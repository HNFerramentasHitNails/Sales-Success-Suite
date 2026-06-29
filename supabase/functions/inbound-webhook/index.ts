import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  const token = last && last !== "inbound-webhook" ? last : (url.searchParams.get("token") ?? "");
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";

  if (!token || !secret) return json(400, { error: "token_and_secret_required" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: endpoint } = await admin
    .from("webhook_endpoints")
    .select("id, organization_id, secret, is_active")
    .eq("token", token)
    .maybeSingle();

  if (!endpoint || !endpoint.is_active || endpoint.secret !== secret) {
    return json(401, { error: "invalid_credentials" });
  }

  let payload: unknown = null;
  try { payload = await req.json(); } catch { payload = await req.text().catch(() => null); }

  let handled: string | null = null;
  const p: any = payload && typeof payload === "object" ? payload : {};
  const eventType: string = p.event ?? p.type ?? "";
  let createdProspectId: string | null = null;

  // ----- LEAD CAPTURE -----
  const isLeadEvent =
    eventType === "lead.created" ||
    eventType === "lead" ||
    eventType === "prospect" ||
    (!eventType && (p.name || p.email || p.phone || p.full_name || p.company_name));

  if (isLeadEvent) {
    try {
      const name =
        p.name ?? p.full_name ?? p.company_name ?? p.email ?? p.phone ?? null;
      if (!name) {
        await admin.from("sync_logs").insert({
          organization_id: endpoint.organization_id,
          connector_key: "generic_webhook_leads",
          direction: "inbound",
          entity_type: "prospect",
          action: "lead.invalid",
          status: "warning",
          message: "Lead sem name/email/phone",
          payload: p,
        });
        return json(200, { ok: true, handled: "lead.invalid" });
      }

      const { data: ins, error: insErr } = await admin
        .from("prospects")
        .insert({
          organization_id: endpoint.organization_id,
          name: String(name),
          company_name: p.company_name ?? p.company ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          source: p.source ?? "webhook",
          pipeline_stage: "novo",
          estimated_value: p.estimated_value ?? p.value ?? null,
          notes_short: p.message ?? p.notes ?? null,
          created_by: null,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      createdProspectId = (ins as any).id;
      handled = "lead.created";

      await admin.from("sync_logs").insert({
        organization_id: endpoint.organization_id,
        connector_key: "generic_webhook_leads",
        direction: "inbound",
        entity_type: "prospect",
        action: "lead.created",
        status: "success",
        message: "Lead criado via webhook",
        payload: p,
      });

      return json(200, { ok: true, handled, prospect_id: createdProspectId });
    } catch (e) {
      await admin.from("sync_logs").insert({
        organization_id: endpoint.organization_id,
        connector_key: "generic_webhook_leads",
        direction: "inbound",
        entity_type: "prospect",
        action: "lead.error",
        status: "error",
        message: (e as Error).message,
        payload: p,
      });
      return json(500, { error: "processing_failed", message: (e as Error).message });
    }
  }

  // Handle invoice issuance confirmation from external ERP (generic invoicing connector).
  // A fatura interna já existe; aqui apenas confirmamos a sincronização externa.
  if (eventType === "invoice.issued" || (p.invoice_number && (p.order_number || p.external_id || p.order_id))) {
    try {
      const pdfUrl = p.pdf_url ?? p.pdf ?? null;
      const externalId = p.external_id ?? p.id ?? null;
      const orderNumber = p.order_number ?? null;
      const orderId = p.order_id ?? null;

      // Locate the order within this org
      let orderRow: any = null;
      if (orderId) {
        const { data } = await admin.from("orders").select("id, organization_id")
          .eq("id", orderId).eq("organization_id", endpoint.organization_id).maybeSingle();
        orderRow = data;
      }
      if (!orderRow && orderNumber) {
        const { data } = await admin.from("orders").select("id, organization_id")
          .eq("order_number", orderNumber).eq("organization_id", endpoint.organization_id).maybeSingle();
        orderRow = data;
      }
      if (!orderRow && externalId) {
        const { data: ref } = await admin.from("external_refs").select("entity_id")
          .eq("organization_id", endpoint.organization_id)
          .eq("entity_type", "invoice").eq("external_id", String(externalId)).maybeSingle();
        if (ref) {
          const { data: inv } = await admin.from("invoices").select("id, order_id")
            .eq("id", (ref as any).entity_id).maybeSingle();
          if (inv) orderRow = { id: (inv as any).order_id, organization_id: endpoint.organization_id };
        }
      }

      if (orderRow) {
        const { data: existingInv } = await admin.from("invoices").select("*")
          .eq("order_id", orderRow.id).neq("status", "error").maybeSingle();
        if (existingInv) {
          await admin.from("invoices").update({
            external_status: "synced",
            pdf_url: pdfUrl ?? (existingInv as any).pdf_url,
            external_id: externalId ? String(externalId) : (existingInv as any).external_id,
            error_message: null,
          }).eq("id", (existingInv as any).id);
          if (externalId) {
            await admin.from("external_refs").upsert({
              organization_id: endpoint.organization_id,
              connector_key: "generic_webhook_invoicing",
              entity_type: "invoice",
              entity_id: (existingInv as any).id,
              external_id: String(externalId),
            }, { onConflict: "organization_id,connector_key,entity_type,entity_id" });
          }
          handled = "invoice.issued";
        } else {
          handled = "invoice.unmatched";
        }
      } else {
        handled = "invoice.unmatched";
      }
    } catch (e) {
      await admin.from("sync_logs").insert({
        organization_id: endpoint.organization_id,
        connector_key: "generic_webhook_invoicing",
        direction: "inbound",
        entity_type: "invoice",
        action: "webhook_received",
        status: "error",
        message: (e as Error).message,
        payload: p,
      });
      return json(500, { error: "processing_failed", message: (e as Error).message });
    }
  }

  await admin.from("sync_logs").insert({
    organization_id: endpoint.organization_id,
    connector_key: handled?.startsWith("invoice") ? "generic_webhook_invoicing" : null,
    direction: "inbound",
    entity_type: handled?.startsWith("invoice") ? "invoice" : null,
    action: handled ?? "webhook_received",
    status: handled === "invoice.unmatched" ? "warning" : "success",
    message: handled === "invoice.issued" ? "Fatura atualizada via webhook"
      : handled === "invoice.unmatched" ? "Não foi possível localizar a encomenda"
      : "Payload recebido com sucesso",
    payload: payload ? (typeof payload === "object" ? payload : { raw: payload }) : null,
  });

  return json(200, { ok: true, handled });
});