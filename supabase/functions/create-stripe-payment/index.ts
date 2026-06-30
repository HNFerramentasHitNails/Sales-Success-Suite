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

const WRITE_ROLES = new Set(["owner", "admin", "sales_director", "sales_rep"]);

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
  if (!orderId) return json(400, { error: "order_id_required" });

  const admin = adminClient();

  try {

  // Fetch order
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, organization_id, order_number, status, total, currency, payment_url, payment_ref, wallet_balance_applied")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) return json(404, { error: "order_not_found" });

  // Verify user is a write-role member of org
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", order.organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership || !WRITE_ROLES.has((membership as any).role)) return json(403, { error: "forbidden" });

  if (order.status !== "confirmada" && order.status !== "rascunho") {
    return json(400, { error: "invalid_status", message: "A encomenda não está num estado pagável." });
  }

  // Identidade legal do vendedor (organização) — informação pré-contratual ao consumidor.
  const { data: org } = await admin
    .from("organizations")
    .select("name, legal_name, tax_id, legal_address, legal_email, legal_phone, return_policy, withdrawal_days")
    .eq("id", order.organization_id)
    .maybeSingle();

  // Reuse payment URL if it already exists
  if (order.payment_url && order.payment_ref) {
    return json(200, { payment_url: order.payment_url, payment_ref: order.payment_ref, reused: true });
  }

  // Find active Stripe connection
  const { data: conn } = await admin
    .from("connections")
    .select("id, status")
    .eq("organization_id", order.organization_id)
    .eq("connector_key", "stripe")
    .maybeSingle();
  if (!conn || conn.status !== "active") return json(400, { error: "stripe_not_connected" });

  const secrets = await loadConnectionSecrets(admin, conn.id);
  const stripeKey = secrets.secret_key;
  if (!stripeKey) return json(400, { error: "stripe_secret_missing" });

  // Valor em dívida = total − carteira já aplicada (não cobrar o que a carteira pagou).
  const total = Number(order.total);
  const walletApplied = Number((order as { wallet_balance_applied?: number }).wallet_balance_applied ?? 0);
  const outstanding = Math.max(total - walletApplied, 0);
  if (!(outstanding > 0)) return json(400, { error: "already_paid", message: "A encomenda já está paga (carteira cobriu o total)." });
  const amountCents = Math.round(outstanding * 100);
  const currency = (order.currency || "EUR").toLowerCase();

  // Build success/cancel URLs (use Origin header if available)
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const base = origin.replace(/\/$/, "");
  const successUrl = `${base}/app/orders?payment=success&order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/app/orders?payment=cancel&order_id=${order.id}`;

  // Identidade do vendedor + informação pré-contratual (DL 24/2014)
  const o = (org ?? {}) as Record<string, unknown>;
  const sellerName = (o.legal_name as string) || (o.name as string) || "";
  const wDays = Number(o.withdrawal_days ?? 14);
  const productName = sellerName
    ? `Encomenda ${order.order_number} — ${sellerName}`
    : `Encomenda ${order.order_number}`;

  const idParts: string[] = [];
  if (sellerName) idParts.push(`Vendedor: ${sellerName}${o.tax_id ? ` (NIF ${o.tax_id})` : ""}`);
  if (o.legal_address) idParts.push(String(o.legal_address));
  const contact = [o.legal_email, o.legal_phone].filter(Boolean).join(" · ");
  if (contact) idParts.push(`Contacto: ${contact}`);
  idParts.push("Preço total a pagar, com IVA incluído quando aplicável.");
  idParts.push(`Direito de livre resolução: ${wDays} dias (DL 24/2014).`);
  if (o.return_policy) idParts.push(`Devoluções: ${o.return_policy}`);
  idParts.push(`Termos: ${base}/termos · Privacidade: ${base}/privacidade`);
  // Stripe custom_text aceita no máx. 1200 caracteres em texto simples.
  const preContractual = idParts.join(" ").slice(0, 1190);

  // Create Stripe Checkout Session via form-encoded API
  const form = new URLSearchParams();
  form.append("mode", "payment");
  form.append("success_url", successUrl);
  form.append("cancel_url", cancelUrl);
  form.append("line_items[0][quantity]", "1");
  form.append("line_items[0][price_data][currency]", currency);
  form.append("line_items[0][price_data][unit_amount]", String(amountCents));
  form.append("line_items[0][price_data][product_data][name]", productName);
  form.append("custom_text[submit][message]", preContractual);
  form.append("metadata[organization_id]", order.organization_id);
  form.append("metadata[order_id]", order.id);
  form.append("metadata[order_number]", order.order_number);
  if (sellerName) form.append("metadata[seller_name]", sellerName);
  if (o.tax_id) form.append("metadata[seller_tax_id]", String(o.tax_id));

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const stripeBody = await stripeRes.json();

  if (!stripeRes.ok) {
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      direction: "outbound",
      connector_key: "stripe",
      action: "create_checkout_session",
      status: "error",
      message: stripeBody?.error?.message ?? "Stripe error",
      payload: { order_id: order.id },
    });
    return json(502, { error: "stripe_error", message: stripeBody?.error?.message });
  }

  const sessionId = stripeBody.id as string;
  const paymentUrl = stripeBody.url as string;

  // Persist on order + external_refs
  await admin.from("orders").update({
    payment_provider: "stripe",
    payment_ref: sessionId,
    payment_url: paymentUrl,
  }).eq("id", order.id);

  await admin.from("external_refs").insert({
    organization_id: order.organization_id,
    connector_key: "stripe",
    entity_type: "payment",
    entity_id: order.id,
    external_id: sessionId,
    external_data: { url: paymentUrl, amount: amountCents, currency },
  });

  await admin.from("sync_logs").insert({
    organization_id: order.organization_id,
    direction: "outbound",
    connector_key: "stripe",
    action: "create_checkout_session",
    status: "success",
    message: `Sessão criada para encomenda ${order.order_number}`,
    payload: { order_id: order.id, session_id: sessionId },
  });

  return json(200, { payment_url: paymentUrl, payment_ref: sessionId });

  } catch (e) {
    console.error("create-stripe-payment fatal:", (e as Error).message);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});