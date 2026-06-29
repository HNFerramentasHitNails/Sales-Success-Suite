// Tipos base do framework de conectores plugáveis.
// O modelo canónico é interno à app; cada adapter mapeia externo↔canónico
// e NUNCA toca diretamente na base de dados.

export type ConnectorCategory = "store" | "invoicing" | "payment" | "calendar";

export type Capability =
  | "customers"
  | "products"
  | "invoices"
  | "orders"
  | "payments"
  | "fiscal";

export type EntityType = "customer" | "product" | "invoice" | "order";

export type SyncDirection = "import" | "export" | "both";

export type AuthType = "apikey" | "oauth2" | "basic" | "none";

export interface CanonicalRecord {
  entityType: EntityType;
  externalId: string;
  data: Record<string, unknown>;
}

export interface PullParams {
  entityTypes: EntityType[];
  since?: string | null;
}

export interface PullResult {
  records: CanonicalRecord[];
  cursor?: string | null;
}

export interface PushTarget {
  entityType: EntityType;
  internalId: string;
  data: Record<string, unknown>;
}

export interface PushResult {
  pushed: { internalId: string; externalId: string }[];
}

export interface Adapter {
  testConnection(): Promise<{ ok: boolean; message: string }>;
  pull(params: PullParams): Promise<PullResult>;
  push(targets: PushTarget[]): Promise<PushResult>;
}

export interface ConnectorContext {
  organizationId: string;
  credentials: Record<string, string>;
  syncDirection: SyncDirection;
}

export interface ConnectorField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required?: boolean;
}

export interface ConnectorDef {
  id: string;
  name: string;
  category: ConnectorCategory;
  capabilities: Capability[];
  authType: AuthType;
  fields: ConnectorField[];
  makeAdapter: (ctx: ConnectorContext) => Adapter;
}