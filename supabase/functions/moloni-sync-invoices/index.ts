import {
  corsHeaders, json, resolveMoloniContext, writeSyncLog,
  upsertExternalRef, findInternalIdByExternal, sanitize,
  MAX_PAGES, PAGE_SIZE, type MoloniSyncContext,
} from "../_shared/moloni-sync.ts";
import { mapMoloniInvoice } from "../_shared/moloni.ts";

// Garante a existência de um customer interno a partir do entity_id do documento.
async function ensureCustomer(
  ctx: MoloniSyncContext,
  entityId: string | number | null,
  fallback: { name: string; vat?: string | null },
): Promise<string | null> {
  if (!entityId) {
    // Sem entity_id: cria/usa um cliente placeholder por nome (não mapeia em external_refs).
    if (!fallback.name) return null;
    const { data: existing } = await ctx.admin
      .from("customers")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("name", fallback.name)
      .is("external_id", null)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: ins, error } = await ctx.admin
      .from("customers")
      .insert({
        organization_id: ctx.organizationId,
        name: fallback.name,
        tax_id: fallback.vat ?? null,
      })
      .select("id").single();
    if (error) throw new Error(`DB insert customer (invoice): ${error.message}`);
    return ins.id as string;
  }

  const ext = String(entityId);
  const existing = await findInternalIdByExternal(ctx, "customer", ext);
  if (existing) return existing;

  const { data: ins, error } = await ctx.admin
    .from("customers")
    .insert({
      organization_id: ctx.organizationId,
      name: fallback.name || `Cliente ${ext}`,
      tax_id: fallback.vat ?? null,
      external_id: ext,
    })
    .select("id").single();
  if (error) throw new Error(`DB insert customer (invoice): ${error.message}`);
  await upsertExternalRef(ctx, "customer", ins.id, ext, { source: "invoice_sync" });
  return ins.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveMoloniContext(req);
  if (!r.ok) return json(200, { ok: false, error: r.error });
  const ctx = r.ctx;

  // Range opcional via body: { date_start?: 'YYYY-MM-DD', date_end?: 'YYYY-MM-DD' }
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = now.toISOString().slice(0, 10);
  const date_start = (body?.date_start as string) || defaultStart;
  const date_end = (body?.date_end as string) || defaultEnd;

  let processed = 0;
  let offset = 0;
  let pages = 0;

  try {
    while (pages < MAX_PAGES) {
      const summaries = await ctx.moloniCall("documents/getAll", {
        qty: PAGE_SIZE, offset, date_start, date_end,
      });
      const page: any[] = Array.isArray(summaries) ? summaries : [];
      if (!page.length) break;

      for (const s of page) {
        const documentId = s?.document_id;
        if (!documentId) continue;
        const externalId = String(documentId);

        // Detalhe (inclui products[])
        const detail = await ctx.moloniCall("documents/getOne", { document_id: documentId });
        const mapped = mapMoloniInvoice(detail);

        const customerId = await ensureCustomer(ctx, detail?.entity_id ?? null, {
          name: detail?.entity_name ?? mapped.customer?.name ?? "",
          vat: detail?.entity_vat ?? mapped.customer?.vat ?? null,
        });

        const row = {
          organization_id: ctx.organizationId,
          customer_id: customerId,
          invoice_number: mapped.invoice_number,
          issue_date: mapped.issue_date,
          subtotal: mapped.subtotal,
          tax_total: mapped.tax_total,
          total: mapped.total,
          currency: mapped.currency,
          status: mapped.status,
          source: "moloni",
          external_id: externalId,
          customer_name_raw: detail?.entity_name ?? null,
          customer_tax_id_raw: detail?.entity_vat ?? null,
          category: detail?.document_type?.name ?? null,
          imported_at: new Date().toISOString(),
        };

        let existingId = await findInternalIdByExternal(ctx, "invoice", externalId);
        if (!existingId && mapped.invoice_number) {
          const { data: byNumber } = await ctx.admin
            .from("invoices")
            .select("id")
            .eq("organization_id", ctx.organizationId)
            .eq("invoice_number", mapped.invoice_number)
            .maybeSingle();
          if (byNumber) existingId = byNumber.id as string;
        }
        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("invoices").update(row).eq("id", existingId);
          await ctx.admin.from("invoice_items").delete().eq("invoice_id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("invoices").insert(row).select("id").single();
          if (error) throw new Error(`DB insert invoice: ${error.message}`);
          internalId = ins.id;
        }

        if (internalId && mapped.items.length > 0) {
          const itemsRows = mapped.items.map((it) => ({
            organization_id: ctx.organizationId,
            invoice_id: internalId!,
            product_id: null,
            product_name_raw: it.product_name_raw,
            product_sku_raw: it.product_sku_raw,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate,
            line_total: it.line_total,
          }));
          const { error: itemsErr } = await ctx.admin.from("invoice_items").insert(itemsRows);
          if (itemsErr) throw new Error(`DB insert invoice_items: ${itemsErr.message}`);
        }

        if (internalId) {
          await upsertExternalRef(ctx, "invoice", internalId, externalId, {
            invoice_number: mapped.invoice_number,
            issue_date: mapped.issue_date,
          });
          processed += 1;
        }
      }

      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      pages += 1;
    }

    await writeSyncLog(
      ctx, "success",
      `Moloni › faturas ${date_start}…${date_end} (${processed})`,
      processed,
    );
    return json(200, { ok: true, records_processed: processed, date_start, date_end });
  } catch (e) {
    const msg = sanitize(ctx, (e as Error).message || "erro_desconhecido");
    await writeSyncLog(ctx, "failed", msg, processed);
    return json(200, { ok: false, error: msg, records_processed: processed });
  }
});