// Store canónico que persiste em customers / invoices / invoice_items
// e mantém idempotência via external_refs. Filtra SEMPRE por organization_id.

import type { CanonicalStore } from "./store.ts";
import type { EntityType } from "./types.ts";

interface SbClient { from(table: string): any }

export interface SupabaseCanonicalStoreOpts {
  client: SbClient;
  organizationId: string;
  provider: string;
}

export class SupabaseCanonicalStore implements CanonicalStore {
  constructor(private readonly opts: SupabaseCanonicalStoreOpts) {}

  private async getLink(entityType: EntityType, externalId: string): Promise<string | null> {
    const { client, organizationId, provider } = this.opts;
    const { data, error } = await client
      .from("external_refs")
      .select("internal_id")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .eq("entity_type", entityType)
      .eq("external_id", externalId)
      .maybeSingle();
    if (error) throw new Error(`external_refs select: ${error.message}`);
    return (data?.internal_id as string) ?? null;
  }

  async link(entityType: EntityType, internalId: string, externalId: string): Promise<void> {
    const { client, organizationId, provider } = this.opts;
    const { error } = await client.from("external_refs").upsert(
      {
        organization_id: organizationId,
        provider,
        entity_type: entityType,
        internal_id: internalId,
        external_id: externalId,
        metadata: {},
      },
      { onConflict: "organization_id,provider,entity_type,external_id" },
    );
    if (error) throw new Error(`external_refs link: ${error.message}`);
  }

  async upsert(entityType: EntityType, externalId: string, data: Record<string, unknown>): Promise<string> {
    if (entityType === "customer") return this.upsertCustomer(externalId, data);
    if (entityType === "invoice") return this.upsertInvoice(externalId, data);
    // Outros tipos: só link em external_refs.
    const existing = await this.getLink(entityType, externalId);
    if (existing) return existing;
    const internalId = crypto.randomUUID();
    await this.link(entityType, internalId, externalId);
    return internalId;
  }

  private async upsertCustomer(externalId: string, data: Record<string, unknown>): Promise<string> {
    const { client, organizationId } = this.opts;

    const linked = await this.getLink("customer", externalId);
    if (linked) return linked;

    const taxId = (data.tax_id as string | null) ?? null;
    const name = (data.name as string | null) ?? null;

    // Fallback por chave natural.
    if (taxId) {
      const { data: byVat } = await client
        .from("customers").select("id")
        .eq("organization_id", organizationId).eq("tax_id", taxId).maybeSingle();
      if (byVat?.id) { await this.link("customer", byVat.id, externalId); return byVat.id; }
    }
    if (name) {
      const { data: byName } = await client
        .from("customers").select("id")
        .eq("organization_id", organizationId).ilike("name", name).maybeSingle();
      if (byName?.id) { await this.link("customer", byName.id, externalId); return byName.id; }
    }

    const { data: inserted, error } = await client.from("customers").insert({
      organization_id: organizationId,
      name: name || "(sem nome)",
      tax_id: taxId,
      email: data.email ?? null,
      phone: data.phone ?? null,
      billing_address: data.billing_address ?? null,
      billing_city: data.billing_city ?? null,
      billing_postal_code: data.billing_postal_code ?? null,
      billing_country: data.billing_country ?? null,
    }).select("id").single();
    if (error) throw new Error(`customer_insert_failed: ${error.message}`);
    const newId = inserted.id as string;
    await this.link("customer", newId, externalId);
    return newId;
  }

  private async upsertInvoice(externalId: string, data: Record<string, unknown>): Promise<string> {
    const { client, organizationId, provider } = this.opts;

    const linked = await this.getLink("invoice", externalId);
    if (linked) return linked;

    const invoiceNumber = (data.invoice_number as string | null) ?? null;
    if (invoiceNumber) {
      const { data: existing } = await client
        .from("invoices").select("id")
        .eq("organization_id", organizationId)
        .eq("invoice_number", invoiceNumber).maybeSingle();
      if (existing?.id) { await this.link("invoice", existing.id, externalId); return existing.id; }
    }

    // Resolve cliente via this.upsert("customer", ...)
    const customer = (data.customer as Record<string, any>) ?? {};
    const customerExternal = String(customer.vat ?? customer.name ?? `${externalId}-cust`);
    const customerId = await this.upsert("customer", customerExternal, {
      name: customer.name ?? "",
      tax_id: customer.vat ?? null,
      email: null,
      phone: null,
      billing_address: customer.address ?? null,
      billing_city: customer.city ?? null,
      billing_postal_code: customer.zip_code ?? null,
      billing_country: customer.country ?? null,
    });

    const { data: inv, error: invErr } = await client.from("invoices").insert({
      organization_id: organizationId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      issue_date: (data.issue_date as string | null) || null,
      status: data.status ?? "draft",
      subtotal: data.subtotal ?? 0,
      tax_total: data.tax_total ?? 0,
      total: data.total ?? 0,
      currency: data.currency ?? "EUR",
      source: provider,
      customer_name_raw: customer.name ?? null,
      customer_tax_id_raw: customer.vat ?? null,
    }).select("id").single();
    if (invErr) throw new Error(`invoice_insert_failed: ${invErr.message}`);
    const invoiceId = inv.id as string;

    const items = Array.isArray(data.items) ? (data.items as any[]) : [];
    if (items.length) {
      const rows = items.map((it) => ({
        organization_id: organizationId,
        invoice_id: invoiceId,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        line_total: it.line_total,
        product_name_raw: it.product_name_raw,
        product_sku_raw: it.product_sku_raw,
      }));
      const { error: itErr } = await client.from("invoice_items").insert(rows);
      if (itErr) throw new Error(`invoice_items_insert_failed: ${itErr.message}`);
    }

    await this.link("invoice", invoiceId, externalId);
    return invoiceId;
  }
}