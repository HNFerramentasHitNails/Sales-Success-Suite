import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  basis: "total" | "subtotal";
  trigger_min_amount: number;
  reward_type: "percent" | "fixed";
  reward_value: number;
  max_credit: number | null;
  one_per_customer: boolean;
  eligible_tags: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
};

type FormState = {
  name: string;
  is_active: boolean;
  basis: "total" | "subtotal";
  trigger_min_amount: string;
  reward_type: "percent" | "fixed";
  reward_value: string;
  max_credit: string;
  one_per_customer: boolean;
  eligible_tags: string[];
  starts_at: string;
  ends_at: string;
};

const emptyForm: FormState = {
  name: "",
  is_active: true,
  basis: "total",
  trigger_min_amount: "0",
  reward_type: "percent",
  reward_value: "5",
  max_credit: "",
  one_per_customer: false,
  eligible_tags: [],
  starts_at: "",
  ends_at: "",
};

export default function WalletCampaigns() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Campaign[]>([]);
  const [orgTags, setOrgTags] = useState<string[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: activeOrg?.currency || "EUR",
    }).format(n || 0);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("wallet_campaigns")
      .select("*")
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems(((data ?? []) as any[]).map((r) => ({
      ...r,
      trigger_min_amount: Number(r.trigger_min_amount) || 0,
      reward_value: Number(r.reward_value) || 0,
      max_credit: r.max_credit !== null ? Number(r.max_credit) : null,
    })) as Campaign[]);
    setLoading(false);
  }, [activeOrg?.id]);

  const loadTags = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase
      .from("customer_tag_definitions")
      .select("name")
      .eq("organization_id", activeOrg.id)
      .order("name");
    let tags = (data ?? []).map((r: any) => r.name as string).filter(Boolean);
    if (tags.length === 0) {
      const { data: cs } = await supabase
        .from("customers")
        .select("tags")
        .eq("organization_id", activeOrg.id)
        .limit(500);
      const set = new Set<string>();
      (cs ?? []).forEach((c: any) => (c.tags ?? []).forEach((t: string) => t && set.add(t)));
      tags = Array.from(set).sort();
    }
    setOrgTags(tags);
  }, [activeOrg?.id]);

  useEffect(() => {
    load();
    loadTags();
  }, [load, loadTags]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      is_active: c.is_active,
      basis: c.basis,
      trigger_min_amount: String(c.trigger_min_amount ?? 0),
      reward_type: c.reward_type,
      reward_value: String(c.reward_value ?? 0),
      max_credit: c.max_credit !== null ? String(c.max_credit) : "",
      one_per_customer: c.one_per_customer,
      eligible_tags: c.eligible_tags ?? [],
      starts_at: c.starts_at ?? "",
      ends_at: c.ends_at ?? "",
    });
    setDialogOpen(true);
  };

  const toggleActive = async (c: Campaign, next: boolean) => {
    const { error } = await supabase
      .from("wallet_campaigns")
      .update({ is_active: next })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const save = async () => {
    if (!activeOrg) return;
    const name = form.name.trim();
    const reward = Number(String(form.reward_value).replace(",", "."));
    const min = Number(String(form.trigger_min_amount).replace(",", ".")) || 0;
    const max = form.max_credit.trim()
      ? Number(String(form.max_credit).replace(",", "."))
      : null;
    if (!name || !reward || reward <= 0) {
      toast({
        title: "Dados inválidos",
        description: "Indique nome e valor de recompensa positivo.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name,
      is_active: form.is_active,
      basis: form.basis,
      trigger_min_amount: min,
      reward_type: form.reward_type,
      reward_value: reward,
      max_credit: max,
      one_per_customer: form.one_per_customer,
      eligible_tags: form.eligible_tags.length > 0 ? form.eligible_tags : null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };
    const { error } = editingId
      ? await supabase.from("wallet_campaigns").update(payload).eq("id", editingId)
      : await supabase.from("wallet_campaigns").insert(payload);
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Campanha atualizada" : "Campanha criada" });
    setDialogOpen(false);
    load();
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Eliminar campanha "${c.name}"?`)) return;
    const { error } = await supabase.from("wallet_campaigns").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Campanha eliminada" });
    load();
  };

  const rewardLabel = (c: Campaign) =>
    c.reward_type === "percent" ? `${c.reward_value}%` : fmtMoney(c.reward_value);

  const toggleTag = (t: string) => {
    setForm((f) => ({
      ...f,
      eligible_tags: f.eligible_tags.includes(t)
        ? f.eligible_tags.filter((x) => x !== t)
        : [...f.eligible_tags, t],
    }));
  };

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [items],
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Campanhas de carteira"
        description="Crédito automático na carteira do cliente quando a encomenda passa a paga ou faturada."
        icon={<BadgePercent className="h-6 w-6" />}
        actions={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Nova campanha
            </Button>
          ) : null
        }
      />

      <Card className="p-3 text-sm text-muted-foreground">
        O crédito é aplicado automaticamente quando uma encomenda do cliente passa a paga ou faturada.
        Cada campanha credita no máximo uma vez por encomenda.
      </Card>

      <div data-tour="wallet-campaigns-list">
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<BadgePercent />}
          title="Sem campanhas"
          description="Crie a primeira campanha para começar a creditar clientes."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <Card key={c.id} className="p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant={c.is_active ? "default" : "outline"}>
                    {c.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                  <Badge variant="secondary">{rewardLabel(c)}</Badge>
                  <Badge variant="outline">
                    {c.basis === "total" ? "c/ IVA" : "s/ IVA"}
                  </Badge>
                  {c.one_per_customer && <Badge variant="outline">1×/cliente</Badge>}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                  <span>Mínimo: {fmtMoney(c.trigger_min_amount)}</span>
                  {c.max_credit !== null && <span>Teto: {fmtMoney(c.max_credit)}</span>}
                  {(c.starts_at || c.ends_at) && (
                    <span>
                      {c.starts_at ? new Date(c.starts_at).toLocaleDateString("pt-PT") : "—"}
                      {" → "}
                      {c.ends_at ? new Date(c.ends_at).toLocaleDateString("pt-PT") : "—"}
                    </span>
                  )}
                </div>
                {c.eligible_tags && c.eligible_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.eligible_tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={c.is_active}
                    onCheckedChange={(v) => toggleActive(c, v)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar campanha" : "Nova campanha"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Cashback 5%"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de recompensa</Label>
                <Select
                  value={form.reward_type}
                  onValueChange={(v) =>
                    setForm({ ...form, reward_type: v as "percent" | "fixed" })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Valor{" "}
                  {form.reward_type === "percent"
                    ? "(%)"
                    : `(${activeOrg?.currency || "EUR"})`}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.reward_value}
                  onChange={(e) => setForm({ ...form, reward_value: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Base do cálculo</Label>
                <Select
                  value={form.basis}
                  onValueChange={(v) => setForm({ ...form, basis: v as "total" | "subtotal" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total (c/ IVA)</SelectItem>
                    <SelectItem value="subtotal">Subtotal (s/ IVA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor mínimo da encomenda</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.trigger_min_amount}
                  onChange={(e) =>
                    setForm({ ...form, trigger_min_amount: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Teto do crédito (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.max_credit}
                  onChange={(e) => setForm({ ...form, max_credit: e.target.value })}
                  placeholder="Sem limite"
                />
              </div>
              <div className="flex items-end gap-3 pb-1">
                <Switch
                  checked={form.one_per_customer}
                  onCheckedChange={(v) => setForm({ ...form, one_per_customer: v })}
                />
                <Label className="cursor-pointer">Apenas 1× por cliente</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início (opcional)</Label>
                <Input
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Tags elegíveis (opcional)</Label>
              <div className="text-xs text-muted-foreground mb-2">
                Se vazio, aplica-se a todos os clientes. Se preenchido, o cliente tem de ter pelo menos uma destas tags.
              </div>
              {orgTags.length === 0 ? (
                <div className="text-sm text-muted-foreground">Sem tags definidas.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {orgTags.map((t) => {
                    const on = form.eligible_tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={`text-xs px-2 py-1 rounded border ${
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label className="cursor-pointer">Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "A guardar…" : editingId ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}