// Reembolsa uma nota de crédito (refund_method='original') via Stripe: obtém o payment_intent
// da checkout session da encomenda e emite um reembolso parcial/total. Se parte da encomenda
// tiver sido paga pela carteira, credita essa parte de volta à carteira do cliente.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function adminClient() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }
function fromB64(b: string) { const x = atob(b); const a = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i); return a; }
async function keyOf() { const raw = new TextEncoder().encode(Deno.env.get("CONNECTOR_SECRETS_KEY")!); const h = await crypto.subtle.digest("SHA-256", raw); return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["decrypt"]); }
async function decryptSecret(ct: string, iv: string) { const k = await keyOf(); const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, k, fromB64(ct)); return new TextDecoder().decode(p); }
async function loadConnectionSecrets(admin: ReturnType<typeof createClient>, connectionId: string): Promise<Record<string, string>> {
  const { data, error } = await admin.from("connection_secrets").select("key, ciphertext, iv").eq("connection_id", connectionId);
  if (error) throw new Error(`Falha a ler segredos: ${error.message}`);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[(row as any).key] = await decryptSecret((row as any).ciphertext, (row as any).iv);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
  const userId = claimsData.claims.sub as string;

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const creditNoteId = String(body.credit_note_id ?? "");
  if (!creditNoteId) return json(400, { error: "credit_note_id_required" });

  const admin = adminClient();

  try {
    const { data: cn } = await admin.from("credit_notes").select("*").eq("id", creditNoteId).maybeSingle();
    if (!cn) return json(404, { error: "credit_note_not_found" });
    if (cn.refund_method !== "original") return json(400, { error: "not_original_method" });
    if (cn.refund_status === "done") return json(200, { ok: true, already: true });
    if (cn.refund_status !== "pending") return json(400, { error: "invalid_refund_status" });

    const { data: membership } = await admin.from("organization_members").select("role")
      .eq("organization_id", cn.organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!membership || !["owner", "admin"].includes((membership as any).role)) return json(403, { error: "forbidden" });

    const { data: order } = await admin.from("orders")
      .select("id, total, currency, payment_provider, payment_ref, wallet_balance_applied, customer_id")
      .eq("id", cn.order_id).maybeSingle();
    if (!order) return json(404, { error: "order_not_found" });
    if (order.payment_provider !== "stripe" || !order.payment_ref) {
      return json(400, { error: "unsupported_provider", message: "Esta encomenda não foi paga via Stripe. Processa o reembolso manualmente." });
    }

    const { data: conn } = await admin.from("connections").select("id, status")
      .eq("organization_id", cn.organization_id).eq("connector_key", "stripe").maybeSingle();
    if (!conn || conn.status !== "active") return json(400, { error: "stripe_not_connected" });
    const secrets = await loadConnectionSecrets(admin, conn.id);
    const stripeKey = secrets.secret_key;
    if (!stripeKey) return json(400, { error: "stripe_secret_missing" });

    const orderTotal = Number(order.total);
    const walletApplied = Number((order as any).wallet_balance_applied ?? 0);
    const cnTotal = Number(cn.total);
    const ratio = orderTotal > 0 ? Math.min(cnTotal / orderTotal, 1) : 1;
    const stripeAmount = Math.round(Math.max(orderTotal - walletApplied, 0) * ratio * 100) / 100;
    const walletAmount = Math.round(walletApplied * ratio * 100) / 100;

    let refundId: string | null = null;
    if (stripeAmount > 0) {
      const sesRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${order.payment_ref}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const ses = await sesRes.json();
      if (!sesRes.ok) return json(502, { error: "stripe_session_error", message: ses?.error?.message ?? "Falha a obter a sessão Stripe." });
      const paymentIntent = typeof ses.payment_intent === "string" ? ses.payment_intent : ses.payment_intent?.id;
      if (!paymentIntent) return json(400, { error: "no_payment_intent", message: "Sessão Stripe sem pagamento associado." });

      const form = new URLSearchParams();
      form.append("payment_intent", paymentIntent);
      form.append("amount", String(Math.round(stripeAmount * 100)));
      form.append("metadata[credit_note_id]", cn.id);
      if (cn.credit_note_number) form.append("metadata[credit_note_number]", cn.credit_note_number);

      const refRes = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const refBody = await refRes.json();
      if (!refRes.ok) {
        await admin.from("sync_logs").insert({ organization_id: cn.organization_id, direction: "outbound", connector_key: "stripe", action: "refund", status: "error", message: refBody?.error?.message ?? "Erro Stripe", payload: { credit_note_id: cn.id } });
        return json(502, { error: "stripe_refund_error", message: refBody?.error?.message });
      }
      refundId = refBody.id as string;
    }

    const { error: finErr } = await admin.rpc("finalize_credit_note_refund", {
      _credit_note_id: cn.id, _wallet_amount: walletAmount, _refund_reference: refundId,
    });
    if (finErr) return json(500, { error: "finalize_failed", message: finErr.message });

    await admin.from("sync_logs").insert({
      organization_id: cn.organization_id, direction: "outbound", connector_key: "stripe", action: "refund", status: "success",
      message: `Reembolso ${cn.credit_note_number}: ${stripeAmount.toFixed(2)}€ Stripe${walletAmount > 0 ? ` + ${walletAmount.toFixed(2)}€ carteira` : ""}.`,
      payload: { credit_note_id: cn.id, refund_id: refundId },
    });

    return json(200, { ok: true, refund_id: refundId, stripe_amount: stripeAmount, wallet_amount: walletAmount });
  } catch (e) {
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
