import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Trash2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CountrySelect from "@/components/CountrySelect";
import { vatBadgeInfo } from "@/lib/vat";

type LineDraft = {
  product_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  discount_percent: string;
};

type Customer = {
  id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  vat_number?: string | null;
  vat_valid?: boolean | null;
  shipping_same_as_billing?: boolean | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
};

type Product = { id: string; name: string; unit_price: number; tax_rate: number; is_tax_exempt: boolean; tracks_stock: boolean; stock_quantity: number };

function emptyLine(): LineDraft {
  return { product_id: null, description: "", quantity: "1", unit_price: "0", tax_rate: "23", discount_percent: "0" };
}

function fmtMoney(v: number, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}

const STEPS = [
  { n: 1, label: "Cliente" },
  { n: 2, label: "Entrega" },
  { n: 3, label: "Produtos" },
  { n: 4, label: "Revisão" },
];

export default function OrderWizardDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const currency = activeOrg?.currency || "EUR";

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [shipToOn, setShipToOn] = useState(false);
  const [shipTo, setShipTo] = useState({ name: "", address: "", city: "", postal_code: "", country: "" });
  const [previewVat, setPreviewVat] = useState<{ treatment: string; destination_rate: number | null; reason: string | null } | null>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [warehouseId, setWarehouseId] = useState("");

  const reset = useCallback(() => {
    setStep(1);
    setCustomerId("");
    setOrderDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setLines([emptyLine()]);
    setShipToOn(false);
    setShipTo({ name: "", address: "", city: "", postal_code: "", country: "" });
    setPreviewVat(null);
    setWarehouseId("");
  }, []);

  // Carregar opções ao abrir
  useEffect(() => {
    if (!open || !activeOrg) return;
    (async () => {
      const [c, p, w] = await Promise.all([
        supabase.from("customers")
          .select("id, name, company_name, email, phone, country, vat_number, vat_valid, shipping_same_as_billing, shipping_address, shipping_city, shipping_postal_code, shipping_country, address, city, postal_code")
          .eq("organization_id", activeOrg.id).order("name"),
        supabase.from("products")
          .select("id, name, unit_price, tax_rate, is_tax_exempt, tracks_stock, stock_quantity")
          .eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
        supabase.from("warehouses").select("id, name, is_default").eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
      ]);
      setCustomers((c.data ?? []) as any);
      setProducts(((p.data ?? []) as any[]).map((x) => ({
        id: x.id, name: x.name, unit_price: Number(x.unit_price), tax_rate: Number(x.tax_rate), is_tax_exempt: x.is_tax_exempt,
        tracks_stock: !!x.tracks_stock, stock_quantity: Number(x.stock_quantity ?? 0),
      })));
      const whs = (w.data ?? []) as { id: string; name: string; is_default: boolean }[];
      setWarehouses(whs);
      setWarehouseId((prev) => prev || whs.find((x) => x.is_default)?.id || "");
    })();
  }, [open, activeOrg]);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId) || null, [customers, customerId]);

  // Quando muda cliente, pré-preenche morada de entrega se o cliente tiver alternativa
  useEffect(() => {
    if (!selectedCustomer) return;
    if (selectedCustomer.shipping_same_as_billing === false && selectedCustomer.shipping_country) {
      setShipToOn(true);
      setShipTo({
        name: "",
        address: selectedCustomer.shipping_address ?? "",
        city: selectedCustomer.shipping_city ?? "",
        postal_code: selectedCustomer.shipping_postal_code ?? "",
        country: selectedCustomer.shipping_country ?? "",
      });
    }
  }, [selectedCustomer]);

  // Pré-visualização AO VIVO do regime de IVA
  useEffect(() => {
    if (!open || !activeOrg || !customerId) { setPreviewVat(null); return; }
    const effectiveShip = shipToOn ? (shipTo.country.trim() || null) : null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("preview_order_vat" as any, {
        p_org_id: activeOrg.id, p_customer_id: customerId, p_ship_country: effectiveShip,
      });
      if (cancelled) return;
      const row = Array.isArray(data) && data.length ? (data[0] as any) : null;
      setPreviewVat(row ? { treatment: row.treatment, destination_rate: row.destination_rate, reason: row.reason } : null);
    })();
    return () => { cancelled = true; };
  }, [open, activeOrg, customerId, shipToOn, shipTo.country]);

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  // Aplica desconto automático a partir da matriz de preços (RPC get_line_discount).
  // O valor pode ser editado manualmente pelo comercial a seguir.
  const applyLineDiscount = async (lineIndex: number, productId: string) => {
    if (!customerId || !productId) return;
    const { data } = await supabase.rpc("get_line_discount" as any, {
      p_customer_id: customerId,
      p_product_id: productId,
    });
    const pct = Number(data) || 0;
    updateLine(lineIndex, { discount_percent: String(pct) });
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
    // Aplica desconto automático da tabela de preços (não-bloqueante).
    void applyLineDiscount(i, p.id);
  };
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);

  // Quando muda o cliente, recalcula desconto automático para todas as linhas com produto.
  useEffect(() => {
    if (!customerId) return;
    lines.forEach((l, idx) => {
      if (l.product_id) void applyLineDiscount(idx, l.product_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // Próximo upgrade de classe alcançável (informativo).
  const [nextUpgrade, setNextUpgrade] = useState<{ class_name: string; discount: number; metric: string; remaining: number } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!customerId) { setNextUpgrade(null); return; }
      const { data } = await supabase.rpc("next_class_upgrade", { p_customer_id: customerId });
      if (!active) return;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setNextUpgrade(row ? {
        class_name: row.class_name,
        discount: Number(row.discount) || 0,
        metric: row.metric,
        remaining: Number(row.remaining) || 0,
      } : null);
    })();
    return () => { active = false; };
  }, [customerId]);

  const totals = lines.reduce((acc, l) => {
    const q = Number(l.quantity) || 0;
    const up = Number(l.unit_price) || 0;
    const disc = Number(l.discount_percent) || 0;
    const rate = Number(l.tax_rate) || 0;
    const sub = q * up * (1 - disc / 100);
    const tax = sub * rate / 100;
    return { sub: acc.sub + sub, tax: acc.tax + tax };
  }, { sub: 0, tax: 0 });

  // Totais refletem o regime de IVA previsto
  const effectiveTax = previewVat?.treatment === "oss_destination"
    ? totals.sub * (Number(previewVat.destination_rate) || 0) / 100
    : (previewVat && ["reverse_charge", "export", "exempt"].includes(previewVat.treatment) ? 0 : totals.tax);
  const effectiveTotal = totals.sub + effectiveTax;

  const validLines = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);

  const vies = (() => {
    if (!selectedCustomer) return null;
    if (!selectedCustomer.vat_number) return { cls: "bg-muted text-muted-foreground", label: "Sem NIF (consumidor final)" };
    if (selectedCustomer.vat_valid === true) return { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "VIES válido" };
    return { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "NIF não validado no VIES" };
  })();

  const vatBadge = vatBadgeInfo(previewVat?.treatment as any, previewVat?.destination_rate ?? null);

  const sellerCountry = (activeOrg as any)?.country as string | undefined;
  const showViesWarning = previewVat?.treatment === "domestic"
    && !!selectedCustomer?.vat_number
    && selectedCustomer?.vat_valid !== true
    && !!sellerCountry
    && (shipToOn ? shipTo.country : selectedCustomer?.country) && (shipToOn ? shipTo.country : selectedCustomer?.country) !== sellerCountry;

  const canNext1 = !!customerId;
  const canNext3 = validLines.length > 0;

  async function save(asStatus: "rascunho" | "confirmada") {
    if (!activeOrg || !user) return;
    if (!customerId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (validLines.length === 0) { toast({ title: "Adicione pelo menos uma linha", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { data: numRes, error: numErr } = await supabase.rpc("next_order_number", { _org_id: activeOrg.id });
      if (numErr) throw numErr;

      const shipFields = shipToOn
        ? {
            ship_to_name: shipTo.name.trim() || null,
            ship_to_address: shipTo.address.trim() || null,
            ship_to_city: shipTo.city.trim() || null,
            ship_to_postal_code: shipTo.postal_code.trim() || null,
            ship_to_country: shipTo.country.trim() || null,
          }
        : { ship_to_name: null, ship_to_address: null, ship_to_city: null, ship_to_postal_code: null, ship_to_country: null };

      const { data: ins, error: insErr } = await supabase.from("orders").insert({
        organization_id: activeOrg.id,
        order_number: numRes as unknown as string,
        customer_id: customerId,
        status: asStatus,
        order_date: orderDate,
        currency,
        notes: notes.trim() || null,
        created_by: user.id,
        warehouse_id: warehouseId || null,
        ...shipFields,
      }).select("id").single();
      if (insErr) throw insErr;
      const orderId = ins.id;

      const payload = validLines.map((l) => ({
        organization_id: activeOrg.id,
        order_id: orderId,
        product_id: l.product_id,
        description: l.description.trim(),
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
        tax_rate: Number(l.tax_rate) || 0,
        discount_percent: Number(l.discount_percent) || 0,
      }));
      const { error: lerr } = await supabase.from("order_lines").insert(payload);
      if (lerr) throw lerr;

      try { await supabase.rpc("resolve_order_vat_treatment" as any, { p_order_id: orderId }); } catch { /* fallback nos triggers */ }

      toast({ title: asStatus === "confirmada" ? "Encomenda confirmada" : "Rascunho criado" });
      onSaved();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const goTo = (n: number) => { if (n < step) setStep(n); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova encomenda</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between gap-2 py-2">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            const clickable = done;
            return (
              <div key={s.n} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => clickable && goTo(s.n)}
                  className={`flex items-center gap-2 ${clickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border
                    ${active ? "bg-primary text-primary-foreground border-primary"
                      : done ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-border"}`}>
                    {done ? <Check className="h-4 w-4" /> : s.n}
                  </div>
                  <span className={`text-sm ${active ? "font-medium text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${step > s.n ? "bg-primary/40" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        <div className="space-y-6 py-2">
          {/* PASSO 1 — CLIENTE */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecionar cliente…" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data da encomenda</Label>
                  <Input type="date" className="h-11" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
              </div>

              {selectedCustomer && (
                <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-medium text-base">{selectedCustomer.name}</div>
                      {selectedCustomer.company_name && (
                        <div className="text-sm text-muted-foreground">{selectedCustomer.company_name}</div>
                      )}
                    </div>
                    {vies && <Badge className={vies.cls}>{vies.label}</Badge>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                    {selectedCustomer.email && <div>Email: <span className="text-foreground">{selectedCustomer.email}</span></div>}
                    {selectedCustomer.phone && <div>Telefone: <span className="text-foreground">{selectedCustomer.phone}</span></div>}
                    {selectedCustomer.country && <div>País faturação: <span className="text-foreground">{selectedCustomer.country}</span></div>}
                  </div>
                  {selectedCustomer.vat_number && selectedCustomer.vat_valid !== true && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 pt-1">
                      Valide o NIF no cartão do cliente para poder aplicar a autoliquidação intra-UE.
                    </p>
                  )}
                </div>
              )}

              {selectedCustomer && nextUpgrade && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200">
                  {nextUpgrade.metric === "total_spent"
                    ? `Faltam ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Math.max(0, Number(nextUpgrade.remaining.toFixed(2))))} em compras para a classe ${nextUpgrade.class_name} (${nextUpgrade.discount}% de desconto).`
                    : `Faltam ${Math.max(0, Math.ceil(nextUpgrade.remaining))} encomenda(s) para a classe ${nextUpgrade.class_name} (${nextUpgrade.discount}% de desconto).`}
                </div>
              )}
            </div>
          )}

          {/* PASSO 2 — ENTREGA */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-lg border p-4 space-y-1 bg-muted/30">
                <p className="text-sm">Por defeito, a entrega é na morada de faturação do cliente.</p>
                {selectedCustomer && (selectedCustomer.address || selectedCustomer.city || selectedCustomer.country) && (
                  <p className="text-sm text-muted-foreground">
                    {[selectedCustomer.address, selectedCustomer.postal_code, selectedCustomer.city, selectedCustomer.country].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border rounded-lg p-4">
                <div>
                  <Label className="text-sm">Entregar noutra morada</Label>
                  <p className="text-xs text-muted-foreground">Indique uma morada de entrega diferente da do cliente.</p>
                </div>
                <Switch checked={shipToOn} onCheckedChange={setShipToOn} />
              </div>

              {shipToOn && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label>Destinatário</Label>
                    <Input className="h-11" value={shipTo.name} onChange={(e) => setShipTo({ ...shipTo, name: e.target.value })} maxLength={200} />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label>Morada</Label>
                    <Input className="h-11" value={shipTo.address} onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })} maxLength={300} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input className="h-11" value={shipTo.city} onChange={(e) => setShipTo({ ...shipTo, city: e.target.value })} maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label>Código Postal</Label>
                    <Input className="h-11" value={shipTo.postal_code} onChange={(e) => setShipTo({ ...shipTo, postal_code: e.target.value })} maxLength={20} />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label>País</Label>
                    <CountrySelect value={shipTo.country} onChange={(v) => setShipTo({ ...shipTo, country: v })} />
                  </div>
                </div>
              )}

              {warehouses.length > 0 && (
                <div className="space-y-2 border rounded-lg p-4">
                  <Label className="text-sm">Armazém de origem</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Predefinido" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (predefinido)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Banner IVA AO VIVO */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-medium">Regime de IVA aplicável</span>
                  <Badge className={vatBadge.className}>{vatBadge.label}</Badge>
                </div>
                {previewVat?.reason && (
                  <p className="text-xs italic text-muted-foreground">{previewVat.reason}</p>
                )}
                {showViesWarning && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    NIF ainda não validado no VIES — valide o NIF do cliente para aplicar a autoliquidação intra-UE.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PASSO 3 — PRODUTOS */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Linhas</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLine}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar linha
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((l, i) => {
                  const q = Number(l.quantity) || 0;
                  const up = Number(l.unit_price) || 0;
                  const disc = Number(l.discount_percent) || 0;
                  const rate = Number(l.tax_rate) || 0;
                  const sub = q * up * (1 - disc / 100);
                  const total = sub * (1 + rate / 100);
                  return (
                    <div key={i} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Label>Produto</Label>
                          <Select value={l.product_id ?? "__free__"} onValueChange={(v) => onPickProduct(i, v)}>
                            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__free__">— Linha livre —</SelectItem>
                              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" size="icon" variant="ghost" className="mt-7" onClick={() => removeLine(i)} aria-label="Remover linha">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Input className="h-10 w-full" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-2">
                          <Label>Quantidade</Label>
                          <Input className="h-10 w-full" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Preço s/ IVA (€)</Label>
                          <Input className="h-10 w-full" inputMode="decimal" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>IVA %</Label>
                          <Input className="h-10 w-full" inputMode="decimal" value={l.tax_rate} onChange={(e) => updateLine(i, { tax_rate: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Desconto %</Label>
                          <Input className="h-10 w-full" inputMode="decimal" value={l.discount_percent} onChange={(e) => updateLine(i, { discount_percent: e.target.value })} />
                          {customerId && l.product_id && (
                            <p className="text-xs text-muted-foreground">Da tabela de preços (editável)</p>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end text-sm">
                        <span className="text-muted-foreground mr-2">Total da linha:</span>
                        <span className="font-semibold tabular-nums">{fmtMoney(total, currency)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end text-sm">
                <div className="space-y-1 min-w-[220px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(totals.sub, currency)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4 — REVISÃO */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground">Cliente</div>
                    <div className="font-medium">{selectedCustomer?.name}</div>
                  </div>
                  {vies && <Badge className={vies.cls}>{vies.label}</Badge>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Data</div>
                    <div>{orderDate}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Morada de entrega</div>
                    {shipToOn ? (
                      <div>{[shipTo.name, shipTo.address, shipTo.postal_code, shipTo.city, shipTo.country].filter(Boolean).join(", ") || "—"}</div>
                    ) : (
                      <div className="text-muted-foreground">Morada do cliente</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t">
                  <span className="text-sm font-medium">Regime de IVA</span>
                  <Badge className={vatBadge.className}>{vatBadge.label}</Badge>
                </div>
                {previewVat?.reason && <p className="text-xs italic text-muted-foreground">{previewVat.reason}</p>}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validLines.map((l, i) => {
                      const q = Number(l.quantity) || 0;
                      const up = Number(l.unit_price) || 0;
                      const disc = Number(l.discount_percent) || 0;
                      const sub = q * up * (1 - disc / 100);
                      return (
                        <TableRow key={i}>
                          <TableCell>{l.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{q}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(up, currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(sub, currency)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <div className="space-y-1 min-w-[260px] text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(totals.sub, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{fmtMoney(effectiveTax, currency)}</span></div>
                  <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span className="tabular-nums">{fmtMoney(effectiveTotal, currency)}</span></div>
                </div>
              </div>

              {(() => {
                const warns = validLines.flatMap((l) => {
                  if (!l.product_id) return [];
                  const p = products.find((x) => x.id === l.product_id);
                  if (!p || !p.tracks_stock) return [];
                  const q = Number(l.quantity) || 0;
                  if (q > p.stock_quantity) {
                    return [{ name: p.name, stock: p.stock_quantity, qty: q }];
                  }
                  return [];
                });
                if (warns.length === 0) return null;
                return (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs space-y-1">
                    {warns.map((w, i) => (
                      <div key={i}>
                        <span className="font-medium">Atenção:</span> stock insuficiente para <span className="font-medium">{w.name}</span> (disponível {w.stock}, pedido {w.qty}). A encomenda fica com stock negativo.
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notas internas ou para o cliente…" />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de navegação */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>Voltar</Button>
            )}
            {step < 4 && (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 1 && !canNext1) || (step === 3 && !canNext3)}
              >
                Seguinte
              </Button>
            )}
            {step === 4 && (
              <>
                <Button type="button" variant="outline" onClick={() => save("rascunho")} disabled={busy}>
                  Guardar rascunho
                </Button>
                <Button type="button" onClick={() => save("confirmada")} disabled={busy}>
                  Confirmar encomenda
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}