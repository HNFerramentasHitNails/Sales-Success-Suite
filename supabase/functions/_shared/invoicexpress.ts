// Shared InvoiceXpress API helpers.
// Docs: https://docs.invoicexpress.com/
// Auth: api_key passado como query param em todos os pedidos.
// Base URL: https://{account_name}.app.invoicexpress.com
// Rate limit: 780 pedidos/minuto por conta. Em 429 fazemos um retry curto.

export type IXCreds = { account_name: string; api_key: string };

function baseUrl(creds: IXCreds) {
  if (!creds?.account_name) throw new Error("invoicexpress_missing_account_name");
  if (!creds?.api_key) throw new Error("invoicexpress_missing_api_key");
  return `https://${creds.account_name}.app.invoicexpress.com`;
}

async function ixRequest(creds: IXCreds, method: string, path: string, params: Record<string, string | number> = {}, body?: unknown) {
  const qs = new URLSearchParams({ api_key: creds.api_key, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const url = `${baseUrl(creds)}${path}?${qs.toString()}`;
  let attempt = 0;
  while (true) {
    const resp = await fetch(url, {
      method,
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* */ }
    if (resp.status === 429 && attempt < 2) {
      attempt++;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (!resp.ok) throw new Error(`invoicexpress_${path}_failed (${resp.status}): ${data?.errors ? JSON.stringify(data.errors) : text}`);
    return data;
  }
}

export async function ixPing(creds: IXCreds): Promise<string> {
  await ixRequest(creds, "GET", "/clients.json", { per_page: 1, page: 1 });
  return `Ligação InvoiceXpress OK (conta ${creds.account_name})`;
}

// ---------- MAPPERS ----------

export function mapIXClient(c: any) {
  return {
    name: c.name ?? "",
    tax_id: c.fiscal_id ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    billing_address: c.address ?? null,
    billing_city: c.city ?? null,
    billing_postal_code: c.postal_code ?? null,
    billing_country: c.country ?? null,
    ix_client_id: c.id ?? null,
  };
}

// Converte "dd/mm/yyyy" (formato InvoiceXpress) para "YYYY-MM-DD".
export function parseIXDate(s: any): string | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// O campo `currency` vem como NOME ("Euro", "Pound sterling", ...), não ISO.
const IX_CURRENCY_BY_NAME: Record<string, string> = {
  "Euro": "EUR",
  "Pound sterling": "GBP",
  "U.S. dollar": "USD",
  "Canadian dollar": "CAD",
  "Brazilian real": "BRL",
};
function mapIXCurrency(name: any): string {
  if (!name || typeof name !== "string") return "EUR";
  return IX_CURRENCY_BY_NAME[name] ?? "EUR";
}

export function mapIXInvoice(d: any) {
  const invoiceNumber = d.inverted_sequence_number || d.sequence_number || String(d.id || "");
  return {
    invoice_number: invoiceNumber,
    issue_date: parseIXDate(d.date),
    subtotal: Number(d.before_taxes ?? 0), // tributável (NÃO `sum`)
    tax_total: Number(d.taxes ?? 0),
    total: Number(d.total ?? 0),
    currency: mapIXCurrency(d.currency),
    status: mapIXStatus(d.status),
    customer: {
      name: d.client?.name ?? "",
      vat: d.client?.fiscal_id ?? null,
      email: d.client?.email ?? null,
      address: d.client?.address ?? null,
      city: d.client?.city ?? null,
      postal_code: d.client?.postal_code ?? null,
      country: d.client?.country ?? null,
    },
    items: Array.isArray(d.items) ? d.items.map((it: any) => {
      const qty = Number(it.quantity ?? 1);
      const unit = Number(it.unit_price ?? 0);
      const disc = Number(it.discount ?? 0); // % 0–100
      return {
        product_name_raw: it.name ?? "",
        product_sku_raw: null, // InvoiceXpress não garante reference/sku no item
        quantity: qty,
        unit_price: unit,
        tax_rate: Number(it.tax?.value ?? 0),
        line_total: Number((qty * unit * (1 - disc / 100)).toFixed(2)),
      };
    }) : [],
  };
}

function mapIXStatus(s: any): string {
  if (s === "final" || s === "settled" || s === "second_copy") return "issued";
  if (s === "canceled") return "cancelled";
  if (s === "draft") return "draft";
  return "draft";
}

// ============================================================
// PURE HELPERS (framework de conectores) — ADITIVOS, sem BD.
// ============================================================

import type { CanonicalRecord } from "./connectors/types.ts";

export async function ixFetchCustomers(creds: IXCreds): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let page = 1;
  const per_page = 30;
  while (true) {
    const body = await ixRequest(creds, "GET", "/clients.json", { page, per_page });
    const list: any = body?.clients ?? body?.client ?? [];
    const arr: any[] = Array.isArray(list) ? list : (list ? [list] : []);
    if (!arr.length) break;
    for (const raw of arr) {
      const externalId = String(raw?.id ?? "");
      if (!externalId) continue;
      out.push({ entityType: "customer", externalId, data: mapIXClient(raw) });
    }
    const totalPages = Number(body?.pagination?.total_pages ?? 1);
    if (page >= totalPages) break;
    page++;
  }
  return out;
}

export async function ixFetchInvoices(creds: IXCreds): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let page = 1;
  const per_page = 30;
  while (true) {
    const body = await ixRequest(creds, "GET", "/invoices.json", { page, per_page });
    const list: any = body?.invoices ?? [];
    const arr: any[] = Array.isArray(list) ? list : (list ? [list] : []);
    if (!arr.length) break;
    for (const raw of arr) {
      const externalId = String(raw?.id ?? "");
      if (!externalId) continue;
      out.push({ entityType: "invoice", externalId, data: mapIXInvoice(raw) });
    }
    const totalPages = Number(body?.pagination?.total_pages ?? 1);
    if (page >= totalPages) break;
    page++;
  }
  return out;
}
