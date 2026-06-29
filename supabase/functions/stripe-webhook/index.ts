import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, loadConnectionSecrets } from "../_shared/connector-secrets.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Stripe signature: header looks like "t=<unix_ts>,v1=<hex_sig>,v1=<hex_sig>..."
// Signed payload = "<t>.<raw_body>", verified with HMAC-SHA256 using the signing secret.
async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts["t"];
  // collect all v1 sigs
  const v1s = sigHeader.split(",").map((p) => p.trim()).filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;

  // Tolerance
  const ts = parseInt(t, 10);
  if (Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  return v1s.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Extract org token from path: /stripe-webhook/<token>
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const token = parts[parts.length - 1];
  if (!token || token === "stripe-webhook") return json(400, { error: "missing_token" });

  const admin = adminClient();

  const { data: hook } = await admin
    .from("webhook_endpoints")
    .select("id, organization_id, is_active")
    .eq("token", token)
    .maybeSingle();
  if (!hook || !hook.is_active) return json(404, { error: "endpoint_not_found" });

  const { data: conn } = await admin
    .from("connections")
    .select("id, status")
    .eq("organization_id", hook.organization_id)
    .eq("connector_key", "stripe")
    .maybeSingle();
  if (!conn) return json(400, { error: "stripe_not_connected" });

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  // Try to verify signature if signing secret exists
  let signatureVerified = false;
  try {
    const secrets = await loadConnectionSecrets(admin, conn.id);
    const signingSecret = secrets.stripe_webhook_signing_secret;
    if (signingSecret) {
      signatureVerified = await verifyStripeSignature(rawBody, sigHeader, signingSecret);
      if (!signatureVerified) {
        await admin.from("sync_logs").insert({
          organization_id: hook.organization_id,
          direction: "inbound",
          connector_key: "stripe",
          action: "webhook",
          status: "error",
          message: "Assinatura inválida",
        });
        return json(400, { error: "invalid_signature" });
      }
    }
    // If no signing secret defined, we accept without verification (logged as warning).
  } catch (e) {
    return json(500, { error: "decrypt_failed", message: (e as Error).message });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return json(400, { error: "invalid_json" }); }

  const type = event?.type as string | undefined;
  const obj = event?.data?.object ?? {};
  const metadata = obj.metadata ?? {};
  const orderId = metadata.order_id as string | undefined;
  const orgId = metadata.organization_id as string | undefined;
  const sessionOrIntentId = obj.id as string | undefined;

  // Only relevant payment events
  const PAID_EVENTS = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "payment_intent.succeeded",
  ]);

  if (type && PAID_EVENTS.has(type) && orderId && orgId === hook.organization_id) {
    // Idempotent: only mark as paid if not already paid
    const { data: order } = await admin
      .from("orders")
      .select("id, status, organization_id, order_number")
      .eq("id", orderId)
      .eq("organization_id", hook.organization_id)
      .maybeSingle();

    if (order) {
      // Stripe "checkout.session.completed" includes payment_status
      const paymentStatus = obj.payment_status ?? "paid";
      if ((type === "payment_intent.succeeded" || paymentStatus === "paid") && order.status !== "paga") {
        await admin.from("orders").update({
          status: "paga",
          paid_at: new Date().toISOString(),
          payment_provider: "stripe",
          payment_ref: sessionOrIntentId,
        }).eq("id", order.id).neq("status", "paga");

        await admin.from("sync_logs").insert({
          organization_id: hook.organization_id,
          direction: "inbound",
          connector_key: "stripe",
          action: "webhook",
          status: "success",
          message: `Encomenda ${order.order_number} paga (${type}).`,
          payload: { event_id: event.id, type, order_id: order.id },
        });
        return json(200, { received: true, updated: true });
      }
    }
  }

  await admin.from("sync_logs").insert({
    organization_id: hook.organization_id,
    direction: "inbound",
    connector_key: "stripe",
    action: "webhook",
    status: "success",
    message: `Evento recebido: ${type ?? "desconhecido"}${signatureVerified ? "" : " (sem verificação de assinatura)"}`,
    payload: { event_id: event?.id, type },
  });

  return json(200, { received: true });
});