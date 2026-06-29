import { FormEvent, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { Shuffle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Prospect = Database["public"]["Tables"]["prospects"]["Row"];
export type MemberOption = { id: string; label: string };
export type CustomerOption = { id: string; name: string; company_name: string | null };

const SOURCES = [
  { v: "website", l: "Website" },
  { v: "referencia", l: "Referência" },
  { v: "linkedin", l: "LinkedIn" },
  { v: "chamada_fria", l: "Chamada fria" },
  { v: "evento", l: "Evento" },
  { v: "outro", l: "Outro" },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: Prospect | null;
  members: MemberOption[];
  customers: CustomerOption[];
  onSaved: () => void;
};

export default function ProspectFormDialog({ open, onOpenChange, prospect, members, customers, onSaved }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [form, setForm] = useState({
    name: "", company_name: "", email: "", phone: "",
    source: "outro", estimated_value: "", expected_close_date: "",
    assigned_member_id: "", customer_id: "", notes_short: "",
  });

  useEffect(() => {
    if (!open || !activeOrg) return;
    (async () => {
      const { data } = await supabase
        .from("lead_assignment_settings")
        .select("enabled")
        .eq("organization_id", activeOrg.id)
        .maybeSingle();
      setAutoAssignEnabled(!!(data as any)?.enabled);
    })();
  }, [open, activeOrg?.id]);

  useEffect(() => {
    if (!open) return;
    if (prospect) {
      setForm({
        name: prospect.name ?? "",
        company_name: prospect.company_name ?? "",
        email: prospect.email ?? "",
        phone: prospect.phone ?? "",
        source: prospect.source ?? "outro",
        estimated_value: prospect.estimated_value != null ? String(prospect.estimated_value) : "",
        expected_close_date: prospect.expected_close_date ?? "",
        assigned_member_id: prospect.assigned_member_id ?? "",
        customer_id: prospect.customer_id ?? "",
        notes_short: prospect.notes_short ?? "",
      });
    } else {
      setForm({ name: "", company_name: "", email: "", phone: "", source: "outro",
        estimated_value: "", expected_close_date: "", assigned_member_id: "", customer_id: "", notes_short: "" });
    }
  }, [open, prospect]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !user) return;
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source || null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      expected_close_date: form.expected_close_date || null,
      assigned_member_id: form.assigned_member_id || null,
      customer_id: form.customer_id || null,
      notes_short: form.notes_short.trim() || null,
    };
    const { error } = prospect
      ? await supabase.from("prospects").update(payload).eq("id", prospect.id)
      : await supabase.from("prospects").insert({ ...payload, created_by: user.id });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: prospect ? "Prospect atualizado" : "Prospect criado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{prospect ? "Editar prospect" : "Novo prospect"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={50} />
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor estimado (€)</Label>
              <Input type="number" step="0.01" min="0" value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
            </div>
            <div>
              <Label>Data prevista de fecho</Label>
              <Input type="date" value={form.expected_close_date}
                onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            </div>
            <div>
              <Label>Comercial atribuído</Label>
              <Select value={form.assigned_member_id || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_member_id: v === "__none__" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {!prospect && autoAssignEnabled ? "Atribuir automaticamente (round-robin)" : "— Nenhum —"}
                  </SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {!prospect && autoAssignEnabled && !form.assigned_member_id && (
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Shuffle className="h-3 w-3" /> O comercial será escolhido automaticamente pelo round-robin.
                </div>
              )}
            </div>
            <div>
              <Label>Cliente associado</Label>
              <Select value={form.customer_id || "__none__"} onValueChange={(v) => setForm({ ...form, customer_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company_name ? ` · ${c.company_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Notas curtas</Label>
              <Textarea rows={2} maxLength={500} value={form.notes_short}
                onChange={(e) => setForm({ ...form, notes_short: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{prospect ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}