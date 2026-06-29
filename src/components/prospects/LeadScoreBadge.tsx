import { Badge } from "@/components/ui/badge";
import { Flame, Thermometer, Snowflake } from "lucide-react";

export function leadTier(score: number | null | undefined): "hot" | "warm" | "cold" {
  const s = score ?? 0;
  if (s >= 70) return "hot";
  if (s >= 40) return "warm";
  return "cold";
}

const META: Record<"hot" | "warm" | "cold", { label: string; cls: string; Icon: typeof Flame }> = {
  hot:  { label: "Quente", cls: "bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/20", Icon: Flame },
  warm: { label: "Morno",  cls: "bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20", Icon: Thermometer },
  cold: { label: "Frio",   cls: "bg-sky-500/15 text-sky-700 border-sky-500/30 hover:bg-sky-500/20", Icon: Snowflake },
};

export default function LeadScoreBadge({ score, showLabel = false }: { score: number | null | undefined; showLabel?: boolean }) {
  const t = leadTier(score);
  const m = META[t];
  const Icon = m.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${m.cls}`}>
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">{score ?? 0}</span>
      {showLabel && <span className="ml-1">· {m.label}</span>}
    </Badge>
  );
}