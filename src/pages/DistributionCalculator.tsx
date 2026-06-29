import { useEffect, useMemo, useState, useCallback } from "react";
import { Calculator, Plus, Trash2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Product = { id: string; name: string; unit_price: number | null };
type Partner = { id: string; name: string };
type Contract = { id: string; partner_id: string; discount_pct: number | null; created_at: string };
type Tier = {
  id: string;
  organization_id: string;
  name: string | null;
  min_quantity: number;
  discount_pct: number;
  is_active: boolean;
};

type DiscountSource = "tier" | "partner" | "manual";

export default function DistributionCalculator() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";
  const currency = activeOrg?.currency || "EUR";

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency]
  );
  const fmtPct = (v: number) =>
    `${(v || 0).toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;

  // Price source
  const [priceMode, setPriceMode] = useState<"product" | "manual">("manual");
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [resalePrice, setResalePrice] = useState<string>("");

  // Discount source
  const [discountSource, setDiscountSource] = useState<DiscountSource>("tier");
  const [manualDiscount, setManualDiscount] = useState<string>("0");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerContract, setPartnerContract] = useState<Contract | null>(null);

  // Tiers
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);

  const loadTiers = useCallback(async () => {
    if (!activeOrg?.id) return;
    setTiersLoading(true);
    const { data, error } = await supabase
      .from("distribution_price_tiers")
      .select("*")
      .eq("organization_id", activeOrg.id)
      .order("min_quantity", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar escalões", description: error.message, variant: "destructive" });
    } else {
      setTiers((data || []) as Tier[]);
    }
    setTiersLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  // Products search
  useEffect(() => {
    if (!activeOrg?.id || priceMode !== "product") return;
    let cancel = false;
    setProductLoading(true);
    const run = async () => {
      let q = supabase
        .from("products")
        .select("id, name, unit_price")
        .eq("organization_id", activeOrg.id)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(20);
      if (productSearch.trim()) q = q.ilike("name", `%${productSearch.trim()}%`);
      const { data, error } = await q;
      if (cancel) return;
      if (!error) setProducts((data || []) as Product[]);
      setProductLoading(false);
    };
    const t = setTimeout(run, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [activeOrg?.id, productSearch, priceMode]);

  // Partners search
  useEffect(() => {
    if (!activeOrg?.id || discountSource !== "partner") return;
    let cancel = false;
    const run = async () => {
      let q = supabase
        .from("distribution_partners")
        .select("id, name")
        .eq("organization_id", activeOrg.id)
        .order("name", { ascending: true })
        .limit(20);
      if (partnerSearch.trim()) q = q.ilike("name", `%${partnerSearch.trim()}%`);
      const { data, error } = await q;
      if (cancel) return;
      if (!error) setPartners((data || []) as Partner[]);
    };
    const t = setTimeout(run, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [activeOrg?.id, partnerSearch, discountSource]);

  // Load active contract for selected partner (most recent)
  useEffect(() => {
    if (!selectedPartner) {
      setPartnerContract(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("distribution_contracts")
        .select("id, partner_id, discount_pct, created_at")
        .eq("partner_id", selectedPartner.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) setPartnerContract(data[0] as Contract);
      else setPartnerContract(null);
    })();
  }, [selectedPartner]);

  // Derive base price / cost
  const basePrice = useMemo(() => {
    if (priceMode === "product") return Number(selectedProduct?.unit_price ?? 0) || 0;
    return parseFloat(manualPrice.replace(",", ".")) || 0;
  }, [priceMode, selectedProduct, manualPrice]);

  const costValue = useMemo(() => {
    const v = parseFloat(cost.replace(",", "."));
    return isNaN(v) ? null : v;
  }, [cost]);

  const qty = useMemo(() => {
    const v = parseInt(quantity, 10);
    return isNaN(v) || v < 1 ? 1 : v;
  }, [quantity]);

  // Resolve discount %
  const effectiveDiscount = useMemo(() => {
    if (discountSource === "manual") {
      const v = parseFloat(manualDiscount.replace(",", "."));
      return isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
    }
    if (discountSource === "partner") {
      return Number(partnerContract?.discount_pct ?? 0) || 0;
    }
    // tier
    const active = tiers
      .filter((t) => t.is_active && t.min_quantity <= qty)
      .sort((a, b) => b.min_quantity - a.min_quantity);
    return active.length > 0 ? Number(active[0].discount_pct) : 0;
  }, [discountSource, manualDiscount, partnerContract, tiers, qty]);

  const unitToPartner = basePrice * (1 - effectiveDiscount / 100);
  const totalToPartner = unitToPartner * qty;
  const discountValueTotal = (basePrice - unitToPartner) * qty;

  const yourMargin =
    costValue !== null ? (unitToPartner - costValue) * qty : null;
  const yourMarginPct =
    costValue !== null && unitToPartner > 0
      ? ((unitToPartner - costValue) / unitToPartner) * 100
      : null;

  const resaleValue = parseFloat(resalePrice.replace(",", "."));
  const validResale = !isNaN(resaleValue) && resaleValue > 0;
  const partnerMarginPct =
    validResale ? ((resaleValue - unitToPartner) / resaleValue) * 100 : null;
  const partnerMarginValue =
    validResale ? (resaleValue - unitToPartner) * qty : null;

  const hasPrice = basePrice > 0;

  // Tiers management
  const [draftTiers, setDraftTiers] = useState<Tier[]>([]);
  useEffect(() => {
    setDraftTiers(tiers);
  }, [tiers]);

  const updateDraftTier = (id: string, patch: Partial<Tier>) => {
    setDraftTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const addDraftTier = () => {
    if (!activeOrg?.id) return;
    const tmpId = `new-${Date.now()}`;
    setDraftTiers((prev) => [
      ...prev,
      {
        id: tmpId,
        organization_id: activeOrg.id,
        name: "",
        min_quantity: 1,
        discount_pct: 0,
        is_active: true,
      },
    ]);
  };
  const deleteTier = async (id: string) => {
    if (id.startsWith("new-")) {
      setDraftTiers((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    const { error } = await supabase.from("distribution_price_tiers").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Escalão eliminado" });
    loadTiers();
  };
  const saveTiers = async () => {
    if (!activeOrg?.id) return;
    const toInsert = draftTiers
      .filter((t) => t.id.startsWith("new-"))
      .map((t) => ({
        organization_id: activeOrg.id,
        name: t.name || null,
        min_quantity: Math.max(1, Number(t.min_quantity) || 1),
        discount_pct: Math.max(0, Math.min(100, Number(t.discount_pct) || 0)),
        is_active: t.is_active,
      }));
    const toUpdate = draftTiers.filter((t) => !t.id.startsWith("new-"));

    try {
      if (toInsert.length > 0) {
        const { error } = await supabase.from("distribution_price_tiers").insert(toInsert);
        if (error) throw error;
      }
      for (const t of toUpdate) {
        const original = tiers.find((x) => x.id === t.id);
        if (
          !original ||
          original.name !== t.name ||
          Number(original.min_quantity) !== Number(t.min_quantity) ||
          Number(original.discount_pct) !== Number(t.discount_pct) ||
          original.is_active !== t.is_active
        ) {
          const { error } = await supabase
            .from("distribution_price_tiers")
            .update({
              name: t.name || null,
              min_quantity: Math.max(1, Number(t.min_quantity) || 1),
              discount_pct: Math.max(0, Math.min(100, Number(t.discount_pct) || 0)),
              is_active: t.is_active,
            })
            .eq("id", t.id);
          if (error) throw error;
        }
      }
      toast({ title: "Escalões guardados" });
      loadTiers();
    } catch (e: any) {
      toast({ title: "Erro ao guardar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calculadora de revenda"
        description="Calcula preços e margens para parceiros distribuidores."
        icon={<Calculator className="h-6 w-6" />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <Card className="p-5 space-y-5">
          <div>
            <Label className="mb-2 block">Origem do preço</Label>
            <Tabs value={priceMode} onValueChange={(v) => setPriceMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">Manual</TabsTrigger>
                <TabsTrigger value="product">Catálogo</TabsTrigger>
              </TabsList>
              <TabsContent value="manual" className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Preço base ({currency})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Custo (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="product" className="pt-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Pesquisar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                  {productLoading && <div className="p-3 text-sm text-muted-foreground">A carregar...</div>}
                  {!productLoading && products.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">Sem resultados.</div>
                  )}
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProduct(p)}
                      className={`w-full text-left p-2 hover:bg-muted text-sm flex justify-between ${
                        selectedProduct?.id === p.id ? "bg-muted" : ""
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">{fmt.format(Number(p.unit_price ?? 0))}</span>
                    </button>
                  ))}
                </div>
                {selectedProduct && (
                  <div className="text-xs text-muted-foreground">
                    Selecionado: <strong>{selectedProduct.name}</strong> ·{" "}
                    {fmt.format(Number(selectedProduct.unit_price ?? 0))}
                  </div>
                )}
                <div>
                  <Label className="text-xs">Custo (opcional, manual)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">PVP de revenda (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={resalePrice}
                onChange={(e) => setResalePrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Fonte do desconto</Label>
            <Select value={discountSource} onValueChange={(v) => setDiscountSource(v as DiscountSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tier">Automático por escalão de volume</SelectItem>
                <SelectItem value="partner">Por parceiro (contrato ativo)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            {discountSource === "manual" && (
              <div className="mt-3">
                <Label className="text-xs">Desconto (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualDiscount}
                  onChange={(e) => setManualDiscount(e.target.value)}
                />
              </div>
            )}

            {discountSource === "partner" && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Pesquisar parceiro..."
                    value={partnerSearch}
                    onChange={(e) => setPartnerSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                  {partners.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">Sem resultados.</div>
                  )}
                  {partners.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPartner(p)}
                      className={`w-full text-left p-2 hover:bg-muted text-sm ${
                        selectedPartner?.id === p.id ? "bg-muted" : ""
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                {selectedPartner && (
                  <div className="text-xs text-muted-foreground">
                    {partnerContract
                      ? `Contrato ativo · desconto ${fmtPct(Number(partnerContract.discount_pct ?? 0))}`
                      : "Sem contrato ativo (desconto 0%)"}
                  </div>
                )}
              </div>
            )}

            {discountSource === "tier" && (
              <div className="mt-3 text-xs text-muted-foreground">
                {tiers.filter((t) => t.is_active).length === 0
                  ? "Sem escalões ativos definidos."
                  : `Será aplicado o escalão com maior quantidade mínima ≤ ${qty}.`}
              </div>
            )}
          </div>
        </Card>

        {/* Results */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-lg">Resultados</h3>
          {!hasPrice ? (
            <EmptyState
              icon={<Calculator className="h-8 w-8" />}
              title="Sem preço"
              description="Escolhe um produto do catálogo ou introduz um preço base."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Preço base</span>
                <span className="font-medium">{fmt.format(basePrice)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Desconto aplicado</span>
                <Badge variant="secondary">{fmtPct(effectiveDiscount)}</Badge>
              </div>
              <div className="border-t pt-3 flex justify-between items-baseline">
                <span className="text-sm">Preço unitário ao parceiro</span>
                <span className="font-semibold text-lg">{fmt.format(unitToPartner)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm">Total ({qty} un.)</span>
                <span className="font-semibold text-lg text-primary">{fmt.format(totalToPartner)}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm text-muted-foreground">
                <span>Valor do desconto total</span>
                <span>{fmt.format(discountValueTotal)}</span>
              </div>

              {yourMargin !== null && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm">A tua margem</span>
                    <span className="font-semibold">{fmt.format(yourMargin)}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm text-muted-foreground">
                    <span>Margem sobre preço ao parceiro</span>
                    <span>{fmtPct(yourMarginPct ?? 0)}</span>
                  </div>
                </div>
              )}

              {validResale && (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm">Margem do parceiro (sobre PVP)</span>
                    <span className="font-semibold">{fmtPct(partnerMarginPct ?? 0)}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-sm text-muted-foreground">
                    <span>Valor da margem do parceiro ({qty} un.)</span>
                    <span>{fmt.format(partnerMarginValue ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Tiers management */}
      {canManage && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Escalões de volume</h3>
              <p className="text-sm text-muted-foreground">
                Aplicados automaticamente quando a fonte do desconto é "por escalão".
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addDraftTier}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
              <Button size="sm" onClick={saveTiers}>
                <Save className="h-4 w-4 mr-1" /> Guardar
              </Button>
            </div>
          </div>

          {tiersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : draftTiers.length === 0 ? (
            <EmptyState
              icon={<Calculator className="h-8 w-8" />}
              title="Sem escalões"
              description="Cria escalões com quantidade mínima e percentagem de desconto."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Quantidade mín.</th>
                    <th className="py-2 pr-3 font-medium">Desconto (%)</th>
                    <th className="py-2 pr-3 font-medium">Ativo</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {draftTiers.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="py-2 pr-3">
                        <Input
                          value={t.name ?? ""}
                          onChange={(e) => updateDraftTier(t.id, { name: e.target.value })}
                          placeholder="ex: Distribuidor"
                        />
                      </td>
                      <td className="py-2 pr-3 w-32">
                        <Input
                          type="number"
                          min="1"
                          value={t.min_quantity}
                          onChange={(e) =>
                            updateDraftTier(t.id, { min_quantity: parseInt(e.target.value, 10) || 1 })
                          }
                        />
                      </td>
                      <td className="py-2 pr-3 w-32">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={t.discount_pct}
                          onChange={(e) =>
                            updateDraftTier(t.id, { discount_pct: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="py-2 pr-3 w-20">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(v) => updateDraftTier(t.id, { is_active: v })}
                        />
                      </td>
                      <td className="py-2 pr-3 w-12">
                        <Button variant="ghost" size="icon" onClick={() => deleteTier(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}