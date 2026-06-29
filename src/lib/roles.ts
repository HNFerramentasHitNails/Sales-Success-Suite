import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  sales_director: "Diretor Comercial",
  sales_rep: "Comercial",
  read_only: "Apenas leitura",
};

export const roleLabel = (r: string | null | undefined): string =>
  (r && ROLE_LABELS[r as AppRole]) || r || "—";

// Ordem de apresentação nos seletores
export const ROLE_ORDER: AppRole[] = [
  "owner",
  "admin",
  "sales_director",
  "sales_rep",
  "read_only",
];