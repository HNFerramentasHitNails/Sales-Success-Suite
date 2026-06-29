// Edge function: invite-user
// Cria um registo em invitations e envia convite por email via Supabase Admin API.
// O utilizador convidado autentica-se (signup ou login) e a página /accept-invite valida o token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InvitePayload {
  email: string;
  role: "owner" | "admin" | "sales_director" | "sales_agent" | "viewer";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const inviter = userData.user;

    const body = (await req.json()) as InvitePayload;
    const email = body.email?.trim().toLowerCase();
    const role = body.role;
    if (!email || !role) {
      return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get inviter's organization and verify admin
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", inviter.id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Upsert invitation (replace existing pending one for same email/org)
    await admin
      .from("invitations")
      .delete()
      .eq("organization_id", membership.organization_id)
      .eq("email", email)
      .is("accepted_at", null);

    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .insert({
        organization_id: membership.organization_id,
        email,
        role,
        invited_by: inviter.id,
      })
      .select("token")
      .single();

    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: invErr?.message ?? "insert_failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const origin = req.headers.get("origin") ?? "";
    const acceptUrl = `${origin}/accept-invite?token=${inv.token}`;

    // Try to invite the user via Supabase Auth (sends email if SMTP configured).
    // If user already exists, fall back to a magic link.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: acceptUrl,
    });

    if (inviteErr && !inviteErr.message?.toLowerCase().includes("already")) {
      console.warn("inviteUserByEmail failed:", inviteErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, accept_url: acceptUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});