import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ranking para não retroceder o estado
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4 };

async function verifySvix(secret: string, id: string, ts: string, payload: string, sigHeader: string): Promise<boolean> {
  try {
    const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signed = `${id}.${ts}.${payload}`;
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signed));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    // header: "v1,<sig> v1,<sig2>"
    const parts = sigHeader.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
    return parts.includes(expected);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

    const raw = await req.text();

    // verificação de assinatura Svix (se o segredo estiver configurado)
    if (secret) {
      const id = req.headers.get("svix-id") ?? "";
      const ts = req.headers.get("svix-timestamp") ?? "";
      const sig = req.headers.get("svix-signature") ?? "";
      const ok = id && ts && sig && await verifySvix(secret, id, ts, raw, sig);
      if (!ok) return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const evt = JSON.parse(raw || "{}");
    const type: string = evt?.type ?? "";
    const emailId: string | undefined = evt?.data?.email_id ?? evt?.data?.id;
    if (!emailId) return new Response(JSON.stringify({ ok: true, ignored: "no_email_id" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: msg } = await admin.from("outreach_messages").select("*").eq("provider_message_id", emailId).maybeSingle();
    if (!msg) return new Response(JSON.stringify({ ok: true, ignored: "no_match" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    let newStatus: string | null = null;

    switch (type) {
      case "email.delivered": newStatus = "delivered"; patch.delivered_at = nowIso; break;
      case "email.opened": newStatus = "opened"; patch.opened_at = nowIso; break;
      case "email.clicked": newStatus = "clicked"; patch.clicked_at = nowIso; break;
      case "email.bounced":
      case "email.complained":
        patch.status = "bounced"; patch.error = type;
        break;
      default:
        return new Response(JSON.stringify({ ok: true, ignored: type }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (newStatus) {
      const cur = RANK[msg.status] ?? 0;
      if ((RANK[newStatus] ?? 0) > cur) patch.status = newStatus;
    }

    if (Object.keys(patch).length) await admin.from("outreach_messages").update(patch).eq("id", msg.id);

    // sinal de engagement para epsilon-greedy: clicado conta como "resposta" (proxy até haver deteção de reply inbound)
    if (type === "email.clicked" && msg.variation_id) {
      const { data: v } = await admin.from("outreach_template_variations").select("responses").eq("id", msg.variation_id).maybeSingle();
      if (v) await admin.from("outreach_template_variations").update({ responses: (v.responses ?? 0) + 1 }).eq("id", msg.variation_id);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("resend-webhook error:", (e as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
