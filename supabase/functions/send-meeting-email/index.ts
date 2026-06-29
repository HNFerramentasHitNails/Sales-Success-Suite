// Edge function: envia convite de reunião por email via Resend, com anexo .ics
// Segredos (NUNCA expor ao frontend):
//   RESEND_API_KEY         — chave da API Resend (obrigatória)
//   MEETING_FROM_EMAIL     — remetente (opcional; fallback abaixo)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toIcsDate(iso: string): string {
  // YYYYMMDDTHHMMSSZ em UTC
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function b64(s: string): string {
  // btoa só aceita Latin-1; passamos UTF-8 -> bytes -> binary string
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function buildIcs(opts: {
  title: string;
  start: string;
  end: string;
  meetingUrl: string;
  notes?: string | null;
}): string {
  const uid = crypto.randomUUID();
  const now = toIcsDate(new Date().toISOString());
  const description = `Link da reunião: ${opts.meetingUrl}${opts.notes ? "\n\n" + opts.notes : ""}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sales Success Suite//Meeting//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(opts.start)}`,
    `DTEND:${toIcsDate(opts.end)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `LOCATION:${escapeIcs(opts.meetingUrl)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function formatPt(iso: string, withTime: boolean): string {
  try {
    const fmt = new Intl.DateTimeFormat("pt-PT", {
      timeZone: "Europe/Lisbon",
      dateStyle: "full",
      ...(withTime ? { timeStyle: "short" } : {}),
    });
    return fmt.format(new Date(iso));
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: exige utilizador autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await client.auth.getUser();
    if (userErr || !userData?.user) return json(401, { ok: false, error: "Não autenticado" });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json(200, {
        ok: false,
        error: "RESEND_API_KEY não configurada. Adicione-a em Configurações do Projeto → Secrets.",
      });
    }
    const FROM = Deno.env.get("MEETING_FROM_EMAIL") || "Sales Success Suite <onboarding@resend.dev>";

    const body = await req.json().catch(() => ({}));
    const {
      to,
      recipient_name,
      title,
      start_at,
      end_at,
      meeting_url,
      location,
      notes,
      org_name,
    } = body ?? {};

    if (!to || !meeting_url) {
      return json(400, { ok: false, error: "Campos obrigatórios em falta: 'to' e 'meeting_url'." });
    }
    if (!title || !start_at) {
      return json(400, { ok: false, error: "Campos obrigatórios em falta: 'title' e 'start_at'." });
    }

    // Fim: usa end_at; caso contrário start_at + 30min
    const endIso = end_at
      ? new Date(end_at).toISOString()
      : new Date(new Date(start_at).getTime() + 30 * 60 * 1000).toISOString();

    const whenStr = formatPt(start_at, true);
    const whenEndStr = end_at ? formatPt(end_at, true) : null;

    const safeTitle = escapeHtml(title);
    const safeMeet = escapeHtml(meeting_url);
    const safeOrg = escapeHtml(org_name || "Sales Success Suite");
    const safeName = recipient_name ? escapeHtml(recipient_name) : null;
    const safeLocation = location ? escapeHtml(location) : null;
    const safeNotes = notes ? escapeHtml(notes).replace(/\n/g, "<br/>") : null;

    const html = `<!doctype html>
<html lang="pt"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td>
          <p style="margin:0 0 16px 0;font-size:15px;color:#333;">Olá${safeName ? ` ${safeName}` : ""},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#333;">Tem uma reunião online agendada:</p>
          <h2 style="margin:0 0 12px 0;font-size:20px;color:#111;">${safeTitle}</h2>
          <p style="margin:0 0 6px 0;font-size:14px;color:#555;"><strong>Quando:</strong> ${escapeHtml(whenStr)}${whenEndStr ? ` — ${escapeHtml(whenEndStr)}` : ""}</p>
          ${safeLocation ? `<p style="margin:0 0 6px 0;font-size:14px;color:#555;"><strong>Local:</strong> ${safeLocation}</p>` : ""}
          <div style="margin:28px 0;text-align:center;">
            <a href="${safeMeet}" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">Entrar na reunião (Google Meet)</a>
          </div>
          <p style="margin:0 0 16px 0;font-size:13px;color:#666;word-break:break-all;">
            Ou copie este link: <a href="${safeMeet}" style="color:#1a73e8;">${safeMeet}</a>
          </p>
          ${safeNotes ? `<div style="margin:20px 0;padding:14px;background:#f6f8fa;border-radius:8px;font-size:14px;color:#444;"><strong>Notas:</strong><br/>${safeNotes}</div>` : ""}
          <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
          <p style="margin:0;font-size:12px;color:#999;">Convite enviado por ${safeOrg}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const ics = buildIcs({
      title,
      start: new Date(start_at).toISOString(),
      end: endIso,
      meetingUrl: meeting_url,
      notes,
    });
    const icsB64 = b64(ics);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `Convite: ${title}`,
        html,
        attachments: [{ filename: "reuniao.ics", content: icsB64 }],
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      console.error("Resend error:", resendRes.status, resendData);
      const msg =
        (resendData && (resendData.message || resendData.error)) ||
        `Falha no envio (HTTP ${resendRes.status})`;
      return json(200, { ok: false, error: msg });
    }

    return json(200, { ok: true, id: resendData?.id ?? null });
  } catch (e) {
    console.error("send-meeting-email error:", e);
    return json(200, { ok: false, error: (e as Error).message || "Erro inesperado" });
  }
});