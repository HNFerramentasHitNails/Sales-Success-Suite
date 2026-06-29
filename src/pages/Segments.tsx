import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, RefreshCw, Sparkles } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Segment = {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  color: string | null;
  r_min: number | null; r_max: number | null;
  f_min: number | null; f_max: number | null;
  m_min: number | null; m_max: number | null;
  priority_for_calls: string;
  is_active: boolean;
};

const PRIO_LABEL: Record<string, string> = {
  urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa", exclude: "Excluir",
};

const PRESETS: Array<Omit<Segment, "id" | "organization_id">> = [
  { name: "Campeões",       sort_order: 1, color: "#16a34a", r_min: null, r_max: 30,  f_min: 5, f_max: null, m_min: 1000, m_max: null, priority_for_calls: "high",   is_active: true },
  { name: "Fiéis",          sort_order: 2, color: "#2563eb", r_min: null, r_max: 60,  f_min: 3, f_max: null, m_min: null, m_max: null, priority_for_calls: "normal", is_active: true },
  { name: "Novos",          sort_order: 3, color: "#06b6d4", r_min: null, r_max: 30,  f_min: null, f_max: 2, m_min: null, m_max: null, priority_for_calls: "high",   is_active: true },
  { name: "Em risco",       sort_order: 4, color: "#f59e0b", r_min: 61,   r_max: 120, f_min: null, f_max: null, m_min: null, m_max: null, priority_for_calls: "high",   is_active: true },
  { name: "Quase perdidos", sort_order: 5, color: "#f97316", r_min: 121,  r_max: 240, f_min: null, f_max: null, m_min: null, m_max: null, priority_for_calls: "urgent", is_active: true },
  { name: "Perdidos",       sort_order: 6, color: "#ef4444", r_min: 241,  r_max: null, f_min: null, f_max: null, m_min: null, m_max: null, priority_for_calls: "low",    is_active: true },
];

type Draft = {
  name: string; color: string; sort_order: string;
  r_min: string; r_max: string;
  f_min: string; f_max: string;
  m_min: string; m_max: string;
  priority_for_calls: string; is_active: boolean;
};

const emptyDraft = (): Draft => ({
  name: "", color: "#64748b", sort_order: "0",
  r_min: "", r_max: "", f_min: "", f_max: "", m_min: "", m_max: "",
  priority_for_calls: "normal", is_active: true,
});

const toNumOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function Segments() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const canManage = isAdmin || role === "sales_director";
  const [rows, setRows] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Segment | null>(null);
  const [form, setForm] = useState<Draft>(emptyDraft());

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase.from("rfm_segments" as any)
      .select("*").eq("organization_id", activeOrg.id)
      .order("sort_order").order("created_at");
    setLoading(false);
    if (error) { toast({ title: "Erro a carregar segmentos", description: error.message, variant: "destructive" }); return; }
    setRows(((data ?? []) as unknown) as Segment[]);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  if (!canManage) {
    return <div className="text-muted-foreground">Sem acesso.</div>;
  }

  const openNew = () => { setEditing(null); setForm(emptyDraft()); setOpen(true); };
  const openEdit = (s: Segment) => {
    setEditing(s);
    setForm({
      name: s.name, color: s.color || "#64748b", sort_order: String(s.sort_order ?? 0),
      r_min: s.r_min == null ? "" : String(s.r_min),
      r_max: s.r_max == null ? "" : String(s.r_max),
      f_min: s.f_min == null ? "" : String(s.f_min),
      f_max: s.f_max == null ? "" : String(s.f_max),
      m_min: s.m_min == null ? "" : String(s.m_min),
      m_max: s.m_max == null ? "" : String(s.m_max),
      priority_for_calls: s.priority_for_calls || "normal",
      is_active: s.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!activeOrg) return;
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setBusy(true);
    const payload: any = {
      organization_id: activeOrg.id,
      name: form.name.trim(),
      color: form.color || null,
      sort_order: Number(form.sort_order) || 0,
      r_min: toNumOrNull(form.r_min), r_max: toNumOrNull(form.r_max),
      f_min: toNumOrNull(form.f_min), f_max: toNumOrNull(form.f_max),
      m_min: toNumOrNull(form.m_min), m_max: toNumOrNull(form.m_max),
      priority_for_calls: form.priority_for_calls,
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("rfm_segments" as any).update(payload).eq("id", editing.id)
      : await supabase.from("rfm_segments" as any).insert(payload);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Segmento atualizado" : "Segmento criado" });
    setOpen(false);
    load();
  };

  const remove = async (s: Segment) => {
    if (!confirm(`Eliminar segmento "${s.name}"?`)) return;
    const { error } = await supabase.from("rfm_segments" as any).delete().eq("id", s.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Segmento eliminado" });
    load();
  };

  const seedPresets = async () => {
    if (!activeOrg) return;
    setBusy(true);
    const payload = PRESETS.map((p) => ({ ...p, organization_id: activeOrg.id }));
    const { error } = await supabase.from("rfm_segments" as any).insert(payload);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Predefinidos criados", description: "Sugestão: clica em \"Recalcular agora\"." });
    load();
  };

  const recalc = async () => {
    if (!activeOrg) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("refresh_org_segments" as any, { p_org: activeOrg.id });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${data ?? 0} clientes recalculados` });
  };

  const fmtRange = (a: number | null, b: number | null, suffix = "") => {
    const A = a == null ? "—" : `${a}${suffix}`;
    const B = b == null ? "—" : `${b}${suffix}`;
    return `${A} – ${B}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Segmentos RFM</h1>
          <p className="text-sm text-muted-foreground">
            Regras configuráveis que classificam automaticamente os clientes por Recência, Frequência e valor Monetário.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length === 0 && (
            <Button variant="outline" onClick={seedPresets} disabled={busy}>
              <Sparkles className="h-4 w-4 mr-1" /> Criar predefinidos
            </Button>
          )}
          <Button variant="outline" onClick={recalc} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recalcular agora
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo segmento</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead className="w-12">Cor</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Recência (dias)</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead>Monetário (€)</TableHead>
                <TableHead>Prioridade chamada</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem segmentos definidos.</TableCell></TableRow>
              )}
              {!loading && rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.sort_order}</TableCell>
                  <TableCell>
                    <span className="inline-block h-4 w-4 rounded-full border" style={{ backgroundColor: s.color || "transparent" }} />
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{fmtRange(s.r_min, s.r_max)}</TableCell>
                  <TableCell>{fmtRange(s.f_min, s.f_max)}</TableCell>
                  <TableCell>{fmtRange(s.m_min, s.m_max)}</TableCell>
                  <TableCell><Badge variant="secondary">{PRIO_LABEL[s.priority_for_calls] ?? s.priority_for_calls}</Badge></TableCell>
                  <TableCell>{s.is_active ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar segmento" : "Novo segmento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} />
            </div>
            <div>
              <Label>Cor</Label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div>
              <Label>Recência min (dias)</Label>
              <Input type="number" value={form.r_min} onChange={(e) => setForm({ ...form, r_min: e.target.value })} />
            </div>
            <div>
              <Label>Recência max (dias)</Label>
              <Input type="number" value={form.r_max} onChange={(e) => setForm({ ...form, r_max: e.target.value })} />
            </div>
            <div>
              <Label>Frequência min</Label>
              <Input type="number" value={form.f_min} onChange={(e) => setForm({ ...form, f_min: e.target.value })} />
            </div>
            <div>
              <Label>Frequência max</Label>
              <Input type="number" value={form.f_max} onChange={(e) => setForm({ ...form, f_max: e.target.value })} />
            </div>
            <div>
              <Label>Monetário min (€)</Label>
              <Input type="number" value={form.m_min} onChange={(e) => setForm({ ...form, m_min: e.target.value })} />
            </div>
            <div>
              <Label>Monetário max (€)</Label>
              <Input type="number" value={form.m_max} onChange={(e) => setForm({ ...form, m_max: e.target.value })} />
            </div>
            <div>
              <Label>Prioridade chamada</Label>
              <Select value={form.priority_for_calls} onValueChange={(v) => setForm({ ...form, priority_for_calls: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgente</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="exclude">Excluir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Campos numéricos vazios = sem limite. A primeira regra (por ordem) que casa com o cliente é a aplicada.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}