import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function resend(path: string, method: string, apiKey: string, body?: unknown) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function scoreFor(status: string): number {
  if (status === "verified") return 100;
  if (status === "pending") return 50;
  if (status === "failed" || status === "temporary_failure") return 10;
  return 40;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!apiKey) return json({ error: "resend_not_configured" }, 400);

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, action, domain_id, domain, from_name, daily_cap, is_active } = body ?? {};
    if (!organization_id || !action) return json({ error: "invalid_payload" }, 400);

    // só admin/owner da org
    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "forbidden" }, 403);

    // helper: carregar linha local garantindo a org
    const loadRow = async (id: string) => {
      const { data } = await admin.from("outreach_email_domains").select("*").eq("id", id).eq("organization_id", organization_id).maybeSingle();
      return data;
    };

    if (action === "add") {
      if (!domain) return json({ error: "missing_domain" }, 400);
      const r = await resend("/domains", "POST", apiKey, { name: domain });
      if (!r.ok) return json({ error: "resend_error", message: (r.data as any)?.message || `HTTP ${r.status}` });
      const d = r.data as any;
      const { data: row, error } = await admin.from("outreach_email_domains").insert({
        organization_id, domain, from_name: from_name || null,
        resend_domain_id: d.id, health_score: scoreFor(d.status ?? "pending"),
        daily_cap: daily_cap ?? 200, is_active: false,
      }).select("*").single();
      if (error) return json({ error: "db_error", message: error.message });
      return json({ row, status: d.status, records: d.records ?? [] });
    }

    if (action === "refresh" || action === "verify") {
      if (!domain_id) return json({ error: "missing_domain_id" }, 400);
      const row = await loadRow(domain_id);
      if (!row?.resend_domain_id) return json({ error: "not_found" }, 404);
      if (action === "verify") await resend(`/domains/${row.resend_domain_id}/verify`, "POST", apiKey);
      const r = await resend(`/domains/${row.resend_domain_id}`, "GET", apiKey);
      if (!r.ok) return json({ error: "resend_error", message: (r.data as any)?.message || `HTTP ${r.status}` });
      const d = r.data as any;
      await admin.from("outreach_email_domains").update({ health_score: scoreFor(d.status ?? "pending") }).eq("id", domain_id);
      return json({ status: d.status, records: d.records ?? [] });
    }

    if (action === "set_active") {
      if (!domain_id) return json({ error: "missing_domain_id" }, 400);
      const row = await loadRow(domain_id);
      if (!row) return json({ error: "not_found" }, 404);
      await admin.from("outreach_email_domains").update({ is_active: !!is_active }).eq("id", domain_id);
      return json({ ok: true });
    }

    if (action === "delete") {
      if (!domain_id) return json({ error: "missing_domain_id" }, 400);
      const row = await loadRow(domain_id);
      if (!row) return json({ error: "not_found" }, 404);
      if (row.resend_domain_id) await resend(`/domains/${row.resend_domain_id}`, "DELETE", apiKey);
      await admin.from("outreach_email_domains").delete().eq("id", domain_id);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("outreach-domains fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
