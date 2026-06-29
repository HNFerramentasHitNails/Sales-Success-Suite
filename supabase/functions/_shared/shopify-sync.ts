// Helpers partilhados para sincronização Shopify.
// IMPORTANTE: nunca devolver/registar o admin_access_token.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type ShopifyCreds = { shop_domain: string; admin_access_token: string };

export type SyncContext = {
  admin: SupabaseClient;
  organizationId: string;
  integrationId: string;
  creds: ShopifyCreds;
  domain: string;
};

export function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resolve org do utilizador autenticado + credenciais Shopify (via vault).
export async function resolveContext(req: Request): Promise<
  | { ok: true; ctx: SyncContext }
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
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
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
    .select("id, is_active")
    .eq("organization_id", organizationId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (!integ) return { ok: false, status: 404, error: "not_configured" };

  const { data: credsData, error: credsErr } = await admin.rpc(
    "get_integration_credentials",
    { p_organization_id: organizationId, p_provider: "shopify" },
  );
  if (credsErr) return { ok: false, status: 500, error: "credentials_error" };
  const creds = (credsData ?? {}) as Partial<ShopifyCreds>;
  if (!creds.shop_domain || !creds.admin_access_token) {
    return { ok: false, status: 400, error: "missing_credentials" };
  }
  const domain = creds.shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return {
    ok: true,
    ctx: {
      admin,
      organizationId,
      integrationId: integ.id as string,
      creds: { shop_domain: domain, admin_access_token: creds.admin_access_token },
      domain,
    },
  };
}

// GET com retry para 429 (Shopify devolve Retry-After em segundos).
export async function shopifyGet(ctx: SyncContext, path: string): Promise<Response> {
  const url = path.startsWith("http") ? path : `https://${ctx.domain}${path}`;
  let attempt = 0;
  let lastResp: Response | null = null;
  while (attempt < 5) {
    const resp = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": ctx.creds.admin_access_token,
        "Accept": "application/json",
      },
    });
    if (resp.status !== 429) return resp;
    lastResp = resp;
    const retryAfter = Number(resp.headers.get("Retry-After") || "2");
    await resp.text().catch(() => {});
    const wait = Math.min(30, Math.max(1, retryAfter)) * 1000 * Math.pow(1.5, attempt);
    await new Promise((r) => setTimeout(r, wait));
    attempt += 1;
  }
  return lastResp ?? new Response("rate_limited", { status: 429 });
}

// Extrai o cursor "next" do header Link da API REST do Shopify.
export function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export async function writeSyncLog(
  ctx: SyncContext,
  status: "success" | "failed",
  message: string,
  recordsProcessed: number,
) {
  await ctx.admin.from("integration_sync_logs").insert({
    organization_id: ctx.organizationId,
    integration_id: ctx.integrationId,
    direction: "inbound",
    status,
    message,
    records_processed: recordsProcessed,
  });
  await ctx.admin
    .from("integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
    })
    .eq("id", ctx.integrationId);
}

export async function upsertExternalRef(
  ctx: SyncContext,
  entityType: "customer" | "product" | "order",
  internalId: string,
  externalId: string,
  metadata: Record<string, unknown> = {},
) {
  await ctx.admin
    .from("external_refs")
    .upsert(
      {
        organization_id: ctx.organizationId,
        provider: "shopify",
        entity_type: entityType,
        internal_id: internalId,
        external_id: externalId,
        metadata,
      },
      { onConflict: "organization_id,provider,entity_type,external_id" },
    );
}

export async function findInternalIdByExternal(
  ctx: SyncContext,
  entityType: "customer" | "product" | "order",
  externalId: string,
): Promise<string | null> {
  const { data } = await ctx.admin
    .from("external_refs")
    .select("internal_id")
    .eq("organization_id", ctx.organizationId)
    .eq("provider", "shopify")
    .eq("entity_type", entityType)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data?.internal_id as string) ?? null;
}

export const MAX_PAGES = 40; // 40 * 250 = 10k registos por execução