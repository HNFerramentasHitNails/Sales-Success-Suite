import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

function applyFilters(list: any[], country: string, minR: number, hasWebsite: boolean) {
  let results = list.map((x) => normalize(x, country || ""));
  if (minR > 0) results = results.filter((x) => (Number(x.rating) || 0) >= minR);
  if (hasWebsite) results = results.filter((x) => x.has_website);
  results = results.filter((x) => x.phone || x.email);
  return results;
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const apiKey = Deno.env.get("OUTSCRAPER_API_KEY") ?? "";
    const headers = { "X-API-KEY": apiKey, "Content-Type": "application/json" };

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const { organization_id, action, results_location, category, custom_category, country, city, quantity, min_rating, has_website } = body ?? {};
    if (!organization_id) return json({ error: "invalid_payload" }, 400);

    const { data: member } = await admin.from("organization_members")
      .select("role").eq("organization_id", organization_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || member.role === "read_only") return json({ error: "forbidden" }, 403);

    if (!apiKey) return json({ error: "not_configured", message: "OUTSCRAPER_API_KEY não está configurado no servidor." });

    const minR = Number(min_rating) || 0;

    // ===== Fase 2: POLL (consultar resultado de um pedido já iniciado) =====
    if (action === "poll") {
      if (!results_location) return json({ error: "missing_location" }, 400);
      let pr;
      try {
        pr = await fetchJson(results_location, headers, 25000);
      } catch (_e) {
        return json({ pending: true }); // tenta de novo no próximo poll
      }
      const st = (pr.data as any)?.status;
      if (st === "Success" || st === "Finished" || (pr.data as any)?.data) {
        const results = applyFilters(extractList(pr.data), country || "", minR, !!has_website);
        return json({ done: true, count: results.length, results });
      }
      if (st === "Error" || st === "Failed") return json({ error: "provider_error", message: "O fornecedor falhou esta pesquisa." });
      return json({ pending: true });
    }

    // ===== Fase 1: START (arranca a pesquisa assíncrona) =====
    const cat = (custom_category?.trim() || category || "").toString().trim();
    if (!cat) return json({ error: "missing_category" }, 400);
    const loc = [city, country].filter(Boolean).join(", ");
    const query = loc ? `${cat}, ${loc}` : cat;
    const limit = Math.min(Math.max(Number(quantity) || 20, 1), 100);

    const url = `https://api.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=${limit}&async=true`;
    let init;
    try {
      init = await fetchJson(url, headers, 25000);
    } catch (_e) {
      return json({ error: "provider_error", message: "Não foi possível iniciar a pesquisa. Tente novamente." });
    }

    // Cache hit: resultados imediatos.
    if (init.data?.data) {
      const results = applyFilters(extractList(init.data), country || "", minR, !!has_website);
      return json({ done: true, count: results.length, results, query });
    }

    const rl = (init.data as any)?.results_location;
    if (!rl) {
      if (!init.res.ok) return json({ error: "provider_error", message: (init.data as any)?.message || `HTTP ${init.res.status}` });
      return json({ done: true, count: 0, results: [], query });
    }
    // Devolve a localização do resultado para a app ir consultando (poll).
    return json({ pending: true, results_location: rl, query });
  } catch (e) {
    console.error("outreach-marketplace fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
