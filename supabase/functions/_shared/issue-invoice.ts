// Núcleo partilhado de emissão de fatura.
// Reutilizado pela edge function manual `create-invoice` e pelo disparo automático `auto-invoice`.
//
// Política nova: a fatura é SEMPRE emitida internamente (numeração própria FAT-xxxxx
// gerada por `public.next_invoice_number`). Se existir uma conexão ATIVA do
// conector `generic_webhook_invoicing`, a fatura é também enviada ao ERP externo
// (sincronização opcional). A falta de conector NUNCA impede a emissão interna.
// A idempotência é garantida pelo índice único parcial `uq_invoices_order_active`.
import { loadConnectionSecrets } from "./connector-secrets.ts";

const CONNECTOR_KEY = "generic_webhook_invoicing";

export type IssueInvoiceResult =
  | { ok: true; invoice: any; already?: boolean }
  | { ok: false; code: string; message: string; status: "pending" | "error" | "skipped" };

export async function issueInvoiceForOrder(
  admin: any,
  orderId: string,
  createdBy: string | null = null,
): Promise<IssueInvoiceResult> {
  // 1) Resolve tratamento de IVA antes de gerar a fatura (garante que o snapshot
  //    da fatura reflete o tratamento fiscal correto mesmo que a UI não o tenha
  //    recalculado). Erros aqui são tolerados — caímos no tratamento atual da encomenda.
  await admin.rpc("resolve_order_vat_treatment", { p_order_id: orderId });

  // 2) Carrega encomenda + cliente + linhas (já com os totais/tratamento atualizados)
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("*, customers(*), order_lines(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return { ok: false, code: "order_not_found", message: "Encomenda não encontrada.", status: "skipped" };
  }

  if (!["confirmada", "paga", "faturada"].includes(order.status)) {
    return {
      ok: false,
      code: "invalid_order_status",
      message: "Apenas encomendas confirmadas ou pagas podem ser faturadas.",
      status: "skipped",
    };
  }

  // 2) Idempotência: se já existir fatura ativa, devolve-a sem chamar o conector.
  const { data: existing } = await admin
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .neq("status", "error")
    .maybeSingle();
  if (existing) {
    return { ok: true, invoice: existing, already: true };
  }

  // 3) Conector externo é OPCIONAL — apenas para sincronização com ERP.
  const { data: connection } = await admin
    .from("connections")
    .select("id, status, config")
    .eq("organization_id", order.organization_id)
    .eq("connector_key", CONNECTOR_KEY)
    .maybeSingle();
  const externalEnabled = !!connection && connection.status === "active"
    && !!(connection.config as any)?.target_url;

  // 4) Carrega org (nome)
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", order.organization_id)
    .maybeSingle();

  const c = (order as any).customers;
  const lines = ((order as any).order_lines ?? []).map((l: any) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unit_price: Number(l.unit_price),
    tax_rate: Number(l.tax_rate ?? 0),
    discount_pct: Number(l.discount_pct ?? 0),
    line_subtotal: Number(l.line_subtotal),
    line_tax: Number(l.line_tax),
    line_total: Number(l.line_total),
  }));

  // 5) Gera nº interno SEMPRE (atómico por org).
  const { data: numRes, error: numErr } = await admin.rpc("next_invoice_number", {
    _org_id: order.organization_id,
  });
  if (numErr || !numRes) {
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      connector_key: CONNECTOR_KEY,
      direction: "outbound",
      entity_type: "invoice",
      action: "create",
      status: "error",
      message: `numbering_failed: ${numErr?.message ?? "sem detalhe"}`,
      payload: { order_id: orderId },
    });
    return { ok: false, code: "numbering_failed", message: numErr?.message ?? "Falha a gerar nº de fatura.", status: "error" };
  }
  const internalNumber = String(numRes);

  // 6) Cria fatura interna com status "issued" (snapshot dos totais).
  //    O índice único parcial protege contra concorrência (uma só por encomenda).
  const initialExternalStatus = externalEnabled ? "pending" : "not_synced";
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      organization_id: order.organization_id,
      order_id: order.id,
      customer_id: order.customer_id,
      connector_key: CONNECTOR_KEY,
      status: "issued",
      invoice_number: internalNumber,
      external_status: initialExternalStatus,
      currency: order.currency,
      subtotal: order.subtotal,
      tax_total: order.tax_total,
      total: order.total,
      vat_treatment: order.vat_treatment,
      vat_exemption_reason: order.vat_exemption_reason,
      issued_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select()
    .single();

  if (invErr || !invoice) {
    // Pode ser a unique constraint (corrida): devolve a existente.
    const { data: again } = await admin
      .from("invoices")
      .select("*")
      .eq("order_id", orderId)
      .neq("status", "error")
      .maybeSingle();
    if (again) return { ok: true, invoice: again, already: true };
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      connector_key: CONNECTOR_KEY,
      direction: "outbound",
      entity_type: "invoice",
      action: "create",
      status: "error",
      message: `invoice_create_failed: ${invErr?.message ?? "sem detalhe"}`,
      payload: { order_id: orderId, internal_number: internalNumber },
    });
    return { ok: false, code: "invoice_create_failed", message: invErr?.message ?? "Falha ao criar fatura.", status: "error" };
  }

  // Marca a encomenda como faturada (emissão interna concluída).
  await admin.from("orders").update({ status: "faturada" }).eq("id", order.id);

  // 7) Se NÃO houver conector externo ativo, terminámos. Fatura interna está emitida.
  if (!externalEnabled) {
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      connector_key: CONNECTOR_KEY,
      direction: "outbound",
      entity_type: "invoice",
      action: "create",
      status: "success",
      message: `Fatura interna ${internalNumber} emitida (sem conector externo ativo).`,
      payload: { invoice_id: invoice.id, order_id: order.id, order_number: order.order_number },
    });
    return { ok: true, invoice };
  }

  // 8) Sincronização opcional com ERP externo.
  const targetUrl = (connection!.config as any).target_url as string;
  const secrets = await loadConnectionSecrets(admin, connection!.id);
  const authHeaderValue = secrets["auth_header"] || "";

  const payload = {
    event: "invoice.create",
    organization: { id: org?.id, name: org?.name },
    invoice: {
      id: invoice.id,
      invoice_number: internalNumber,
      vat_treatment: order.vat_treatment,
      vat_exemption_reason: order.vat_exemption_reason,
    },
    order: {
      id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      tax_total: Number(order.tax_total),
      total: Number(order.total),
      vat_treatment: order.vat_treatment,
      vat_exemption_reason: order.vat_exemption_reason,
      ship_to: {
        name: order.ship_to_name,
        address: order.ship_to_address,
        city: order.ship_to_city,
        postal_code: order.ship_to_postal_code,
        country: order.ship_to_country,
      },
    },
    customer: c
      ? {
          id: c.id,
          name: c.name,
          email: c.email,
          vat_number: c.vat_number,
          address: {
            address: c.address,
            city: c.city,
            postal_code: c.postal_code,
            country: c.country,
          },
        }
      : null,
    lines,
  };

  // 9) POST para target_url do ERP.
  let respText = "";
  let respJson: any = null;
  let resp: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeaderValue) headers["Authorization"] = authHeaderValue;
    resp = await fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    respText = await resp.text();
    try { respJson = JSON.parse(respText); } catch { /* não-JSON */ }
  } catch (e) {
    const msg = `Falha de rede: ${(e as Error).message}`;
    await admin.from("invoices")
      .update({ external_status: "error", error_message: msg })
      .eq("id", invoice.id);
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      connector_key: CONNECTOR_KEY,
      direction: "outbound",
      entity_type: "invoice",
      action: "create",
      status: "error",
      message: msg,
      payload,
    });
    // A fatura interna mantém-se emitida; devolvemos ok com o registo já existente.
    const { data: cur } = await admin.from("invoices").select("*").eq("id", invoice.id).single();
    return { ok: true, invoice: cur ?? invoice };
  }

  if (!resp.ok) {
    const msg = `HTTP ${resp.status}: ${respText.slice(0, 500)}`;
    await admin.from("invoices")
      .update({ external_status: "error", error_message: msg })
      .eq("id", invoice.id);
    await admin.from("sync_logs").insert({
      organization_id: order.organization_id,
      connector_key: CONNECTOR_KEY,
      direction: "outbound",
      entity_type: "invoice",
      action: "create",
      status: "error",
      message: msg,
      payload,
    });
    const { data: cur } = await admin.from("invoices").select("*").eq("id", invoice.id).single();
    return { ok: true, invoice: cur ?? invoice };
  }

  // 10) Resposta OK — pode trazer pdf_url / id externo síncronos, ou apenas ACK.
  const pdfUrl = respJson?.pdf_url ?? respJson?.pdf ?? null;
  const externalId = respJson?.external_id ?? respJson?.id ?? null;
  const syncedNow = !!(pdfUrl || externalId);

  await admin.from("invoices").update({
    external_status: syncedNow ? "synced" : "pending",
    pdf_url: pdfUrl ?? invoice.pdf_url,
    external_id: externalId ? String(externalId) : invoice.external_id,
    error_message: null,
  }).eq("id", invoice.id);

  if (externalId) {
    await admin.from("external_refs").upsert(
      {
        organization_id: order.organization_id,
        connector_key: CONNECTOR_KEY,
        entity_type: "invoice",
        entity_id: invoice.id,
        external_id: String(externalId),
      },
      { onConflict: "organization_id,connector_key,entity_type,entity_id" },
    );
  }

  await admin.from("sync_logs").insert({
    organization_id: order.organization_id,
    connector_key: CONNECTOR_KEY,
    direction: "outbound",
    entity_type: "invoice",
    action: "create",
    status: "success",
    message: syncedNow
      ? `Fatura ${internalNumber} sincronizada com ERP externo.`
      : `Fatura ${internalNumber} enviada — a aguardar confirmação do ERP.`,
    payload: { request: payload, response: respJson ?? respText },
  });

  const { data: updated } = await admin.from("invoices").select("*").eq("id", invoice.id).single();
  return { ok: true, invoice: updated ?? invoice };
}