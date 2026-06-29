// Platform Stripe webhook — sincroniza estado de subscrições da plataforma
// verify_jwt = false em supabase/config.toml — mas EXIGE assinatura Stripe-Signature válida.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function logSync(orgId: string | null, status: string, message: string, payload: unknown) {
  if (!orgId) return; // sync_logs.organization_id is NOT NULL
  const allowed = status === "ok" ? "success" : status === "error" ? "error" : "success";
  try {
    await admin().from("sync_logs").insert({
      organization_id: orgId,
      connector_key: "platform_stripe",
      direction: "inbound",
      status: allowed,
      message,
      payload: payload as never,
    });
  } catch (_) { /* ignore log errors */ }
}

function mapStatus(s: string): "active" | "past_due" | "canceled" | "trialing" {
  if (s === "active") return "active";
  if (s === "trialing") return "trialing";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled";
}

async function applySubscription(sub: Stripe.Subscription) {
  const db = admin();
  const orgId = (sub.metadata?.organization_id as string | undefined) ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id ?? null;

  // Find org: by metadata, then by stripe_subscription_id, then by stripe_customer_id
  let targetOrgId = orgId;
  if (!targetOrgId) {
    const { data } = await db
      .from("organization_subscription")
      .select("organization_id")
      .or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${customerId}`)
      .maybeSingle();
    targetOrgId = data?.organization_id ?? null;
  }
  if (!targetOrgId) return { ok: false, reason: "org_not_found" };

  // Match plan by price (fall back to metadata.plan_id)
  let planId: string | null = (sub.metadata?.plan_id as string | undefined) ?? null;
  if (priceId) {
    const { data: pl } = await db.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (pl) planId = pl.id;
  }

  const status = mapStatus(sub.status);
  const update: Record<string, unknown> = {
    status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  };
  if (planId) update.plan_id = planId;

  await db.from("organization_subscription").update(update).eq("organization_id", targetOrgId);
  return { ok: true, organization_id: targetOrgId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const stripeKey = Deno.env.get("STRIPE_PLATFORM_SECRET_KEY");
  const whSecret = Deno.env.get("STRIPE_PLATFORM_WEBHOOK_SECRET");
  if (!stripeKey || !whSecret) {
    return json(503, { error: "payments_not_configured" });
  }

  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sigHeader, whSecret);
  } catch (err) {
    return json(400, { error: "invalid_signature", message: (err as Error).message });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = (session.metadata?.organization_id as string | undefined) ?? null;
      const planId = (session.metadata?.plan_id as string | undefined) ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

      if (orgId && customerId && subscriptionId) {
        const db = admin();
        const update: Record<string, unknown> = {
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          cancel_at_period_end: false,
        };
        if (planId) update.plan_id = planId;
        await db.from("organization_subscription").update(update).eq("organization_id", orgId);

        // also fetch and apply subscription (price → plan, period_end, etc.)
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await applySubscription(sub);
        } catch (_) { /* best effort */ }
      }
      await logSync(orgId, "ok", `checkout.session.completed ${session.id}`, event);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      const res = await applySubscription(sub);
      await logSync(res.ok ? (res as { organization_id: string }).organization_id : null,
        res.ok ? "ok" : "warning",
        `${event.type} ${sub.id}`, event);
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const db = admin();
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const { data: row } = await db
        .from("organization_subscription")
        .select("organization_id")
        .or(`stripe_subscription_id.eq.${sub.id},stripe_customer_id.eq.${customerId}`)
        .maybeSingle();
      const targetOrgId = row?.organization_id ?? (sub.metadata?.organization_id as string | undefined) ?? null;
      if (targetOrgId) {
        const { data: trial } = await db.from("plans").select("id").eq("key", "trial").maybeSingle();
        const update: Record<string, unknown> = {
          status: "canceled",
          cancel_at_period_end: false,
          stripe_subscription_id: null,
        };
        if (trial?.id) update.plan_id = trial.id;
        await db.from("organization_subscription").update(update).eq("organization_id", targetOrgId);
      }
      await logSync(targetOrgId, "ok", `customer.subscription.deleted ${sub.id}`, event);
    } else {
      await logSync(null, "ignored", `unhandled ${event.type}`, { id: event.id, type: event.type });
    }
  } catch (err) {
    await logSync(null, "error", `handler_error ${event.type}`, { error: (err as Error).message, id: event.id });
    return json(500, { error: "handler_error" });
  }

  return json(200, { received: true });
});
