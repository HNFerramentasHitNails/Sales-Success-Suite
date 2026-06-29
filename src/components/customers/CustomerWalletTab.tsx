import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";

type Wallet = {
  id: string;
  balance: number;
  currency: string | null;
};

type Tx = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  source_type: string;
  description: string | null;
  balance_after: number | null;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  adjustment: "Ajuste",
  order: "Encomenda",
  refund: "Reembolso",
  voucher: "Voucher",
  topup: "Carregamento",
  other: "Outro",
};

export default function CustomerWalletTab({ customerId }: { customerId: string }) {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [dialogOpen, setDialogOpen] = useState<null | "credit" | "debit">(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const currency = wallet?.currency || activeOrg?.currency || "EUR";
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(n || 0);

  const load = useCallback(async () => {
    if (!activeOrg || !customerId) return;
    setLoading(true);
    const { data: w } = await supabase
      .from("customer_wallets")
      .select("id, balance, currency")
      .eq("organization_id", activeOrg.id)
      .eq("customer_id", customerId)
      .maybeSingle();
    setWallet(
      w
        ? { id: w.id, balance: Number(w.balance) || 0, currency: w.currency }
        : null
    );
    const { data: t } = await supabase
      .from("customer_wallet_transactions")
      .select("id, type, amount, source_type, description, balance_after, created_at")
      .eq("organization_id", activeOrg.id)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(200);
    setTxs(
      ((t ?? []) as any[]).map((r) => ({
        ...r,
        amount: Number(r.amount) || 0,
        balance_after: r.balance_after != null ? Number(r.balance_after) : null,
      })) as Tx[]
    );
    setLoading(false);
  }, [activeOrg, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (mode: "credit" | "debit") => {
    setAmount("");
    setDescription("");
    setDialogOpen(mode);
  };

  const submit = async () => {
    if (!activeOrg || !dialogOpen) return;
    const value = Number(String(amount).replace(",", "."));
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", description: "Indique um valor positivo.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const fn = dialogOpen === "credit" ? "wallet_credit" : "wallet_debit";
    const { error } = await supabase.rpc(fn, {
      _org_id: activeOrg.id,
      _customer_id: customerId,
      _amount: value,
      _source_type: "manual",
      _source_id: null,
      _description: description.trim() || null,
    });
    setBusy(false);
    if (error) {
      const msg = error.message?.includes("insufficient_balance")
        ? "Saldo insuficiente para este débito."
        : error.message?.includes("forbidden")
          ? "Sem permissão para este lançamento."
          : error.message;
      toast({ title: "Erro", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: dialogOpen === "credit" ? "Crédito adicionado" : "Débito lançado" });
    setDialogOpen(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <div className="text-xs text-muted-foreground">Saldo atual</div>
            <div className="text-2xl font-semibold">
              {loading ? "…" : fmt(wallet?.balance ?? 0)}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openDialog("credit")}>
              <ArrowUpCircle className="h-4 w-4 mr-1" /> Adicionar crédito
            </Button>
            <Button size="sm" variant="outline" onClick={() => openDialog("debit")}>
              <ArrowDownCircle className="h-4 w-4 mr-1" /> Lançar débito/ajuste
            </Button>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2">Histórico</div>
        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem movimentos.</p>
        ) : (
          <div className="space-y-1">
            {txs.map((t) => {
              const sign = t.type === "credit" ? "+" : "−";
              const color = t.type === "credit" ? "text-emerald-600" : "text-destructive";
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between border rounded p-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_LABEL[t.source_type] ?? t.source_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    {t.description && (
                      <div className="text-xs mt-1 truncate">{t.description}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${color}`}>
                      {sign} {fmt(t.amount)}
                    </div>
                    {t.balance_after != null && (
                      <div className="text-[11px] text-muted-foreground">
                        Saldo: {fmt(t.balance_after)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen !== null} onOpenChange={(o) => !o && setDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogOpen === "credit" ? "Adicionar crédito" : "Lançar débito / ajuste"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Valor ({currency})</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Descrição</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Motivo do lançamento…"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={busy || !amount}>
              {busy ? "A processar…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}