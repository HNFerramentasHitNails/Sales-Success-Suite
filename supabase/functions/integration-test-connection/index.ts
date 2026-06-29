// Edge Function: integration-test-connection
// Testa as credenciais de uma integração para a organização do utilizador autenticado.
// - Não devolve nem regista credenciais.
// - Escreve o resultado em integration_sync_logs (status: success/failed).
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "moloni" | "shopify" | "google_calendar";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function testMoloni(c: Record<string, string>): Promise<string> {
  const { client_id, client_secret, username, password } = c;
  if (!client_id || !client_secret || !username || !password) {
    throw new Error("Credenciais Moloni incompletas");
  }
  const url = `https://api.moloni.pt/v1/grant/?grant_type=password` +
    `&client_id=${encodeURIComponent(client_id)}` +
    `&client_secret=${encodeURIComponent(client_secret)}` +
    `&username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}`;
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !(body as any)?.access_token) {
    throw new Error("Falha de autenticação Moloni");
  }
  return "Ligação Moloni OK";
}

async function testShopify(c: Record<string, string>): Promise<string> {
  const { shop_domain, admin_access_token } = c;
  if (!shop_domain || !admin_access_token) throw new Error("Credenciais Shopify incompletas");
  const domain = shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const r = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
    headers: { "X-Shopify-Access-Token": admin_access_token },
  });
  if (!r.ok) throw new Error(`Shopify devolveu HTTP ${r.status}`);
  await r.text();
  return `Ligação Shopify OK (${domain})`;
}

async function testGoogleCalendar(c: Record<string, string>): Promise<string> {
  const { client_id, client_secret, refresh_token } = c;
  if (!client_id || !client_secret || !refresh_token) throw new Error("Credenciais Google incompletas");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id, client_secret, refresh_token, grant_type: "refresh_token",
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !(body as any)?.access_token) throw new Error("Falha a refrescar token Google");
  return "Ligação Google Calendar OK";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { ok: false, error: "unauthorized" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json(401, { ok: false, error: "unauthorized" });
    const userId = claims.claims.sub as string;

    const admin = createClient(url, serviceRole);

    const body = await req.json().catch(() => ({}));
    const provider = (body?.provider ?? "") as Provider;
    if (!["moloni", "shopify", "google_calendar"].includes(provider)) {
      return json(400, { ok: false, error: "invalid_provider" });
    }

    // Resolve org do utilizador (admin/owner)
    const { data: mem, error: mErr } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr || !mem) return json(403, { ok: false, error: "no_membership" });
    if (!["owner", "admin"].includes(mem.role)) {
      return json(403, { ok: false, error: "forbidden" });
    }
    const organizationId = mem.organization_id;

    // Carrega integração e credenciais (via vault)
    const { data: integ } = await admin
      .from("integrations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .maybeSingle();
    if (!integ) return json(404, { ok: false, error: "not_configured" });

    // Chamada com userClient para que auth.uid() resolva o utilizador
    // (a função verifica is_org_admin(auth.uid(), org)).
    const { data: credsData, error: credsErr } = await userClient.rpc(
      "get_integration_credentials",
      { p_organization_id: organizationId, p_provider: provider },
    );
    if (credsErr) {
      return json(500, { ok: false, error: "credentials_error", detail: credsErr.message });
    }
    const creds = (credsData ?? {}) as Record<string, string>;
    if (!creds || Object.keys(creds).length === 0) {
      return json(400, { ok: false, error: "no_credentials" });
    }

    let message = "";
    let status: "success" | "failed" = "success";
    try {
      if (provider === "moloni") message = await testMoloni(creds);
      else if (provider === "shopify") message = await testShopify(creds);
      else if (provider === "google_calendar") message = await testGoogleCalendar(creds);
    } catch (e) {
      status = "failed";
      // Mensagem sanitizada (nunca incluímos credenciais)
      message = (e as Error).message || "Falha na ligação";
    }

    // Regista no log (sem credenciais)
    await admin.from("integration_sync_logs").insert({
      organization_id: organizationId,
      integration_id: integ.id,
      direction: "test",
      status,
      message,
      records_processed: 0,
    });

    // Atualiza estado na integração
    await admin.from("integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
    }).eq("id", integ.id);

    return json(200, { ok: status === "success", message });
  } catch (e) {
    return json(500, { ok: false, error: (e as Error).message });
  }
});