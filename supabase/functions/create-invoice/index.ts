import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/connector-secrets.ts";
import { issueInvoiceForOrder } from "../_shared/issue-invoice.ts";

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json(401, { error: "unauthorized" });
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const orderId = (body as any)?.order_id as string | undefined;
    if (!orderId) return json(200, { ok: false, code: "order_id_required", message: "order_id em falta." });

    const admin = adminClient();

    // Carrega a encomenda apenas para validar pertença e papel do utilizador.
    const { data: order } = await admin
      .from("orders")
      .select("id, organization_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json(200, { ok: false, code: "order_not_found", message: "Encomenda não encontrada." });

    const { data: membership } = await admin
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", order.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || membership.status !== "active") {
      return json(200, { ok: false, code: "not_a_member", message: "Não pertence a esta organização." });
    }
    if (!["owner", "admin", "sales_director", "sales_rep"].includes(membership.role)) {
      return json(200, { ok: false, code: "forbidden", message: "Sem permissão para emitir faturas." });
    }

    const result = await issueInvoiceForOrder(admin, orderId, userId);
    if (result.ok) {
      return json(200, { ok: true, invoice: result.invoice, already: result.already ?? false });
    }
    // Devolve sempre 200 com o motivo do insucesso para o frontend mostrar a mensagem real.
    return json(200, { ok: false, code: result.code, message: result.message });
  } catch (e) {
    return json(200, { ok: false, code: "internal_error", message: String((e as any)?.message ?? e) });
  }
});