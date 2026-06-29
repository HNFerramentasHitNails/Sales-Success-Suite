import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runSync } from "./orchestrator.ts";
import { InMemoryStore } from "./store.ts";
import { getConnector } from "./registry.ts";

Deno.test("dummy import: 3 entidades x 2 registos -> 6 links, idempotente", async () => {
  const def = getConnector("dummy")!;
  const store = new InMemoryStore();
  const ctx = {
    organizationId: "org-1",
    credentials: { api_key: "k" },
    syncDirection: "import" as const,
  };

  const first = await runSync(def, ctx, store);
  assertEquals(first.ok, true);
  assertEquals(first.imported, 6);
  assertEquals(store.links.size, 6);

  const second = await runSync(def, ctx, store);
  assertEquals(second.ok, true);
  assertEquals(store.links.size, 6, "segunda corrida não deve duplicar");
});

Deno.test("dummy testConnection respeita api_key", async () => {
  const def = getConnector("dummy")!;
  const okAdapter = def.makeAdapter({
    organizationId: "o",
    credentials: { api_key: "k" },
    syncDirection: "import",
  });
  const okRes = await okAdapter.testConnection();
  assertEquals(okRes.ok, true);

  const badAdapter = def.makeAdapter({
    organizationId: "o",
    credentials: {},
    syncDirection: "import",
  });
  const badRes = await badAdapter.testConnection();
  assertEquals(badRes.ok, false);
});