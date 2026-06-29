import {
  corsHeaders, json, resolveContext, shopifyGet, nextPageUrl,
  writeSyncLog, upsertExternalRef, findInternalIdByExternal, MAX_PAGES,
  type SyncContext,
} from "../_shared/shopify-sync.ts";

// Map Shopify financial/fulfillment to internal status
function mapStatus(o: any): string {
  if (o.cancelled_at) return "cancelada";
  if (o.financial_status === "paid" || o.financial_status === "partially_paid") return "faturado";
  return "encomenda";
}

async function ensureCustomer(
  ctx: SyncContext,
  shopifyCustomer: any | null,
  fallbackName: string,
): Promise<{ id: string | null; name: string }> {
  if (!shopifyCustomer?.id) return { id: null, name: fallbackName };
  const extId = String(shopifyCustomer.id);
  let internalId = await findInternalIdByExternal(ctx, "customer", extId);
  const name =
    [shopifyCustomer.first_name, shopifyCustomer.last_name].filter(Boolean).join(" ").trim()
    || shopifyCustomer.email || fallbackName;

  if (!internalId) {
    const { data: ins, error } = await ctx.admin
      .from("customers")
      .insert({
        organization_id: ctx.organizationId,
        name,
        email: shopifyCustomer.email ?? null,
        phone: shopifyCustomer.phone ?? null,
        external_id: extId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`DB insert customer (order): ${error.message}`);
    internalId = ins.id;
    await upsertExternalRef(ctx, "customer", internalId!, extId, { source: "order_sync" });
  }
  return { id: internalId, name };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveContext(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });
  const ctx = r.ctx;
  let processed = 0;
  let pageUrl: string | null = `/admin/api/2024-01/orders.json?status=any&limit=250`;
  let pages = 0;

  try {
    while (pageUrl && pages < MAX_PAGES) {
      const resp = await shopifyGet(ctx, pageUrl);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Shopify HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const data = await resp.json();
      const orders = (data?.orders ?? []) as any[];

      for (const o of orders) {
        const externalId = String(o.id);
        const orderNumber = o.name || `#${o.order_number ?? externalId}`;
        const fallbackName = [o?.billing_address?.first_name, o?.billing_address?.last_name]
          .filter(Boolean).join(" ").trim() || o?.email || "Cliente Shopify";

        const { id: customerId, name: customerName } = await ensureCustomer(
          ctx, o.customer, fallbackName,
        );

        const subtotal = Number(o.subtotal_price ?? o.current_subtotal_price ?? 0) || 0;
        const total = Number(o.total_price ?? o.current_total_price ?? 0) || 0;
        const tax = Number(o.total_tax ?? o.current_total_tax ?? 0) || 0;
        const currency = o.currency || "EUR";
        const orderDate = (o.created_at || new Date().toISOString()).slice(0, 10);
        const status = mapStatus(o);

        const row = {
          organization_id: ctx.organizationId,
          order_number: orderNumber,
          customer_id: customerId,
          customer_name_raw: customerName,
          category: "Produto" as const,
          status,
          subtotal,
          tax_total: tax,
          total,
          currency,
          source: "shopify",
          order_date: orderDate,
          notes: o.note ?? null,
        };

        const existingId = await findInternalIdByExternal(ctx, "order", externalId);
        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("orders").update(row).eq("id", existingId);
          // Limpa linhas e re-insere (idempotente)
          await ctx.admin.from("order_items").delete().eq("order_id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("orders")
            .insert(row)
            .select("id")
            .single();
          if (error) throw new Error(`DB insert order: ${error.message}`);
          internalId = ins.id;
        }

        // Linhas
        const items = (o.line_items ?? []) as any[];
        if (internalId && items.length > 0) {
          const itemsRows = await Promise.all(items.map(async (li, idx) => {
            let productId: string | null = null;
            if (li.product_id) {
              productId = await findInternalIdByExternal(ctx, "product", String(li.product_id));
            }
            const quantity = Number(li.quantity ?? 1) || 1;
            const unitPrice = Number(li.price ?? 0) || 0;
            return {
              organization_id: ctx.organizationId,
              order_id: internalId,
              product_id: productId,
              description: (li.title || li.name || "Item").slice(0, 500),
              quantity,
              unit_price: unitPrice,
              line_total: unitPrice * quantity,
              position: idx,
            };
          }));
          const { error: itemsErr } = await ctx.admin.from("order_items").insert(itemsRows);
          if (itemsErr) throw new Error(`DB insert order_items: ${itemsErr.message}`);
        }

        if (internalId) {
          await upsertExternalRef(ctx, "order", internalId, externalId, {
            order_number: orderNumber, updated_at: o.updated_at ?? null,
          });
          processed += 1;
        }
      }

      pageUrl = nextPageUrl(resp.headers.get("link"));
      pages += 1;
    }

    await writeSyncLog(ctx, "success", `Sincronização Shopify › encomendas (${processed})`, processed);
    return json(200, { ok: true, records_processed: processed });
  } catch (e) {
    const msg = (e as Error).message || "erro_desconhecido";
    const safe = msg.replace(ctx.creds.admin_access_token, "***");
    await writeSyncLog(ctx, "failed", safe.slice(0, 500), processed);
    return json(200, { ok: false, error: safe, records_processed: processed });
  }
});