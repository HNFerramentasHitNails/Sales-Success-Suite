import {
  corsHeaders, json, resolveMoloniContext, writeSyncLog,
  upsertExternalRef, findInternalIdByExternal, sanitize,
  MAX_PAGES, PAGE_SIZE,
} from "../_shared/moloni-sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveMoloniContext(req);
  if (!r.ok) return json(200, { ok: false, error: r.error });
  const ctx = r.ctx;

  let processed = 0;
  let offset = 0;
  let pages = 0;

  try {
    while (pages < MAX_PAGES) {
      const res = await ctx.moloniCall("products/getAll", { qty: PAGE_SIZE, offset });
      const page: any[] = Array.isArray(res) ? res : [];
      if (!page.length) break;

      for (const p of page) {
        const externalId = String(p?.product_id ?? "");
        if (!externalId) continue;
        const name = (p.name || `Produto ${externalId}`).slice(0, 500);
        const sku = p.reference ?? null;
        const unitPrice = Number(p.price ?? 0) || 0;
        const row = {
          organization_id: ctx.organizationId,
          name,
          sku,
          unit_price: unitPrice,
          is_active: p.has_stock === 1 || p.has_stock === undefined ? true : !!p.has_stock,
        };
        const existingId = await findInternalIdByExternal(ctx, "product", externalId);
        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("products").update(row).eq("id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("products").insert(row).select("id").single();
          if (error) throw new Error(`DB insert product: ${error.message}`);
          internalId = ins.id;
        }
        if (internalId) {
          await upsertExternalRef(ctx, "product", internalId, externalId, {
            reference: sku ?? null,
          });
          processed += 1;
        }
      }

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      pages += 1;
    }

    await writeSyncLog(ctx, "success", `Moloni › produtos (${processed})`, processed);
    return json(200, { ok: true, records_processed: processed });
  } catch (e) {
    const msg = sanitize(ctx, (e as Error).message || "erro_desconhecido");
    await writeSyncLog(ctx, "failed", msg, processed);
    return json(200, { ok: false, error: msg, records_processed: processed });
  }
});