// Emite a fatura de uma encomenda no Moloni e grava external_id+pdf_url na fatura
// local (status 'issued'). Self-contained. verify_jwt=false. v1: doméstico + isenção 0%.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const BASE = "https://api.moloni.pt/v1";

function fromB64(b: string) { const x = atob(b); const a = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i); return a; }
async function keyOf() { const raw = new TextEncoder().encode(Deno.env.get("CONNECTOR_SECRETS_KEY")!); const h = await crypto.subtle.digest("SHA-256", raw); return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["decrypt"]); }
async function dec(ct: string, iv: string) { const k = await keyOf(); const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, k, fromB64(ct)); return new TextDecoder().decode(p); }

function flatten(v: unknown, p: string, out: [string, string][]) {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) { v.forEach((x, i) => flatten(x, `${p}[${i}]`, out)); return; }
  if (typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) flatten(x, p ? `${p}[${k}]` : k, out); return; }
  if (typeof v === "boolean") { out.push([p, v ? "1" : "0"]); return; }
  out.push([p, String(v)]);
}
function form(b: Record<string, unknown>) { const pr: [string, string][] = []; for (const [k, v] of Object.entries(b ?? {})) flatten(v, k, pr); const sp = new URLSearchParams(); for (const [k, v] of pr) sp.append(k, v); return sp.toString(); }
async function mPost(path: string, token: string, b: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}${path}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(b) });
  const t = await res.text(); let d: any = null; try { d = JSON.parse(t); } catch { /* */ }
  if (!res.ok) throw new Error(`${path} [HTTP ${res.status}]: ${t.slice(0, 400)}`);
  if (d && typeof d === "object" && !Array.isArray(d) && (d.valid === 0 || d.valid === "0")) throw new Error(`${path} inválido: ${t.slice(0, 400)}`);
  return d;
}
async function grant(c: Record<string, string>): Promise<string> {
  const p = new URLSearchParams({ grant_type: "password", client_id: c.client_id ?? "", client_secret: c.client_secret ?? "", username: c.developer_username ?? "", password: c.developer_password ?? "" });
  const res = await fetch(`${BASE}/grant/?${p.toString()}`, { method: "GET" });
  const t = await res.text(); let d: any = null; try { d = JSON.parse(t); } catch { /* */ }
  if (!res.ok || !d?.access_token) throw new Error(d?.error_description || d?.error || `grant HTTP ${res.status}`);
  return d.access_token;
}
function posInt(v: unknown): number | null { if (v === null || v === undefined || v === "") return null; const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; }
const EXEMPTION: Record<string, string> = { reverse_charge: "M16", export: "M05", exempt: "M99", oss_destination: "M30" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    const tok = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!tok) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(tok);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const orderId = body?.order_id as string | undefined;
    if (!orderId) return json({ ok: false, error: "missing_order_id" }, 400);

    const { data: order } = await admin.from("orders").select("*, customers(*), order_lines(*)").eq("id", orderId).maybeSingle();
    if (!order) return json({ ok: false, error: "order_not_found" }, 404);
    const orgId = order.organization_id as string;
    const { data: org } = await admin.from("organizations")
      .select("warehouse_address, warehouse_city, warehouse_postal_code, warehouse_country, legal_address")
      .eq("id", orgId).maybeSingle();

    const { data: member } = await admin.from("organization_members").select("role").eq("organization_id", orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) return json({ ok: false, error: "forbidden" }, 403);
    if (!["confirmada", "paga", "faturada"].includes(order.status)) return json({ ok: false, error: "invalid_status", message: "A encomenda tem de estar confirmada/paga." });

    const { data: existing } = await admin.from("invoices").select("*").eq("order_id", orderId).neq("status", "error").maybeSingle();
    if (existing?.external_id && existing?.pdf_url) return json({ ok: true, already: true, external_id: existing.external_id, pdf_url: existing.pdf_url });

    const { data: conn } = await admin.from("connections").select("id, config").eq("organization_id", orgId).eq("connector_key", "moloni").eq("status", "active").maybeSingle();
    if (!conn) return json({ ok: false, error: "moloni_not_connected", message: "Liga o Moloni em Integrações." });
    const { data: secretRows } = await admin.from("connection_secrets").select("key, ciphertext, iv").eq("connection_id", conn.id);
    const creds: Record<string, string> = {};
    for (const r of secretRows ?? []) creds[(r as any).key] = await dec((r as any).ciphertext, (r as any).iv);

    const cfg = (conn.config as Record<string, unknown>) ?? {};
    const token = await grant(creds);
    const companyId = posInt(cfg.company_id) ?? posInt((await mPost("/companies/getAll/", token, {}))?.[0]?.company_id);
    if (!companyId) return json({ ok: false, error: "no_company", message: "Company ID por resolver. Testa a ligação primeiro." });

    let documentSetId = posInt(cfg.document_set_id);
    if (!documentSetId) { const sets = await mPost("/documentSets/getAll/", token, { company_id: companyId }); documentSetId = posInt(Array.isArray(sets) ? sets[0]?.document_set_id : null); }
    if (!documentSetId) return json({ ok: false, error: "no_document_set", message: "Sem série de documentos. Define o ID na configuração." });

    const taxes = await mPost("/taxes/getAll/", token, { company_id: companyId });
    const taxByRate = new Map<number, number>();
    for (const t of (Array.isArray(taxes) ? taxes : [])) { const val = Number(t?.value); const id = posInt(t?.tax_id); if (id && Number.isFinite(val)) taxByRate.set(Math.round(val * 100) / 100, id); }

    // Unidade de medida (Moloni exige unit_id nas linhas).
    // Unidade de medida: usa a configurada, senão a "unidade" (evita escolher "horas"); fallback à 1.ª.
    let unitId: number | null = posInt(cfg.unit_id);
    if (!unitId) {
      try {
        const units = await mPost("/measurementUnits/getAll/", token, { company_id: companyId });
        const arr = Array.isArray(units) ? units : [];
        const pick = arr.find((u: any) => {
          const s = (String(u?.name ?? "") + " " + String(u?.short_name ?? "")).toLowerCase();
          return s.includes("unid") || /(^|\s)(un|uni|unit)(\s|\.|$)/.test(s);
        }) ?? arr[0];
        unitId = posInt(pick?.unit_id);
      } catch { /* */ }
    }

    // Categoria de produto (necessária para criar produtos no catálogo).
    let categoryId = posInt(cfg.category_id);
    if (!categoryId) {
      try { const cats = await mPost("/productCategories/getAll/", token, { company_id: companyId, parent_id: 0 }); categoryId = posInt(Array.isArray(cats) ? cats[0]?.category_id : null); } catch { /* */ }
      if (!categoryId) { try { const nc = await mPost("/productCategories/insert/", token, { company_id: companyId, parent_id: 0, name: "Vendas" }); categoryId = posInt(nc?.category_id); } catch { /* */ } }
    }

    const c = (order as any).customers ?? {};
    // Resolve país do cliente: prefixo do NIF (ex.: PT/ES/FR) ou país do cliente; defeito PT.
    const rawVat = (c.vat_number && String(c.vat_number).trim()) || "";
    const isoM = rawVat.match(/^([A-Za-z]{2})(?=.)/);
    let iso = isoM ? isoM[1].toUpperCase() : null;
    if (!iso && c.country && /^[A-Za-z]{2}$/.test(String(c.country).trim())) iso = String(c.country).trim().toUpperCase();
    // Moloni guarda o NIF sem prefixo de país (o país vai em country_id). Consumidor final por defeito.
    const vat = (isoM ? rawVat.slice(2) : rawVat) || "999999990";
    // country_id do Moloni (Portugal = 1 por defeito; resolve o real para estrangeiros).
    let countryId = 1;
    if (iso && iso !== "PT") {
      try {
        const countries = await mPost("/countries/getAll/", token, {});
        const m = (Array.isArray(countries) ? countries : []).find((x: any) =>
          [x?.iso3166_1, x?.iso_3166_1, x?.iso].some((z) => String(z ?? "").toUpperCase() === iso));
        const cid = posInt(m?.country_id);
        if (cid) countryId = cid;
      } catch { /* mantém PT */ }
    }
    let custId: number | null = null;
    try { const f = await mPost("/customers/getByVat/", token, { company_id: companyId, vat }); custId = posInt(Array.isArray(f) ? f[0]?.customer_id : f?.customer_id); } catch { /* */ }
    if (!custId) {
      try {
        const created = await mPost("/customers/insert/", token, {
          company_id: companyId, vat, number: vat,
          name: c.name || "Consumidor Final", language_id: 1,
          address: c.address || "Desconhecido", city: c.city || "Desconhecido",
          zip_code: c.postal_code || "1000-001", country_id: countryId,
          email: c.email || "",
          maturity_date_id: 0, payment_method_id: 0, delivery_method_id: 0,
          salesman_id: 0, payment_day: 0, discount: 0, credit_limit: 0,
          field_notes: "",
        });
        custId = posInt(created?.customer_id);
        if (!custId) return json({ ok: false, error: "customer_failed", message: `Moloni nao devolveu customer_id: ${JSON.stringify(created).slice(0, 400)}` });
      } catch (ce) {
        return json({ ok: false, error: "customer_insert_failed", message: (ce as Error).message });
      }
    }

    const treat = order.vat_treatment as string | null;
    const lines: Record<string, unknown>[] = [];
    for (const l of ((order as any).order_lines ?? [])) {
      const rate = Number(l.tax_rate ?? 0);
      const name = (l.description || "Artigo").toString().slice(0, 250);
      // Preço com 5 casas decimais (igual ao Moloni) para evitar divergências de arredondamento.
      const price = Number(Number(l.unit_price ?? 0).toFixed(5));
      const taxId = rate > 0 ? taxByRate.get(Math.round(rate * 100) / 100) : null;
      if (rate > 0 && !taxId) return json({ ok: false, error: "no_tax", message: `O Moloni nao tem o imposto a ${rate}% configurado nesta empresa. Cria a taxa de IVA no Moloni e tenta de novo.` });
      const taxPart: Record<string, unknown> = taxId
        ? { taxes: [{ tax_id: taxId, value: rate, order: 0, cumulative: 0 }] }
        : { exemption_reason: EXEMPTION[treat ?? ""] ?? "M99" };

      // Catálogo: encontra ou cria o produto (Moloni exige product_id nas linhas).
      const reference = ("SSS-" + name.replace(/[^A-Za-z0-9]+/g, "-")).slice(0, 24) + "-" + Math.round(price * 100000);
      let productId: number | null = null;
      try { const f = await mPost("/products/getByReference/", token, { company_id: companyId, reference }); productId = posInt(Array.isArray(f) ? f[0]?.product_id : f?.product_id); } catch { /* */ }
      if (!productId && categoryId && unitId) {
        try {
          const np = await mPost("/products/insert/", token, { company_id: companyId, category_id: categoryId, type: 1, name, reference, price, unit_id: unitId, has_stock: 0, ...taxPart });
          productId = posInt(np?.product_id);
        } catch (pe) { return json({ ok: false, error: "product_insert_failed", message: (pe as Error).message }); }
      }

      const prod: Record<string, unknown> = { name, qty: Number(l.quantity ?? 1), price, discount: Number(l.discount_percent ?? 0), order: lines.length, ...taxPart };
      if (productId) prod.product_id = productId;
      if (unitId) prod.unit_id = unitId;
      lines.push(prod);
    }

    // Dados de transporte (a fatura serve de documento de transporte AT quando há envio por transportadora).
    const transport: Record<string, unknown> = {};
    if ((order as any).delivery_method === "carrier") {
      const dtv = (order as any).delivery_datetime;
      const dt = dtv ? new Date(dtv) : new Date();
      transport.delivery_datetime = dt.toISOString().slice(0, 19).replace("T", " ");
      transport.delivery_departure_address = (org as any)?.warehouse_address || (org as any)?.legal_address || "Desconhecido";
      transport.delivery_departure_city = (org as any)?.warehouse_city || "";
      transport.delivery_departure_zip_code = (org as any)?.warehouse_postal_code || "";
      transport.delivery_departure_country = 1;
      transport.delivery_destination_address = (order as any).ship_to_address || c.address || "Desconhecido";
      transport.delivery_destination_city = (order as any).ship_to_city || c.city || "";
      transport.delivery_destination_zip_code = (order as any).ship_to_postal_code || c.postal_code || "";
      transport.delivery_destination_country = countryId;
    }

    const today = new Date().toISOString().slice(0, 10);
    const inserted = await mPost("/invoices/insert/", token, { company_id: companyId, date: today, expiration_date: today, document_set_id: documentSetId, customer_id: custId, your_reference: order.order_number ?? "", status: 1, ...transport, products: lines });
    const documentId = posInt(inserted?.document_id);
    if (!documentId) return json({ ok: false, error: "insert_failed", message: `Resposta sem document_id: ${JSON.stringify(inserted).slice(0, 300)}` });

    let pdfUrl: string | null = null;
    try { const pdf = await mPost("/documents/getPDFLink/", token, { company_id: companyId, document_id: documentId }); pdfUrl = pdf?.url ?? null; } catch { /* */ }
    let docNumber: string | null = null;
    try { const one = await mPost("/documents/getOne/", token, { company_id: companyId, document_id: documentId }); const sn = one?.document_set?.name ?? null; docNumber = sn && one?.number != null ? `${sn} ${one.number}` : (one?.number != null ? String(one.number) : null); } catch { /* */ }

    let invoiceId = existing?.id as string | undefined;
    if (invoiceId) {
      await admin.from("invoices").update({ connector_key: "moloni", external_id: String(documentId), pdf_url: pdfUrl, external_status: "synced", status: "issued", error_message: null, invoice_number: docNumber ?? existing!.invoice_number }).eq("id", invoiceId);
    } else {
      const { data: ins } = await admin.from("invoices").insert({ organization_id: orgId, order_id: orderId, customer_id: order.customer_id, connector_key: "moloni", external_id: String(documentId), pdf_url: pdfUrl, status: "issued", external_status: "synced", invoice_number: docNumber ?? String(documentId), currency: order.currency, subtotal: order.subtotal, tax_total: order.tax_total, total: order.total, vat_treatment: order.vat_treatment, vat_exemption_reason: order.vat_exemption_reason, issued_at: new Date().toISOString(), created_by: userId }).select("id").single();
      invoiceId = ins?.id;
    }

    await admin.from("orders").update({ status: "faturada" }).eq("id", orderId);
    await admin.from("external_refs").upsert({ organization_id: orgId, connector_key: "moloni", entity_type: "invoice", entity_id: invoiceId, external_id: String(documentId) }, { onConflict: "organization_id,connector_key,entity_type,entity_id" });
    await admin.from("sync_logs").insert({ organization_id: orgId, connector_key: "moloni", direction: "outbound", entity_type: "invoice", action: "create", status: "success", message: `Fatura ${docNumber ?? documentId} emitida no Moloni.`, payload: { order_id: orderId, document_id: documentId } });

    return json({ ok: true, document_id: documentId, invoice_number: docNumber, pdf_url: pdfUrl });
  } catch (e) {
    return json({ ok: false, error: "moloni_error", message: (e as Error).message }, 200);
  }
});
