// Platform subscription checkout (Stripe da plataforma, NÃO o conector Stripe por organização)
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
  const userEmail = (claimsData.claims.email as string | undefined) ?? null;

  let body: { plan_id?: string; organization_id?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid_body" }); }
  const { plan_id, organization_id } = body;
  if (!plan_id || !organization_id) return json(400, { error: "missing_params" });

  // Owner/admin check
  const { data: member } = await admin
    .from("organization_members")
    .select("role,status")
    .eq("organization_id", organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || member.status !== "active" || !["owner", "admin"].includes(member.role)) {
    return json(403, { error: "forbidden" });
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id,key,name,stripe_price_id")
    .eq("id", plan_id)
    .maybeSingle();
  if (!plan) return json(404, { error: "plan_not_found" });
  if (!plan.stripe_price_id) return json(200, { error: "plan_without_price", message: "Plano sem preço configurado." });

  const { data: org } = await admin
    .from("organizations")
    .select("id,name")
    .eq("id", organization_id)
    .maybeSingle();
  if (!org) return json(404, { error: "org_not_found" });

  const { data: sub } = await admin
    .from("organization_subscription")
    .select("stripe_customer_id")
    .eq("organization_id", organization_id)
    .maybeSingle();

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: userEmail ?? undefined,
      metadata: { organization_id },
    });
    customerId = customer.id;
    await admin
      .from("organization_subscription")
      .update({ stripe_customer_id: customerId })
      .eq("organization_id", organization_id);
  }

  const origin = req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/$/, "") ?? "";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    metadata: { organization_id, plan_id },
    subscription_data: { metadata: { organization_id, plan_id } },
    success_url: `${origin}/app/plan?billing=success`,
    cancel_url: `${origin}/app/plan?billing=cancel`,
    allow_promotion_codes: true,
  });

  return json(200, { url: session.url });
});
