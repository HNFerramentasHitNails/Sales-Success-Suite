import type { ReactNode } from "react";

export type VatTreatment =
  | "domestic"
  | "reverse_charge"
  | "export"
  | "oss_destination"
  | "exempt"
  | string
  | null
  | undefined;

export type VatBadgeInfo = {
  label: string;
  className: string;
};

// Mapeamento centralizado dos tratamentos de IVA para badges visíveis no
// resumo de encomendas/faturas. Cores coerentes com o resto da app.
export function vatBadgeInfo(treatment: VatTreatment, destinationRate?: number | null): VatBadgeInfo {
  // Fallback neutro garantido — nunca devolvemos undefined.
  const NORMAL: VatBadgeInfo = {
    label: "IVA normal",
    className: "bg-muted text-muted-foreground",
  };
  const EXEMPT: VatBadgeInfo = {
    label: "Isento",
    className: "bg-muted text-muted-foreground",
  };
  // Sem tratamento conhecido (encomenda nova/sem dados) → mostra "IVA normal".
  if (treatment == null || treatment === "") return NORMAL;
  switch (treatment) {
    case "domestic":
      return NORMAL;
    case "reverse_charge":
      return {
        label: "Isento — autoliquidação intra-UE (0%)",
        className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      };
    case "export":
      return {
        label: "Exportação (0%)",
        className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      };
    case "oss_destination": {
      const rate = destinationRate != null ? `${Number(destinationRate)}%` : "—";
      return {
        label: `OSS — IVA do destino (${rate})`,
        className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
      };
    }
    case "exempt":
    default:
      // exempt ou valor desconhecido → badge neutro "Isento".
      return EXEMPT;
  }
}

// Permite usar como children numa <Badge> sem dependência de React aqui.
export type _Unused = ReactNode;