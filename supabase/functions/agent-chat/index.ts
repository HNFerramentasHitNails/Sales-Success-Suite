import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AgentType = "sales" | "trainer" | "strategist";

const BASE_PROMPTS: Record<AgentType, string> = {
  sales: `És o **Agente de Vendas**, copiloto comercial em português europeu (PT-PT).
Apoias o comercial: prepara reuniões, redige mensagens, sugere próximos passos e responde a objeções com base na base de conhecimento de produtos da organização.
Sê concreto, conciso e orientado à ação. Usa markdown (listas, negritos) quando útil. Adapta o tom ao perfil DISC do utilizador e, se disponível, do cliente.`,
  trainer: `És o **Agente de Treino** de vendas em português europeu (PT-PT).
Conduz role-plays realistas: assume o papel de cliente com objeções, dá feedback estruturado (o que correu bem / a melhorar / próximo passo) e adapta a dificuldade ao perfil DISC do comercial.
Usa markdown. Termina sempre com uma sugestão concreta de próximo exercício, ancorada nos selling points, objeções e FAQ dos produtos da organização.`,
  strategist: `És o **Agente de Estratégia** comercial em português europeu (PT-PT).
Analisa os KPIs e o pipeline fornecidos no contexto: identifica riscos, oportunidades, clientes/produtos chave e padrões. Recomenda 3-5 próximas ações priorizadas.
Sê analítico, baseado em dados, e estrutura sempre a resposta em markdown com secções claras.`,
};

function safe(v: unknown) { try { return JSON.stringify(v); } catch { return "null"; } }

function errResp(body: unknown, status = 500) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return errResp({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const agent_type = body.agent_type as AgentType;
    const message = (body.message ?? "").toString();
    let conversation_id = body.conversation_id as string | undefined;
    const customer_id = body.customer_id as string | undefined;
    const prospect_id = body.prospect_id as string | undefined;

    if (!agent_type || !["sales", "trainer", "strategist"].includes(agent_type) || !message.trim()) {
      return errResp({ error: "missing_params" }, 400);
    }

    // Resolve organization
    const { data: memb } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const organizationId = memb?.organization_id;
    if (!organizationId) return errResp({ error: "no_organization" }, 403);

    const agentColumn = agent_type === "sales" ? "sales_agent" : agent_type;

    // Ensure conversation exists
    if (!conversation_id) {
      const { data: newConv, error: convErr } = await supabase
        .from("ai_conversations")
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          agent: agentColumn,
          title: message.slice(0, 60),
          customer_id: customer_id ?? null,
          prospect_id: prospect_id ?? null,
        })
        .select("id")
        .single();
      if (convErr || !newConv) throw new Error("conversation_create_failed");
      conversation_id = newConv.id;
    }

    // Persist user message
    await supabase.from("ai_messages").insert({
      conversation_id,
      organization_id: organizationId,
      role: "user",
      content: message,
    });

    // Load linked entities from conversation
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("customer_id, prospect_id")
      .eq("id", conversation_id)
      .maybeSingle();
    const linkedCustomerId = customer_id ?? conv?.customer_id ?? null;
    const linkedProspectId = prospect_id ?? conv?.prospect_id ?? null;

    // User profile (DISC)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, disc_profile")
      .eq("id", user.id)
      .maybeSingle();

    // Org custom instructions
    const { data: instr } = await supabase
      .from("agent_instructions")
      .select("instructions, is_active")
      .eq("organization_id", organizationId)
      .eq("agent_type", agent_type)
      .maybeSingle();

    let contextBlock = "";
    if (profile?.disc_profile) {
      contextBlock += `\n\n**Perfil DISC do comercial (${profile.full_name ?? "—"})**: ${safe(profile.disc_profile)}`;
    }

    if (agent_type === "sales") {
      if (linkedCustomerId) {
        const { data: cust } = await supabase
          .from("customers")
          .select("*")
          .eq("id", linkedCustomerId)
          .maybeSingle();
        if (cust) {
          contextBlock += `\n\n**Cliente**: ${safe(cust)}`;
          if (cust.disc_profile) contextBlock += `\n\n**Perfil DISC do cliente**: ${safe(cust.disc_profile)}`;
          const { data: recentInv } = await supabase
            .from("invoices")
            .select("number, issue_date, total, status")
            .eq("customer_id", linkedCustomerId)
            .order("issue_date", { ascending: false })
            .limit(10);
          const { data: recentOrders } = await supabase
            .from("orders")
            .select("id, status, total, created_at")
            .eq("customer_id", linkedCustomerId)
            .order("created_at", { ascending: false })
            .limit(10);
          contextBlock += `\n\n**Faturas recentes**: ${safe(recentInv ?? [])}`;
          contextBlock += `\n\n**Encomendas recentes**: ${safe(recentOrders ?? [])}`;
        }
      }
      if (linkedProspectId) {
        const { data: pr } = await supabase.from("prospects").select("*").eq("id", linkedProspectId).maybeSingle();
        if (pr) contextBlock += `\n\n**Prospect**: ${safe(pr)}`;
      }
      const { data: knowledge } = await supabase
        .from("product_knowledge")
        .select("positioning, target_audience, selling_points, objections, faq, product_id, products(name)")
        .eq("organization_id", organizationId)
        .limit(20);
      if (knowledge?.length) {
        contextBlock += `\n\n**Base de conhecimento de produtos**:\n\`\`\`json\n${JSON.stringify(knowledge, null, 2)}\n\`\`\``;
      }
    }

    if (agent_type === "trainer") {
      const { data: knowledge } = await supabase
        .from("product_knowledge")
        .select("selling_points, objections, faq, products(name)")
        .eq("organization_id", organizationId)
        .limit(20);
      if (knowledge?.length) {
        contextBlock += `\n\n**Material para role-play (produtos)**:\n\`\`\`json\n${JSON.stringify(knowledge, null, 2)}\n\`\`\``;
      }
    }

    if (agent_type === "strategist") {
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("line_total, products(category, name), invoices!inner(issue_date, status, organization_id, customer_id)")
        .eq("organization_id", organizationId)
        .limit(2000);
      const byCategory: Record<string, number> = {};
      const byProduct: Record<string, number> = {};
      const byCustomer: Record<string, number> = {};
      for (const r of (invItems ?? []) as any[]) {
        if (r.invoices?.status === "cancelled") continue;
        const cat = r.products?.category ?? "—";
        const prod = r.products?.name ?? "—";
        byCategory[cat] = (byCategory[cat] ?? 0) + Number(r.line_total ?? 0);
        byProduct[prod] = (byProduct[prod] ?? 0) + Number(r.line_total ?? 0);
        const cid = r.invoices?.customer_id;
        if (cid) byCustomer[cid] = (byCustomer[cid] ?? 0) + Number(r.line_total ?? 0);
      }
      const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topCustomerIds = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 10);
      let topCustomers: any[] = [];
      if (topCustomerIds.length) {
        const { data: cs } = await supabase
          .from("customers")
          .select("id, name, rfm_segment, ltv")
          .in("id", topCustomerIds.map(([id]) => id));
        topCustomers = (cs ?? []).map((c) => ({ ...c, revenue: byCustomer[c.id] }));
      }
      const { data: pipeline } = await supabase
        .from("prospects")
        .select("status, estimated_value, probability")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .limit(200);
      contextBlock += `\n\n**Receita por categoria**: ${safe(byCategory)}`;
      contextBlock += `\n\n**Top produtos**: ${safe(topProducts)}`;
      contextBlock += `\n\n**Top clientes**: ${safe(topCustomers)}`;
      contextBlock += `\n\n**Pipeline aberto (resumo)**: ${safe(pipeline ?? [])}`;
    }

    let systemPrompt = BASE_PROMPTS[agent_type];
    if (instr?.is_active && instr.instructions?.trim()) {
      systemPrompt += `\n\n**Instruções específicas da organização**:\n${instr.instructions.trim()}`;
    }
    systemPrompt += contextBlock;

    // Conversation history
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(40);

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    // Load AI provider settings (via admin to access api_key)
    const { data: aiSettings } = await admin
      .from("ai_provider_settings")
      .select("provider, model, api_key, intl_transfer_ack_at")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const aiProvider = aiSettings?.provider ?? "deepseek";
    // RGPD Cap. V — exige declaração de transferência internacional para fornecedores fora da UE.
    if (aiProvider === "deepseek" && !aiSettings?.intl_transfer_ack_at) {
      return errResp({ error: "intl_transfer_not_acknowledged", message: "Aceita a declaração de transferência internacional nas Definições de IA." }, 400);
    }
    const aiModel = aiSettings?.model || (aiProvider === "anthropic" ? "claude-opus-4-8" : "deepseek-v4-flash");
    const orgKey = aiSettings?.api_key ?? "";
    const aiKey = orgKey.trim() || DEEPSEEK_API_KEY;

    const convId = conversation_id;

    // Anthropic: non-streaming path, emit as fake SSE
    if (aiProvider === "anthropic") {
      if (!orgKey.trim()) return errResp({ error: "ai_not_configured" }, 400);
      const chatMessages = messages.filter((m) => m.role !== "system");
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": orgKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: aiModel, max_tokens: 2048, system: systemPrompt, messages: chatMessages }),
      });
      const anthropicData = await anthropicRes.json().catch(() => ({}));
      if (!anthropicRes.ok) {
        console.error("Anthropic error", anthropicRes.status, anthropicData);
        return errResp({ error: "Erro do serviço de IA." }, 500);
      }
      const assistantText = (anthropicData as any)?.content?.find((b: any) => b?.type === "text")?.text ?? "";
      if (assistantText.trim()) {
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          organization_id: organizationId,
          role: "assistant",
          content: assistantText,
        });
        await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      }
      const payload =
        `event: meta\ndata: ${JSON.stringify({ conversation_id: convId })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: { content: assistantText } }] })}\n\n` +
        `data: [DONE]\n\n`;
      return new Response(payload, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // DeepSeek / OpenAI: native streaming (OpenAI-compatible)
    const endpoint =
      aiProvider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.deepseek.com/v1/chat/completions";

    const aiResp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiModel, messages, stream: true }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return errResp({ error: "Limite de pedidos atingido. Tenta novamente em instantes." }, 429);
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return errResp({ error: "Erro do serviço de IA." }, 500);
    }

    let assistantText = "";
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: meta\ndata: ${JSON.stringify({ conversation_id: convId })}\n\n`));
        const reader = aiResp.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const c = parsed.choices?.[0]?.delta?.content;
                if (c) assistantText += c;
              } catch { /* ignore */ }
            }
          }
        } catch (e) {
          console.error("stream error", e);
        } finally {
          controller.close();
          if (assistantText.trim()) {
            await supabase.from("ai_messages").insert({
              conversation_id: convId,
              organization_id: organizationId,
              role: "assistant",
              content: assistantText,
            });
            await supabase
              .from("ai_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", convId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
