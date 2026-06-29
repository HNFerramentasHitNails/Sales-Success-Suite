import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import EntityPicker from "./EntityPicker";

type Member = { user_id: string; name: string };

export type RmaRow = {
  id: string;
  reason: string | null;
  notes: string | null;
  status: string;
  resolution: string | null;
  customer_id: string | null;
  order_id: string | null;
  assigned_to: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: RmaRow | null;
}

export default function RmaFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(editing?.reason ?? "");
    setNotes(editing?.notes ?? "");
    setCustomerId(editing?.customer_id ?? null);
    setOrderId(editing?.order_id ?? null);
    setAssignedTo(editing?.assigned_to ?? user?.id ?? "");
  }, [open, editing?.id]);

  useEffect(() => {
    if (!activeOrg) return;
    (async () => {
      const { data: oms } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", activeOrg.id)
        .eq("status", "active");
      const ids = (oms ?? []).map((m: any) => m.user_id);
      let profs: any[] = [];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        profs = data ?? [];
      }
      const pmap: Record<string, any> = Object.fromEntries(profs.map((p: any) => [p.id, p]));
      setMembers(
        (oms ?? []).map((m: any) => ({
          user_id: m.user_id,
          name: pmap[m.user_id]?.full_name || pmap[m.user_id]?.email || "—",
        })),
      );
    })();
  }, [activeOrg?.id]);

  async function save() {
    if (!activeOrg || !user) return;
    if (!customerId && !orderId) {
      toast({ title: "Escolha um cliente ou encomenda", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      organization_id: activeOrg.id,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
      customer_id: customerId,
      order_id: orderId,
      assigned_to: assignedTo || null,
    };
    const { error } = editing
      ? await supabase.from("rma").update(payload).eq("id", editing.id)
      : await supabase.from("rma").insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Devolução atualizada" : "Devolução criada" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar devolução" : "Nova devolução"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <EntityPicker
            customerId={customerId}
            orderId={orderId}
            onChange={({ customer_id, order_id }) => {
              setCustomerId(customer_id);
              setOrderId(order_id);
            }}
          />

          <div className="space-y-1">
            <Label>Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: produto danificado" />
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Select value={assignedTo || "__none__"} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Nenhum —</SelectItem>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A guardar..." : editing ? "Guardar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}