import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Agent = "sales_agent" | "trainer" | "strategist";

const SYSTEM_PROMPTS: Record<Agent, string> = {
  sales_agent: `És o **Sales Agent**, copiloto comercial em português europeu.
Apoias o comercial durante o ciclo de venda: preparar reuniões, redigir mensagens, sugerir próximos passos, responder a objeções com base na base de conhecimento do produto.
Sê concreto, conciso e orientado à ação. Usa markdown (listas, negritos) quando útil. Adapta o tom ao perfil DISC do utilizador, se fornecido.`,
  trainer: `És o **Sales Trainer**, treinador de vendas em português europeu.
Conduz role-plays realistas: assume o papel de cliente com objeções, dá feedback estruturado (o que correu bem / a melhorar / próximo passo), e adapta a dificuldade ao perfil DISC do comercial.
Usa markdown. Termina sempre com uma sugestão concreta de próximo exercício.`,
  strategist: `És o **Sales Strategist**, analista sénior em português europeu.
Analisa o pipeline e o histórico fornecidos no contexto: identifica riscos, oportunidades, deals em risco, padrões de conversão, e recomenda 3-5 próximas ações priorizadas.
Sê analítico, baseado em dados, e estrutura sempre a resposta em markdown com secções claras.`,
};

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
    if (!userData.user) return errResp({ error: "unauthorized" }, 401);

    const { conversationId, message } = await req.json();
    if (!conversationId || !message) return errResp({ error: "missing_params" }, 400);

    // Load conversation
    const { data: conv, error: convErr } = await supabase
      .from("ai_conversations")
      .select("id, agent, organization_id, prospect_id, customer_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr || !conv) throw new Error("conversation_not_found");

    const agent = conv.agent as Agent;

    // Insert user message
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      organization_id: conv.organization_id,
      role: "user",
      content: message,
    });

    // Build context
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, disc_profile")
      .eq("id", userData.user.id)
      .maybeSingle();

    let contextBlock = "";
    if (profile?.disc_profile) {
      contextBlock += `\n\n**Perfil DISC do comercial**: ${JSON.stringify(profile.disc_profile)}`;
    }

    if (agent === "strategist") {
      const { data: prospects } = await supabase
        .from("prospects")
        .select("name, company, status, estimated_value, probability, next_action, next_action_date, expected_close_date")
        .eq("organization_id", conv.organization_id)
        .eq("status", "open")
        .limit(50);
      contextBlock += `\n\n**Pipeline aberto** (${prospects?.length ?? 0}):\n\`\`\`json\n${JSON.stringify(prospects ?? [], null, 2)}\n\`\`\``;
    }

    if ((agent === "sales_agent" || agent === "trainer") && conv.prospect_id) {
      const { data: p } = await supabase
        .from("prospects")
        .select("*")
        .eq("id", conv.prospect_id)
        .maybeSingle();
      if (p) contextBlock += `\n\n**Prospect**: ${JSON.stringify(p)}`;
    }

    if (agent === "sales_agent") {
      const { data: knowledge } = await supabase
        .from("product_knowledge")
        .select("positioning, target_audience, selling_points, objections, faq, product_id, products(name)")
        .eq("organization_id", conv.organization_id)
        .limit(20);
      if (knowledge?.length) {
        contextBlock += `\n\n**Base de conhecimento de produtos**:\n\`\`\`json\n${JSON.stringify(knowledge, null, 2)}\n\`\`\``;
      }
    }

    // Load history
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const systemContent = SYSTEM_PROMPTS[agent] + contextBlock;
    const messages = [
      { role: "system", content: systemContent },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    // Load AI provider settings
    const { data: aiSettings } = await admin
      .from("ai_provider_settings")
      .select("provider, model, api_key")
      .eq("organization_id", conv.organization_id)
      .maybeSingle();

    const aiProvider = aiSettings?.provider ?? "deepseek";
    const aiModel = aiSettings?.model || (aiProvider === "anthropic" ? "claude-opus-4-8" : "deepseek-v4-flash");
    const orgKey = aiSettings?.api_key ?? "";
    const aiKey = orgKey.trim() || DEEPSEEK_API_KEY;

    // Anthropic: non-streaming path
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
        body: JSON.stringify({ model: aiModel, max_tokens: 2048, system: systemContent, messages: chatMessages }),
      });
      const anthropicData = await anthropicRes.json().catch(() => ({}));
      if (!anthropicRes.ok) {
        console.error("Anthropic error", anthropicRes.status, anthropicData);
        return errResp({ error: "ai_error" }, 500);
      }
      const assistantText = (anthropicData as any)?.content?.find((b: any) => b?.type === "text")?.text ?? "";
      if (assistantText.trim()) {
        await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          organization_id: conv.organization_id,
          role: "assistant",
          content: assistantText,
        });
        await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      }
      // Emit as fake SSE so client code works unchanged
      const payload =
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
      if (aiResp.status === 429) return errResp({ error: "rate_limited" }, 429);
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return errResp({ error: "ai_error" }, 500);
    }

    // Tee the stream: forward to client + capture full text to persist
    let assistantText = "";
    const stream = new ReadableStream({
      async start(controller) {
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
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
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
              conversation_id: conversationId,
              organization_id: conv.organization_id,
              role: "assistant",
              content: assistantText,
            });
            await supabase
              .from("ai_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
