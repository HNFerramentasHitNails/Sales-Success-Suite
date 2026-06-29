import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, loadConnectionSecrets } from "../_shared/connector-secrets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
  const userId = claimsData.claims.sub as string;

  let body: any = {};
  try { body = await req.json(); } catch { /* no body ok */ }
  const connectionId = String(body.connection_id ?? "");
  if (!connectionId) return json(400, { error: "connection_id_required" });

  const admin = adminClient();
  const { data: conn } = await admin
    .from("connections")
    .select("id, organization_id, connector_key")
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn || conn.connector_key !== "stripe") return json(404, { error: "connection_not_found" });

  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", conn.organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes((membership as any).role)) {
    return json(403, { error: "forbidden" });
  }

  const secrets = await loadConnectionSecrets(admin, conn.id);
  const stripeKey = secrets.secret_key;
  if (!stripeKey) return json(400, { error: "stripe_secret_missing" });

  const r = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const data = await r.json();

  await admin.from("connections")
    .update({ last_tested_at: new Date().toISOString(), last_error: r.ok ? null : (data?.error?.message ?? "Erro Stripe") })
    .eq("id", conn.id);

  if (!r.ok) return json(400, { ok: false, error: data?.error?.message ?? "Erro Stripe" });
  const livemode = data?.livemode === true;
  return json(200, { ok: true, livemode, mode: livemode ? "live" : "test" });
});