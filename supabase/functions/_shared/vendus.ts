// Shared Vendus API helpers.
// Docs oficiais: https://www.vendus.pt/ws/v1.1/
// Auth: HTTP Basic — username = api_key, password vazia.
//   Header: Authorization: Basic base64(api_key + ":")
// Base URL: https://www.vendus.pt/ws/v1.1 (Portugal; .es para Espanha).

const VENDUS_BASE = "https://www.vendus.pt/ws/v1.1";

export type VendusCreds = { api_key: string };

async function vendusRequest(creds: VendusCreds, method: string, path: string, params: Record<string, string | number> = {}, body?: unknown) {
  if (!creds?.api_key) throw new Error("vendus_missing_api_key");
  const qsEntries = Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]);
  const qs = new URLSearchParams(qsEntries);
  const url = `${VENDUS_BASE}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const basic = btoa(`${creds.api_key}:`);
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  if (!resp.ok) throw new Error(`vendus_${path}_failed (${resp.status}): ${data?.errors ? JSON.stringify(data.errors) : text}`);
  return data;
}

export async function vendusPing(creds: VendusCreds): Promise<string> {
  await vendusRequest(creds, "GET", "/clients/", { per_page: 1 });
  return "Ligação Vendus OK";
}

// ---------- MAPPERS ----------

export function mapVendusClient(c: any) {
  return {
    name: c.name ?? "",
    tax_id: c.fiscal_id ?? null,
    email: c.email ?? null,
    phone: c.mobile ?? c.phone ?? null,
    billing_address: c.address ?? null,
    billing_city: c.city ?? null,
    billing_postal_code: c.postalcode ?? null,
    billing_country: c.country ?? null,
    vendus_id: c.id ?? null,
  };
}

export function mapVendusDocument(d: any) {
  const net = Number(d.amount_net ?? 0);
  const gross = Number(d.amount_gross ?? 0);
  return {
    invoice_number: d.number ?? String(d.id || ""),
    issue_date: (d.date || "").slice(0, 10),
    subtotal: net,
    // A listagem Vendus não tem amount_tax — calcula-se sempre por diferença.
    tax_total: Number((Math.max(0, gross - net)).toFixed(2)),
    total: gross,
    currency: d.currency_code ?? "EUR",
    status: mapVendusStatus(d.status),
    type: d.type ?? null,
    subtype: d.subtype ?? null,
    customer: {
      name: d.client?.name ?? "",
      vat: d.client?.fiscal_id ?? null,
      email: d.client?.email ?? null,
      address: d.client?.address ?? null,
    },
    // AFINAR CONTRA API REAL: a estrutura das linhas no detalhe do documento
    // não está 100% documentada publicamente; usamos nomes defensivos.
    items: Array.isArray(d.items) ? d.items.map((it: any) => ({
      product_name_raw: it.title ?? it.reference ?? "",
      product_sku_raw: it.reference ?? null,
      quantity: Number(it.qty ?? it.quantity ?? 1),
      unit_price: Number(it.gross_price ?? it.price ?? 0),
      tax_rate: Number(it.tax_rate ?? it.tax ?? 0),
      line_total: Number(it.amount_gross ?? Number(it.qty ?? it.quantity ?? 1) * Number(it.gross_price ?? it.price ?? 0)),
    })) : [],
  };
}

function mapVendusStatus(s: any): string {
  // N = Normal, F = Invoiced -> emitido; A = Canceled -> cancelado.
  if (s === "N" || s === "F") return "issued";
  if (s === "A") return "cancelled";
  return "issued";
}

// ============================================================
// PURE HELPERS (framework de conectores) — ADITIVOS, sem BD.
// ============================================================

import type { CanonicalRecord } from "./connectors/types.ts";

export async function vendusFetchCustomers(creds: VendusCreds): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let page = 1;
  const per_page = 50;
  while (true) {
    const res = await vendusRequest(creds, "GET", "/clients/", { page, per_page });
    const arr: any[] = Array.isArray(res) ? res : (res?.data ?? []);
    if (!arr.length) break;
    for (const raw of arr) {
      const externalId = String(raw?.id ?? "");
      if (!externalId) continue;
      out.push({ entityType: "customer", externalId, data: mapVendusClient(raw) });
    }
    if (arr.length < per_page) break;
    page++;
  }
  return out;
}

export async function vendusFetchInvoices(creds: VendusCreds): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let page = 1;
  const per_page = 50;
  const docTypes = "FT,FR,FS";
  while (true) {
    const res = await vendusRequest(creds, "GET", "/documents/", { page, per_page, type: docTypes });
    const arr: any[] = Array.isArray(res) ? res : (res?.data ?? []);
    if (!arr.length) break;
    for (const summary of arr) {
      const externalId = String(summary?.id ?? "");
      if (!externalId) continue;
      // Buscar detalhe completo (inclui items) — fallback ao summary se falhar.
      let detail: any = summary;
      try { detail = await vendusRequest(creds, "GET", `/documents/${summary.id}/`, {}); }
      catch { detail = summary; }
      out.push({ entityType: "invoice", externalId, data: mapVendusDocument(detail) });
    }
    if (arr.length < per_page) break;
    page++;
  }
  return out;
}
