import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

function digits(s: string): string {
  let o = "";
  for (const c of s) if (c >= "0" && c <= "9") o += c;
  return o;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const expected = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") ?? "";

    if (expected) {
      const url = new URL(req.url);
      if (url.searchParams.get("token") !== expected) return new Response(JSON.stringify({ error: "forbidden" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const evt = await req.json().catch(() => ({} as any));
    const rawEvent: string = (evt?.event ?? evt?.type ?? "").toString().toLowerCase().replace("_", ".");
    const instanceName: string = evt?.instance ?? evt?.instanceName ?? "";
    if (!instanceName) return ok({ ignored: "no_instance" });

    const { data: inst } = await admin.from("outreach_whatsapp_instances").select("*").eq("name", instanceName).maybeSingle();
    if (!inst) return ok({ ignored: "unknown_instance" });
    const orgId = inst.organization_id;

    // atualização de ligação
    if (rawEvent.includes("connection")) {
      const state = (evt?.data?.state ?? evt?.state ?? "").toString();
      const status = state === "open" ? "open" : state === "close" ? "close" : "connecting";
      const patch: Record<string, unknown> = { status };
      if (status === "open" && !inst.connected_at) patch.connected_at = new Date().toISOString();
      await admin.from("outreach_whatsapp_instances").update(patch).eq("id", inst.id);
      return ok({ updated: "connection", status });
    }

    // mensagem recebida
    if (rawEvent.includes("messages.upsert")) {
      const data = evt?.data ?? {};
      const arr = Array.isArray(data) ? data : [data];
      for (const m of arr) {
        const key = m?.key ?? {};
        if (key?.fromMe) continue; // ignorar mensagens enviadas por nós
        const jid: string = key?.remoteJid ?? "";
        if (!jid || jid.includes("@g.us")) continue; // ignorar grupos
        const phone = digits(jid.split("@")[0]);
        if (phone.length < 6) continue;
        const last9 = phone.slice(-9);

        // encontrar lead por telefone na org
        const { data: leads } = await admin.from("outreach_leads")
          .select("id, status").eq("organization_id", orgId).is("deleted_at", null)
          .ilike("phone", `%${last9}%`).limit(1);
        const lead = leads?.[0];
        if (!lead) continue;

        if (lead.status !== "respondeu") await admin.from("outreach_leads").update({ status: "respondeu" }).eq("id", lead.id);
        // parar sequências ativas deste lead
        await admin.from("outreach_campaign_targets").update({ status: "replied" })
          .eq("lead_id", lead.id).in("status", ["pending", "active"]);
      }
      return ok({ processed: "messages.upsert" });
    }

    return ok({ ignored: rawEvent });
  } catch (e) {
    console.error("evolution-webhook error:", (e as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
