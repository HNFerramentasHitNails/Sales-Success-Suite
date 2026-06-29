// Endpoint interno chamado pelo trigger AFTER UPDATE/INSERT em `public.orders`
// (via pg_net). Verifica um segredo partilhado guardado em `public.runtime_config`
// e delega a emissão na função partilhada (idempotente).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/connector-secrets.ts";
import { issueInvoiceForOrder } from "../_shared/issue-invoice.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const provided = req.headers.get("x-internal-secret") ?? "";
  const admin = adminClient();

  const { data: cfg } = await admin
    .from("runtime_config")
    .select("internal_secret")
    .eq("id", true)
    .maybeSingle();
  const expected = (cfg as any)?.internal_secret as string | undefined;
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return json(401, { error: "unauthorized" });
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const orderId = String(body.order_id ?? "");
  if (!orderId) return json(400, { error: "order_id_required" });

  // `created_by` é null: ação automática do sistema.
  const result = await issueInvoiceForOrder(admin, orderId, null);

  // Nunca devolvemos erro 5xx ao trigger: o objetivo é registar e seguir.
  if (result.ok) {
    return json(200, { ok: true, already: (result as any).already ?? false, invoice_id: result.invoice?.id });
  }
  return json(200, { ok: false, code: result.code, message: result.message, status: result.status });
});