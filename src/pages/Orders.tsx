import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2, CreditCard, ExternalLink, Copy, FileText, Upload, Wallet, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import OrderFormDialog from "@/components/orders/OrderFormDialog";
import OrderWizardDialog from "@/components/orders/OrderWizardDialog";
import OrderHistoryImportDialog from "@/components/orders/OrderHistoryImportDialog";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type OrderStatus = Database["public"]["Enums"]["order_status"];
type Row = Order & {
  customers: { name: string } | null;
  invoices: { id: string; status: string; invoice_number: string | null; pdf_url: string | null }[];
};

const STATUSES: { v: OrderStatus; l: string; cls: string }[] = [
  { v: "rascunho",   l: "Rascunho",   cls: "bg-muted text-muted-foreground" },
  { v: "confirmada", l: "Confirmada", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { v: "paga",       l: "Paga",       cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { v: "faturada",   l: "Faturada",   cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { v: "cancelada",  l: "Cancelada",  cls: "bg-destructive/15 text-destructive" },
];
const PAGE_SIZE = 25;

function fmtMoney(v: number, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}
function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; }
}

export default function Orders() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const canWrite = role !== null && role !== "read_only";
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [stripeActive, setStripeActive] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [issuingFor, setIssuingFor] = useState<string | null>(null);
  const [payingWalletFor, setPayingWalletFor] = useState<string | null>(null);
  const [walletByCustomer, setWalletByCustomer] = useState<Record<string, number>>({});
  const currency = activeOrg?.currency || "EUR";

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    let q = supabase.from("orders")
      .select("*, customers(name), invoices(id, status, invoice_number, pdf_url)", { count: "exact" })
      .eq("organization_id", activeOrg.id)
      .order("order_date", { ascending: false })
      .order("order_number", { ascending: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.ilike("order_number", `%${s}%`);
    }
    if (statusFilter !== "__all__") q = q.eq("status", statusFilter as OrderStatus);
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count: c, error } = await q;
    setLoading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const list = (data ?? []) as Row[];
    setRows(list);
    setCount(c ?? 0);

    // Saldos de carteira dos clientes visíveis (para a ação rápida "Pagar com carteira")
    const custIds = Array.from(new Set(list.map((o) => o.customer_id).filter(Boolean))) as string[];
    if (custIds.length) {
      const { data: wallets } = await supabase
        .from("customer_wallets")
        .select("customer_id, balance")
        .eq("organization_id", activeOrg.id)
        .in("customer_id", custIds);
      const map: Record<string, number> = {};
      (wallets ?? []).forEach((w) => { map[(w as { customer_id: string }).customer_id] = Number((w as { balance: number }).balance); });
      setWalletByCustomer(map);
    } else {
      setWalletByCustomer({});
    }
  }, [activeOrg, search, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  // Detect active Stripe connection for the org
  useEffect(() => {
    if (!activeOrg) { setStripeActive(false); return; }
    (async () => {
      // Usar RPC dedicada (RLS de `connections` é admin-only — esta função
      // devolve só um booleano e é chamável por qualquer membro da org).
      const { data } = await supabase.rpc("org_connector_active", {
        _org_id: activeOrg.id,
        _connector_key: "stripe",
      });
      setStripeActive(data === true);
    })();
  }, [activeOrg]);

  // Handle return from Stripe Checkout (success → verify)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const orderId = params.get("order_id");
    const sessionId = params.get("session_id");
    if (!payment || !orderId) return;
    // Clean URL early
    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);
    if (payment === "success" && sessionId) {
      (async () => {
        const { data, error } = await supabase.functions.invoke("verify-stripe-payment", {
          body: { order_id: orderId, session_id: sessionId },
        });
        if (error) { toast({ title: "Erro ao verificar pagamento", description: error.message, variant: "destructive" }); return; }
        if ((data as any)?.paid) toast({ title: "Pagamento confirmado" });
        else toast({ title: "Pagamento ainda não confirmado", description: "Tente novamente em instantes." });
        load();
      })();
    } else if (payment === "cancel") {
      toast({ title: "Pagamento cancelado" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generatePaymentLink(o: Row) {
    setGeneratingFor(o.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-payment", {
        body: { order_id: o.id },
      });
      if (error) throw error;
      const url = (data as any)?.payment_url as string;
      if (!url) throw new Error("Sem URL de pagamento.");
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: "Link de pagamento gerado", description: "Copiado para a área de transferência." });
      window.open(url, "_blank", "noopener");
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setGeneratingFor(null);
    }
  }

  async function issueInvoice(o: Row) {
    setIssuingFor(o.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: { order_id: o.id },
      });
      if (error) {
        toast({ title: "Erro ao emitir fatura", description: error.message, variant: "destructive" });
        return;
      }
      const res = data as any;
      if (res?.ok === false || res?.error) {
        toast({
          title: "Não foi possível emitir a fatura",
          description: res?.message ?? res?.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return;
      }
      const inv = res?.invoice;
      if (inv?.status === "issued") {
        toast({
          title: "Fatura emitida",
          description: inv.invoice_number ? `Nº ${inv.invoice_number}` : undefined,
        });
        if (inv.pdf_url) window.open(inv.pdf_url, "_blank", "noopener");
      } else if (inv?.status === "pending") {
        toast({ title: "Pedido enviado", description: "A aguardar confirmação do sistema de faturação." });
      } else if (res?.already) {
        toast({ title: "Fatura já emitida para esta encomenda." });
      } else {
        toast({ title: "Fatura criada", description: inv?.status });
      }
      load();
    } catch (e: any) {
      toast({ title: "Erro ao emitir fatura", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setIssuingFor(null);
    }
  }

  async function payWithWallet(o: Row) {
    setPayingWalletFor(o.id);
    const { data, error } = await supabase.rpc("pay_order_with_wallet", { _order_id: o.id });
    setPayingWalletFor(null);
    if (error) {
      const map: Record<string, string> = {
        no_balance: "O cliente não tem saldo na carteira.",
        already_applied: "A carteira já foi aplicada a esta encomenda.",
        order_not_payable: "Esta encomenda já está paga, faturada ou cancelada.",
        forbidden: "Sem permissão.",
        insufficient_balance: "Saldo insuficiente.",
      };
      toast({ title: "Não foi possível pagar com a carteira", description: map[error.message] ?? error.message, variant: "destructive" });
      return;
    }
    const res = data as { applied?: number; fully_paid?: boolean; remaining?: number };
    toast({
      title: res?.fully_paid ? "Encomenda paga com a carteira" : "Carteira aplicada",
      description: `Aplicado ${fmtMoney(res?.applied ?? 0, o.currency || currency)}${res?.fully_paid ? "" : ` · em falta ${fmtMoney(res?.remaining ?? 0, o.currency || currency)}`}`,
    });
    load();
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado" });
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const openNew = () => { setEditing(null); setWizardOpen(true); };
  const openEdit = (o: Order) => { setEditing(o); setDialogOpen(true); };

  const remove = async (o: Order) => {
    if (!confirm(`Eliminar a encomenda ${o.order_number}?`)) return;
    const { error } = await supabase.from("orders").delete().eq("id", o.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Encomenda eliminada" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-3xl font-bold tracking-tight">Encomendas</h1>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar histórico
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova encomenda</Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Pesquisar por nº…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os estados</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sem encomendas.</TableCell></TableRow>}
              {!loading && rows.map((o) => {
                const st = STATUSES.find((s) => s.v === o.status);
                const canPay = stripeActive && canWrite && o.status === "confirmada";
                const activeInvoice = (o.invoices ?? []).find((i) => i.status !== "error");
                const canInvoice = canWrite
                  && (o.status === "confirmada" || o.status === "paga")
                  && !activeInvoice;
                const walletBal = o.customer_id ? (walletByCustomer[o.customer_id] ?? 0) : 0;
                const walletApplied = Number((o as any).wallet_balance_applied ?? 0);
                const canPayWallet = canWrite
                  && !["paga", "faturada", "cancelada"].includes(o.status)
                  && walletApplied <= 0
                  && walletBal > 0;
                return (
                  <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40" onClick={() => canWrite && openEdit(o)}>
                    <TableCell className="font-medium">{o.order_number}</TableCell>
                    <TableCell>{o.customers?.name ?? "—"}</TableCell>
                    <TableCell>{fmtDate(o.order_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <Badge className={st?.cls} variant="secondary">{st?.l ?? o.status}</Badge>
                          {Number((o as any).wallet_balance_applied ?? 0) > 0 && (
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 gap-1"
                              title={`Carteira aplicada: ${fmtMoney(Number((o as any).wallet_balance_applied), o.currency || currency)}`}>
                              <Wallet className="h-3 w-3" /> Carteira
                            </Badge>
                          )}
                        </div>
                        {o.status === "paga" && (o as any).paid_at && (
                          <span className="text-[10px] text-muted-foreground">Pago em {fmtDate((o as any).paid_at)}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{fmtMoney(Number(o.total), o.currency || currency)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canPayWallet && (
                          <Button size="sm" variant="outline" disabled={payingWalletFor === o.id}
                            onClick={() => payWithWallet(o)}
                            title={`Pagar com a carteira do cliente (saldo ${fmtMoney(walletBal, o.currency || currency)})`}>
                            {payingWalletFor === o.id
                              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              : <Wallet className="h-4 w-4 mr-1" />}
                            Carteira
                          </Button>
                        )}
                        {canPay && (
                          <Button size="sm" variant="outline" disabled={generatingFor === o.id}
                            onClick={() => generatePaymentLink(o)} title="Gerar link de pagamento Stripe">
                            <CreditCard className="h-4 w-4 mr-1" />
                            {generatingFor === o.id ? "A gerar…" : (o as any).payment_url ? "Reenviar link" : "Pagar"}
                          </Button>
                        )}
                        {canInvoice && (
                          <Button size="sm" variant="outline" disabled={issuingFor === o.id}
                            onClick={() => issueInvoice(o)} title="Emitir fatura">
                            <FileText className="h-4 w-4 mr-1" />
                            {issuingFor === o.id ? "A emitir…" : "Emitir fatura"}
                          </Button>
                        )}
                        {activeInvoice?.pdf_url && (
                          <Button size="sm" variant="ghost" asChild title="Abrir fatura">
                            <a href={activeInvoice.pdf_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {activeInvoice && !activeInvoice.pdf_url && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1" title="Fatura">
                            <FileText className="h-3.5 w-3.5" />
                            {activeInvoice.invoice_number ?? (activeInvoice.status === "pending" ? "A emitir…" : "Emitida")}
                          </span>
                        )}
                        {(o as any).payment_url && o.status !== "paga" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => copyText((o as any).payment_url)} title="Copiar link">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" asChild title="Abrir link">
                              <a href={(o as any).payment_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </>
                        )}
                        {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => remove(o)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} {count === 1 ? "encomenda" : "encomendas"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <OrderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        order={editing}
        onSaved={load}
      />
      <OrderWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={load}
      />
      <OrderHistoryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={load}
      />
    </div>
  );
}