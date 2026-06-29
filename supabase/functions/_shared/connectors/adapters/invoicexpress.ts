// Adapter InvoiceXpress para o framework de conectores.
// NÃO toca na base de dados. Reutiliza helpers puros de _shared/invoicexpress.ts.

import type { Adapter, ConnectorContext, EntityType } from "../types.ts";
import {
  ixPing,
  ixFetchCustomers,
  ixFetchInvoices,
  type IXCreds,
} from "../../invoicexpress.ts";

export function makeInvoicexpressAdapter(ctx: ConnectorContext): Adapter {
  const creds = ctx.credentials as unknown as IXCreds;

  return {
    async testConnection() {
      try {
        const msg = await ixPing(creds);
        return { ok: true, message: msg };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    async pull({ entityTypes }: { entityTypes: EntityType[] }) {
      const records = [];
      if (entityTypes.includes("customer")) {
        records.push(...await ixFetchCustomers(creds));
      }
      if (entityTypes.includes("invoice")) {
        records.push(...await ixFetchInvoices(creds));
      }
      return { records, cursor: null };
    },
    push(_targets) {
      // Export fica para passo posterior — não duplica exportToIX.
      return Promise.resolve({ pushed: [] });
    },
  };
}