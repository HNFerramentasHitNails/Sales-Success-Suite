import {
  corsHeaders, json, resolveContext, shopifyGet, nextPageUrl,
  writeSyncLog, upsertExternalRef, findInternalIdByExternal, MAX_PAGES,
} from "../_shared/shopify-sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const r = await resolveContext(req);
  if (!r.ok) return json(r.status, { ok: false, error: r.error });
  const ctx = r.ctx;
  let processed = 0;
  let pageUrl: string | null = `/admin/api/2024-01/customers.json?limit=250`;
  let pages = 0;

  try {
    while (pageUrl && pages < MAX_PAGES) {
      const resp = await shopifyGet(ctx, pageUrl);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Shopify HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const data = await resp.json();
      const customers = (data?.customers ?? []) as any[];

      for (const c of customers) {
        const externalId = String(c.id);
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
          || c.email || `Cliente ${externalId}`;
        const email = c.email ?? null;
        const phone = c.phone ?? c?.default_address?.phone ?? null;
        const country = c?.default_address?.country_code ?? null;

        const existingId = await findInternalIdByExternal(ctx, "customer", externalId);
        const row = {
          organization_id: ctx.organizationId,
          name,
          email,
          phone,
          country,
          external_id: externalId,
        };

        let internalId = existingId;
        if (existingId) {
          await ctx.admin.from("customers").update(row).eq("id", existingId);
        } else {
          const { data: ins, error } = await ctx.admin
            .from("customers")
            .insert(row)
            .select("id")
            .single();
          if (error) throw new Error(`DB insert customer: ${error.message}`);
          internalId = ins.id;
        }
        if (internalId) {
          await upsertExternalRef(ctx, "customer", internalId, externalId, {
            email, updated_at: c.updated_at ?? null,
          });
          processed += 1;
        }
      }

      pageUrl = nextPageUrl(resp.headers.get("link"));
      pages += 1;
    }

    await writeSyncLog(ctx, "success", `Sincronização Shopify › clientes (${processed})`, processed);
    return json(200, { ok: true, records_processed: processed });
  } catch (e) {
    const msg = (e as Error).message || "erro_desconhecido";
    // sanitiza: nunca incluir o token
    const safe = msg.replace(ctx.creds.admin_access_token, "***");
    await writeSyncLog(ctx, "failed", safe.slice(0, 500), processed);
    return json(200, { ok: false, error: safe, records_processed: processed });
  }
});