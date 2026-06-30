import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function digits(s: string): string {
  let o = ""; for (const c of (s || "")) if (c >= "0" && c <= "9") o += c; return o;
}

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;max-width:440px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.05)}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;line-height:1.5;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status: 200, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const token = url.searchParams.get("t") || url.searchParams.get("token") || "";
  if (!token) return page("Ligação inválida", "Falta o identificador de cancelamento.");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: lead } = await admin
    .from("outreach_leads")
    .select("id, organization_id, email, phone")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!lead) return page("Ligação inválida", "Este pedido de cancelamento não é válido ou já expirou.");

  // Marca o lead como não contactar + adiciona à lista de supressão (email e telefone).
  await admin.from("outreach_leads").update({ opted_out: true, opted_out_at: new Date().toISOString() }).eq("id", lead.id);

  const email = (lead.email || "").trim().toLowerCase();
  const phone = digits(lead.phone || "");
  const rows: Array<Record<string, unknown>> = [];
  if (email) rows.push({ organization_id: lead.organization_id, channel: "email", value: email, reason: "unsubscribe" });
  if (phone) rows.push({ organization_id: lead.organization_id, channel: "whatsapp", value: phone, reason: "unsubscribe" });
  if (rows.length) {
    await admin.from("outreach_suppression").upsert(rows, { onConflict: "organization_id,channel,value", ignoreDuplicates: true });
  }

  return page(
    "Subscrição cancelada",
    "Deixou de receber as nossas comunicações. Se foi engano, contacte o remetente.",
  );
});
