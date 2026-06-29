import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import { getMoloniToken, getCompanyId, type IntegrationRow } from "../_shared/moloni.ts";
import { ixPing } from "../_shared/invoicexpress.ts";
import { vendusPing } from "../_shared/vendus.ts";

type SaveBody = {
  action: "save";
  organization_id: string;
  provider: string;
  credentials?: Record<string, string>;
  sync_direction?: "import" | "export" | "both";
  is_active?: boolean;
};

type StatusBody = { action: "get_status"; organization_id: string };
type TestBody = { action: "test"; organization_id: string; provider: string };
type Body = SaveBody | StatusBody | TestBody;

const ALLOWED_PROVIDERS = ["moloni", "invoicexpress", "vendus"];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
    const userId = claimsData.claims.sub as string;

    // Verify platform_admin via service_role
    const admin = createClient(url, serviceRole);
    const { data: pa, error: paErr } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (paErr) return json(500, { error: paErr.message });
    if (!pa) return json(403, { error: "forbidden_not_platform_admin" });

    const body = (await req.json()) as Body;
    if (!body || typeof body !== "object" || !("action" in body)) {
      return json(400, { error: "missing_action" });
    }

    if (body.action === "get_status") {
      if (!body.organization_id) return json(400, { error: "missing_organization_id" });
      const { data, error } = await admin
        .from("integrations")
        .select("id, organization_id, provider, is_active, sync_direction, config, last_sync_at, last_sync_status, created_at, updated_at, credentials_secret_id")
        .eq("organization_id", body.organization_id);
      if (error) return json(500, { error: error.message });
      const safe = (data ?? []).map((row: any) => {
        const hasCreds = !!row.credentials_secret_id;
        const { credentials_secret_id: _drop, ...rest } = row;
        return { ...rest, has_credentials: hasCreds };
      });
      return json(200, { integrations: safe });
    }

    if (body.action === "save") {
      const { organization_id, provider, credentials, sync_direction, is_active } = body;
      if (!organization_id || !provider) return json(400, { error: "missing_fields" });
      if (!ALLOWED_PROVIDERS.includes(provider)) return json(400, { error: "invalid_provider" });

      // Fetch existing credentials from the Vault to preserve blank fields on merge.
      const { data: prevCreds, error: prevErr } = await admin.rpc(
        "get_integration_credentials",
        { p_organization_id: organization_id, p_provider: provider },
      );
      if (prevErr) return json(500, { error: prevErr.message });
      const prev: Record<string, string> = (prevCreds as Record<string, string>) ?? {};
      const incoming = credentials ?? {};
      const merged: Record<string, string> = { ...prev };
      for (const [k, v] of Object.entries(incoming)) {
        if (typeof v === "string" && v.trim() !== "") merged[k] = v;
      }

      // Upsert the integration row WITHOUT credentials (the plaintext column no longer exists).
      const payload: Record<string, unknown> = { organization_id, provider };
      if (typeof sync_direction === "string") payload.sync_direction = sync_direction;
      if (typeof is_active === "boolean") payload.is_active = is_active;

      const { error: upErr } = await admin
        .from("integrations")
        .upsert(payload, { onConflict: "organization_id,provider" });
      if (upErr) return json(500, { error: upErr.message });

      // Encrypt the merged credentials into the Vault via the SECURITY DEFINER RPC.
      if (Object.keys(merged).length > 0) {
        const { error: setErr } = await admin.rpc("set_integration_credentials", {
          p_organization_id: organization_id,
          p_provider: provider,
          p_credentials: merged,
        });
        if (setErr) return json(500, { error: setErr.message });
      }
      return json(200, { ok: true });
    }

    if (body.action === "test") {
      if (!body.organization_id || !body.provider) return json(400, { error: "missing_fields" });
      if (body.provider === "moloni") {
        const { data: integ, error: iErr } = await admin
          .from("integrations")
          .select("id, organization_id, is_active, sync_direction, config")
          .eq("organization_id", body.organization_id)
          .eq("provider", "moloni")
          .maybeSingle();
        if (iErr) return json(500, { ok: false, message: iErr.message });
        if (!integ) return json(404, { ok: false, message: "Integração não configurada" });
        const { data: mCreds, error: mErr } = await admin.rpc("get_integration_credentials", {
          p_organization_id: body.organization_id, p_provider: "moloni",
        });
        if (mErr) return json(500, { ok: false, message: mErr.message });
        (integ as any).credentials = mCreds ?? {};
        try {
          const token = await getMoloniToken(integ as IntegrationRow, admin);
          const companyId = await getCompanyId(integ as IntegrationRow, admin, token);
          return json(200, { ok: true, message: `Ligação Moloni OK (empresa ${companyId})` });
        } catch (e) {
          return json(200, { ok: false, message: (e as Error).message });
        }
      }
      // Outros providers: load integration + ping específico do provider
      const { data: integ, error: iErr } = await admin
        .from("integrations")
        .select("id, organization_id, is_active, sync_direction, config")
        .eq("organization_id", body.organization_id)
        .eq("provider", body.provider)
        .maybeSingle();
      if (iErr) return json(500, { ok: false, message: iErr.message });
      if (!integ) return json(404, { ok: false, message: "Integração não configurada" });
      const { data: pCreds, error: pErr } = await admin.rpc("get_integration_credentials", {
        p_organization_id: body.organization_id, p_provider: body.provider,
      });
      if (pErr) return json(500, { ok: false, message: pErr.message });
      const creds = (pCreds ?? {}) as any;
      try {
        let message = "";
        if (body.provider === "invoicexpress") message = await ixPing(creds);
        else if (body.provider === "vendus") message = await vendusPing(creds);
        else return json(200, { ok: true, message: "Teste ainda não implementado para este provider." });
        return json(200, { ok: true, message });
      } catch (e) {
        return json(200, { ok: false, message: (e as Error).message });
      }
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});