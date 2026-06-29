// Helpers para etiquetas/cores do módulo RFM e churn.
// Mantém os rótulos em pt-PT alinhados com o painel "Chamadas do dia".

export type ChurnRisk = "baixo" | "medio" | "alto" | "critico" | string | null | undefined;
export type Phase = "novo" | "entrada" | "recorrente" | "em_risco" | "inativo" | string | null | undefined;
export type Objective = "retencao" | "reativacao" | "desenvolvimento" | string | null | undefined;
export type Priority = "urgent" | "high" | "normal" | string | null | undefined;

export function churnLabel(r: ChurnRisk): string {
  switch (r) {
    case "baixo": return "Baixo";
    case "medio": return "Médio";
    case "alto": return "Alto";
    case "critico": return "CRÍTICO";
    default: return "—";
  }
}

export function churnClass(r: ChurnRisk): string {
  switch (r) {
    case "critico": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900";
    case "alto":    return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900";
    case "medio":   return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900";
    case "baixo":   return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900";
    default:        return "bg-muted text-muted-foreground border-border";
  }
}

export function churnPct(r: ChurnRisk): number {
  switch (r) {
    case "baixo": return 25;
    case "medio": return 50;
    case "alto": return 75;
    case "critico": return 100;
    default: return 0;
  }
}

export function phaseLabel(p: Phase): string {
  switch (p) {
    case "novo": return "Novo";
    case "entrada": return "Entrada";
    case "recorrente": return "Recorrente";
    case "em_risco": return "Em risco";
    case "inativo": return "Inativo";
    default: return "—";
  }
}

export function objectiveLabel(o: Objective): string {
  switch (o) {
    case "retencao": return "Retenção";
    case "reativacao": return "Reativação";
    case "desenvolvimento": return "Desenvolvimento";
    default: return "—";
  }
}

export function priorityLabel(p: Priority): string {
  switch (p) {
    case "urgent": return "Urgente";
    case "high": return "Alta";
    case "normal": return "Normal";
    default: return "Normal";
  }
}

export function priorityClass(p: Priority): string {
  switch (p) {
    case "urgent": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900";
    case "high":   return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900";
    default:        return "bg-muted text-muted-foreground border-border";
  }
}

export function priorityBorderClass(p: Priority): string {
  switch (p) {
    case "urgent": return "border-t-4 border-t-red-500";
    case "high":   return "border-t-4 border-t-orange-500";
    default:        return "border-t-4 border-t-muted";
  }
}

export function priorityRank(p: Priority): number {
  switch (p) { case "urgent": return 0; case "high": return 1; default: return 2; }
}

export function fmtEUR(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
}

export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}