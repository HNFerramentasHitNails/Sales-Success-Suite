import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeInvoicexpressAdapter } from "./invoicexpress.ts";

// Mocka fetch para simular respostas do InvoiceXpress.
// Sequência: 1) /clients.json page 1 (total_pages=1), 2) /invoices.json page 1 (total_pages=1).

Deno.test("invoicexpress adapter pull mapeia customers e invoices em CanonicalRecord", async () => {
  const responses: Array<{ match: RegExp; body: unknown }> = [
    { match: /\/clients\.json/, body: {
      clients: [
        { id: 21, name: "Cliente IX", fiscal_id: "502000001", email: "ix@ix.pt" },
      ],
      pagination: { total_pages: 1 },
    } },
    { match: /\/invoices\.json/, body: {
      invoices: [
        {
          id: 8001, sequence_number: "FT 2026/1", date: "10/03/2026",
          before_taxes: 100, taxes: 23, total: 123, currency: "Euro", status: "final",
          client: { name: "Cliente IX", fiscal_id: "502000001" },
          items: [{ name: "Item IX", quantity: 1, unit_price: 100, discount: 0, tax: { value: 23 } }],
        },
      ],
      pagination: { total_pages: 1 },
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
    const adapter = makeInvoicexpressAdapter({
      organizationId: "org-1",
      credentials: { account_name: "demo", api_key: "K" },
      syncDirection: "import",
    });
    const { records } = await adapter.pull({ entityTypes: ["customer", "invoice"] });
    const customers = records.filter((r) => r.entityType === "customer");
    const invoices = records.filter((r) => r.entityType === "invoice");
    assertEquals(customers.length, 1);
    assertEquals(customers[0].externalId, "21");
    assertEquals((customers[0].data as any).tax_id, "502000001");
    assertEquals(invoices.length, 1);
    assertEquals(invoices[0].externalId, "8001");
    assertEquals((invoices[0].data as any).invoice_number, "FT 2026/1");
    assertEquals((invoices[0].data as any).total, 123);
    assertEquals((invoices[0].data as any).issue_date, "2026-03-10");
    assertEquals(((invoices[0].data as any).items as any[]).length, 1);
    const pushed = await adapter.push([]);
    assertEquals(pushed.pushed.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});