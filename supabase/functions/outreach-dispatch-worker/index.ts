import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BATCH = 100;
const CIRCUIT_THRESHOLD = 5;

function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}
const today = (d: Date) => d.toISOString().slice(0, 10);

function digitsOnly(s: string): string {
  let o = ""; for (const c of (s || "")) if (c >= "0" && c <= "9") o += c; return o;
}

function render(tpl: string, lead: any): string {
  if (!tpl) return "";
  const map: Record<string, string> = {
    name: lead.name ?? "", full_name: lead.full_name ?? lead.name ?? "", company: lead.company ?? "",
    city: lead.city ?? "", email: lead.email ?? "", phone: lead.phone ?? "", niche: lead.niche ?? "",
  };
  let out = tpl;
  for (const k of Object.keys(map)) out = out.split("{{" + k + "}}").join(map[k]);
  return out;
}

function warmupLimit(inst: any, now: Date): number {
  if (inst.skip_warmup) return 100;
  if (!inst.connected_at) return 20;
  const days = Math.floor((now.getTime() - new Date(inst.connected_at).getTime()) / 86400_000);
  if (days <= 3) return 20;
  if (days <= 7) return 40;
  if (days <= 14) return 60;
  return 100;
}

async function resendSend(apiKey: string, from: string, to: string, subject: string, body: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: subject || "(sem assunto)", text: body, html: body.split("\n").join("<br>") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as any)?.message || `HTTP ${res.status}` };
    return { ok: true, id: (data as any)?.id as string | undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function whatsappSend(base: string, key: string, instance: string, number: string, text: string) {
  try {
    const url = `${base.endsWith("/") ? base.slice(0, -1) : base}/message/sendText/${encodeURIComponent(instance)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "apikey": key, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as any)?.message || `HTTP ${res.status}` };
    return { ok: true, id: (data as any)?.key?.id ?? (data as any)?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function pickVariation(vars: any[]): any | null {
  if (!vars.length) return null;
  if (Math.random() < 0.2) return vars[Math.floor(Math.random() * vars.length)];
  let best = vars[0], bestRate = -1, anyData = false;
  for (const v of vars) {
    if (v.sends > 0) anyData = true;
    const rate = v.responses / Math.max(v.sends, 1);
    if (rate > bestRate) { bestRate = rate; best = v; }
  }
  return anyData ? best : vars[Math.floor(Math.random() * vars.length)];
}

async function weeklyCap(admin: any, orgId: string): Promise<number | null> {
  const { data } = await admin.rpc("org_feature", { _org_id: orgId, _feature_key: "max_weekly_dispatches" });
  const row = Array.isArray(data) ? data[0] : null;
  return row?.limit_int ?? null;
}

async function getChannelState(admin: any, orgId: string, channel: string, now: Date) {
  const { data } = await admin.from("outreach_channel_state").select("*").eq("organization_id", orgId).eq("channel", channel).maybeSingle();
  let st = data;
  if (!st) {
    const ins = await admin.from("outreach_channel_state").insert({ organization_id: orgId, channel, day: today(now), week_start: isoWeekStart(now) }).select("*").single();
    st = ins.data;
  }
  let changed = false;
  if (st.day !== today(now)) { st.day = today(now); st.daily_sent = 0; changed = true; }
  if (st.week_start !== isoWeekStart(now)) { st.week_start = isoWeekStart(now); st.weekly_sent = 0; changed = true; }
  if (changed) await admin.from("outreach_channel_state").update({ day: st.day, daily_sent: st.daily_sent, week_start: st.week_start, weekly_sent: st.weekly_sent }).eq("id", st.id);
  return st;
}

async function activeDomain(admin: any, orgId: string) {
  const { data } = await admin.from("outreach_email_domains").select("*").eq("organization_id", orgId).eq("is_active", true).order("health_score", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function processOrg(admin: any, orgId: string, resendKey: string, fallbackFrom: string, now: Date) {
  const { data: campaigns } = await admin.from("outreach_campaigns").select("*").eq("organization_id", orgId).eq("status", "running");
  if (!campaigns || campaigns.length === 0) return { org: orgId, sent: 0 };

  const cap = await weeklyCap(admin, orgId);
  const campMap = new Map(campaigns.map((c: any) => [c.id, c]));
  const nowIso = now.toISOString();

  // email
  const emailState = await getChannelState(admin, orgId, "email", now);
  const domain = await activeDomain(admin, orgId);
  const from = domain ? `${domain.from_name || "Outreach"} <outreach@${domain.domain}>` : fallbackFrom;

  // whatsapp — config + TODAS as instâncias ligadas (rotação)
  const { data: waCfg } = await admin.from("outreach_whatsapp_settings").select("*").eq("organization_id", orgId).maybeSingle();
  const { data: waInsts } = await admin.from("outreach_whatsapp_instances").select("*").eq("organization_id", orgId).eq("status", "open").order("created_at", { ascending: true });
  for (const wi of waInsts ?? []) {
    if (wi.day !== today(now)) { wi.day = today(now); wi.daily_sent = 0; await admin.from("outreach_whatsapp_instances").update({ day: wi.day, daily_sent: 0 }).eq("id", wi.id); }
  }
  let waState: any = null;

  const { data: targets } = await admin.from("outreach_campaign_targets")
    .select("*").in("campaign_id", campaigns.map((c: any) => c.id))
    .in("status", ["pending", "active"])
    .or(`next_action_at.is.null,next_action_at.lte.${nowIso}`)
    .order("next_action_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  let sent = 0;
  const pausedForQuota = new Set<string>();

  for (const tgt of targets ?? []) {
    if (pausedForQuota.has(tgt.campaign_id)) continue;
    const camp: any = campMap.get(tgt.campaign_id);
    const steps: any[] = Array.isArray(camp?.steps) ? camp.steps : [];
    if (tgt.current_step >= steps.length) { await admin.from("outreach_campaign_targets").update({ status: "completed" }).eq("id", tgt.id); continue; }
    const step = steps[tgt.current_step] ?? {};
    const channel = step.channel || "email";

    const advance = async (extra: Record<string, unknown> = {}) => {
      const nextIdx = tgt.current_step + 1;
      if (nextIdx >= steps.length) {
        await admin.from("outreach_campaign_targets").update({ status: "completed", current_step: nextIdx, ...extra }).eq("id", tgt.id);
      } else {
        const delayH = Number(steps[nextIdx]?.delay_hours ?? 24);
        const next = new Date(now.getTime() + delayH * 3600_000).toISOString();
        await admin.from("outreach_campaign_targets").update({ status: "active", current_step: nextIdx, next_action_at: next, ...extra }).eq("id", tgt.id);
      }
    };
    const retryLater = async (hours: number) => {
      await admin.from("outreach_campaign_targets").update({ next_action_at: new Date(now.getTime() + hours * 3600_000).toISOString() }).eq("id", tgt.id);
    };
    const logMsg = async (status: string, extra: Record<string, unknown> = {}) => {
      await admin.from("outreach_messages").insert({ organization_id: orgId, campaign_id: camp.id, target_id: tgt.id, lead_id: tgt.lead_id, channel, status, ...extra });
    };

    const { data: lead } = await admin.from("outreach_leads").select("*").eq("id", tgt.lead_id).maybeSingle();
    if (!lead || lead.deleted_at) { await admin.from("outreach_campaign_targets").update({ status: "stopped" }).eq("id", tgt.id); continue; }

    // ---------- EMAIL ----------
    if (channel === "email") {
      if (emailState.status === "circuit_open") continue;
      if (cap != null && emailState.weekly_sent >= cap) { await admin.from("outreach_campaigns").update({ status: "waiting_for_quota" }).eq("id", camp.id); pausedForQuota.add(camp.id); continue; }
      if (!lead.email) { await logMsg("failed", { error: "no_email" }); await advance(); continue; }
      const { data: vars } = await admin.from("outreach_template_variations").select("*").eq("template_id", step.template_id).eq("channel", "email");
      const variation = pickVariation(vars ?? []);
      if (!variation) { await advance(); continue; }
      const r = await resendSend(resendKey, from, lead.email, render(variation.subject || "", lead), render(variation.body || "", lead));
      await admin.from("outreach_messages").insert({ organization_id: orgId, campaign_id: camp.id, target_id: tgt.id, lead_id: lead.id, variation_id: variation.id, channel: "email", status: r.ok ? "sent" : "failed", provider_message_id: r.ok ? r.id ?? null : null, error: r.ok ? null : (r.error ?? "send_failed"), sent_at: r.ok ? nowIso : null });
      if (r.ok) {
        sent++; emailState.daily_sent++; emailState.weekly_sent++; emailState.consecutive_failures = 0;
        await admin.from("outreach_template_variations").update({ sends: (variation.sends ?? 0) + 1 }).eq("id", variation.id);
        if (lead.status === "novo") await admin.from("outreach_leads").update({ status: "contactado" }).eq("id", lead.id);
        if (domain) await admin.from("outreach_email_domains").update({ sent_today: (domain.sent_today ?? 0) + 1 }).eq("id", domain.id);
        await advance({ last_channel: "email" });
      } else {
        emailState.consecutive_failures++;
        if (emailState.consecutive_failures >= CIRCUIT_THRESHOLD) { emailState.status = "circuit_open"; await admin.from("outreach_campaigns").update({ status: "paused" }).eq("organization_id", orgId).eq("status", "running"); }
        await retryLater(1);
      }
      await admin.from("outreach_channel_state").update({ daily_sent: emailState.daily_sent, weekly_sent: emailState.weekly_sent, consecutive_failures: emailState.consecutive_failures, status: emailState.status }).eq("id", emailState.id);
      if (emailState.status === "circuit_open") break;
      continue;
    }

    // ---------- WHATSAPP ----------
    if (channel === "whatsapp") {
      if (!waCfg?.api_key || !(waInsts && waInsts.length)) { await logMsg("failed", { error: waCfg?.api_key ? "no_connected_instance" : "whatsapp_not_configured" }); await advance({ last_channel: "whatsapp" }); continue; }
      if (!lead.phone) { await logMsg("failed", { error: "no_phone" }); await advance({ last_channel: "whatsapp" }); continue; }
      if (!waState) waState = await getChannelState(admin, orgId, "whatsapp", now);
      if (waState.status === "circuit_open") continue;
      if (cap != null && waState.weekly_sent >= cap) { await admin.from("outreach_campaigns").update({ status: "waiting_for_quota" }).eq("id", camp.id); pausedForQuota.add(camp.id); continue; }

      // rotação: escolher a instância ligada MENOS usada que ainda tem orçamento de warmup hoje
      const eligible = waInsts.filter((wi: any) => wi.daily_sent < warmupLimit(wi, now));
      if (eligible.length === 0) { await retryLater(6); continue; } // todas no limite de aquecimento
      const waInst = eligible.reduce((a: any, b: any) => (a.daily_sent <= b.daily_sent ? a : b));

      const { data: vars } = await admin.from("outreach_template_variations").select("*").eq("template_id", step.template_id).eq("channel", "whatsapp");
      const variation = pickVariation(vars ?? []);
      if (!variation) { await advance({ last_channel: "whatsapp" }); continue; }
      const number = digitsOnly(lead.phone);
      const r = await whatsappSend(waCfg.base_url, waCfg.api_key, waInst.name, number, render(variation.body || "", lead));
      await admin.from("outreach_messages").insert({ organization_id: orgId, campaign_id: camp.id, target_id: tgt.id, lead_id: lead.id, variation_id: variation.id, channel: "whatsapp", status: r.ok ? "sent" : "failed", provider_message_id: r.ok ? r.id ?? null : null, error: r.ok ? null : (r.error ?? "send_failed"), sent_at: r.ok ? nowIso : null });
      if (r.ok) {
        sent++; waState.daily_sent++; waState.weekly_sent++; waState.consecutive_failures = 0;
        waInst.daily_sent++;
        await admin.from("outreach_whatsapp_instances").update({ daily_sent: waInst.daily_sent }).eq("id", waInst.id);
        await admin.from("outreach_template_variations").update({ sends: (variation.sends ?? 0) + 1 }).eq("id", variation.id);
        if (lead.status === "novo") await admin.from("outreach_leads").update({ status: "contactado" }).eq("id", lead.id);
        await advance({ last_channel: "whatsapp" });
      } else {
        waState.consecutive_failures++;
        if (waState.consecutive_failures >= CIRCUIT_THRESHOLD) { waState.status = "circuit_open"; await admin.from("outreach_campaigns").update({ status: "paused" }).eq("organization_id", orgId).eq("status", "running"); }
        await retryLater(1);
      }
      await admin.from("outreach_channel_state").update({ daily_sent: waState.daily_sent, weekly_sent: waState.weekly_sent, consecutive_failures: waState.consecutive_failures, status: waState.status }).eq("id", waState.id);
      if (waState.status === "circuit_open") break;
      continue;
    }

    // canal desconhecido -> avançar
    await advance({ last_channel: channel });
  }

  return { org: orgId, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const fallbackFrom = Deno.env.get("MEETING_FROM_EMAIL") || "Outreach <onboarding@resend.dev>";

    const now = new Date();
    const cronSecret = Deno.env.get("OUTREACH_CRON_SECRET") ?? "";
    const provided = req.headers.get("x-cron-secret") ?? "";
    const body = await req.json().catch(() => ({} as any));

    if (cronSecret && provided && provided === cronSecret) {
      const { data: orgs } = await admin.from("outreach_campaigns").select("organization_id").eq("status", "running");
      const unique = Array.from(new Set((orgs ?? []).map((o: any) => o.organization_id)));
      const results = [];
      for (const orgId of unique.slice(0, 50)) results.push(await processOrg(admin, orgId, resendKey, fallbackFrom, now));
      return json({ mode: "cron", processed: results });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: claims, error: cErr } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (cErr || !userId) return json({ error: "unauthorized" }, 401);

    const orgId = body?.organization_id as string | undefined;
    if (!orgId) return json({ error: "missing_organization" }, 400);
    const { data: member } = await admin.from("organization_members").select("id, role").eq("organization_id", orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member || member.role === "read_only") return json({ error: "forbidden" }, 403);

    const result = await processOrg(admin, orgId, resendKey, fallbackFrom, now);
    return json({ mode: "manual", ...result });
  } catch (e) {
    console.error("dispatch-worker fatal:", (e as Error).message);
    return json({ error: "internal_error", message: (e as Error).message }, 500);
  }
});
