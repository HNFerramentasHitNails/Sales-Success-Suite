// Persistência canónica abstraída atrás de uma interface.
// O orquestrador só fala com CanonicalStore; os adapters nunca tocam na BD.

import type { EntityType } from "./types.ts";

export interface UnlinkedItem {
  internalId: string;
  data: Record<string, unknown>;
}

export interface CanonicalStore {
  /**
   * Idempotente: se (provider, entity_type, external_id) já existir para a org,
   * devolve o internal_id existente; caso contrário gera um novo e regista-o.
   */
  upsert(
    entityType: EntityType,
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<string>;
  /**
   * Liga um internal_id a um external_id depois de um push bem-sucedido.
   */
  link(
    entityType: EntityType,
    internalId: string,
    externalId: string,
  ): Promise<void>;
  /**
   * Opcional: registos internos que ainda não têm external_id para este provider.
   */
  listUnlinked?(entityType: EntityType): Promise<UnlinkedItem[]>;
}

// ---------------------------------------------------------------------------
// InMemoryStore — usado em testes.
// ---------------------------------------------------------------------------
export class InMemoryStore implements CanonicalStore {
  // Chave: `${entityType}::${externalId}` -> internalId
  public readonly links = new Map<string, string>();
  public readonly data = new Map<string, Record<string, unknown>>();

  upsert(
    entityType: EntityType,
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const key = `${entityType}::${externalId}`;
    let internalId = this.links.get(key);
    if (!internalId) {
      internalId = crypto.randomUUID();
      this.links.set(key, internalId);
    }
    this.data.set(internalId, data);
    return Promise.resolve(internalId);
  }

  link(
    entityType: EntityType,
    internalId: string,
    externalId: string,
  ): Promise<void> {
    const key = `${entityType}::${externalId}`;
    this.links.set(key, internalId);
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// ExternalRefsStore — persiste mapeamentos na tabela public.external_refs.
// Recebe um cliente Supabase já criado (service-role) e o contexto da org/provider.
// ---------------------------------------------------------------------------

// Tipo mínimo — evita acoplar à versão do SDK em tempo de compilação Deno.
interface SbClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface ExternalRefsStoreOpts {
  client: SbClient;
  organizationId: string;
  provider: string;
}

export class ExternalRefsStore implements CanonicalStore {
  constructor(private readonly opts: ExternalRefsStoreOpts) {}

  async upsert(
    entityType: EntityType,
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const { client, organizationId, provider } = this.opts;
    const { data: existing, error: selErr } = await client
      .from("external_refs")
      .select("internal_id")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .eq("entity_type", entityType)
      .eq("external_id", externalId)
      .maybeSingle();
    if (selErr) throw new Error(`external_refs select: ${selErr.message}`);
    if (existing?.internal_id) return existing.internal_id as string;

    const internalId = crypto.randomUUID();
    const { error: insErr } = await client.from("external_refs").insert({
      organization_id: organizationId,
      provider,
      entity_type: entityType,
      internal_id: internalId,
      external_id: externalId,
      metadata: data ?? {},
    });
    if (insErr) throw new Error(`external_refs insert: ${insErr.message}`);
    return internalId;
  }

  async link(
    entityType: EntityType,
    internalId: string,
    externalId: string,
  ): Promise<void> {
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
}