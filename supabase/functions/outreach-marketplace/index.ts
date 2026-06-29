import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function firstEmail(r: any): string | null {
  if (Array.isArray(r?.emails) && r.emails.length) {
    const e = r.emails[0];
    return typeof e === "string" ? e : (e?.value ?? null);
  }
  return r?.email_1 ?? r?.email ?? null;
}

function normalize(r: any, country: string) {
  const site = r?.site ?? r?.website ?? null;
  return {
    name: r?.name ?? r?.title ?? "",
    phone: r?.phone ?? r?.phone_1 ?? null,
    email: firstEmail(r),
    site,
    city: r?.city ?? null,
    country,
    rating: r?.rating ?? null,
    address: r?.full_address ?? r?.address ?? null,
    has_website: !!site,
  };
}

async function outscraperSearch(apiKey: string, query: string, limit: number) {
  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
  const url = `https://api.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=${limit}&async=false`;
  let res = await fetch(url, { headers });
  let data = await res.json().catch(() => ({}));

  // pode devolver 202 + results_location (assíncrono) -> fazer poll
  const loc = (data as any)?.results_location;
  if ((res.status === 202 || (data as any)?.status === "Pending") && loc) {
    for (let i = 0; i < 8; i++) {
      await sleep(3000);
      const pr = await fetch(loc, { headers });
      const pd = await pr.json().catch(() => ({}));
      if ((pd as any)?.status === "Success") { data = pd; break; }
    }
  }
  if (!res.ok && !(data as any)?.data) {
    return { error: (data as any)?.message || `HTTP ${res.status}` };
  }
  // data.data é um array de arrays (uma lista por query)
  const raw = (data as any)?.data;
  const list = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [];
  return { list };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const apiKey = Deno.env.get("OUTSCRAPER_API_KEY") ?? "";

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, category, custom_category, country, city, quantity, min_rating, has_website } = body ?? {};
    if (!organization_id) return json({ error: "invalid_payload" }, 400);

    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || member.role === "read_only") return json({ error: "forbidden" }, 403);

    if (!apiKey) return json({ error: "not_configured", message: "OUTSCRAPER_API_KEY não está configurado no servidor." });

    const cat = (custom_category?.trim() || category || "").toString().trim();
    if (!cat) return json({ error: "missing_category" }, 400);
    const loc = [city, country].filter(Boolean).join(", ");
    const query = loc ? `${cat}, ${loc}` : cat;
    const limit = Math.min(Math.max(Number(quantity) || 20, 1), 100);

    const r = await outscraperSearch(apiKey, query, limit);
    if ((r as any).error) return json({ error: "provider_error", message: (r as any).error });

    let results = ((r as any).list as any[]).map((x) => normalize(x, country || ""));
    const minR = Number(min_rating) || 0;
    if (minR > 0) results = results.filter((x) => (Number(x.rating) || 0) >= minR);
    if (has_website) results = results.filter((x) => x.has_website);
    // só úteis para outreach: têm telefone ou email
    results = results.filter((x) => x.phone || x.email);

    return json({ count: results.length, results, query });
  } catch (e) {
    console.error("outreach-marketplace fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
