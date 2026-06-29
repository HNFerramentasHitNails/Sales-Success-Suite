import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function digitsOnly(s: string): string {
  let o = ""; for (const c of (s || "")) if (c >= "0" && c <= "9") o += c; return o;
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
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, lead_id, text } = body ?? {};
    if (!organization_id || !lead_id || !text?.trim()) return json({ error: "invalid_payload" }, 400);

    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || member.role === "read_only") return json({ error: "forbidden" }, 403);

    const { data: lead } = await admin.from("outreach_leads").select("id, phone").eq("id", lead_id).eq("organization_id", organization_id).maybeSingle();
    if (!lead?.phone) return json({ error: "no_phone" }, 400);

    const { data: cfg } = await admin.from("outreach_whatsapp_settings").select("*").eq("organization_id", organization_id).maybeSingle();
    if (!cfg?.api_key) return json({ error: "whatsapp_not_configured" }, 400);
    const { data: inst } = await admin.from("outreach_whatsapp_instances")
      .select("*").eq("organization_id", organization_id).eq("status", "open").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!inst) return json({ error: "no_connected_instance" }, 400);

    const base = cfg.base_url.endsWith("/") ? cfg.base_url.slice(0, -1) : cfg.base_url;
    let providerId: string | null = null;
    try {
      const res = await fetch(`${base}/message/sendText/${encodeURIComponent(inst.name)}`, {
        method: "POST",
        headers: { "apikey": cfg.api_key, "Content-Type": "application/json" },
        body: JSON.stringify({ number: digitsOnly(lead.phone), text: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: "send_failed", message: (data as any)?.message || `HTTP ${res.status}` });
      providerId = (data as any)?.key?.id ?? (data as any)?.id ?? null;
    } catch (e) {
      return json({ error: "send_failed", message: (e as Error).message });
    }

    const { data: msg } = await admin.from("outreach_inbox_messages").insert({
      organization_id, lead_id, channel: "whatsapp", direction: "out",
      body: text.trim(), provider_message_id: providerId, author_user_id: userId, read: true,
    }).select("*").single();

    return json({ ok: true, message: msg });
  } catch (e) {
    console.error("outreach-reply fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
