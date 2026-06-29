import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeMoloniAdapter } from "./moloni.ts";

// Mocka fetch global para simular respostas do Moloni.
// Sequência: 1) grant token, 2) companies/getAll, 3) customers/getAll page 1,
// 4) customers/getAll page 2 (vazia), 5) documents/getAll page 1, 6) documents/getOne,
// 7) documents/getAll page 2 (vazia).

Deno.test("moloni adapter pull mapeia customers e invoices em CanonicalRecord", async () => {
  const responses: Array<{ match: RegExp; body: unknown; ok?: boolean }> = [
    { match: /\/grant\//, body: { access_token: "T", refresh_token: "R", expires_in: 3600 } },
    { match: /\/customers\/getAll\//, body: [
      { customer_id: 101, name: "Cliente A", vat: "500000001", email: "a@a.pt" },
      { customer_id: 102, name: "Cliente B", vat: "500000002" },
    ] },
    { match: /\/documents\/getAll\//, body: [{ document_id: 9001 }] },
    { match: /\/documents\/getOne\//, body: {
      document_id: 9001, number: 1, date: "2026-01-15",
      document_set: { name: "FT" },
      net_value: 100, taxes_value: 23, gross_value: 123,
      entity_name: "Cliente A", entity_vat: "500000001",
      products: [{ name: "Item X", reference: "SKU1", qty: 2, price: 50, discount: 0, taxes: [{ value: 23 }] }],
      status: 1,
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
    const adapter = makeMoloniAdapter({
      organizationId: "org-1",
      credentials: { client_id: "c", client_secret: "s", username: "u", password: "p", company_id: "5" },
      syncDirection: "import",
    });
    const { records } = await adapter.pull({ entityTypes: ["customer", "invoice"] });
    const customers = records.filter((r) => r.entityType === "customer");
    const invoices = records.filter((r) => r.entityType === "invoice");
    assertEquals(customers.length, 2);
    assertEquals(customers[0].externalId, "101");
    assertEquals((customers[0].data as any).tax_id, "500000001");
    assertEquals(invoices.length, 1);
    assertEquals(invoices[0].externalId, "9001");
    assertEquals((invoices[0].data as any).invoice_number, "FT 1");
    assertEquals((invoices[0].data as any).total, 123);
    assertEquals(((invoices[0].data as any).items as any[]).length, 1);
    // push devolve vazio (export ainda não implementado neste adapter).
    const pushed = await adapter.push([]);
    assertEquals(pushed.pushed.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});