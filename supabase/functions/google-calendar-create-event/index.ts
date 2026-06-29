// Cria um evento no Google Calendar primary com Meet automático.
// Credenciais SEMPRE via vault: get_integration_credentials(org,'google_calendar').
// Nunca ler refresh_token/client_secret de Deno.env.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type GCreds = { client_id: string; client_secret: string; refresh_token: string };

type Body = {
  summary: string;
  description?: string;
  start: string; // ISO
  end: string;   // ISO
  attendees?: string[]; // emails
  timezone?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { ok: false, error: "unauthorized" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims) return json(401, { ok: false, error: "unauthorized" });
  const userId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: mem } = await admin
    .from("organization_members").select("organization_id")
    .eq("user_id", userId).maybeSingle();
  if (!mem) return json(403, { ok: false, error: "no_membership" });
  const organizationId = mem.organization_id as string;

  const { data: integ } = await admin
    .from("integrations").select("id, is_active")
    .eq("organization_id", organizationId).eq("provider", "google_calendar").maybeSingle();
  if (!integ) return json(404, { ok: false, error: "not_configured" });

  const { data: credsData, error: credsErr } = await admin.rpc(
    "get_integration_credentials",
    { p_organization_id: organizationId, p_provider: "google_calendar" },
  );
  if (credsErr) return json(500, { ok: false, error: "credentials_error" });
  const c = (credsData ?? {}) as Partial<GCreds>;
  if (!c.client_id || !c.client_secret || !c.refresh_token) {
    return json(400, { ok: false, error: "missing_credentials" });
  }

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_body" }); }
  if (!body?.summary || !body?.start || !body?.end) {
    return json(400, { ok: false, error: "missing_fields" });
  }

  const integrationId = integ.id as string;
  const writeLog = async (status: "success" | "failed", message: string) => {
    await admin.from("integration_sync_logs").insert({
      organization_id: organizationId,
      integration_id: integrationId,
      direction: "outbound",
      status,
      message: message.slice(0, 1000),
      records_processed: status === "success" ? 1 : 0,
    });
  };

  try {
    // 1) Trocar refresh_token por access_token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.client_id!,
        client_secret: c.client_secret!,
        refresh_token: c.refresh_token!,
        grant_type: "refresh_token",
      }).toString(),
    });
    if (!tokenRes.ok) {
      await writeLog("failed", `google_token_${tokenRes.status}`);
      return json(200, { ok: false, error: "google_token_failed" });
    }
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token as string;

    // 2) Criar evento com Meet
    const tz = body.timezone || "Europe/Lisbon";
    const eventPayload = {
      summary: body.summary,
      description: body.description || undefined,
      start: { dateTime: new Date(body.start).toISOString(), timeZone: tz },
      end: { dateTime: new Date(body.end).toISOString(), timeZone: tz },
      attendees: (body.attendees ?? []).filter(Boolean).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    const evRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      },
    );
    if (!evRes.ok) {
      const text = await evRes.text();
      await writeLog("failed", `google_event_${evRes.status}: ${text.slice(0, 200)}`);
      return json(200, { ok: false, error: "google_event_failed" });
    }
    const ev = await evRes.json();
    const meetLink = ev?.hangoutLink
      || ev?.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri
      || null;

    await admin.from("integrations")
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: "success" })
      .eq("id", integrationId);
    await writeLog("success", `event ${ev.id}`);

    return json(200, {
      ok: true,
      event_id: ev.id,
      html_link: ev.htmlLink ?? null,
      meet_link: meetLink,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "erro";
    await writeLog("failed", msg);
    return json(200, { ok: false, error: msg });
  }
});