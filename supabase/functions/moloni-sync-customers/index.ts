import {
  corsHeaders, json, resolveMoloniContext, writeSyncLog,
  upsertExternalRef, findInternalIdByExternal, sanitize,
  MAX_PAGES, PAGE_SIZE,
} from "../_shared/moloni-sync.ts";
import { mapMoloniCustomer } from "../_shared/moloni.ts";

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
      const res = await ctx.moloniCall("customers/getAll", { qty: PAGE_SIZE, offset });
      const page: any[] = Array.isArray(res) ? res : [];
      if (!page.length) break;

      for (const raw of page) {
        const externalId = String(raw?.customer_id ?? "");
        if (!externalId) continue;
        const m = mapMoloniCustomer(raw);
        const row = {
          organization_id: ctx.organizationId,
          name: m.name || `Cliente ${externalId}`,
          tax_id: m.tax_id,
          email: m.email,
          phone: m.phone,
          billing_address: m.billing_address,
          billing_city: m.billing_city,
          billing_postal_code: m.billing_postal_code,
          billing_country: m.billing_country,
          external_id: externalId,
        };
        const existingId = await findInternalIdByExternal(ctx, "customer", externalId);
        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("customers").update(row).eq("id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("customers").insert(row).select("id").single();
          if (error) throw new Error(`DB insert customer: ${error.message}`);
          internalId = ins.id;
        }
        if (internalId) {
          await upsertExternalRef(ctx, "customer", internalId, externalId, {
            vat: m.tax_id ?? null,
          });
          processed += 1;
        }
      }

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      pages += 1;
    }

    await writeSyncLog(ctx, "success", `Moloni › clientes (${processed})`, processed);
    return json(200, { ok: true, records_processed: processed });
  } catch (e) {
    const msg = sanitize(ctx, (e as Error).message || "erro_desconhecido");
    await writeSyncLog(ctx, "failed", msg, processed);
    return json(200, { ok: false, error: msg, records_processed: processed });
  }
});