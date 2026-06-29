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

export type IssueRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  customer_id: string | null;
  order_id: string | null;
  assigned_to: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing?: IssueRow | null;
}

const PRIORITIES = [
  { v: "low", l: "Baixa" },
  { v: "normal", l: "Normal" },
  { v: "high", l: "Alta" },
  { v: "urgent", l: "Urgente" },
];

export default function IssueFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setPriority(editing?.priority ?? "normal");
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
    if (!title.trim()) {
      toast({ title: "Indique um título", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      organization_id: activeOrg.id,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      customer_id: customerId,
      order_id: orderId,
      assigned_to: assignedTo || null,
    };
    const { error } = editing
      ? await supabase.from("issues").update(payload).eq("id", editing.id)
      : await supabase.from("issues").insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Problema atualizado" : "Problema criado" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar problema" : "Novo problema"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <EntityPicker
            customerId={customerId}
            orderId={orderId}
            onChange={({ customer_id, order_id }) => {
              setCustomerId(customer_id);
              setOrderId(order_id);
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                </SelectContent>
              </Select>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A guardar..." : editing ? "Guardar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}