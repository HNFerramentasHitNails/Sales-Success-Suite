import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];

const EMPTY_FORM = { name: "", address: "", city: "", postal_code: "", country: "PT" };

export default function WarehousesManager({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("warehouses").select("*").eq("organization_id", orgId).order("created_at");
    if (error) toast({ title: "Erro a carregar armazéns", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Warehouse[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setForm({ name: w.name, address: w.address ?? "", city: w.city ?? "", postal_code: w.postal_code ?? "", country: w.country ?? "PT" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Indica um nome para o armazém" }); return; }
    setSaving(true);
    const payload = {
      organization_id: orgId,
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country: form.country.trim() || "PT",
    };
    const { error } = editing
      ? await supabase.from("warehouses").update(payload).eq("id", editing.id)
      : await supabase.from("warehouses").insert({ ...payload, is_default: rows.length === 0 });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Armazém atualizado" : "Armazém criado" });
    setOpen(false);
    load();
  };

  const remove = async (w: Warehouse) => {
    if (!confirm(`Eliminar o armazém "${w.name}"? Encomendas que o tinham como origem passam a usar o predefinido.`)) return;
    const { error } = await supabase.from("warehouses").delete().eq("id", w.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Armazém eliminado" });
    load();
  };

  const makeDefault = async (w: Warehouse) => {
    const { error } = await supabase.rpc("set_default_warehouse", { _warehouse_id: w.id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-md">
          Cada morada é usada como origem de carga no documento de transporte da fatura. Uma encomenda que não
          escolha nenhum usa o armazém marcado como predefinido.
        </p>
        {isAdmin && <Button type="button" size="sm" variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo armazém</Button>}
      </div>

      {loading ? null : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem armazéns configurados.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {w.name}
                  {w.is_default && <Badge variant="secondary">Predefinido</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[w.address, w.city, w.postal_code, w.country].filter(Boolean).join(", ") || "Sem morada"}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  {!w.is_default && (
                    <Button type="button" size="sm" variant="ghost" title="Tornar predefinido" onClick={() => makeDefault(w)}>
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" title="Editar" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
                  <Button type="button" size="sm" variant="ghost" title="Eliminar" onClick={() => remove(w)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar armazém" : "Novo armazém"}</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="wh_name">Nome</Label>
              <Input id="wh_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Armazém Central" />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="wh_address">Morada</Label>
              <Input id="wh_address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="wh_city">Cidade</Label>
              <Input id="wh_city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="wh_postal">Código Postal</Label>
              <Input id="wh_postal" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="0000-000" />
            </div>
            <div>
              <Label htmlFor="wh_country">País (ISO)</Label>
              <Input id="wh_country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} maxLength={2} placeholder="PT" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={save} disabled={saving}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
