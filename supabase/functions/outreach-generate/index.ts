import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Channel = "email" | "sms" | "whatsapp";

const CHANNEL_RULES: Record<Channel, string> = {
  email: "Email: assunto (subject) curto e apelativo (<=80 chars) + corpo (body) com 2-4 parágrafos curtos. Pode usar quebras de linha.",
  sms: "SMS: SEM subject. body <=160 caracteres, uma só mensagem direta.",
  whatsapp: "WhatsApp: SEM subject. body <=360 caracteres, tom conversacional, pode usar 1-2 emojis com moderação.",
};

const ANGLES = ["dor", "resultado", "curiosidade"];

async function callModel(
  provider: string,
  model: string,
  apiKey: string,
  system: string,
  user: string,
): Promise<{ text?: string; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: model || "claude-opus-4-8",
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: (data as any)?.error?.message || `HTTP ${res.status}` };
      const text = (data as any)?.content?.find((b: any) => b?.type === "text")?.text ?? "";
      return { text };
    }
    // deepseek (default) / openai — OpenAI-compatible
    const endpoint = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.deepseek.com/v1/chat/completions";
    const defModel = provider === "openai" ? "gpt-4o-mini" : "deepseek-v4-flash";
    const res = await fetch(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model || defModel,
        max_tokens: 2048,
        temperature: 0.8,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (data as any)?.error?.message || `HTTP ${res.status}` };
    return { text: (data as any)?.choices?.[0]?.message?.content ?? "" };
  } catch (e) {
    return { error: (e as Error).message || "request_failed" };
  } finally {
    clearTimeout(t);
  }
}

function extractJson(raw: string): any {
  if (!raw) return null;
  let s = raw.trim();
  // remover code fences ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // apanhar do primeiro { ao último }
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: claimsErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const {
      organization_id, niche, lead_stage, objective, tone, language,
      about_offer, about_problem, about_proof, channels, variations,
    } = body ?? {};

    if (!organization_id || !Array.isArray(channels) || channels.length === 0) {
      return json({ error: "invalid_payload" }, 400);
    }
    const selChannels = (channels as string[]).filter((c) => ["email", "sms", "whatsapp"].includes(c)) as Channel[];
    if (selChannels.length === 0) return json({ error: "invalid_channels" }, 400);
    const nVar = Math.min(Math.max(Number(variations) || 1, 1), 3);

    // pertença ativa
    const { data: member } = await admin
      .from("organization_members")
      .select("id").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    // settings de IA da org (reutiliza DeepSeek/Anthropic)
    const { data: settings } = await admin
      .from("ai_provider_settings").select("provider, model, api_key, intl_transfer_ack_at").eq("organization_id", organization_id).maybeSingle();
    const provider = settings?.provider ?? "deepseek";
    // RGPD Cap. V — exige declaração de transferência internacional para fornecedores fora da UE.
    if (provider === "deepseek" && !settings?.intl_transfer_ack_at) {
      return json({ error: "intl_transfer_not_acknowledged", message: "Aceita a declaração de transferência internacional nas Definições de IA." });
    }
    const orgKey = (settings?.api_key ?? "").trim();
    let apiKey = orgKey;
    if (provider === "deepseek" && !apiKey) apiKey = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
    if (!apiKey) return json({ error: "ai_not_configured", message: "Configura a chave de IA primeiro." });

    const lang = language || "pt-PT";
    const rules = selChannels.map((c) => `- ${CHANNEL_RULES[c]}`).join("\n");
    const angleHint = ANGLES.slice(0, nVar).join(", ");

    const system =
      `És um copywriter de outreach B2B de elite. Escreves no idioma "${lang}". ` +
      `Geras mensagens curtas, humanas e orientadas à ação. Usas merge tags entre chavetas duplas quando úteis: ` +
      `{{name}}, {{full_name}}, {{company}}, {{city}}, {{email}}, {{phone}}, {{niche}}. ` +
      `Cada variação deve ter um ÂNGULO diferente (${angleHint}). Respondes APENAS com JSON válido, sem texto extra.`;

    const user = JSON.stringify({
      instrucoes: {
        nicho: niche || null,
        estagio_do_lead: lead_stage || null,
        objetivo: objective || null,
        tom: tone || null,
        sobre_oferta: about_offer || null,
        problema_que_resolve: about_problem || null,
        prova_ou_diferencial: about_proof || null,
        canais: selChannels,
        variacoes_por_canal: nVar,
        regras_por_canal: rules,
      },
      formato_resposta: {
        descricao: "Devolve um objeto com a chave 'channels'. Para cada canal selecionado, um array com exatamente N variações.",
        exemplo: {
          channels: {
            email: [{ angle: "dor", subject: "...", body: "..." }],
            sms: [{ angle: "dor", body: "..." }],
            whatsapp: [{ angle: "dor", body: "..." }],
          },
        },
      },
    });

    const out = await callModel(provider, settings?.model ?? "", apiKey, system, user);
    if (out.error) return json({ error: "provider_error", message: out.error });

    const parsed = extractJson(out.text ?? "");
    const channelsOut = parsed?.channels;
    if (!channelsOut || typeof channelsOut !== "object") {
      return json({ error: "parse_failed", message: "A IA não devolveu JSON válido.", raw: out.text?.slice(0, 500) });
    }

    // normalizar: garantir arrays com angle/subject/body por canal
    const result: Record<string, Array<{ angle: string; subject?: string; body: string }>> = {};
    for (const c of selChannels) {
      const arr = Array.isArray(channelsOut[c]) ? channelsOut[c] : [];
      result[c] = arr.slice(0, nVar).map((v: any, i: number) => ({
        angle: typeof v?.angle === "string" ? v.angle : ANGLES[i % ANGLES.length],
        subject: c === "email" ? (typeof v?.subject === "string" ? v.subject : "") : undefined,
        body: typeof v?.body === "string" ? v.body : "",
      }));
    }

    return json({ channels: result });
  } catch (e) {
    console.error("outreach-generate fatal:", (e as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
