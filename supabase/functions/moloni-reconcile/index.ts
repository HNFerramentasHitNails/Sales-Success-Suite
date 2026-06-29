import {
  corsHeaders, json, resolveMoloniContext, writeSyncLog, sanitize,
  MAX_PAGES, PAGE_SIZE,
} from "../_shared/moloni-sync.ts";
import { mapMoloniInvoice } from "../_shared/moloni.ts";

type Discrepancy = {
  external_id: string;
  invoice_number: string;
  issue_date: string;
  moloni_total: number;
  local_total: number | null;
  diff: number | null;
  reason: "missing_local" | "amount_mismatch";
};

function monthRange(month: string): { start: string; end: string } {
  // month: 'YYYY-MM'
  const [y, m] = month.split("-").map(Number);
  const startD = new Date(Date.UTC(y, m - 1, 1));
  const endD = new Date(Date.UTC(y, m, 0)); // último dia do mês
  return {
    start: startD.toISOString().slice(0, 10),
    end: endD.toISOString().slice(0, 10),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveMoloniContext(req);
  if (!r.ok) return json(200, { ok: false, error: r.error });
  const ctx = r.ctx;

  const body = await req.json().catch(() => ({}));
  const month: string = body?.month
    || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { start, end } = monthRange(month);

  try {
    // 1) Faturas locais (source moloni ou hub) no intervalo
    const { data: localRows, error: lErr } = await ctx.admin
      .from("invoices")
      .select("id, external_id, invoice_number, issue_date, total, source")
      .eq("organization_id", ctx.organizationId)
      .gte("issue_date", start)
      .lte("issue_date", end);
    if (lErr) throw new Error(`DB read invoices: ${lErr.message}`);

    const localByExt = new Map<string, { total: number; invoice_number: string }>();
    const localByNumber = new Map<string, { total: number; invoice_number: string }>();
    for (const row of localRows ?? []) {
      if (row.external_id) {
        localByExt.set(String(row.external_id), {
          total: Number(row.total ?? 0),
          invoice_number: row.invoice_number,
        });
      }
      if (row.invoice_number) {
        localByNumber.set(row.invoice_number, {
          total: Number(row.total ?? 0),
          invoice_number: row.invoice_number,
        });
      }
    }

    // 2) Documentos Moloni no intervalo (summary chega aqui — basta total + número)
    const moloniInvoices: Array<{
      external_id: string; invoice_number: string; issue_date: string; total: number;
    }> = [];
    let offset = 0;
    let pages = 0;
    while (pages < MAX_PAGES) {
      const res = await ctx.moloniCall("documents/getAll", {
        qty: PAGE_SIZE, offset, date_start: start, date_end: end,
      });
      const page: any[] = Array.isArray(res) ? res : [];
      if (!page.length) break;
      for (const d of page) {
        const externalId = String(d?.document_id ?? "");
        if (!externalId) continue;
        const mapped = mapMoloniInvoice(d);
        moloniInvoices.push({
          external_id: externalId,
          invoice_number: mapped.invoice_number || externalId,
          issue_date: mapped.issue_date,
          total: round2(Number(d?.gross_value ?? mapped.total ?? 0)),
        });
      }
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE; pages += 1;
    }

    // 3) Compara
    const discrepancies: Discrepancy[] = [];
    let moloniTotalSum = 0;
    for (const m of moloniInvoices) {
      moloniTotalSum += m.total;
      const local = localByExt.get(m.external_id) ?? localByNumber.get(m.invoice_number) ?? null;
      if (!local) {
        discrepancies.push({
          external_id: m.external_id,
          invoice_number: m.invoice_number,
          issue_date: m.issue_date,
          moloni_total: m.total,
          local_total: null,
          diff: null,
          reason: "missing_local",
        });
        continue;
      }
      const diff = round2(local.total - m.total);
      if (Math.abs(diff) >= 0.01) {
        discrepancies.push({
          external_id: m.external_id,
          invoice_number: m.invoice_number,
          issue_date: m.issue_date,
          moloni_total: m.total,
          local_total: round2(local.total),
          diff,
          reason: "amount_mismatch",
        });
      }
    }

    const summary = `Reconciliação ${month}: Moloni=${moloniInvoices.length} docs/${round2(moloniTotalSum)}€; ` +
      `discrepâncias=${discrepancies.length}.`;
    await writeSyncLog(ctx, "success", summary, discrepancies.length);

    return json(200, {
      ok: true,
      month,
      date_start: start,
      date_end: end,
      moloni_count: moloniInvoices.length,
      moloni_total: round2(moloniTotalSum),
      discrepancies,
    });
  } catch (e) {
    const msg = sanitize(ctx, (e as Error).message || "erro_desconhecido");
    await writeSyncLog(ctx, "failed", msg, 0);
    return json(200, { ok: false, error: msg });
  }
});