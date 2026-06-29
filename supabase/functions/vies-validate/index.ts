import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { customer_id } = body ?? {};
    let country: string | undefined = body?.country;
    let vat: string | undefined = body?.vat;
    let customerOrg: string | null = null;

    if (customer_id) {
      const { data: cust, error } = await supabase
        .from("customers")
        .select("organization_id, vat_country, vat_number, tax_id")
        .eq("id", customer_id)
        .maybeSingle();
      if (error || !cust) return json({ error: "customer_not_found" }, 404);
      customerOrg = cust.organization_id;
      country = (country ?? cust.vat_country ?? "").toString();
      vat = (vat ?? cust.vat_number ?? cust.tax_id ?? "").toString();
    }

    country = (country ?? "").toUpperCase().trim().replace(/[^A-Z]/g, "").slice(0, 2);
    vat = (vat ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (vat.startsWith(country)) vat = vat.slice(2);

    if (!country || country.length !== 2 || !vat) {
      return json({ error: "invalid_vat" }, 400);
    }

    // Call VIES REST API with timeout (it can be slow / down)
    let valid = false;
    let name: string | null = null;
    let viesError: string | null = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${vat}`;
      const r = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (r.ok) {
        const data = await r.json().catch(() => null) as any;
        valid = Boolean(data?.isValid ?? data?.valid);
        name = data?.name ?? data?.traderName ?? null;
      } else {
        viesError = `vies_http_${r.status}`;
      }
    } catch (e: any) {
      viesError = e?.name === "AbortError" ? "vies_timeout" : "vies_unreachable";
    } finally {
      clearTimeout(timer);
    }

    const checkedAt = new Date().toISOString();

    if (customer_id && customerOrg && !viesError) {
      await supabase
        .from("customers")
        .update({
          vat_country: country,
          vat_number: vat,
          vies_valid: valid,
          vies_name: name,
          vies_checked_at: checkedAt,
        })
        .eq("id", customer_id)
        .eq("organization_id", customerOrg);
    }

    return json({
      ok: !viesError,
      country,
      vat,
      valid,
      name,
      checked_at: checkedAt,
      error: viesError,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}