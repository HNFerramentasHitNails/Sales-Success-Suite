import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, loadConnectionSecrets } from "../_shared/connector-secrets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
  const userId = claimsData.claims.sub as string;

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const orderId = String(body.order_id ?? "");
  const sessionId = String(body.session_id ?? "");
  if (!orderId || !sessionId) return json(400, { error: "missing_params" });

  const admin = adminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, organization_id, order_number, status, payment_ref")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json(404, { error: "order_not_found" });

  // User must be member of the org
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", order.organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return json(403, { error: "forbidden" });

  const { data: conn } = await admin
    .from("connections")
    .select("id")
    .eq("organization_id", order.organization_id)
    .eq("connector_key", "stripe")
    .maybeSingle();
  if (!conn) return json(400, { error: "stripe_not_connected" });

  const secrets = await loadConnectionSecrets(admin, conn.id);
  const stripeKey = secrets.secret_key;
  if (!stripeKey) return json(400, { error: "stripe_secret_missing" });

  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const session = await r.json();
  if (!r.ok) return json(502, { error: "stripe_error", message: session?.error?.message });

  const meta = session.metadata ?? {};
  if (meta.order_id !== order.id || meta.organization_id !== order.organization_id) {
    return json(400, { error: "metadata_mismatch" });
  }

  const paid = session.payment_status === "paid";
  if (paid && order.status !== "paga") {
    await admin.from("orders").update({
      status: "paga",
      paid_at: new Date().toISOString(),
      payment_provider: "stripe",
      payment_ref: sessionId,
    }).eq("id", order.id);

    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      direction: "inbound",
      connector_key: "stripe",
      action: "verify_payment",
      status: "success",
      message: `Encomenda ${order.order_number} marcada como paga (verify).`,
      payload: { order_id: order.id, session_id: sessionId },
    });
  }

  return json(200, { paid, payment_status: session.payment_status, status: paid ? "paga" : order.status });
});