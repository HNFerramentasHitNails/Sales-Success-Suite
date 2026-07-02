import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Member = { id: string; label: string };
type Row = { month: number; target: number; actual: number; actual_prev: number };

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const EMPRESA = "__empresa__";

export default function Objectives() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const currency = activeOrg?.currency || "EUR";
  const canEdit = isAdmin || role === "sales_director";
  const nowYear = new Date().getFullYear();

  const fmt = (v: number) => { try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(v || 0); } catch { return `${(v || 0).toFixed(0)} ${currency}`; } };
  const fmtFull = (v: number) => { try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v || 0); } catch { return `${(v || 0).toFixed(2)} ${currency}`; } };
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const [year, setYear] = useState<number>(nowYear);
  const [metric, setMetric] = useState<"vendas" | "faturado">("vendas");
  const [scope, setScope] = useState<string>(EMPRESA);
  const [members, setMembers] = useState<Member[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [annual, setAnnual] = useState<string>("0");
  const [monthTargets, setMonthTargets] = useState<number[]>(Array(12).fill(0));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeOrg) return;
    (async () => {
      const { data: m } = await supabase.from("organization_members").select("id, user_id").eq("organization_id", activeOrg.id).eq("status", "active");
      const mr = (m ?? []) as Array<{ id: string; user_id: string }>;
      const ids = mr.map((r) => r.user_id);
      let profs: Array<{ id: string; full_name: string | null; email: string | null }> = [];
      if (ids.length) { const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", ids); profs = (p ?? []) as typeof profs; }
      const pm = new Map(profs.map((p) => [p.id, p]));
      setMembers(mr.map((r) => { const p = pm.get(r.user_id); return { id: r.id, label: p?.full_name || p?.email || "—" }; }));
    })();
  }, [activeOrg]);

  const memberId = scope === EMPRESA ? null : scope;

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_objective_progress" as any, { _org_id: activeOrg.id, _year: year, _member_id: memberId, _metric: metric });
      if (error) throw error;
      const r = ((data as any[]) ?? []).map((x) => ({ month: Number(x.month), target: Number(x.target || 0), actual: Number(x.actual || 0), actual_prev: Number(x.actual_prev || 0) })) as Row[];
      const byM = new Map(r.map((x) => [x.month, x]));
      const full: Row[] = Array.from({ length: 12 }, (_, i) => byM.get(i + 1) ?? { month: i + 1, target: 0, actual: 0, actual_prev: 0 });
      setRows(full);
      setMonthTargets(full.map((x) => x.target));
      let q = supabase.from("sales_objectives").select("annual_target").eq("organization_id", activeOrg.id).eq("year", year).eq("metric", metric);
      q = memberId === null ? q.is("member_id", null) : q.eq("member_id", memberId);
      const { data: par } = await q.maybeSingle();
      setAnnual(String((par as any)?.annual_target ?? 0));
    } catch (e: any) {
      toast({ title: "Erro a carregar objetivos", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [activeOrg, year, metric, memberId]);

  useEffect(() => { load(); }, [load]);

  const sumMonths = useMemo(() => monthTargets.reduce((s, v) => s + (Number(v) || 0), 0), [monthTargets]);
  const annualNum = Number(annual) || 0;
  const mismatch = Math.abs(sumMonths - annualNum) > 0.01;

  const distribute = () => {
    const per = Math.round((annualNum / 12) * 100) / 100;
    const arr = Array(12).fill(per);
    const diff = Math.round((annualNum - per * 12) * 100) / 100;
    arr[11] = Math.round((per + diff) * 100) / 100;
    setMonthTargets(arr);
  };

  const setMonth = (i: number, v: string) => setMonthTargets((prev) => { const n = [...prev]; n[i] = Number(v) || 0; return n; });

  const save = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      const monthsPayload = monthTargets.map((t, i) => ({ month: i + 1, target: Number(t) || 0 }));
      const { error } = await supabase.rpc("set_sales_objective" as any, { _org_id: activeOrg.id, _year: year, _member_id: memberId, _metric: metric, _annual: annualNum, _months: monthsPayload });
      if (error) throw error;
      toast({ title: "Objetivo guardado" });
      load();
    } catch (e: any) {
      toast({ title: "Erro a guardar", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const chartData = rows.map((r, i) => ({ name: MONTHS[i], Meta: r.target, Realizado: r.actual, "Ano anterior": r.actual_prev }));
  const ytdActual = rows.reduce((s, r) => s + r.actual, 0);
  const ytdPrev = rows.reduce((s, r) => s + r.actual_prev, 0);
  const ytdTarget = sumMonths || annualNum;
  const pct = ytdTarget > 0 ? ytdActual / ytdTarget : 0;
  const yoy = ytdPrev > 0 ? (ytdActual - ytdPrev) / ytdPrev : null;
  const years = [nowYear - 2, nowYear - 1, nowYear, nowYear + 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Objetivos</h1>
          <p className="text-sm text-muted-foreground">Metas de vendas anuais e mensais · {activeOrg?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="objectives-filters">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v) => setMetric(v as "vendas" | "faturado")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vendas">Vendas (encomendas)</SelectItem>
              <SelectItem value="faturado">Faturado (faturas)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPRESA}>Empresa (global)</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tour="objectives-kpis">
        <Card><CardContent className="p-4 space-y-1"><div className="text-xs uppercase tracking-wide text-muted-foreground">Meta anual</div><div className="font-display text-2xl font-semibold">{fmtFull(ytdTarget)}</div></CardContent></Card>
        <Card><CardContent className="p-4 space-y-1"><div className="text-xs uppercase tracking-wide text-muted-foreground">Realizado ({year})</div><div className="font-display text-2xl font-semibold">{fmtFull(ytdActual)}</div></CardContent></Card>
        <Card><CardContent className="p-4 space-y-1"><div className="text-xs uppercase tracking-wide text-muted-foreground">Cumprimento</div><div className="font-display text-2xl font-semibold">{ytdTarget > 0 ? fmtPct(pct) : "—"}</div></CardContent></Card>
        <Card><CardContent className="p-4 space-y-1"><div className="text-xs uppercase tracking-wide text-muted-foreground">vs ano anterior</div><div className="font-display text-2xl font-semibold">{yoy === null ? "—" : `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`}</div><div className="text-xs text-muted-foreground">{fmtFull(ytdPrev)}</div></CardContent></Card>
      </div>

      {canEdit && (
        <Card data-tour="objectives-targets">
          <CardHeader><CardTitle>Definir metas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Meta anual</Label>
                <Input type="number" inputMode="decimal" className="w-44" value={annual} onChange={(e) => setAnnual(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={distribute}>Distribuir igualmente</Button>
              <div className={`text-sm ${mismatch ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                Soma das mensais: <b>{fmtFull(sumMonths)}</b>{mismatch ? ` · difere da meta anual (${fmtFull(annualNum)})` : " · OK"}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {MONTHS.map((m, i) => (
                <div key={m}>
                  <Label className="text-xs">{m}</Label>
                  <Input type="number" inputMode="decimal" value={String(monthTargets[i] ?? 0)} onChange={(e) => setMonth(i, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>{saving ? "A guardar…" : "Guardar objetivo"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-tour="objectives-chart">
        <CardHeader><CardTitle>Meta vs Realizado · {year}</CardTitle></CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmt(Number(v))} width={80} />
                <Tooltip formatter={(v: any) => fmtFull(Number(v))} />
                <Legend />
                <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} />
                <Bar dataKey="Realizado" fill="hsl(var(--primary))" />
                <Line type="monotone" dataKey="Ano anterior" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}