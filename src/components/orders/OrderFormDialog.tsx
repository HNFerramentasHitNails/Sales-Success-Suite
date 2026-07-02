import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, RefreshCw, Wallet, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CountrySelect from "@/components/CountrySelect";
import { vatBadgeInfo } from "@/lib/vat";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type OrderStatus = Database["public"]["Enums"]["order_status"];
type LineDraft = {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  discount_percent: string;
};

function fmtMoney(v: number, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}

function emptyLine(): LineDraft {
  return { product_id: null, description: "", quantity: "1", unit_price: "0", tax_rate: "23", discount_percent: "0" };
}

export default function OrderFormDialog({
  open, onOpenChange, order, onSaved, forceShipTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: Order | null;
  onSaved: () => void;
  forceShipTo?: boolean;
}) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const currency = activeOrg?.currency || "EUR";
  const [busy, setBusy] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; vat_number?: string | null; vat_valid?: boolean | null; country?: string | null }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; unit_price: number; tax_rate: number; is_tax_exempt: boolean }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<OrderStatus>("rascunho");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  // Morada de entrega alternativa (Fase 2)
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "carrier">("carrier");
  const [deliveryCarrier, setDeliveryCarrier] = useState("");
  const [shipToOn, setShipToOn] = useState(false);
  const [shipTo, setShipTo] = useState({
    name: "", address: "", city: "", postal_code: "", country: "",
  });
  // Snapshot do servidor (totais + tratamento de IVA) — atualizado após RPC.
  const [serverOrder, setServerOrder] = useState<Order | null>(null);
  // Pré-visualização AO VIVO do regime de IVA (sem gravar).
  const [previewVat, setPreviewVat] = useState<{ treatment: string; destination_rate: number | null; reason: string | null } | null>(null);
  // Carteira do cliente (para pagar a encomenda com saldo)
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payingWallet, setPayingWallet] = useState(false);

  useEffect(() => {
    if (!open || !order || !activeOrg || !customerId) { setWalletBalance(null); return; }
    supabase.from("customer_wallets").select("balance")
      .eq("organization_id", activeOrg.id).eq("customer_id", customerId).maybeSingle()
      .then(({ data }) => setWalletBalance(data ? Number((data as { balance: number }).balance) : 0));
  }, [open, order, activeOrg, customerId]);

  const handlePayWallet = async () => {
    if (!order) return;
    setPayingWallet(true);
    const { data, error } = await supabase.rpc("pay_order_with_wallet", { _order_id: order.id });
    setPayingWallet(false);
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
      description: `Aplicado ${fmtMoney(res?.applied ?? 0, currency)}${res?.fully_paid ? "" : ` · em falta ${fmtMoney(res?.remaining ?? 0, currency)}`}`,
    });
    onSaved();
    onOpenChange(false);
  };

  const loadOptions = useCallback(async () => {
    if (!activeOrg) return;
    const [c, p, w] = await Promise.all([
      supabase.from("customers").select("id, name, vat_number, vat_valid, country, shipping_same_as_billing, shipping_address, shipping_city, shipping_postal_code, shipping_country").eq("organization_id", activeOrg.id).order("name"),
      supabase.from("products").select("id, name, unit_price, tax_rate, is_tax_exempt").eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
      supabase.from("warehouses").select("id, name, is_default").eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
    ]);
    setCustomers((c.data ?? []) as any);
    setProducts((p.data ?? []).map((x: { id: string; name: string; unit_price: number | string; tax_rate: number | string; is_tax_exempt: boolean }) => ({
      id: x.id, name: x.name, unit_price: Number(x.unit_price), tax_rate: Number(x.tax_rate), is_tax_exempt: x.is_tax_exempt,
    })));
    setWarehouses((w.data ?? []) as any);
  }, [activeOrg]);

  useEffect(() => { if (open) loadOptions(); }, [open, loadOptions]);

  // Pré-visualização AO VIVO do regime de IVA quando muda cliente / país de entrega.
  useEffect(() => {
    if (!open || !activeOrg || !customerId) { setPreviewVat(null); return; }
    const effectiveShip = shipToOn ? (shipTo.country.trim() || null) : null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("preview_order_vat" as any, {
        p_org_id: activeOrg.id,
        p_customer_id: customerId,
        p_ship_country: effectiveShip,
      });
      if (cancelled) return;
      const row = Array.isArray(data) && data.length ? (data[0] as any) : null;
      setPreviewVat(row ? { treatment: row.treatment, destination_rate: row.destination_rate, reason: row.reason } : null);
    })();
    return () => { cancelled = true; };
  }, [open, activeOrg, customerId, shipToOn, shipTo.country]);

  useEffect(() => {
    if (!open) return;
    if (order) {
      setCustomerId(order.customer_id);
      setOrderDate(order.order_date);
      setNotes(order.notes ?? "");
      setStatus(order.status);
      setServerOrder(order);
      setDeliveryMethod(((order as any).delivery_method as "pickup" | "carrier") ?? "carrier");
      setDeliveryCarrier((order as any).delivery_carrier ?? "");
      setWarehouseId((order as any).warehouse_id ?? "");
      const hasShipTo = !!(order as any).ship_to_country || !!(order as any).ship_to_address;
      setShipToOn(hasShipTo || !!forceShipTo);
      setShipTo({
        name: (order as any).ship_to_name ?? "",
        address: (order as any).ship_to_address ?? "",
        city: (order as any).ship_to_city ?? "",
        postal_code: (order as any).ship_to_postal_code ?? "",
        country: (order as any).ship_to_country ?? "",
      });
      supabase.from("order_lines").select("*").eq("order_id", order.id).order("created_at")
        .then(({ data }) => {
          // Exclui a linha de "Portes de envio" (gerida automaticamente, não editável aqui).
          const editable = (data ?? []).filter((l) => !(l.product_id === null && l.description === "Portes de envio"));
          setLines((editable.length > 0
            ? editable.map((l) => ({
                id: l.id, product_id: l.product_id, description: l.description,
                quantity: String(l.quantity), unit_price: String(l.unit_price),
                tax_rate: String(l.tax_rate), discount_percent: String(l.discount_percent),
              }))
            : [emptyLine()]));
        });
    } else {
      setCustomerId(""); setOrderDate(new Date().toISOString().slice(0, 10));
      setNotes(""); setStatus("rascunho"); setLines([emptyLine()]);
      setServerOrder(null);
      setDeliveryMethod("carrier"); setDeliveryCarrier("");
      setWarehouseId("");
      setShipToOn(false);
      setShipTo({ name: "", address: "", city: "", postal_code: "", country: "" });
    }
  }, [open, order]);

  // Nova encomenda: pré-seleciona o armazém predefinido assim que a lista carregar.
  useEffect(() => {
    if (!open || order || warehouseId) return;
    const def = warehouses.find((w) => w.is_default);
    if (def) setWarehouseId(def.id);
  }, [open, order, warehouses, warehouseId]);

  // Pré-preencher morada de entrega a partir do cliente se este tiver
  // shipping_same_as_billing=false e país definido. Só para novas encomendas
  // (para não sobrescrever uma morada de entrega já guardada).
  useEffect(() => {
    if (!open || !customerId || order) return;
    const c: any = customers.find((x) => x.id === customerId);
    if (!c) return;
    if (c.shipping_same_as_billing === false && c.shipping_country) {
      setShipToOn(true);
      setShipTo({
        name: "",
        address: c.shipping_address ?? "",
        city: c.shipping_city ?? "",
        postal_code: c.shipping_postal_code ?? "",
        country: c.shipping_country ?? "",
      });
    }
  }, [customerId, customers, open, order]);

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };
  const onPickProduct = (i: number, productId: string) => {
    if (productId === "__free__") { updateLine(i, { product_id: null }); return; }
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateLine(i, {
      product_id: p.id,
      description: p.name,
      unit_price: String(p.unit_price),
      tax_rate: String(p.is_tax_exempt ? 0 : p.tax_rate),
    });
  };
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);

  const totals = lines.reduce((acc, l) => {
    const q = Number(l.quantity) || 0;
    const up = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const rate = Number(l.tax_rate) || 0;
    const sub = q * up * (1 - disc / 100);
    const tax = sub * rate / 100;
    return { sub: acc.sub + sub, tax: acc.tax + tax };
  }, { sub: 0, tax: 0 });

  // Helpers para chamar a RPC do servidor e recarregar a encomenda.
  const reloadOrder = async (orderId: string) => {
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (data) setServerOrder(data as Order);
  };
  const resolveVat = async (orderId: string) => {
    await supabase.rpc("resolve_order_vat_treatment" as any, { p_order_id: orderId });
    await reloadOrder(orderId);
  };
  const recalcNow = async () => {
    if (!serverOrder) return;
    setRecalcBusy(true);
    try {
      await resolveVat(serverOrder.id);
      toast({ title: "IVA recalculado" });
    } catch (e: any) {
      toast({ title: "Erro a recalcular", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRecalcBusy(false);
    }
  };

  const submit = async (e: FormEvent, asStatus?: OrderStatus) => {
    e.preventDefault();
    if (!activeOrg || !user) return;
    if (!customerId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    const validLines = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast({ title: "Adicione pelo menos uma linha", variant: "destructive" }); return; }
    setBusy(true);

    let orderId = order?.id;
    let finalStatus = asStatus ?? status;

    // Campos da morada de entrega (snapshot na encomenda). Quando o switch
    // está desligado, gravamos NULL e a entrega usa a morada do cliente.
    const shipFields = shipToOn
      ? {
          ship_to_name: shipTo.name.trim() || null,
          ship_to_address: shipTo.address.trim() || null,
          ship_to_city: shipTo.city.trim() || null,
          ship_to_postal_code: shipTo.postal_code.trim() || null,
          ship_to_country: shipTo.country.trim() || null,
        }
      : {
          ship_to_name: null,
          ship_to_address: null,
          ship_to_city: null,
          ship_to_postal_code: null,
          ship_to_country: null,
        };

    if (!order) {
      const { data: numRes, error: numErr } = await supabase.rpc("next_order_number", { _org_id: activeOrg.id });
      if (numErr) { setBusy(false); toast({ title: "Erro", description: numErr.message, variant: "destructive" }); return; }
      const { data: ins, error: insErr } = await supabase.from("orders").insert({
        organization_id: activeOrg.id,
        order_number: numRes as unknown as string,
        customer_id: customerId,
        status: finalStatus,
        order_date: orderDate,
        currency,
        notes: notes.trim() || null,
        created_by: user.id,
        delivery_method: deliveryMethod,
        delivery_carrier: deliveryMethod === "carrier" ? (deliveryCarrier.trim() || null) : null,
        warehouse_id: warehouseId || null,
        ...shipFields,
      }).select("id").single();
      if (insErr) { setBusy(false); toast({ title: "Erro", description: insErr.message, variant: "destructive" }); return; }
      orderId = ins.id;
    } else {
      const { error: upErr } = await supabase.from("orders").update({
        customer_id: customerId, status: finalStatus, order_date: orderDate,
        notes: notes.trim() || null,
        delivery_method: deliveryMethod,
        delivery_carrier: deliveryMethod === "carrier" ? (deliveryCarrier.trim() || null) : null,
        warehouse_id: warehouseId || null,
        ...shipFields,
      }).eq("id", order.id);
      if (upErr) { setBusy(false); toast({ title: "Erro", description: upErr.message, variant: "destructive" }); return; }
      await supabase.from("order_lines").delete().eq("order_id", order.id);
    }

    const payload = validLines.map((l) => ({
      organization_id: activeOrg.id,
      order_id: orderId!,
      product_id: l.product_id,
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0,
      tax_rate: Number(l.tax_rate) || 0,
      discount_percent: Number(l.discount_percent) || 0,
    }));
    const { error: lerr } = await supabase.from("order_lines").insert(payload);
    if (lerr) { toast({ title: "Erro nas linhas", description: lerr.message, variant: "destructive" }); return; }

    // Recalcular tratamento de IVA + totais no servidor antes de fechar.
    try {
      await supabase.rpc("resolve_order_vat_treatment" as any, { p_order_id: orderId! });
    } catch {
      /* triggers já cobrem a maior parte dos casos — não bloqueia o fluxo */
    }
    // Aplicar portes automaticamente (linha "Portes de envio" segundo as regras; 0 em levantamento).
    try {
      await supabase.rpc("set_order_shipping" as any, { _order_id: orderId! });
    } catch {
      /* sem regras de portes definidas — não bloqueia */
    }
    setBusy(false);

    toast({ title: order ? "Encomenda atualizada" : "Encomenda criada" });
    onSaved(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Editar ${order.order_number}` : "Nova encomenda"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => submit(e)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Cliente *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente…" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
          </div>

          {/* Método de envio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded p-3">
            <div>
              <Label className="text-sm">Método de envio</Label>
              <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as "pickup" | "carrier")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="carrier">Envio por transportadora</SelectItem>
                  <SelectItem value="pickup">Levantamento no armazém</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {deliveryMethod === "carrier"
                  ? "Os portes são calculados pelas regras de envio e os dados de transporte vão na fatura."
                  : "Sem portes; o cliente levanta no armazém."}
              </p>
            </div>
            {deliveryMethod === "carrier" && (
              <div>
                <Label className="text-sm">Transportadora</Label>
                <Input value={deliveryCarrier} onChange={(e) => setDeliveryCarrier(e.target.value)} maxLength={120} placeholder="Ex.: CTT, DPD…" />
              </div>
            )}
            {warehouses.length > 0 && (
              <div>
                <Label className="text-sm">Armazém de origem</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Predefinido" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (predefinido)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Morada de entrega (Fase 2 IVA) */}
          <div className="space-y-3 border rounded p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Entregar noutra morada</Label>
                <p className="text-xs text-muted-foreground">
                  Por defeito, a entrega usa a morada do cliente.
                </p>
              </div>
              <Switch checked={shipToOn} onCheckedChange={setShipToOn} />
            </div>
            {shipToOn && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Destinatário</Label>
                  <Input value={shipTo.name} onChange={(e) => setShipTo({ ...shipTo, name: e.target.value })} maxLength={200} />
                </div>
                <div className="md:col-span-2">
                  <Label>Morada</Label>
                  <Input value={shipTo.address} onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })} maxLength={300} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={shipTo.city} onChange={(e) => setShipTo({ ...shipTo, city: e.target.value })} maxLength={100} />
                </div>
                <div>
                  <Label>Código Postal</Label>
                  <Input value={shipTo.postal_code} onChange={(e) => setShipTo({ ...shipTo, postal_code: e.target.value })} maxLength={20} />
                </div>
                <div className="md:col-span-2">
                  <Label>País</Label>
                  <CountrySelect value={shipTo.country} onChange={(v) => setShipTo({ ...shipTo, country: v })} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Linhas</Label>
              <Button type="button" size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar linha
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Produto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-20 text-right">Qtd</TableHead>
                  <TableHead className="w-28 text-right">Preço s/ IVA</TableHead>
                  <TableHead className="w-20 text-right">IVA %</TableHead>
                  <TableHead className="w-20 text-right">Desc. %</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const q = Number(l.quantity) || 0;
                  const up = Number(l.unit_price) || 0;
                  const disc = Number(l.discount_percent) || 0;
                  const rate = Number(l.tax_rate) || 0;
                  const sub = q * up * (1 - disc / 100);
                  const total = sub * (1 + rate / 100);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={l.product_id ?? "__free__"} onValueChange={(v) => onPickProduct(i, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__free__">— Linha livre —</SelectItem>
                            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                      </TableCell>
                      <TableCell><Input className="text-right" type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} /></TableCell>
                      <TableCell><Input className="text-right" type="number" step="0.0001" min="0" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} /></TableCell>
                      <TableCell><Input className="text-right" type="number" step="0.01" min="0" max="100" value={l.tax_rate} onChange={(e) => updateLine(i, { tax_rate: e.target.value })} /></TableCell>
                      <TableCell><Input className="text-right" type="number" step="0.01" min="0" max="100" value={l.discount_percent} onChange={(e) => updateLine(i, { discount_percent: e.target.value })} /></TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(total, currency)}</TableCell>
                      <TableCell>
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeLine(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="text-sm space-y-1 min-w-[260px]">
              {(() => {
                // Painel do regime de IVA — usa previewVat (ao vivo) com fallback ao snapshot do servidor.
                const treatment = previewVat?.treatment ?? (serverOrder as any)?.vat_treatment ?? null;
                const destRate = previewVat?.destination_rate ?? (serverOrder as any)?.vat_destination_rate ?? null;
                const reason = previewVat?.reason ?? ((serverOrder as any)?.vat_exemption_reason as string | null) ?? null;
                if (!treatment && !serverOrder) return null;
                const info = vatBadgeInfo(treatment, destRate);
                // Aviso: cliente B2B (tem NIF) mas NIF não validado no VIES — fica em IVA doméstico em vez de autoliquidação.
                const cust = customers.find((c) => c.id === customerId) as any | undefined;
                const sellerCountry = (activeOrg as any)?.country?.toUpperCase?.() ?? "PT";
                const effShip = (shipToOn ? shipTo.country.trim() : (cust?.country ?? "")).toUpperCase();
                const showViesWarning =
                  treatment === "domestic" &&
                  !!cust?.vat_number && !cust?.vat_valid &&
                  effShip && effShip !== sellerCountry;
                return (
                  <div className="mb-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Regime de IVA</span>
                      <Badge className={info.className} variant="secondary">{info.label}</Badge>
                    </div>
                    {reason && (
                      <p className="text-[11px] italic text-muted-foreground text-right">{reason}</p>
                    )}
                    {showViesWarning && (
                      <p className="text-[11px] text-amber-600 text-right">
                        NIF ainda não validado no VIES — valide o NIF do cliente para aplicar a autoliquidação intra-UE.
                      </p>
                    )}
                    {serverOrder && (
                      <div className="flex justify-end">
                        <Button type="button" size="sm" variant="ghost" disabled={recalcBusy} onClick={recalcNow}>
                          <RefreshCw className={`h-3 w-3 mr-1 ${recalcBusy ? "animate-spin" : ""}`} />
                          {recalcBusy ? "A recalcular…" : "Recalcular IVA"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {(() => {
                // Totais ao vivo — refletem o regime de IVA pré-visualizado.
                const sub = totals.sub;
                const t = previewVat?.treatment;
                let tax: number;
                if (t === "oss_destination") {
                  tax = sub * (Number(previewVat?.destination_rate) || 0) / 100;
                } else if (t && ["reverse_charge", "export", "exempt"].includes(t)) {
                  tax = 0;
                } else {
                  tax = totals.tax; // domestic ou sem preview → IVA das linhas
                }
                const total = sub + tax;
                return (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtMoney(sub, currency)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{fmtMoney(tax, currency)}</span></div>
                    <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{fmtMoney(total, currency)}</span></div>
                  </>
                );
              })()}
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>

          {order && (
            <div>
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="faturada">Faturada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {order && !["paga", "faturada", "cancelada"].includes(status) && walletBalance !== null && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-4 w-4" /> Carteira do cliente</span>
                <span className="font-semibold">{fmtMoney(walletBalance, currency)}</span>
              </div>
              {Number(order.wallet_balance_applied ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">Já aplicado a esta encomenda: {fmtMoney(Number(order.wallet_balance_applied), currency)}</div>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={payingWallet || walletBalance <= 0 || Number(order.wallet_balance_applied ?? 0) > 0}
                onClick={handlePayWallet}
              >
                {payingWallet ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
                Pagar com carteira
              </Button>
              {walletBalance <= 0 && <p className="text-xs text-muted-foreground">Sem saldo disponível na carteira.</p>}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {!order && (
              <Button type="button" variant="outline" disabled={busy} onClick={(e) => submit(e as unknown as FormEvent, "rascunho")}>
                Guardar rascunho
              </Button>
            )}
            {!order && (
              <Button type="button" disabled={busy} onClick={(e) => submit(e as unknown as FormEvent, "confirmada")}>
                Confirmar
              </Button>
            )}
            {order && <Button type="submit" disabled={busy}>Guardar</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}