// Stripe Billing Portal (plataforma)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const stripeKey = Deno.env.get("STRIPE_PLATFORM_SECRET_KEY");
  if (!stripeKey) return json(200, { error: "payments_not_configured", message: "Pagamentos ainda não configurados." });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json(401, { error: "unauthorized" });
  const userId = claimsData.claims.sub as string;

  let body: { organization_id?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_body" }); }
  const { organization_id } = body;
  if (!organization_id) return json(400, { error: "missing_params" });

  const { data: member } = await admin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || member.status !== "active" || !["owner", "admin"].includes(member.role)) {
    return json(403, { error: "forbidden" });
  }

  const { data: sub } = await admin
    .from("organization_subscription")
    .select("stripe_customer_id")
    .eq("organization_id", organization_id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) return json(200, { error: "no_customer", message: "Ainda não existe cliente de faturação." });

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const origin = req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/$/, "") ?? "";

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/app/plan`,
  });

  return json(200, { url: portal.url });
});
