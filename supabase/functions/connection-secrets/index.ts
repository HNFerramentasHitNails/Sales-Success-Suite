import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRETS_KEY = Deno.env.get("CONNECTOR_SECRETS_KEY")!;

async function importKey(): Promise<CryptoKey> {
  // Derive a 256-bit AES-GCM key from the configured secret string.
  const raw = new TextEncoder().encode(SECRETS_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function encrypt(plain: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { ciphertext: toB64(cipher), iv: toB64(iv.buffer) };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
  const userId = claimsData.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any = {};
  if (req.method !== "GET") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const url = new URL(req.url);
  const connectionId = (body.connection_id ?? url.searchParams.get("connection_id"))?.toString();
  if (!connectionId) return json(400, { error: "connection_id_required" });

  // Verify the user is admin of the org owning this connection.
  const { data: conn, error: connErr } = await admin
    .from("connections")
    .select("id, organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr || !conn) return json(404, { error: "connection_not_found" });

  const { data: isAdmin } = await admin.rpc("is_org_admin", { _org_id: conn.organization_id });
  // is_org_admin uses auth.uid() — we must call it as the user, not service role.
  // Re-check via the user-scoped client:
  const { data: membership } = await userClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", conn.organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const allowed = membership && (membership.role === "owner" || membership.role === "admin");
  if (!allowed) return json(403, { error: "forbidden" });

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("connection_secrets")
      .select("key, updated_at")
      .eq("connection_id", connectionId);
    if (error) return json(500, { error: error.message });
    return json(200, { keys: data ?? [] });
  }

  if (req.method === "POST" || req.method === "PUT") {
    const secrets = body.secrets as Record<string, string> | undefined;
    if (!secrets || typeof secrets !== "object") return json(400, { error: "secrets_required" });

    for (const [k, v] of Object.entries(secrets)) {
      if (v === null || v === "") {
        await admin.from("connection_secrets").delete().eq("connection_id", connectionId).eq("key", k);
        continue;
      }
      const { ciphertext, iv } = await encrypt(String(v));
      const { error } = await admin
        .from("connection_secrets")
        .upsert({ connection_id: connectionId, key: k, ciphertext, iv }, { onConflict: "connection_id,key" });
      if (error) return json(500, { error: error.message });
    }
    return json(200, { ok: true });
  }

  if (req.method === "DELETE") {
    const key = body.key ?? url.searchParams.get("key");
    const q = admin.from("connection_secrets").delete().eq("connection_id", connectionId);
    if (key) q.eq("key", key);
    const { error } = await q;
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: "method_not_allowed" });
});