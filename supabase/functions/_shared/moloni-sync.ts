// Resolvedor de contexto Moloni para edge functions (sync per-org).
// Carrega integração + credenciais do vault + company_id e expõe
// `moloniCall(endpoint, body)` que injecta automaticamente token + company_id.
// NUNCA devolve nem regista credenciais ou tokens.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  getMoloniToken, getCompanyId, moloniPost, type IntegrationRow, type MoloniConfig,
} from "./moloni.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type MoloniSyncContext = {
  admin: SupabaseClient;
  organizationId: string;
  integrationId: string;
  companyId: number;
  token: string;
  /** POST a um endpoint Moloni com company_id já injectado. */
  moloniCall: (endpoint: string, body?: Record<string, unknown>) => Promise<any>;
};

const SAFE = (s: string, token: string) => s.replaceAll(token, "***");

export async function resolveMoloniContext(req: Request): Promise<
  | { ok: true; ctx: MoloniSyncContext }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims) return { ok: false, status: 401, error: "unauthorized" };
  const userId = claims.claims.sub as string;

  const admin = createClient(url, serviceRole);
  const { data: mem } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem) return { ok: false, status: 403, error: "no_membership" };
  const organizationId = mem.organization_id as string;

  const { data: integ } = await admin
    .from("integrations")
    .select("id, organization_id, is_active, sync_direction, config")
    .eq("organization_id", organizationId)
    .eq("provider", "moloni")
    .maybeSingle();
  if (!integ) return { ok: false, status: 404, error: "not_configured" };

  const { data: credsData, error: credsErr } = await admin.rpc(
    "get_integration_credentials",
    { p_organization_id: organizationId, p_provider: "moloni" },
  );
  if (credsErr) return { ok: false, status: 500, error: "credentials_error" };
  const raw = (credsData ?? {}) as Record<string, string>;
  if (!raw.client_id || !raw.client_secret || !raw.username || !raw.password) {
    return { ok: false, status: 400, error: "missing_credentials" };
  }

  // Adapta para o formato esperado pelos helpers existentes em _shared/moloni.ts
  // (que conhecem `developer_username/developer_password`).
  const integrationRow: IntegrationRow = {
    id: integ.id as string,
    organization_id: organizationId,
    is_active: !!integ.is_active,
    sync_direction: (integ.sync_direction as IntegrationRow["sync_direction"]) ?? "import",
    credentials: {
      client_id: raw.client_id,
      client_secret: raw.client_secret,
      developer_username: raw.username,
      developer_password: raw.password,
      company_id: (raw.company_id as string | undefined) ?? undefined,
    },
    config: (integ.config as MoloniConfig | null) ?? {},
  };

  try {
    const token = await getMoloniToken(integrationRow, admin);
    const companyId = await getCompanyId(integrationRow, admin, token);

    const moloniCall = async (endpoint: string, body: Record<string, unknown> = {}) => {
      const path = `/${endpoint.replace(/^\/+|\/+$/g, "")}/`;
      return await moloniPost(path, token, { company_id: companyId, ...body });
    };

    return {
      ok: true,
      ctx: {
        admin,
        organizationId,
        integrationId: integ.id as string,
        companyId,
        token,
        moloniCall,
      },
    };
  } catch (e) {
    return { ok: false, status: 200, error: (e as Error).message || "moloni_auth_failed" };
  }
}

export async function writeSyncLog(
  ctx: MoloniSyncContext,
  status: "success" | "failed",
  message: string,
  recordsProcessed: number,
) {
  const safe = SAFE(message, ctx.token).slice(0, 1000);
  await ctx.admin.from("integration_sync_logs").insert({
    organization_id: ctx.organizationId,
    integration_id: ctx.integrationId,
    direction: "inbound",
    status,
    message: safe,
    records_processed: recordsProcessed,
  });
  await ctx.admin
    .from("integrations")
    .update({ last_sync_at: new Date().toISOString(), last_sync_status: status })
    .eq("id", ctx.integrationId);
}

export async function upsertExternalRef(
  ctx: MoloniSyncContext,
  entityType: "customer" | "product" | "invoice",
  internalId: string,
  externalId: string,
  metadata: Record<string, unknown> = {},
) {
  await ctx.admin.from("external_refs").upsert(
    {
      organization_id: ctx.organizationId,
      provider: "moloni",
      entity_type: entityType,
      internal_id: internalId,
      external_id: externalId,
      metadata,
    },
    { onConflict: "organization_id,provider,entity_type,external_id" },
  );
}

export async function findInternalIdByExternal(
  ctx: MoloniSyncContext,
  entityType: "customer" | "product" | "invoice",
  externalId: string,
): Promise<string | null> {
  const { data } = await ctx.admin
    .from("external_refs")
    .select("internal_id")
    .eq("organization_id", ctx.organizationId)
    .eq("provider", "moloni")
    .eq("entity_type", entityType)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data?.internal_id as string) ?? null;
}

export function sanitize(ctx: MoloniSyncContext, msg: string): string {
  return SAFE(msg, ctx.token);
}

export const MAX_PAGES = 200; // 200 * 50 = 10k registos por execução
export const PAGE_SIZE = 50;