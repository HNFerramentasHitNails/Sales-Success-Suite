// Adapter de exemplo / testes. Não faz nenhuma chamada externa.

import type { Adapter, ConnectorContext, EntityType } from "../types.ts";

export function makeDummyAdapter(ctx: ConnectorContext): Adapter {
  return {
    testConnection() {
      const ok = !!ctx.credentials?.api_key;
      return Promise.resolve({
        ok,
        message: ok ? "dummy ligado" : "api_key em falta",
      });
    },
    pull({ entityTypes }) {
      const records = entityTypes.flatMap((et: EntityType) => [
        { entityType: et, externalId: `${et}-1`, data: { name: `${et} um` } },
        { entityType: et, externalId: `${et}-2`, data: { name: `${et} dois` } },
      ]);
      return Promise.resolve({ records, cursor: null });
    },
    push(targets) {
      return Promise.resolve({
        pushed: targets.map((t) => ({
          internalId: t.internalId,
          externalId: `pushed-${t.internalId}`,
        })),
      });
    },
  };
}