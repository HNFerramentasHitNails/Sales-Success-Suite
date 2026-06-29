// Cria um rascunho de Encomenda Cliente no Moloni a partir de uma encomenda interna.
// Resolve org do utilizador, carrega credenciais Moloni via vault, e chama
// /documents/orders/insert/ (documento "Encomenda Cliente" — equivalente a rascunho de venda).
// Guarda o moloni_document_id na encomenda e um registo em external_refs.
import {
  corsHeaders, json, resolveMoloniContext, upsertExternalRef, sanitize,
} from "../_shared/moloni-sync.ts";

type Body = { order_id?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const orderId = body.order_id;
  if (!orderId || typeof orderId !== "string") {
    return json(400, { ok: false, error: "missing_order_id" });
  }

  const r = await resolveMoloniContext(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });
  const ctx = r.ctx;

  try {
    // 1) Carrega encomenda + linhas (filtra por org como salvaguarda extra)
    const { data: order, error: oErr } = await ctx.admin
      .from("orders")
      .select("id, organization_id, order_number, order_date, notes, subtotal, total, customer_id, customer_name_raw, billing_address, shipping_address")
      .eq("id", orderId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (oErr || !order) return json(404, { ok: false, error: "order_not_found" });

    const { data: items, error: iErr } = await ctx.admin
      .from("order_items")
      .select("description, quantity, unit_price, discount_pct, product_id")
      .eq("order_id", orderId)
      .order("position", { ascending: true });
    if (iErr) throw new Error(iErr.message);
    if (!items || items.length === 0) return json(400, { ok: false, error: "order_has_no_items" });

    // 2) Resolve customer Moloni id (se já existir external_ref); caso contrário usa nome avulso
    let moloniCustomerId: number | null = null;
    if (order.customer_id) {
      const { data: ref } = await ctx.admin
        .from("external_refs")
        .select("external_id")
        .eq("organization_id", ctx.organizationId)
        .eq("provider", "moloni")
        .eq("entity_type", "customer")
        .eq("internal_id", order.customer_id)
        .maybeSingle();
      if (ref?.external_id) moloniCustomerId = Number(ref.external_id) || null;
    }
    if (!moloniCustomerId) {
      return json(400, { ok: false, error: "customer_not_synced_to_moloni" });
    }

    // 3) Constrói payload Moloni — documents/orders/insert/
    //    Os IDs Moloni de tax/document_set podem variar por conta; usamos os defaults da empresa
    //    quando disponíveis. Para um rascunho, status=0.
    const products = items.map((l) => ({
      name: l.description,
      qty: Number(l.quantity || 0),
      price: Number(l.unit_price || 0),
      discount: Number(l.discount_pct || 0),
    }));

    const payload: Record<string, unknown> = {
      date: order.order_date,
      expiration_date: order.order_date,
      customer_id: moloniCustomerId,
      status: 0, // 0 = rascunho
      notes: order.notes ?? `Origem: Hub · ${order.order_number}`,
      products,
    };

    const res = await ctx.moloniCall("documents/orders/insert", payload);
    const documentId = res?.document_id ?? res?.documentId ?? null;
    if (!documentId) {
      throw new Error(`moloni_no_document_id: ${JSON.stringify(res).slice(0, 200)}`);
    }

    // 4) Guarda o id no orders e cria external_ref
    await ctx.admin
      .from("orders")
      .update({ moloni_document_id: String(documentId) })
      .eq("id", orderId)
      .eq("organization_id", ctx.organizationId);

    // upsertExternalRef foi pensado para customer/product/invoice — alargamos via insert directo.
    // O unique constraint de external_refs é (org, provider, entity_type, external_id).
    await ctx.admin.from("external_refs").upsert({
      organization_id: ctx.organizationId,
      provider: "moloni",
      entity_type: "order",
      internal_id: orderId,
      external_id: String(documentId),
      metadata: { order_number: order.order_number },
    }, { onConflict: "organization_id,provider,entity_type,external_id" });

    return json(200, { ok: true, moloni_document_id: String(documentId) });
  } catch (e) {
    const msg = sanitize(ctx, (e as Error).message || "erro_desconhecido");
    return json(200, { ok: false, error: msg });
  }
});