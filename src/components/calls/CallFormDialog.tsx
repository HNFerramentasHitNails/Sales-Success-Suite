import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";

type Option = { id: string; label: string };
type Member = { user_id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  defaults?: {
    customer_id?: string | null;
    prospect_id?: string | null;
    scheduled_for?: string | null;
    assigned_to?: string | null;
  };
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CallFormDialog({ open, onOpenChange, onSaved, defaults }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [target, setTarget] = useState<"customer" | "prospect">(
    defaults?.prospect_id ? "prospect" : "customer"
  );
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string | null>(
    defaults?.customer_id ?? defaults?.prospect_id ?? null
  );
  const [scheduledFor, setScheduledFor] = useState<string>(toLocalInput(defaults?.scheduled_for) || toLocalInput(new Date().toISOString()));
  const [members, setMembers] = useState<Member[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>(defaults?.assigned_to ?? user?.id ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setTarget(defaults?.prospect_id ? "prospect" : "customer");
    setSelected(defaults?.customer_id ?? defaults?.prospect_id ?? null);
    setScheduledFor(toLocalInput(defaults?.scheduled_for) || toLocalInput(new Date().toISOString()));
    setAssignedTo(defaults?.assigned_to ?? user?.id ?? "");
    setNotes("");
    setSearch("");
  }, [open]);

  // Load members
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
      const list: Member[] = (oms ?? []).map((m: any) => ({
        user_id: m.user_id,
        name: pmap[m.user_id]?.full_name || pmap[m.user_id]?.email || "—",
      }));
      setMembers(list);
    })();
  }, [activeOrg?.id]);

  // Search customers/prospects
  useEffect(() => {
    if (!activeOrg) return;
    const t = setTimeout(async () => {
      const tbl = target === "customer" ? "customers" : "prospects";
      let q = supabase
        .from(tbl)
        .select("id, name, company_name")
        .eq("organization_id", activeOrg.id)
        .order("name")
        .limit(20);
      if (search.trim()) {
        q = q.ilike("name", `%${search.trim()}%`);
      }
      const { data } = await q;
      setOptions(
        (data ?? []).map((r: any) => ({
          id: r.id,
          label: r.company_name ? `${r.name} · ${r.company_name}` : r.name,
        }))
      );
    }, 200);
    return () => clearTimeout(t);
  }, [search, target, activeOrg?.id]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === selected)?.label,
    [options, selected]
  );

  async function save() {
    if (!activeOrg || !user) return;
    if (!selected) {
      toast({ title: "Escolha um cliente ou prospect", variant: "destructive" });
      return;
    }
    if (!scheduledFor) {
      toast({ title: "Indique a data/hora", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      organization_id: activeOrg.id,
      customer_id: target === "customer" ? selected : null,
      prospect_id: target === "prospect" ? selected : null,
      scheduled_for: new Date(scheduledFor).toISOString(),
      assigned_to: assignedTo || null,
      status: "pending",
      notes: notes || null,
      created_by: user.id,
    };
    const { error } = await supabase.from("sales_calls").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro a criar chamada", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamada criada" });
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova chamada</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={target} onValueChange={(v) => { setTarget(v as any); setSelected(null); }}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="customer">Cliente</TabsTrigger>
              <TabsTrigger value="prospect">Prospect</TabsTrigger>
            </TabsList>
            <TabsContent value={target} className="mt-3 space-y-2">
              <Label>Pesquisar</Label>
              <Input
                placeholder="Nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto rounded border">
                {options.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
                ) : (
                  options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelected(o.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                        selected === o.id ? "bg-muted font-medium" : ""
                      }`}
                    >
                      {o.label}
                    </button>
                  ))
                )}
              </div>
              {selectedLabel && (
                <div className="text-xs text-muted-foreground">Selecionado: {selectedLabel}</div>
              )}
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data / hora</Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Nota</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto, objetivo da chamada..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "A guardar..." : "Criar chamada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}