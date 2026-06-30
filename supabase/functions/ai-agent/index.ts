import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AgentType = "sales" | "trainer" | "strategist";

const SYSTEM_PROMPTS: Record<AgentType, string> = {
  sales:
    "És um assistente de vendas profissional em português europeu. Ajudas o comercial a preparar abordagens, responder a objeções de clientes e definir próximos passos claros. Sê conciso, prático e orientado à ação.",
  trainer:
    "És um coach de vendas em português europeu. Treinas o comercial com feedback construtivo, role-plays e exercícios concretos. Termina sempre com um próximo passo de prática.",
  strategist:
    "És um analista de estratégia comercial em português europeu. Ajudas a priorizar contas, identificar oportunidades e planear ações. Estrutura a resposta de forma clara e baseada em dados.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAnthropic(apiKey: string, model: string, system: string, messages: unknown[]) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || "claude-opus-4-8",
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      return { error: msg };
    }
    const reply =
      (Array.isArray((data as any)?.content)
        ? (data as any).content.find((b: any) => b?.type === "text")?.text
        : "") ?? "";
    return { reply };
  } catch (e) {
    return { error: (e as Error).message || "request_failed" };
  } finally {
    clearTimeout(t);
  }
}

async function callOpenAI(apiKey: string, model: string, system: string, messages: unknown[]) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        max_tokens: 1024,
        messages: [{ role: "system", content: system }, ...(messages as any[])],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      return { error: msg };
    }
    const reply = (data as any)?.choices?.[0]?.message?.content ?? "";
    return { reply };
  } catch (e) {
    return { error: (e as Error).message || "request_failed" };
  } finally {
    clearTimeout(t);
  }
}

async function callDeepSeek(apiKey: string, model: string, system: string, messages: unknown[]) {
  if (!apiKey) {
    return { error: "provider_error", message: "DEEPSEEK_API_KEY não configurado no servidor." };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || "deepseek-v4-flash",
        max_tokens: 1024,
        temperature: 0.7,
        messages: [{ role: "system", content: system }, ...(messages as any[])],
      }),
    });
    if (res.status === 429) {
      return { error: "rate_limited", message: "Limite de pedidos de IA atingido. Tenta novamente daqui a pouco." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      return { error: "provider_error", message: msg };
    }
    const reply = (data as any)?.choices?.[0]?.message?.content ?? "";
    return { reply };
  } catch (e) {
    return { error: "provider_error", message: (e as Error).message || "request_failed" };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validar JWT
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return jsonResponse({ error: "unauthorized" }, 401);
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return jsonResponse({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, agent_type, messages } = body ?? {};
    if (!organization_id || !Array.isArray(messages)) {
      return jsonResponse({ error: "invalid_payload" }, 400);
    }

    // Validar pertença ativa
    const { data: member } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!member) return jsonResponse({ error: "forbidden" }, 403);

    // Carregar configuração de IA da org
    const { data: settings } = await admin
      .from("ai_provider_settings")
      .select("provider, model, api_key, intl_transfer_ack_at")
      .eq("organization_id", organization_id)
      .maybeSingle();

    const agent: AgentType =
      agent_type === "trainer" || agent_type === "strategist" ? agent_type : "sales";
    let system = SYSTEM_PROMPTS[agent];

    // Injetar Base de Conhecimento da organização (entradas ativas)
    try {
      const { data: kb } = await admin
        .from("ai_knowledge_entries")
        .select("title, content, category")
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .order("category", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (kb && kb.length > 0) {
        const MAX_CHARS = 8000;
        let block = "";
        let truncated = false;
        for (const e of kb as Array<{ title: string; content: string; category: string | null }>) {
          const piece = `### ${e.title} (${e.category ?? "Geral"})\n${e.content}\n\n`;
          if (block.length + piece.length > MAX_CHARS) {
            const remaining = MAX_CHARS - block.length;
            if (remaining > 100) block += piece.slice(0, remaining);
            block += "\n[...]";
            truncated = true;
            break;
          }
          block += piece;
        }
        system +=
          "\n\n# Conhecimento da organização (usa como factos verídicos sobre esta empresa/produtos; se algo não estiver aqui, diz que não tens essa informação em vez de inventar):\n" +
          block;
        if (truncated) {
          console.log(`ai-agent kb truncated for org ${organization_id}`);
        }
      }
    } catch (e) {
      console.error("ai-agent kb load failed:", (e as Error).message);
    }

    // Sanitizar mensagens
    const safeMessages = (messages as any[])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    // Determinar provider e chave
    const provider = settings?.provider ?? "deepseek";
    const model = settings?.model ?? "";
    const orgKey = settings?.api_key ?? "";

    // RGPD Cap. V — fornecedores fora da UE sem decisão de adequação exigem
    // declaração explícita de transferência internacional antes de qualquer envio.
    if (provider === "deepseek" && !settings?.intl_transfer_ack_at) {
      return jsonResponse({ error: "intl_transfer_not_acknowledged" });
    }

    let result: { reply?: string; error?: string; message?: string };

    if (provider === "anthropic") {
      if (!orgKey.trim()) return jsonResponse({ error: "ai_not_configured" });
      const r = await callAnthropic(orgKey, model, system, safeMessages);
      result = "error" in r && !r.reply ? { error: "provider_error", message: r.error } : { reply: r.reply };
    } else if (provider === "openai") {
      if (!orgKey.trim()) return jsonResponse({ error: "ai_not_configured" });
      const r = await callOpenAI(orgKey, model, system, safeMessages);
      result = "error" in r ? { error: "provider_error", message: r.error } : { reply: r.reply };
    } else {
      // deepseek (default) — usa chave da org se tiver, senão chave global
      const apiKey = orgKey.trim() || (Deno.env.get("DEEPSEEK_API_KEY") ?? "");
      result = await callDeepSeek(apiKey, model, system, safeMessages);
    }

    if (result.error) {
      console.error(`ai-agent ${result.error} (${provider})`);
      return jsonResponse({ error: result.error, message: result.message });
    }
    return jsonResponse({ reply: result.reply });
  } catch (e) {
    console.error("ai-agent fatal:", (e as Error).message);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
