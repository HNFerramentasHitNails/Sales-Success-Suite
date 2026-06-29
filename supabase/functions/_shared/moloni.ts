// Shared Moloni API helpers (OAuth2 + mappers + import/export).
// Docs: https://www.moloni.pt/dev/
// NOTA: Os nomes de campos podem precisar de afinação contra dados reais
// (a API Moloni v1 retorna estruturas ligeiramente variáveis por endpoint).

const MOLONI_BASE = "https://api.moloni.pt/v1";

export type MoloniCreds = {
  client_id: string;
  client_secret: string;
  developer_username: string;
  developer_password: string;
  company_id?: string | number;
};

export type MoloniConfig = {
  moloni_token?: string;
  moloni_refresh_token?: string;
  moloni_token_expires_at?: string; // ISO
  moloni_company_id?: number;
  allow_invoice_export?: boolean;
  [k: string]: unknown;
};

export type IntegrationRow = {
  id: string;
  organization_id: string;
  is_active: boolean;
  sync_direction: "import" | "export" | "both";
  credentials: MoloniCreds;
  config: MoloniConfig | null;
};

async function persistConfig(admin: any, integrationId: string, prev: MoloniConfig | null, patch: Partial<MoloniConfig>) {
  const merged = { ...(prev ?? {}), ...patch };
  await admin.from("integrations").update({ config: merged }).eq("id", integrationId);
  return merged;
}

async function requestToken(body: Record<string, string>) {
  const params = new URLSearchParams(body);
  const resp = await fetch(`${MOLONI_BASE}/grant/?${params.toString()}`, { method: "GET" });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* keep null */ }
  if (!resp.ok || !data?.access_token) {
    throw new Error(`moloni_oauth_failed: ${data?.error_description || data?.error || text}`);
  }
  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function getMoloniToken(integration: IntegrationRow, admin: any): Promise<string> {
  const cfg = integration.config ?? {};
  const now = Date.now();
  if (cfg.moloni_token && cfg.moloni_token_expires_at && new Date(cfg.moloni_token_expires_at).getTime() - 60_000 > now) {
    return cfg.moloni_token;
  }
  const creds = integration.credentials;
  if (!creds?.client_id || !creds?.client_secret) throw new Error("moloni_missing_credentials");

  // Try refresh first
  if (cfg.moloni_refresh_token) {
    try {
      const r = await requestToken({
        grant_type: "refresh_token",
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: cfg.moloni_refresh_token,
      });
      await persistConfig(admin, integration.id, cfg, {
        moloni_token: r.access_token,
        moloni_refresh_token: r.refresh_token,
        moloni_token_expires_at: new Date(now + r.expires_in * 1000).toISOString(),
      });
      return r.access_token;
    } catch { /* fall back to password grant */ }
  }

  if (!creds.developer_username || !creds.developer_password) throw new Error("moloni_missing_dev_credentials");
  const r = await requestToken({
    grant_type: "password",
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    username: creds.developer_username,
    password: creds.developer_password,
  });
  await persistConfig(admin, integration.id, cfg, {
    moloni_token: r.access_token,
    moloni_refresh_token: r.refresh_token,
    moloni_token_expires_at: new Date(now + r.expires_in * 1000).toISOString(),
  });
  return r.access_token;
}

// Achata um objecto/array aninhado em pares chave/valor com notação PHP de colchetes,
// como esperado pela API Moloni (ex.: products[0][name]=X&products[0][price]=1).
// Ignora null/undefined. Booleans → "1"/"0". Number/string → string.
function flattenForMoloni(value: unknown, prefix: string, out: [string, string][]): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenForMoloni(v, `${prefix}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      flattenForMoloni(v, key, out);
    }
    return;
  }
  if (typeof value === "boolean") { out.push([prefix, value ? "1" : "0"]); return; }
  out.push([prefix, String(value)]);
}

function toFormUrlEncoded(body: Record<string, unknown>): string {
  const pairs: [string, string][] = [];
  for (const [k, v] of Object.entries(body ?? {})) {
    flattenForMoloni(v, k, pairs);
  }
  // URLSearchParams faz o percent-encoding correcto (incluindo dos colchetes).
  const sp = new URLSearchParams();
  for (const [k, v] of pairs) sp.append(k, v);
  return sp.toString();
}

export async function moloniPost(path: string, token: string, body: Record<string, unknown>) {
  // Moloni API: parâmetros em application/x-www-form-urlencoded (estilo PHP).
  // access_token vai na query string; restantes (incluindo company_id) no body form-encoded.
  const resp = await fetch(`${MOLONI_BASE}${path}?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toFormUrlEncoded(body ?? {}),
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* */ }
  // Captura corpo COMPLETO em caso de erro HTTP (não engolir info diagnóstica).
  if (!resp.ok) {
    throw new Error(`moloni_${path}_failed [HTTP ${resp.status}]: ${text}`);
  }
  // Moloni pode responder 200 mas com valid:0 e detalhes de erro por campo.
  if (data && typeof data === "object" && !Array.isArray(data) && (data.valid === 0 || data.valid === "0")) {
    throw new Error(`moloni_${path}_invalid: ${text}`);
  }
  return data;
}

// Aceita apenas inteiros > 0. "0", "", null, NaN, undefined → null.
function toPositiveInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

// Cache em memória por execução da função, evita chamar companies/getAll repetidamente.
const _companyIdCache = new Map<string, number>();

export async function getCompanyId(integration: IntegrationRow, admin: any, token: string): Promise<number> {
  const cached = _companyIdCache.get(integration.id);
  if (cached) return cached;

  const cfg = integration.config ?? {};

  // 1) Configurado manualmente (credentials.company_id ou config.moloni_company_id).
  //    Só aceita inteiros > 0 (string "0", "", null, etc. são rejeitados).
  const fromCreds = toPositiveInt(integration.credentials?.company_id);
  if (fromCreds) {
    _companyIdCache.set(integration.id, fromCreds);
    return fromCreds;
  }
  const fromCfgManual = toPositiveInt((cfg as any).company_id);
  if (fromCfgManual) {
    _companyIdCache.set(integration.id, fromCfgManual);
    return fromCfgManual;
  }
  const fromCfg = toPositiveInt(cfg.moloni_company_id);
  if (fromCfg) {
    _companyIdCache.set(integration.id, fromCfg);
    return fromCfg;
  }

  // 2) Descoberta automática: companies/getAll só precisa do access_token.
  //    Resposta: array de empresas. Pega na primeira com company_id válido.
  const companies = await moloniPost("/companies/getAll/", token, {});
  const list = Array.isArray(companies) ? companies : [];
  let discovered: number | null = null;
  for (const c of list) {
    const cid = toPositiveInt(c?.company_id);
    if (cid) { discovered = cid; break; }
  }

  // 3) Validação CRÍTICA: nunca prosseguir com 0.
  if (!discovered) {
    throw new Error("moloni_no_company_id: não foi possível determinar a empresa Moloni. Verifica o Company ID na configuração ou as permissões da conta.");
  }

  await persistConfig(admin, integration.id, cfg, { moloni_company_id: discovered });
  _companyIdCache.set(integration.id, discovered);
  return discovered;
}

// ---------- MAPPERS ----------
// Estes mappers podem precisar de afinação contra dados reais da API Moloni.

export function mapMoloniCustomer(m: any) {
  return {
    name: m.name ?? "",
    tax_id: m.vat ?? null,
    email: m.email ?? null,
    phone: m.phone ?? null,
    billing_address: m.address ?? null,
    billing_city: m.city ?? null,
    billing_postal_code: m.zip_code ?? null,
    // TODO: mapear country_id (int Moloni) -> ISO via /global-data/countries/.
    billing_country: m.country_id ? String(m.country_id) : (m.country ?? null),
    moloni_customer_id: m.customer_id ?? null,
  };
}

export function mapMoloniInvoice(d: any) {
  // Documentos de venda Moloni: usa document_set.name + number (ex: "FT 2024/123").
  const setName: string | null = d.document_set?.name ?? d.document_set_name ?? null;
  const docNumber: string = setName && d.number != null
    ? `${setName} ${d.number}`
    : (d.number != null ? String(d.number) : String(d.document_id || ""));
  return {
    invoice_number: docNumber,
    issue_date: (d.date || "").slice(0, 10), // YYYY-MM-DD
    subtotal: Math.min(Number(d.net_value ?? 0), Number(d.gross_value ?? 0)),
    tax_total: Number(d.taxes_value ?? 0),
    total: Math.max(Number(d.net_value ?? 0), Number(d.gross_value ?? 0)),
    currency: d.exchange_currency?.iso4217 ?? "EUR",
    status: mapMoloniStatus(d.status),
    moloni_document_id: d.document_id ?? null,
    customer: {
      name: d.entity_name ?? "",
      vat: d.entity_vat ?? null,
      address: d.entity_address ?? null,
      city: d.entity_city ?? null,
      zip_code: d.entity_zip_code ?? null,
      country: d.entity_country ?? null,
    },
    items: Array.isArray(d.products) ? d.products.map((p: any) => {
      const qty = Number(p.qty ?? 1);
      const price = Number(p.price ?? 0);
      const discount = Number(p.discount ?? 0); // 0–100 (%)
      const taxes = Array.isArray(p.taxes) ? p.taxes : [];
      return {
        product_name_raw: p.name ?? "",
        product_sku_raw: p.reference ?? null,
        quantity: qty,
        unit_price: price,
        tax_rate: taxes.length ? Number(taxes[0]?.value ?? 0) : 0,
        line_total: Number((qty * price * (1 - discount / 100)).toFixed(2)),
      };
    }) : [],
  };
}

function mapMoloniStatus(s: any): string {
  // Moloni: 0 = rascunho, 1 = fechado/emitido. Outros mantêm-se como draft.
  if (s === 1 || s === "1") return "issued";
  return "draft";
}

// ============================================================
// PURE HELPERS (framework de conectores) — ADITIVOS, sem BD.
// Não tocam em integrations.config; o token é obtido em memória.
// ============================================================

import type { CanonicalRecord } from "./connectors/types.ts";

type AnyCreds = Record<string, string | number | undefined> & {
  client_id?: string; client_secret?: string;
  developer_username?: string; developer_password?: string;
  username?: string; password?: string;
  company_id?: string | number;
};

export async function moloniGetTokenFromCreds(creds: AnyCreds): Promise<string> {
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error("moloni_missing_credentials");
  }
  const username = creds.developer_username ?? creds.username;
  const password = creds.developer_password ?? creds.password;
  if (!username || !password) throw new Error("moloni_missing_dev_credentials");
  const r = await requestToken({
    grant_type: "password",
    client_id: String(creds.client_id),
    client_secret: String(creds.client_secret),
    username: String(username),
    password: String(password),
  });
  return r.access_token;
}

export async function moloniResolveCompanyId(creds: AnyCreds, token: string): Promise<number> {
  const fromCreds = toPositiveInt(creds?.company_id);
  if (fromCreds) return fromCreds;
  const companies = await moloniPost("/companies/getAll/", token, {});
  const list = Array.isArray(companies) ? companies : [];
  for (const c of list) {
    const cid = toPositiveInt(c?.company_id);
    if (cid) return cid;
  }
  throw new Error("moloni_no_company_id");
}

export async function fetchMoloniCustomers(token: string, companyId: number): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let offset = 0; const qty = 50;
  while (true) {
    const res = await moloniPost("/customers/getAll/", token, { company_id: companyId, qty, offset });
    const page: any[] = Array.isArray(res) ? res : [];
    if (!page.length) break;
    for (const raw of page) {
      const externalId = String(raw?.customer_id ?? "");
      if (!externalId) continue;
      out.push({ entityType: "customer", externalId, data: mapMoloniCustomer(raw) });
    }
    if (page.length < qty) break;
    offset += qty;
  }
  return out;
}

export async function fetchMoloniInvoices(token: string, companyId: number): Promise<CanonicalRecord[]> {
  const out: CanonicalRecord[] = [];
  let offset = 0; const qty = 50;
  while (true) {
    const res = await moloniPost("/documents/getAll/", token, { company_id: companyId, qty, offset });
    const page: any[] = Array.isArray(res) ? res : [];
    if (!page.length) break;
    for (const summary of page) {
      const documentId = summary?.document_id;
      if (!documentId) continue;
      // Buscar o detalhe COMPLETO (inclui products[] / linhas).
      const detail = await moloniPost("/documents/getOne/", token, {
        company_id: companyId, document_id: documentId,
      });
      out.push({
        entityType: "invoice",
        externalId: String(documentId),
        data: mapMoloniInvoice(detail),
      });
    }
    if (page.length < qty) break;
    offset += qty;
  }
  return out;
}
