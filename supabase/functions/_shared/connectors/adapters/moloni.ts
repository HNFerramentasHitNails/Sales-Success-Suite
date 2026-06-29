// Adapter Moloni para o framework de conectores.
// NÃO toca na base de dados. Reutiliza helpers puros de _shared/moloni.ts.

import type { Adapter, ConnectorContext, EntityType } from "../types.ts";
import {
  moloniGetTokenFromCreds,
  moloniResolveCompanyId,
  fetchMoloniCustomers,
  fetchMoloniInvoices,
} from "../../moloni.ts";

export function makeMoloniAdapter(ctx: ConnectorContext): Adapter {
  const creds = ctx.credentials as Record<string, string>;

  async function bootstrap(): Promise<{ token: string; companyId: number }> {
    const token = await moloniGetTokenFromCreds(creds);
    const companyId = await moloniResolveCompanyId(creds, token);
    return { token, companyId };
  }

  return {
    async testConnection() {
      try {
        await bootstrap();
        return { ok: true, message: "moloni ligado" };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    async pull({ entityTypes }: { entityTypes: EntityType[] }) {
      const { token, companyId } = await bootstrap();
      const records = [];
      if (entityTypes.includes("customer")) {
        records.push(...await fetchMoloniCustomers(token, companyId));
      }
      if (entityTypes.includes("invoice")) {
        records.push(...await fetchMoloniInvoices(token, companyId));
      }
      return { records, cursor: null };
    },
    push(_targets) {
      // Export fica para passo posterior — não duplica exportToMoloni.
      return Promise.resolve({ pushed: [] });
    },
  };
}