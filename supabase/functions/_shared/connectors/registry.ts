// Registo central de conectores disponíveis.

import type { Capability, ConnectorDef } from "./types.ts";
import { makeDummyAdapter } from "./adapters/dummy.ts";
import { makeMoloniAdapter } from "./adapters/moloni.ts";
import { makeVendusAdapter } from "./adapters/vendus.ts";
import { makeInvoicexpressAdapter } from "./adapters/invoicexpress.ts";

const notImplemented = (name: string) => () => {
  throw new Error(`adapter ${name} não implementado`);
};

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "dummy",
    name: "Dummy (testes)",
    category: "store",
    capabilities: ["customers", "products", "orders"],
    authType: "apikey",
    fields: [{ key: "api_key", label: "API Key", type: "password", required: true }],
    makeAdapter: makeDummyAdapter,
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "store",
    capabilities: ["customers", "products", "orders"],
    authType: "apikey",
    fields: [
      { key: "shop_domain", label: "Shop Domain", type: "url", required: true },
      { key: "access_token", label: "Access Token", type: "password", required: true },
    ],
    makeAdapter: notImplemented("shopify"),
  },
  {
    id: "moloni",
    name: "Moloni",
    category: "invoicing",
    capabilities: ["customers", "invoices", "fiscal"],
    authType: "oauth2",
    fields: [
      { key: "client_id", label: "Client ID", type: "text", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      { key: "username", label: "Username", type: "text", required: true },
      { key: "password", label: "Password", type: "password", required: true },
    ],
    makeAdapter: makeMoloniAdapter,
  },
  {
    id: "vendus",
    name: "Vendus",
    category: "invoicing",
    capabilities: ["customers", "invoices", "fiscal"],
    authType: "apikey",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    makeAdapter: makeVendusAdapter,
  },
  {
    id: "invoicexpress",
    name: "InvoiceXpress",
    category: "invoicing",
    capabilities: ["customers", "invoices", "fiscal"],
    authType: "apikey",
    fields: [
      { key: "account_name", label: "Nome da conta", type: "text", required: true },
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    makeAdapter: makeInvoicexpressAdapter,
  },
];

export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function connectorsWithCapability(cap: Capability): ConnectorDef[] {
  return CONNECTORS.filter((c) => c.capabilities.includes(cap));
}