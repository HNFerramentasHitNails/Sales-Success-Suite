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

function extractList(data: any): any[] {
  const raw = data?.data;
  return Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : [];
}

// fetch com timeout para não bloquear indefinidamente
async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(t);
  }
}

// Usa o modo assíncrono do Outscraper + polling limitado (evita o timeout da edge function).
async function outscraperSearch(apiKey: string, query: string, limit: number) {
  const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };
  const start = Date.now();
  const DEADLINE = 110_000; // margem abaixo do limite (~150s) da edge function

  const url = `https://api.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=${limit}&async=true`;
  let init;
  try {
    init = await fetchJson(url, headers);
  } catch (_e) {
    return { error: "timeout" };
  }
  // Por vezes devolve logo os dados (cache).
  if (init.data?.data) return { list: extractList(init.data) };

  const loc = init.data?.results_location;
  if (!loc) {
    if (!init.res.ok) return { error: (init.data as any)?.message || `HTTP ${init.res.status}` };
    return { list: [] };
  }

  // Poll do resultado.
  while (Date.now() - start < DEADLINE) {
    await sleep(5000);
    let pr;
    try {
      pr = await fetchJson(loc, headers, 20000);
    } catch (_e) {
      continue; // tenta de novo até ao deadline
    }
    const st = (pr.data as any)?.status;
    if (st === "Success" || st === "Finished" || (pr.data as any)?.data) {
      return { list: extractList(pr.data) };
    }
    if (st === "Error" || st === "Failed") return { error: "provider_failed" };
  }
  return { error: "timeout" };
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
    if ((r as any).error) {
      if ((r as any).error === "timeout") {
        return json({ error: "timeout", message: "A pesquisa demorou demasiado. Tente reduzir a quantidade (ex.: 10) ou repita dentro de momentos." });
      }
      return json({ error: "provider_error", message: (r as any).error });
    }

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
