import { useCallback, useEffect, useState, FormEvent } from "react";
import { Truck, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Rule = {
  id: string; name: string; country: string | null;
  weight_min: number | null; weight_max: number | null;
  value_min: number | null; value_max: number | null;
  price: number; free_above: number | null; tax_rate: number | null;
  is_active: boolean; priority: number;
};

const empty = () => ({
  name: "", country: "", weight_min: "", weight_max: "", value_min: "", value_max: "",
  price: "0", free_above: "", tax_rate: "23", priority: "0", is_active: true,
});

function fmt(v: number | null, suffix = "") { return v == null ? "—" : `${v}${suffix}`; }

export default function ShippingRules() {
  const { activeOrg, isAdmin } = useOrganization();
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState(empty());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase.from("shipping_rules" as never)
      .select("*").eq("organization_id", activeOrg.id)
      .order("priority", { ascending: false }).order("created_at");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRules((data ?? []) as Rule[]);
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: Rule) {
    setEditing(r);
    setForm({
      name: r.name, country: r.country ?? "",
      weight_min: r.weight_min?.toString() ?? "", weight_max: r.weight_max?.toString() ?? "",
      value_min: r.value_min?.toString() ?? "", value_max: r.value_max?.toString() ?? "",
      price: String(r.price), free_above: r.free_above?.toString() ?? "",
      tax_rate: r.tax_rate?.toString() ?? "23", priority: String(r.priority), is_active: r.is_active,
    });
    setOpen(true);
  }

  const numOrNull = (s: string) => s.trim() === "" ? null : Number(s);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrg || !user) return;
    if (!form.name.trim()) { toast({ title: "Indique um nome", variant: "destructive" }); return; }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name: form.name.trim(),
      country: form.country.trim() ? form.country.trim().toUpperCase() : null,
      weight_min: numOrNull(form.weight_min), weight_max: numOrNull(form.weight_max),
      value_min: numOrNull(form.value_min), value_max: numOrNull(form.value_max),
      price: Number(form.price) || 0,
      free_above: numOrNull(form.free_above),
      tax_rate: numOrNull(form.tax_rate),
      priority: Number(form.priority) || 0,
      is_active: form.is_active,
    } as never;
    const res = editing
      ? await supabase.from("shipping_rules" as never).update(payload).eq("id", editing.id)
      : await supabase.from("shipping_rules" as never).insert({ ...payload, created_by: user.id } as never);
    setBusy(false);
    if (res.error) { toast({ title: "Erro", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Regra atualizada" : "Regra criada" });
    setOpen(false); load();
  }

  async function remove(r: Rule) {
    if (!confirm(`Eliminar a regra "${r.name}"?`)) return;
    const { error } = await supabase.from("shipping_rules" as never).delete().eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portes de envio"
        description="Regras de cálculo automático de portes por país, peso e valor da encomenda."
        icon={<Truck className="h-6 w-6" />}
        actions={isAdmin ? <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button> : null}
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : rules.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Sem regras de portes. As encomendas por transportadora ficam sem custo até criar regras.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead>Peso (kg)</TableHead>
                  <TableHead>Valor (€)</TableHead>
                  <TableHead className="text-right">Portes</TableHead>
                  <TableHead className="text-right">Grátis acima</TableHead>
                  <TableHead>Prio.</TableHead>
                  <TableHead></TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.country ?? "Qualquer"}</TableCell>
                    <TableCell className="text-sm">{fmt(r.weight_min)}–{fmt(r.weight_max, "")}</TableCell>
                    <TableCell className="text-sm">{fmt(r.value_min)}–{fmt(r.value_max)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.price.toFixed(2)} €</TableCell>
                    <TableCell className="text-right tabular-nums">{r.free_above != null ? `${r.free_above.toFixed(2)} €` : "—"}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell>{r.is_active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar regra" : "Nova regra de portes"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Portugal Continental" />
              </div>
              <div>
                <Label>País (ISO, vazio = qualquer)</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="PT" maxLength={2} />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              </div>
              <div>
                <Label>Peso mín. (kg)</Label>
                <Input type="number" step="0.001" value={form.weight_min} onChange={(e) => setForm({ ...form, weight_min: e.target.value })} placeholder="sem limite" />
              </div>
              <div>
                <Label>Peso máx. (kg)</Label>
                <Input type="number" step="0.001" value={form.weight_max} onChange={(e) => setForm({ ...form, weight_max: e.target.value })} placeholder="sem limite" />
              </div>
              <div>
                <Label>Valor mín. (€)</Label>
                <Input type="number" step="0.01" value={form.value_min} onChange={(e) => setForm({ ...form, value_min: e.target.value })} placeholder="sem limite" />
              </div>
              <div>
                <Label>Valor máx. (€)</Label>
                <Input type="number" step="0.01" value={form.value_max} onChange={(e) => setForm({ ...form, value_max: e.target.value })} placeholder="sem limite" />
              </div>
              <div>
                <Label>Portes (€)</Label>
                <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <Label>Grátis acima de (€)</Label>
                <Input type="number" step="0.01" value={form.free_above} onChange={(e) => setForm({ ...form, free_above: e.target.value })} placeholder="nunca" />
              </div>
              <div>
                <Label>Taxa de IVA dos portes (%)</Label>
                <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
