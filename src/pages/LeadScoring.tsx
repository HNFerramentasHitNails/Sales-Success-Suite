import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, Save } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import LeadScoreBadge from "@/components/prospects/LeadScoreBadge";

const STAGES: { key: string; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "contactado", label: "Contactado" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Perdido" },
];

type Weights = {
  stage_points: Record<string, number>;
  value_tiers: { min: number; points: number }[];
  has_email: number;
  has_phone: number;
  recent_activity_days: number;
  recent_activity_points: number;
};

const DEFAULTS: Weights = {
  stage_points: { novo:5, contactado:15, qualificado:30, proposta:50, negociacao:65, ganho:100, perdido:0 },
  value_tiers: [{ min: 10000, points: 25 }, { min: 1000, points: 10 }],
  has_email: 5,
  has_phone: 5,
  recent_activity_days: 14,
  recent_activity_points: 15,
};

export default function LeadScoring() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [weights, setWeights] = useState<Weights>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_scoring_config")
      .select("id, is_active, weights")
      .eq("organization_id", activeOrg.id)
      .maybeSingle();
    if (error) toast({ title: "Erro a carregar", description: error.message, variant: "destructive" });
    if (data) {
      setConfigId((data as any).id);
      setIsActive((data as any).is_active);
      const w = (data as any).weights ?? {};
      setWeights({
        stage_points: { ...DEFAULTS.stage_points, ...(w.stage_points ?? {}) },
        value_tiers: Array.isArray(w.value_tiers) && w.value_tiers.length ? w.value_tiers : DEFAULTS.value_tiers,
        has_email: w.has_email ?? DEFAULTS.has_email,
        has_phone: w.has_phone ?? DEFAULTS.has_phone,
        recent_activity_days: w.recent_activity_days ?? DEFAULTS.recent_activity_days,
        recent_activity_points: w.recent_activity_points ?? DEFAULTS.recent_activity_points,
      });
    }
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => { load(); }, [load]);

  if (!canManage) return <Navigate to="/app/dashboard" replace />;

  async function save() {
    if (!activeOrg) return;
    setSaving(true);
    // Sort value_tiers desc by min so the trigger picks the highest matching tier first
    const sorted = [...weights.value_tiers].sort((a, b) => Number(b.min) - Number(a.min));
    const payload = {
      organization_id: activeOrg.id,
      is_active: isActive,
      weights: { ...weights, value_tiers: sorted } as any,
    };
    const { error } = configId
      ? await supabase.from("lead_scoring_config").update(payload).eq("id", configId)
      : await supabase.from("lead_scoring_config").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuração guardada" });
    load();
  }

  async function recompute() {
    if (!activeOrg) return;
    setRecomputing(true);
    const { data, error } = await supabase.rpc("recompute_org_lead_scores", { _org_id: activeOrg.id });
    setRecomputing(false);
    if (error) {
      toast({ title: "Erro ao recalcular", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Lead scores recalculados", description: `${data ?? 0} prospects atualizados.` });
  }

  function setStagePts(stage: string, v: number) {
    setWeights((w) => ({ ...w, stage_points: { ...w.stage_points, [stage]: v } }));
  }
  function setTier(idx: number, field: "min" | "points", v: number) {
    setWeights((w) => ({ ...w, value_tiers: w.value_tiers.map((t, i) => i === idx ? { ...t, [field]: v } : t) }));
  }
  function addTier() {
    setWeights((w) => ({ ...w, value_tiers: [...w.value_tiers, { min: 0, points: 0 }] }));
  }
  function removeTier(idx: number) {
    setWeights((w) => ({ ...w, value_tiers: w.value_tiers.filter((_, i) => i !== idx) }));
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<Sparkles className="h-6 w-6" />}
        title="Lead scoring"
        description="Pontuação automática de prospects (0–100). Quente ≥ 70 · Morno 40–69 · Frio < 40."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={recompute} disabled={recomputing || loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${recomputing ? "animate-spin" : ""}`} />
              Recalcular agora
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Exemplo de escala:</span>
        <LeadScoreBadge score={20} showLabel />
        <LeadScoreBadge score={55} showLabel />
        <LeadScoreBadge score={85} showLabel />
      </div>

      <div data-tour="lead-scoring-config">
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5 space-y-4" data-tour="lead-scoring-stages">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Estado do scoring</div>
                <div className="text-sm text-muted-foreground">Quando desativado, todos os prospects ficam com score 0.</div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Separator />
            <div>
              <div className="font-semibold mb-2">Pontos por etapa do pipeline</div>
              <div className="grid grid-cols-2 gap-3">
                {STAGES.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <Label className="flex-1">{s.label}</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={weights.stage_points[s.key] ?? 0}
                      onChange={(e) => setStagePts(s.key, Number(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4" data-tour="lead-scoring-tiers">
            <div>
              <div className="font-semibold mb-2">Escalões por valor estimado (€)</div>
              <div className="text-sm text-muted-foreground mb-3">
                Pontos atribuídos ao escalão mais alto que o valor estimado atinge.
              </div>
              <div className="space-y-2">
                {weights.value_tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Label className="w-16 shrink-0">≥</Label>
                    <Input
                      type="number"
                      value={t.min}
                      onChange={(e) => setTier(i, "min", Number(e.target.value) || 0)}
                    />
                    <Label className="w-16 shrink-0 text-right">pts</Label>
                    <Input
                      type="number"
                      value={t.points}
                      onChange={(e) => setTier(i, "points", Number(e.target.value) || 0)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeTier(i)}>Remover</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTier}>+ Adicionar escalão</Button>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Bónus se tem email</Label>
                <Input
                  type="number"
                  value={weights.has_email}
                  onChange={(e) => setWeights((w) => ({ ...w, has_email: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Bónus se tem telefone</Label>
                <Input
                  type="number"
                  value={weights.has_phone}
                  onChange={(e) => setWeights((w) => ({ ...w, has_phone: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Atividade recente — dias</Label>
                <Input
                  type="number"
                  value={weights.recent_activity_days}
                  onChange={(e) => setWeights((w) => ({ ...w, recent_activity_days: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Atividade recente — pontos</Label>
                <Input
                  type="number"
                  value={weights.recent_activity_points}
                  onChange={(e) => setWeights((w) => ({ ...w, recent_activity_points: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Considera atividades agendadas/realizadas e chamadas (tabelas <code>activities</code> e <code>sales_calls</code>) nos últimos N dias.
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}