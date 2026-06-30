// Testa a ligação ao Moloni (faturação certificada): autentica com as credenciais
// guardadas e resolve a empresa (company_id). Self-contained (sem imports partilhados)
// para deploy fiável. verify_jwt=false: valida o token internamente via getClaims.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MOLONI_BASE = "https://api.moloni.pt/v1";

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function importKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(Deno.env.get("CONNECTOR_SECRETS_KEY")!);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["decrypt"]);
}
async function decryptSecret(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await importKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ciphertextB64));
  return new TextDecoder().decode(plain);
}

function toPositiveInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

async function moloniGrant(creds: Record<string, string>): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: creds.client_id ?? "",
    client_secret: creds.client_secret ?? "",
    username: creds.developer_username ?? "",
    password: creds.developer_password ?? "",
  });
  const res = await fetch(`${MOLONI_BASE}/grant/?${params.toString()}`, { method: "GET" });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* */ }
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data.access_token as string;
}

async function moloniCompanies(token: string): Promise<any[]> {
  const res = await fetch(`${MOLONI_BASE}/companies/getAll/?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* */ }
  if (!res.ok) throw new Error(`companies/getAll HTTP ${res.status}: ${text.slice(0, 300)}`);
  return Array.isArray(data) ? data : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const connectionId = body?.connection_id as string | undefined;
    if (!connectionId) return json({ ok: false, error: "missing_connection_id" }, 400);

    const { data: conn } = await admin.from("connections")
      .select("id, organization_id, connector_key, config")
      .eq("id", connectionId).maybeSingle();
    if (!conn || conn.connector_key !== "moloni") return json({ ok: false, error: "connection_not_found" }, 404);

    // Apenas admins da organização.
    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", conn.organization_id).eq("user_id", userId)
      .eq("status", "active").maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) return json({ ok: false, error: "forbidden" }, 403);

    // Carrega e decifra os segredos.
    const { data: secretRows } = await admin.from("connection_secrets")
      .select("key, ciphertext, iv").eq("connection_id", connectionId);
    const creds: Record<string, string> = {};
    for (const row of secretRows ?? []) {
      try { creds[(row as any).key] = await decryptSecret((row as any).ciphertext, (row as any).iv); }
      catch { return json({ ok: false, error: "decrypt_failed", message: `Falha a decifrar "${(row as any).key}".` }); }
    }
    for (const k of ["client_id", "client_secret", "developer_username", "developer_password"]) {
      if (!creds[k]) return json({ ok: false, error: "missing_credentials", message: `Falta a credencial "${k}".` });
    }

    // Autentica.
    let accessToken: string;
    try { accessToken = await moloniGrant(creds); }
    catch (e) { return json({ ok: false, error: "auth_failed", message: (e as Error).message }); }

    // Resolve empresa.
    const cfg = (conn.config as Record<string, unknown>) ?? {};
    let companyId = toPositiveInt(cfg.company_id);
    let companies: any[] = [];
    try { companies = await moloniCompanies(accessToken); }
    catch (e) { return json({ ok: false, error: "companies_failed", message: (e as Error).message }); }

    if (!companyId) {
      for (const c of companies) { const cid = toPositiveInt(c?.company_id); if (cid) { companyId = cid; break; } }
    }
    if (!companyId) {
      return json({ ok: false, error: "no_company", message: "Autenticação OK, mas não foi possível determinar o Company ID. Defina-o na configuração." });
    }

    const company = companies.find((c) => toPositiveInt(c?.company_id) === companyId);
    const companyName = company?.name ?? company?.company_name ?? null;

    // Persiste o company_id resolvido na config (para a emissão usar).
    if (toPositiveInt(cfg.company_id) !== companyId) {
      await admin.from("connections").update({ config: { ...cfg, company_id: companyId }, last_tested_at: new Date().toISOString(), last_error: null }).eq("id", connectionId);
    } else {
      await admin.from("connections").update({ last_tested_at: new Date().toISOString(), last_error: null }).eq("id", connectionId);
    }

    await admin.from("sync_logs").insert({
      organization_id: conn.organization_id, connector_key: "moloni", direction: "outbound",
      action: "test", status: "success", message: `Ligação Moloni OK (empresa ${companyId}${companyName ? " — " + companyName : ""}).`,
    });

    return json({ ok: true, company_id: companyId, company_name: companyName, companies_count: companies.length });
  } catch (e) {
    return json({ ok: false, error: "internal_error", message: (e as Error).message }, 500);
  }
});
