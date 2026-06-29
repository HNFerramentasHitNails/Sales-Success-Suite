import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function trimSlash(u: string) { return u.endsWith("/") ? u.slice(0, -1) : u; }

async function evo(base: string, key: string, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${trimSlash(base)}${path}`, {
    method,
    headers: { "apikey": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// extrai o QR (base64) de várias formas possíveis da resposta Evolution
function pickQr(d: any): string | null {
  return d?.qrcode?.base64 ?? d?.base64 ?? d?.qrcode ?? null;
}
function pickState(d: any): string {
  return d?.instance?.state ?? d?.state ?? "connecting";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const webhookToken = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") ?? "";

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, action } = body ?? {};
    if (!organization_id || !action) return json({ error: "invalid_payload" }, 400);

    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "forbidden" }, 403);

    const loadCfg = async () => {
      const { data } = await admin.from("outreach_whatsapp_settings").select("*").eq("organization_id", organization_id).maybeSingle();
      return data;
    };

    if (action === "get_config") {
      const cfg = await loadCfg();
      return json({ base_url: cfg?.base_url ?? "https://whatsapp.janeiras.synology.me", has_key: !!cfg?.api_key });
    }

    if (action === "set_config") {
      const base_url = (body.base_url || "https://whatsapp.janeiras.synology.me").trim();
      const api_key = (body.api_key ?? "").trim();
      const existing = await loadCfg();
      const keyToStore = api_key || existing?.api_key || null;
      const { error } = await admin.from("outreach_whatsapp_settings")
        .upsert({ organization_id, base_url, api_key: keyToStore, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
      if (error) return json({ error: "db_error", message: error.message });
      return json({ ok: true, base_url, has_key: !!keyToStore });
    }

    // ações que precisam da config + key
    const cfg = await loadCfg();
    if (!cfg?.api_key) return json({ error: "not_configured", message: "Configura a API key do Evolution primeiro." });
    const base = cfg.base_url;
    const key = cfg.api_key;

    if (action === "create_instance") {
      const name = (body.name ?? "").trim();
      if (!name) return json({ error: "missing_name" }, 400);
      const webhookUrl = `${trimSlash(SUPABASE_URL)}/functions/v1/evolution-webhook${webhookToken ? `?token=${encodeURIComponent(webhookToken)}` : ""}`;
      const r = await evo(base, key, "/instance/create", "POST", {
        instanceName: name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      });
      if (!r.ok) return json({ error: "evolution_error", message: (r.data as any)?.message || JSON.stringify(r.data).slice(0, 300) });
      // tentar garantir webhook (algumas versões ignoram no create)
      await evo(base, key, `/webhook/set/${encodeURIComponent(name)}`, "POST", {
        webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
      }).catch(() => ({}));

      const { data: row, error } = await admin.from("outreach_whatsapp_instances")
        .upsert({ organization_id, name, status: "connecting" }, { onConflict: "organization_id,name" })
        .select("*").single();
      if (error) return json({ error: "db_error", message: error.message });
      return json({ instance: row, qr: pickQr(r.data) });
    }

    if (action === "connect") {
      const { data: inst } = await admin.from("outreach_whatsapp_instances").select("*").eq("id", body.instance_id).eq("organization_id", organization_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const r = await evo(base, key, `/instance/connect/${encodeURIComponent(inst.name)}`, "GET");
      if (!r.ok) return json({ error: "evolution_error", message: (r.data as any)?.message || `HTTP ${r.status}` });
      return json({ qr: pickQr(r.data), pairingCode: (r.data as any)?.pairingCode ?? (r.data as any)?.code ?? null });
    }

    if (action === "status") {
      const { data: inst } = await admin.from("outreach_whatsapp_instances").select("*").eq("id", body.instance_id).eq("organization_id", organization_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      const r = await evo(base, key, `/instance/connectionState/${encodeURIComponent(inst.name)}`, "GET");
      const state = pickState(r.data);
      const patch: Record<string, unknown> = { status: state === "open" ? "open" : state === "close" ? "close" : "connecting" };
      if (state === "open" && !inst.connected_at) patch.connected_at = new Date().toISOString();
      await admin.from("outreach_whatsapp_instances").update(patch).eq("id", inst.id);
      return json({ status: patch.status });
    }

    if (action === "set_skip_warmup") {
      await admin.from("outreach_whatsapp_instances").update({ skip_warmup: !!body.skip }).eq("id", body.instance_id).eq("organization_id", organization_id);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { data: inst } = await admin.from("outreach_whatsapp_instances").select("*").eq("id", body.instance_id).eq("organization_id", organization_id).maybeSingle();
      if (!inst) return json({ error: "not_found" }, 404);
      await evo(base, key, `/instance/logout/${encodeURIComponent(inst.name)}`, "DELETE").catch(() => ({}));
      await evo(base, key, `/instance/delete/${encodeURIComponent(inst.name)}`, "DELETE").catch(() => ({}));
      await admin.from("outreach_whatsapp_instances").delete().eq("id", inst.id);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("outreach-whatsapp fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
