import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Ticket, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Voucher = {
  id: string;
  code: string;
  amount: number;
  currency: string | null;
  status: "active" | "redeemed" | "expired" | "canceled";
  customer_id: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  notes: string | null;
  created_at: string;
  customers?: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  redeemed: "Resgatado",
  expired: "Expirado",
  canceled: "Cancelado",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  redeemed: "secondary",
  expired: "outline",
  canceled: "destructive",
};

function randomCode(len = 9) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type CustomerOpt = { id: string; name: string; company_name: string | null };

function CustomerSearch({
  value,
  onChange,
  placeholder = "Nome...",
}: {
  value: string | null;
  onChange: (id: string | null, label: string | null) => void;
  placeholder?: string;
}) {
  const { activeOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [opts, setOpts] = useState<CustomerOpt[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrg) return;
    const t = setTimeout(async () => {
      let q = supabase
        .from("customers")
        .select("id, name, company_name")
        .eq("organization_id", activeOrg.id)
        .order("name")
        .limit(20);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q;
      setOpts((data ?? []) as CustomerOpt[]);
    }, 200);
    return () => clearTimeout(t);
  }, [search, activeOrg?.id]);

  return (
    <div className="space-y-2">
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {value && selectedLabel && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          Selecionado: {selectedLabel}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(null, null);
              setSelectedLabel(null);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="max-h-40 overflow-y-auto rounded border">
        {opts.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
        ) : (
          opts.map((o) => {
            const label = o.company_name ? `${o.name} · ${o.company_name}` : o.name;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id, label);
                  setSelectedLabel(label);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                  value === o.id ? "bg-muted font-medium" : ""
                }`}
              >
                {label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function Vouchers() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";
  const canRedeem =
    isAdmin || role === "sales_director" || role === "sales_rep";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Voucher[]>([]);
  const [filterStatus, setFilterStatus] = useState("__all__");

  // New voucher dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCustomer, setNewCustomer] = useState<string | null>(null);
  const [newExpires, setNewExpires] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Redeem dialog
  const [redeemTarget, setRedeemTarget] = useState<Voucher | null>(null);
  const [redeemCustomer, setRedeemCustomer] = useState<string | null>(null);

  const fmt = (n: number, cur: string | null | undefined) =>
    new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: cur || activeOrg?.currency || "EUR",
    }).format(n || 0);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vouchers")
      .select(
        "id, code, amount, currency, status, customer_id, expires_at, redeemed_at, notes, created_at, customers(id, name)"
      )
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        amount: Number(r.amount) || 0,
      })) as Voucher[]
    );
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filterStatus === "__all__") return items;
    return items.filter((v) => v.status === filterStatus);
  }, [items, filterStatus]);

  const openNew = () => {
    setNewCode(randomCode(9));
    setNewAmount("");
    setNewCustomer(null);
    setNewExpires("");
    setNewNotes("");
    setNewOpen(true);
  };

  const createVoucher = async () => {
    if (!activeOrg) return;
    const amount = Number(String(newAmount).replace(",", "."));
    if (!newCode.trim() || !amount || amount <= 0) {
      toast({
        title: "Dados inválidos",
        description: "Indique código e valor positivo.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("vouchers").insert({
      organization_id: activeOrg.id,
      code: newCode.trim().toUpperCase(),
      amount,
      currency: activeOrg.currency || "EUR",
      customer_id: newCustomer,
      expires_at: newExpires ? new Date(newExpires).toISOString() : null,
      notes: newNotes.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast({
        title: "Erro",
        description: error.message.includes("vouchers_organization_id_code_key")
          ? "Já existe um voucher com este código."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Voucher criado" });
    setNewOpen(false);
    load();
  };

  const redeem = async () => {
    if (!activeOrg || !redeemTarget) return;
    const needsCustomer = !redeemTarget.customer_id;
    if (needsCustomer && !redeemCustomer) {
      toast({
        title: "Cliente necessário",
        description: "Escolha o cliente que recebe o crédito.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("redeem_voucher", {
      _org_id: activeOrg.id,
      _voucher_id: redeemTarget.id,
      _customer_id: redeemTarget.customer_id ?? redeemCustomer,
    });
    setBusy(false);
    if (error) {
      const msg = error.message || "";
      const friendly = msg.includes("voucher_expired")
        ? "Voucher expirado."
        : msg.includes("voucher_not_active")
          ? "Este voucher já não está ativo."
          : msg.includes("voucher_customer_mismatch")
            ? "Este voucher está atribuído a outro cliente."
            : msg.includes("customer_required")
              ? "É necessário indicar o cliente."
              : msg.includes("forbidden")
                ? "Sem permissão para resgatar."
                : msg;
      toast({ title: "Erro", description: friendly, variant: "destructive" });
      return;
    }
    toast({ title: "Voucher resgatado", description: "Carteira creditada." });
    setRedeemTarget(null);
    setRedeemCustomer(null);
    load();
  };

  const cancelVoucher = async (v: Voucher) => {
    if (!confirm(`Cancelar voucher ${v.code}?`)) return;
    const { error } = await supabase
      .from("vouchers")
      .update({ status: "canceled" })
      .eq("id", v.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Voucher cancelado" });
    load();
  };

  const isExpiredVisually = (v: Voucher) =>
    v.status === "active" &&
    v.expires_at &&
    new Date(v.expires_at) < new Date();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Vouchers"
        description="Crédito comercial atribuído a clientes."
        icon={<Ticket className="h-6 w-6" />}
        actions={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Novo voucher
            </Button>
          ) : null
        }
      />

      <div className="flex items-center gap-3" data-tour="vouchers-filters">
        <Label className="text-xs text-muted-foreground">Estado</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="redeemed">Resgatados</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
            <SelectItem value="canceled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div data-tour="vouchers-list">
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Ticket />}
          title="Sem vouchers"
          description="Crie o primeiro voucher para começar."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const expiredVisual = isExpiredVisually(v);
            return (
              <Card key={v.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{v.code}</span>
                    <Badge variant={STATUS_VARIANT[v.status]}>
                      {STATUS_LABEL[v.status]}
                    </Badge>
                    {expiredVisual && (
                      <Badge variant="outline" className="text-destructive border-destructive">
                        Expirado
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                    <span className="font-medium text-foreground">
                      {fmt(v.amount, v.currency)}
                    </span>
                    {v.customers && <span>Cliente: {v.customers.name}</span>}
                    {v.expires_at && (
                      <span>
                        Válido até {new Date(v.expires_at).toLocaleDateString("pt-PT")}
                      </span>
                    )}
                    {v.redeemed_at && (
                      <span>
                        Resgatado em{" "}
                        {new Date(v.redeemed_at).toLocaleDateString("pt-PT")}
                      </span>
                    )}
                  </div>
                  {v.notes && (
                    <div className="text-xs mt-1 truncate">{v.notes}</div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {v.status === "active" && canRedeem && !expiredVisual && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setRedeemTarget(v);
                        setRedeemCustomer(null);
                      }}
                    >
                      <Check className="h-4 w-4 mr-1" /> Resgatar
                    </Button>
                  )}
                  {v.status === "active" && canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelVoucher(v)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </div>

      {/* New voucher dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo voucher</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código</Label>
                <div className="flex gap-2">
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    maxLength={20}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewCode(randomCode(9))}
                  >
                    Gerar
                  </Button>
                </div>
              </div>
              <div>
                <Label>Valor ({activeOrg?.currency || "EUR"})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div>
              <Label>Cliente (opcional)</Label>
              <CustomerSearch value={newCustomer} onChange={(id) => setNewCustomer(id)} />
            </div>
            <div>
              <Label>Validade (opcional)</Label>
              <Input
                type="date"
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)}
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={2}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={createVoucher} disabled={busy}>
              {busy ? "A criar…" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem dialog */}
      <Dialog
        open={redeemTarget !== null}
        onOpenChange={(o) => !o && setRedeemTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resgatar voucher {redeemTarget?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              Valor:{" "}
              <span className="font-semibold">
                {redeemTarget ? fmt(redeemTarget.amount, redeemTarget.currency) : ""}
              </span>
            </div>
            {redeemTarget && !redeemTarget.customer_id ? (
              <div>
                <Label>Cliente</Label>
                <CustomerSearch
                  value={redeemCustomer}
                  onChange={(id) => setRedeemCustomer(id)}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Cliente: {redeemTarget?.customers?.name ?? "—"}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRedeemTarget(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={redeem} disabled={busy}>
              {busy ? "A resgatar…" : "Confirmar resgate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}