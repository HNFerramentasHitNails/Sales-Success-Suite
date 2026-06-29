import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Plus, Pencil, Trash2, RefreshCw, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Achievement = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  metric: "total_revenue" | "num_orders" | "num_customers" | "num_won_deals";
  threshold: number;
  period: "all_time" | "this_month" | "this_year";
  is_active: boolean;
};

type MemberAch = {
  achievement_id: string;
  user_id: string;
  value: number | null;
  earned_at: string;
};

type RankRow = {
  member_id: string | null;
  member_name: string | null;
  member_email: string | null;
  total: number;
  num_orders: number;
};

const METRIC_LABEL: Record<string, string> = {
  total_revenue: "Faturado",
  num_orders: "Nº de encomendas",
  num_customers: "Nº de clientes",
  num_won_deals: "Negócios ganhos",
};
const PERIOD_LABEL: Record<string, string> = {
  all_time: "Sempre",
  this_month: "Este mês",
  this_year: "Este ano",
};
const PERIOD_RANGE: Record<string, { from: string; to: string }> = {
  all_time: { from: "1900-01-01", to: "9999-12-31" },
  this_month: (() => {
    const d = new Date();
    return {
      from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    };
  })(),
  this_year: (() => {
    const d = new Date();
    return {
      from: new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    };
  })(),
};

function emptyDef(): Achievement {
  return {
    id: "",
    name: "",
    description: "",
    icon: "🏆",
    metric: "total_revenue",
    threshold: 1000,
    period: "all_time",
    is_active: true,
  };
}

export default function Achievements() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const { user } = useAuth();
  const canManage = isAdmin || role === "sales_director";
  const canSeeRanking = canManage; // get_team_ranking RPC is restricted to admin/sales_director

  const [loading, setLoading] = useState(true);
  const [defs, setDefs] = useState<Achievement[]>([]);
  const [earned, setEarned] = useState<MemberAch[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<keyof typeof PERIOD_RANGE>("this_month");
  const [ranking, setRanking] = useState<RankRow[]>([]);

  // Edit/create dialog
  const [dlgOpen, setDlgOpen] = useState(false);
  const [draft, setDraft] = useState<Achievement>(emptyDef());
  const [busy, setBusy] = useState(false);

  const fmtCur = (n: number) =>
    new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: activeOrg?.currency || "EUR",
    }).format(n || 0);

  const fmtValue = (metric: string, val: number | null) => {
    if (val == null) return "—";
    if (metric === "total_revenue") return fmtCur(val);
    return String(Math.round(val));
  };

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [defsR, earnedR] = await Promise.all([
      supabase
        .from("achievements")
        .select("id, name, description, icon, metric, threshold, period, is_active")
        .eq("organization_id", activeOrg.id)
        .order("created_at"),
      supabase
        .from("member_achievements")
        .select("achievement_id, user_id, value, earned_at")
        .eq("organization_id", activeOrg.id),
    ]);
    if (defsR.error)
      toast({ title: "Erro", description: defsR.error.message, variant: "destructive" });
    setDefs(
      ((defsR.data ?? []) as any[]).map((r) => ({
        ...r,
        threshold: Number(r.threshold) || 0,
      })) as Achievement[]
    );
    setEarned(
      ((earnedR.data ?? []) as any[]).map((r) => ({
        ...r,
        value: r.value != null ? Number(r.value) : null,
      })) as MemberAch[]
    );

    // Resolve user names from profiles
    const uids = Array.from(
      new Set((earnedR.data ?? []).map((r: any) => r.user_id).filter(Boolean))
    );
    if (uids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uids);
      const m = new Map<string, string>();
      (profs ?? []).forEach((p: any) => m.set(p.id, p.full_name || p.email || "—"));
      setProfiles(m);
    } else {
      setProfiles(new Map());
    }

    setLoading(false);
  }, [activeOrg?.id]);

  const loadRanking = useCallback(async () => {
    if (!activeOrg || !canSeeRanking) {
      setRanking([]);
      return;
    }
    const range = PERIOD_RANGE[period];
    const { data, error } = await supabase.rpc("get_team_ranking", {
      _org_id: activeOrg.id,
      _from: range.from,
      _to: range.to,
    });
    if (error) {
      // silent — user just won't see leaderboard
      setRanking([]);
      return;
    }
    setRanking(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        total: Number(r.total) || 0,
        num_orders: Number(r.num_orders) || 0,
      })) as RankRow[]
    );
  }, [activeOrg?.id, period, canSeeRanking]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  const earnersByAch = useMemo(() => {
    const m = new Map<string, MemberAch[]>();
    earned.forEach((e) => {
      const arr = m.get(e.achievement_id) ?? [];
      arr.push(e);
      m.set(e.achievement_id, arr);
    });
    return m;
  }, [earned]);

  const myAchievementIds = useMemo(
    () => new Set(earned.filter((e) => e.user_id === user?.id).map((e) => e.achievement_id)),
    [earned, user?.id]
  );

  const openCreate = () => {
    setDraft(emptyDef());
    setDlgOpen(true);
  };
  const openEdit = (a: Achievement) => {
    setDraft({ ...a });
    setDlgOpen(true);
  };

  const saveDef = async () => {
    if (!activeOrg) return;
    if (!draft.name.trim() || !draft.threshold || draft.threshold <= 0) {
      toast({ title: "Dados inválidos", description: "Nome e limiar > 0 são obrigatórios.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      icon: draft.icon?.trim() || null,
      metric: draft.metric,
      threshold: draft.threshold,
      period: draft.period,
      is_active: draft.is_active,
    };
    const q = draft.id
      ? supabase.from("achievements").update(payload).eq("id", draft.id)
      : supabase.from("achievements").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: draft.id ? "Conquista atualizada" : "Conquista criada" });
    setDlgOpen(false);
    load();
  };

  const deleteDef = async (a: Achievement) => {
    if (!confirm(`Eliminar "${a.name}"? Todas as atribuições serão removidas.`)) return;
    const { error } = await supabase.from("achievements").delete().eq("id", a.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conquista eliminada" });
    load();
  };

  const recompute = async () => {
    if (!activeOrg) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("recompute_achievements", {
      _org_id: activeOrg.id,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Recalculado",
      description: `${data ?? 0} nova(s) conquista(s) atribuída(s).`,
    });
    load();
  };

  const medalFor = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Conquistas"
        description="Reconhecimentos por desempenho da equipa."
        icon={<Trophy className="h-6 w-6" />}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={recompute} disabled={busy}>
                <RefreshCw className="h-4 w-4 mr-1" /> Recalcular
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Nova conquista
              </Button>
            </div>
          ) : null
        }
      />

      {/* Leaderboard */}
      {canSeeRanking && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Medal className="h-5 w-5 text-primary" /> Ranking
            </h2>
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="this_year">Este ano</SelectItem>
                <SelectItem value="all_time">Sempre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ranking.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">Sem dados para o período.</Card>
          ) : (
            <div className="space-y-1">
              {ranking.slice(0, 10).map((r, i) => {
                const isMe = r.member_id && r.member_id === user?.id;
                return (
                  <Card
                    key={(r.member_id ?? "x") + i}
                    className={`p-3 flex items-center justify-between ${
                      isMe ? "border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 text-center text-lg">
                        {medalFor(i) || <span className="text-sm text-muted-foreground">#{i + 1}</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {r.member_name ?? "—"}
                          {isMe && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Eu
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.num_orders} encomenda(s)
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-semibold">{fmtCur(r.total)}</div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Achievements grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Conquistas
        </h2>
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : defs.length === 0 ? (
          <EmptyState
            icon={<Trophy />}
            title="Sem conquistas definidas"
            description={canManage ? "Crie a primeira conquista para começar." : "Ainda não há conquistas."}
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {defs.map((a) => {
              const earners = earnersByAch.get(a.id) ?? [];
              const mine = myAchievementIds.has(a.id);
              return (
                <Card
                  key={a.id}
                  className={`p-4 space-y-2 ${mine ? "border-primary ring-1 ring-primary/40" : ""} ${!a.is_active ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-2xl shrink-0">{a.icon || "🏆"}</div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{a.name}</div>
                        {a.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {a.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteDef(a)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <Badge variant="secondary">{METRIC_LABEL[a.metric]}</Badge>
                    <Badge variant="outline">{PERIOD_LABEL[a.period]}</Badge>
                    <Badge variant="outline">
                      ≥ {a.metric === "total_revenue" ? fmtCur(a.threshold) : a.threshold}
                    </Badge>
                    {!a.is_active && <Badge variant="destructive">Inativa</Badge>}
                    {mine && <Badge>Obtida ✓</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {earners.length === 0 ? (
                      "Ainda ninguém a conquistou."
                    ) : (
                      <>
                        <div className="font-medium text-foreground mb-1">
                          {earners.length} comercial(is)
                        </div>
                        <div className="space-y-0.5">
                          {earners.slice(0, 5).map((e) => (
                            <div key={e.user_id} className="truncate">
                              • {profiles.get(e.user_id) ?? "—"}
                              {e.value != null && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {fmtValue(a.metric, e.value)}
                                </span>
                              )}
                            </div>
                          ))}
                          {earners.length > 5 && <div>+ {earners.length - 5}…</div>}
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar conquista" : "Nova conquista"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <Label>Ícone</Label>
                <Input
                  value={draft.icon ?? ""}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  maxLength={4}
                  placeholder="🏆"
                />
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  maxLength={100}
                />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                maxLength={300}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Métrica</Label>
                <Select
                  value={draft.metric}
                  onValueChange={(v: any) => setDraft({ ...draft, metric: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Período</Label>
                <Select
                  value={draft.period}
                  onValueChange={(v: any) => setDraft({ ...draft, period: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIOD_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Limiar (≥)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.threshold}
                  onChange={(e) =>
                    setDraft({ ...draft, threshold: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={draft.is_active}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                />
                <Label>Ativa</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlgOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={saveDef} disabled={busy}>
              {busy ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}