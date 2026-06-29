import {
  corsHeaders, json, resolveContext, shopifyGet, nextPageUrl,
  writeSyncLog, upsertExternalRef, findInternalIdByExternal, MAX_PAGES,
} from "../_shared/shopify-sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveContext(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });
  const ctx = r.ctx;
  let processed = 0;
  let pageUrl: string | null = `/admin/api/2024-01/products.json?limit=250`;
  let pages = 0;

  try {
    while (pageUrl && pages < MAX_PAGES) {
      const resp = await shopifyGet(ctx, pageUrl);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Shopify HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const data = await resp.json();
      const products = (data?.products ?? []) as any[];

      for (const p of products) {
        const externalId = String(p.id);
        const firstVariant = (p.variants ?? [])[0] ?? {};
        const sku = firstVariant.sku || null;
        const unitPrice = Number(firstVariant.price ?? 0) || 0;
        const name = (p.title || `Produto ${externalId}`).slice(0, 500);

        const existingId = await findInternalIdByExternal(ctx, "product", externalId);
        const row = {
          organization_id: ctx.organizationId,
          name,
          sku,
          unit_price: unitPrice,
          is_active: p.status === "active",
        };

        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("products").update(row).eq("id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("products")
            .insert(row)
            .select("id")
            .single();
          if (error) throw new Error(`DB insert product: ${error.message}`);
          internalId = ins.id;
        }
        if (internalId) {
          await upsertExternalRef(ctx, "product", internalId, externalId, {
            handle: p.handle ?? null, updated_at: p.updated_at ?? null,
          });
          processed += 1;
        }
      }

      pageUrl = nextPageUrl(resp.headers.get("link"));
      pages += 1;
    }

    await writeSyncLog(ctx, "success", `Sincronização Shopify › produtos (${processed})`, processed);
    return json(200, { ok: true, records_processed: processed });
  } catch (e) {
    const msg = (e as Error).message || "erro_desconhecido";
    const safe = msg.replace(ctx.creds.admin_access_token, "***");
    await writeSyncLog(ctx, "failed", safe.slice(0, 500), processed);
    return json(200, { ok: false, error: safe, records_processed: processed });
  }
});