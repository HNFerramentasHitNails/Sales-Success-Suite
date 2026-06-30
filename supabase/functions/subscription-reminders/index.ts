import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const UNIT_LABEL: Record<string, string> = { week: "semana", month: "mês", quarter: "trimestre", year: "ano" };

function money(v: number, currency = "EUR"): string {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}

async function resendSend(apiKey: string, from: string, to: string, subject: string, html: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronSecret = Deno.env.get("OUTREACH_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || provided !== cronSecret) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fallbackFrom = Deno.env.get("MEETING_FROM_EMAIL") || "Subscrições <onboarding@resend.dev>";
  if (!resendKey) return json({ error: "resend_not_configured" });

  const today = new Date();
  const horizon = new Date(today.getTime() + 3 * 86400_000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // Subscrições ativas a renovar nos próximos 3 dias, sem lembrete enviado para essa data.
  const { data: subs } = await admin
    .from("recurring_subscriptions")
    .select("id, organization_id, customer_id, description, unit_price, quantity, discount_percent, tax_rate, interval_unit, interval_count, next_run_date, reminder_sent_for, status")
    .eq("status", "active")
    .gte("next_run_date", todayStr)
    .lte("next_run_date", horizon)
    .limit(500);

  let sent = 0;
  for (const s of subs ?? []) {
    if ((s as { reminder_sent_for?: string }).reminder_sent_for === s.next_run_date) continue;

    const { data: cust } = await admin.from("customers").select("name, email").eq("id", s.customer_id).maybeSingle();
    if (!cust?.email) continue;
    const { data: org } = await admin.from("organizations").select("name, legal_name, legal_email, currency").eq("id", s.organization_id).maybeSingle();

    const seller = (org as { legal_name?: string; name?: string } | null)?.legal_name || (org as { name?: string } | null)?.name || "";
    const currency = (org as { currency?: string } | null)?.currency || "EUR";
    const qty = Number(s.quantity ?? 1);
    const sub = Number(s.unit_price ?? 0) * qty * (1 - Number(s.discount_percent ?? 0) / 100);
    const total = sub * (1 + Number(s.tax_rate ?? 0) / 100);
    const every = `${Math.max(1, Number(s.interval_count ?? 1))} ${UNIT_LABEL[s.interval_unit] ?? s.interval_unit}`;
    const contact = (org as { legal_email?: string } | null)?.legal_email;

    const html = `
      <p>Olá ${cust.name ?? ""},</p>
      <p>Lembramos que a sua subscrição${s.description ? ` <strong>${s.description}</strong>` : ""} será
      renovada automaticamente em <strong>${s.next_run_date}</strong>.</p>
      <p>Periodicidade: a cada ${every}. Valor estimado: <strong>${money(total, currency)}</strong> (IVA incluído quando aplicável).</p>
      <p>Para alterar ou cancelar a subscrição${contact ? `, contacte ${contact}` : ", contacte o vendedor"}.</p>
      ${seller ? `<p style="color:#64748b;font-size:12px">${seller}</p>` : ""}
    `;

    const ok = await resendSend(resendKey, fallbackFrom, cust.email, "Lembrete de renovação da subscrição", html);
    if (ok) {
      await admin.from("recurring_subscriptions").update({ reminder_sent_for: s.next_run_date }).eq("id", s.id);
      sent++;
    }
  }

  return json({ ok: true, reminders_sent: sent });
});
