import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeVendusAdapter } from "./vendus.ts";

// Mocka fetch para simular respostas do Vendus.
// Sequência: 1) /clients/ page 1 (1 cliente, <50 -> stop),
// 2) /documents/ page 1 (1 doc), 3) /documents/{id}/ detalhe.

Deno.test("vendus adapter pull mapeia customers e invoices em CanonicalRecord", async () => {
  const responses: Array<{ match: RegExp; body: unknown }> = [
    { match: /\/clients\/\?/, body: [
      { id: 11, name: "Cliente V", fiscal_id: "501000001", email: "v@v.pt" },
    ] },
    { match: /\/documents\/\?/, body: [
      { id: 7001, number: "FT 1/1", date: "2026-02-10", amount_net: 100, amount_gross: 123, currency_code: "EUR", status: "F" },
    ] },
    { match: /\/documents\/7001\//, body: {
      id: 7001, number: "FT 1/1", date: "2026-02-10",
      amount_net: 100, amount_gross: 123, currency_code: "EUR", status: "F",
      client: { name: "Cliente V", fiscal_id: "501000001" },
      items: [{ title: "Linha A", reference: "SKU-A", qty: 2, gross_price: 50, tax_rate: 23, amount_gross: 100 }],
    } },
  ];

  const originalFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((input: any) => {
    const url = typeof input === "string" ? input : input.url;
    const next = responses[i++];
    if (!next || !next.match.test(url)) {
      throw new Error(`unexpected fetch #${i}: ${url}`);
    }
    return Promise.resolve(new Response(JSON.stringify(next.body), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    const adapter = makeVendusAdapter({
      organizationId: "org-1",
      credentials: { api_key: "K" },
      syncDirection: "import",
    });
    const { records } = await adapter.pull({ entityTypes: ["customer", "invoice"] });
    const customers = records.filter((r) => r.entityType === "customer");
    const invoices = records.filter((r) => r.entityType === "invoice");
    assertEquals(customers.length, 1);
    assertEquals(customers[0].externalId, "11");
    assertEquals((customers[0].data as any).tax_id, "501000001");
    assertEquals(invoices.length, 1);
    assertEquals(invoices[0].externalId, "7001");
    assertEquals((invoices[0].data as any).invoice_number, "FT 1/1");
    assertEquals((invoices[0].data as any).total, 123);
    assertEquals(((invoices[0].data as any).items as any[]).length, 1);
    const pushed = await adapter.push([]);
    assertEquals(pushed.pushed.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});