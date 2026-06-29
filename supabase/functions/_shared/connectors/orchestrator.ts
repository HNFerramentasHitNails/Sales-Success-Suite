// Orquestrador: corre um adapter contra um store canónico.
// Garante idempotência (via store.upsert) e captura erros sem rebentar.

import type { ConnectorContext, ConnectorDef, EntityType } from "./types.ts";
import type { CanonicalStore } from "./store.ts";

export interface SyncResult {
  ok: boolean;
  imported: number;
  exported: number;
  errors: string[];
}

export async function runSync(
  def: ConnectorDef,
  ctx: ConnectorContext,
  store: CanonicalStore,
): Promise<SyncResult> {
  const errors: string[] = [];
  let imported = 0;
  let exported = 0;

  const adapter = def.makeAdapter(ctx);

  // Mapa capability -> entityType (apenas as capabilities que correspondem a entidades).
  const capToEntity: Partial<Record<string, EntityType>> = {
    customers: "customer",
    products: "product",
    invoices: "invoice",
    orders: "order",
  };
  const entityTypes: EntityType[] = def.capabilities
    .map((c) => capToEntity[c])
    .filter((e): e is EntityType => !!e);

  const wantImport = ctx.syncDirection === "import" || ctx.syncDirection === "both";
  const wantExport = ctx.syncDirection === "export" || ctx.syncDirection === "both";

  if (wantImport) {
    try {
      const { records } = await adapter.pull({ entityTypes });
      for (const rec of records) {
        try {
          await store.upsert(rec.entityType, rec.externalId, rec.data);
          imported++;
        } catch (e) {
          errors.push(`upsert ${rec.entityType}/${rec.externalId}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`pull: ${(e as Error).message}`);
    }
  }

  if (wantExport && store.listUnlinked) {
    for (const entityType of entityTypes) {
      try {
        const pending = await store.listUnlinked(entityType);
        if (pending.length === 0) continue;
        const { pushed } = await adapter.push(
          pending.map((p) => ({ entityType, internalId: p.internalId, data: p.data })),
        );
        for (const p of pushed) {
          try {
            await store.link(entityType, p.internalId, p.externalId);
            exported++;
          } catch (e) {
            errors.push(`link ${entityType}/${p.internalId}: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        errors.push(`push ${entityType}: ${(e as Error).message}`);
      }
    }
  }

  return { ok: errors.length === 0, imported, exported, errors };
}