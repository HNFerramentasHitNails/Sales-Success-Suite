// Adapter Vendus para o framework de conectores.
// NÃO toca na base de dados. Reutiliza helpers puros de _shared/vendus.ts.

import type { Adapter, ConnectorContext, EntityType } from "../types.ts";
import {
  vendusPing,
  vendusFetchCustomers,
  vendusFetchInvoices,
  type VendusCreds,
} from "../../vendus.ts";

export function makeVendusAdapter(ctx: ConnectorContext): Adapter {
  const creds = ctx.credentials as unknown as VendusCreds;

  return {
    async testConnection() {
      try {
        const msg = await vendusPing(creds);
        return { ok: true, message: msg };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    async pull({ entityTypes }: { entityTypes: EntityType[] }) {
      const records = [];
      if (entityTypes.includes("customer")) {
        records.push(...await vendusFetchCustomers(creds));
      }
      if (entityTypes.includes("invoice")) {
        records.push(...await vendusFetchInvoices(creds));
      }
      return { records, cursor: null };
    },
    push(_targets) {
      // Export fica para passo posterior — não duplica exportToVendus.
      return Promise.resolve({ pushed: [] });
    },
  };
}