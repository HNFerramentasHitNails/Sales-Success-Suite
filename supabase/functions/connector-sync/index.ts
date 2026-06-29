import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import { getConnector } from "../_shared/connectors/registry.ts";
import { SupabaseCanonicalStore } from "../_shared/connectors/supabase-store.ts";
import { runSync } from "../_shared/connectors/orchestrator.ts";
import type { SyncDirection } from "../_shared/connectors/types.ts";

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

    // Identificar utilizador
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => null) as
      | { organization_id?: string; provider?: string }
      | null;
    if (!body?.organization_id || !body?.provider) {
      return json(400, { error: "missing_fields" });
    }
    const { organization_id, provider } = body;

    const admin = createClient(url, serviceRole);

    // Autorização: platform_admin OU membro da organização
    const { data: pa } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    let allowed = !!pa;
    if (!allowed) {
      const { data: mem } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("user_id", userId)
        .eq("organization_id", organization_id)
        .maybeSingle();
      allowed = !!mem;
    }
    if (!allowed) return json(403, { error: "forbidden" });

    const def = getConnector(provider);
    if (!def) return json(400, { error: "unknown_provider" });

    // Carregar integração ativa (sempre filtrada por organization_id)
    const { data: integ, error: iErr } = await admin
      .from("integrations")
      .select("id, organization_id, provider, is_active, sync_direction")
      .eq("organization_id", organization_id)
      .eq("provider", provider)
      .maybeSingle();
    if (iErr) return json(500, { error: iErr.message });
    if (!integ) return json(404, { error: "integration_not_found" });
    if (!integ.is_active) return json(400, { error: "integration_inactive" });

    // Credenciais decifradas via RPC (mesmo mecanismo do integrations-admin)
    const { data: credsData, error: credsErr } = await admin.rpc(
      "get_integration_credentials",
      { p_organization_id: organization_id, p_provider: provider },
    );
    if (credsErr) return json(500, { error: credsErr.message });
    const credentials = (credsData ?? {}) as Record<string, string>;

    const syncDirection = (integ.sync_direction ?? "both") as SyncDirection;
    const store = new SupabaseCanonicalStore({
      client: admin,
      organizationId: organization_id,
      provider,
    });

    const result = await runSync(
      def,
      { organizationId: organization_id, credentials, syncDirection },
      store,
    );

    // Log no integration_sync_logs (paridade com sync-runner).
    try {
      const direction = syncDirection === "both" ? "import" : syncDirection;
      const status = result.ok ? "success" : "error";
      const base = `Conector ${provider}: imported=${result.imported} exported=${result.exported}` +
        (result.errors.length ? ` (${result.errors.length} erros)` : "");
      const detail = result.errors.length ? ` :: ${result.errors.join(" || ")}` : "";
      const message = (base + detail).slice(0, 2000);
      await admin.from("integration_sync_logs").insert({
        integration_id: integ.id,
        organization_id,
        direction,
        status,
        message,
        records_processed: result.imported + result.exported,
      });
    } catch { /* log best-effort */ }

    await admin
      .from("integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.ok ? "success" : "error",
      })
      .eq("id", integ.id);

    return json(200, result);
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});