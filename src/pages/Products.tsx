import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2, Boxes } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import StockAdjustDialog from "@/components/products/StockAdjustDialog";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductType = Database["public"]["Enums"]["product_type"];

const TYPES: { v: ProductType; l: string }[] = [
  { v: "produto", l: "Produto" },
  { v: "servico", l: "Serviço" },
  { v: "outro", l: "Outro" },
];

const PAGE_SIZE = 25;

function fmtMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

function ProductDialog({
  open, onOpenChange, product, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [priceGroups, setPriceGroups] = useState<{ id: string; name: string }[]>([]);
  const [parentOptions, setParentOptions] = useState<{ id: string; name: string }[]>([]);
  const [kitComponents, setKitComponents] = useState<{ component_product_id: string; quantity: string }[]>([]);
  const [componentOptions, setComponentOptions] = useState<{ id: string; name: string }[]>([]);
  const [orgChannels, setOrgChannels] = useState<{ id: string; name: string }[]>([]);
  const [channelSel, setChannelSel] = useState<Record<string, { on: boolean; sku: string; price: string }>>({});
  const [form, setForm] = useState({
    name: "", sku: "", description: "", product_type: "produto" as ProductType,
    category: "", unit_price: "0", unit_cost: "0", tax_rate: "23", is_tax_exempt: false,
    tracks_stock: false, stock_quantity: "0", low_stock_threshold: "", is_active: true,
    price_group_id: "", parent_product_id: "", variant_label: "",
  });

  useEffect(() => {
    if (!open) return;
    if (activeOrg) {
      supabase.from("price_groups").select("id, name").eq("organization_id", activeOrg.id).order("sort_order").order("name")
        .then(({ data }) => setPriceGroups((data ?? []) as { id: string; name: string }[]));
      supabase.from("products").select("id, name").eq("organization_id", activeOrg.id).is("parent_product_id", null).order("name")
        .then(({ data }) => setParentOptions(((data ?? []) as { id: string; name: string }[]).filter((x) => x.id !== product?.id)));
      supabase.from("products").select("id, name").eq("organization_id", activeOrg.id).order("name")
        .then(({ data }) => setComponentOptions(((data ?? []) as { id: string; name: string }[]).filter((x) => x.id !== product?.id)));
      supabase.from("sales_channels").select("id, name").eq("organization_id", activeOrg.id).eq("is_active", true).order("name")
        .then(({ data }) => setOrgChannels((data ?? []) as { id: string; name: string }[]));
    }
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? "",
        description: product.description ?? "",
        product_type: product.product_type,
        category: product.category ?? "",
        unit_price: String(product.unit_price ?? 0),
        unit_cost: String((product as any).unit_cost ?? 0),
        tax_rate: String(product.tax_rate ?? 23),
        is_tax_exempt: product.is_tax_exempt,
        tracks_stock: product.tracks_stock,
        stock_quantity: String(product.stock_quantity ?? 0),
        low_stock_threshold: (product as any).low_stock_threshold != null ? String((product as any).low_stock_threshold) : "",
        is_active: product.is_active,
        price_group_id: (product as any).price_group_id ?? "",
        parent_product_id: (product as any).parent_product_id ?? "",
        variant_label: (product as any).variant_label ?? "",
      });
      supabase.from("product_components").select("component_product_id, quantity").eq("kit_product_id", product.id)
        .then(({ data }) => setKitComponents(((data ?? []) as any[]).map((c) => ({ component_product_id: c.component_product_id, quantity: String(c.quantity) }))));
      supabase.from("product_sales_channels").select("channel_id, channel_sku, channel_price").eq("product_id", product.id)
        .then(({ data }) => {
          const m: Record<string, { on: boolean; sku: string; price: string }> = {};
          ((data ?? []) as any[]).forEach((r) => { m[r.channel_id] = { on: true, sku: r.channel_sku ?? "", price: r.channel_price != null ? String(r.channel_price) : "" }; });
          setChannelSel(m);
        });
    } else {
      setForm({
        name: "", sku: "", description: "", product_type: "produto", category: "",
        unit_price: "0", unit_cost: "0", tax_rate: "23", is_tax_exempt: false,
        tracks_stock: false, stock_quantity: "0", low_stock_threshold: "", is_active: true,
        price_group_id: "", parent_product_id: "", variant_label: "",
      });
      setKitComponents([]);
      setChannelSel({});
    }
  }, [open, product, activeOrg]);

  const price = Number(form.unit_price) || 0;
  const cost = Number(form.unit_cost) || 0;
  const rate = form.is_tax_exempt ? 0 : (Number(form.tax_rate) || 0);
  const priceWithTax = price * (1 + rate / 100);

  const addComp = () => setKitComponents((p) => [...p, { component_product_id: "", quantity: "1" }]);
  const removeComp = (i: number) => setKitComponents((p) => p.filter((_, idx) => idx !== i));
  const updateComp = (i: number, k: "component_product_id" | "quantity", v: string) => setKitComponents((p) => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !user) return;
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setBusy(true);
    const payload = {
      organization_id: activeOrg.id,
      name: form.name.trim(),
      sku: form.sku.trim() ? form.sku.trim() : null,
      description: form.description.trim() || null,
      product_type: form.product_type,
      category: form.category.trim() || null,
      unit_price: Number(form.unit_price) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      tax_rate: form.is_tax_exempt ? 0 : (Number(form.tax_rate) || 0),
      is_tax_exempt: form.is_tax_exempt,
      currency: activeOrg.currency || "EUR",
      tracks_stock: form.tracks_stock,
      stock_quantity: form.tracks_stock ? (Number(form.stock_quantity) || 0) : 0,
      low_stock_threshold: form.tracks_stock && form.low_stock_threshold.trim() !== "" ? Number(form.low_stock_threshold) : null,
      is_active: form.is_active,
      price_group_id: form.price_group_id || null,
      parent_product_id: form.parent_product_id || null,
      variant_label: form.parent_product_id ? (form.variant_label.trim() || null) : null,
    } as any;
    let productId = product?.id as string | undefined;
    if (product) {
      const { error } = await supabase.from("products").update(payload).eq("id", product.id);
      if (error) {
        setBusy(false);
        const msg = error.message.includes("products_org_sku_unique") ? "Já existe um produto com este SKU." : error.message;
        toast({ title: "Erro", description: msg, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase.from("products").insert({ ...payload, created_by: user.id }).select("id").single();
      if (error) {
        setBusy(false);
        const msg = error.message.includes("products_org_sku_unique") ? "Já existe um produto com este SKU." : error.message;
        toast({ title: "Erro", description: msg, variant: "destructive" });
        return;
      }
      productId = (data as any).id;
    }
    if (productId) {
      const comps = kitComponents.filter((c) => c.component_product_id).map((c) => ({ component_product_id: c.component_product_id, quantity: Number(c.quantity) || 1 }));
      const { error: ce } = await supabase.rpc("set_kit_components" as any, { p_kit: productId, p_components: comps as any });
      if (ce) {
        setBusy(false);
        toast({ title: "Produto guardado, mas a composição falhou", description: ce.message, variant: "destructive" });
        onSaved();
        onOpenChange(false);
        return;
      }
      const channels = orgChannels.filter((ch) => channelSel[ch.id]?.on).map((ch) => ({ channel_id: ch.id, channel_sku: channelSel[ch.id].sku || null, channel_price: channelSel[ch.id].price === "" ? null : Number(channelSel[ch.id].price) }));
      const { error: che } = await supabase.rpc("set_product_channels" as any, { p_product: productId, p_channels: channels as any });
      if (che) {
        setBusy(false);
        toast({ title: "Produto guardado, mas os canais falharam", description: che.message, variant: "destructive" });
        onSaved();
        onOpenChange(false);
        return;
      }
    }
    setBusy(false);
    toast({ title: product ? "Produto atualizado" : "Produto criado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} maxLength={80} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v as ProductType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={100} />
            </div>
            <div className="md:col-span-2 border rounded p-3 space-y-3">
              <Label className="text-sm">Variante</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Variante de (produto principal)</Label>
                  <Select value={form.parent_product_id || "__none__"} onValueChange={(v) => setForm({ ...form, parent_product_id: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="— Nenhum (produto normal) —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nenhum (produto normal) —</SelectItem>
                      {parentOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.parent_product_id && (
                  <div>
                    <Label className="text-xs">Etiqueta da variante</Label>
                    <Input value={form.variant_label} onChange={(e) => setForm({ ...form, variant_label: e.target.value })} placeholder="ex.: Vermelho · M" maxLength={100} />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Variantes têm 1 nível: um produto principal não pode ser, ele próprio, uma variante.</p>
            </div>
            <div className="md:col-span-2 border rounded p-3 space-y-3">
              <Label className="text-sm">Composição (kit)</Label>
              <p className="text-[11px] text-muted-foreground">Se for um kit, define os componentes. Ao vender, o stock é abatido a cada componente (qtd componente × qtd da linha). Os componentes não podem ser, eles próprios, kits.</p>
              {kitComponents.map((c, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Componente</Label>
                    <Select value={c.component_product_id || "__none__"} onValueChange={(v) => updateComp(i, "component_product_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="— Selecionar —" /></SelectTrigger>
                      <SelectContent>
                        {componentOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" step="0.001" min="0" value={c.quantity} onChange={(e) => updateComp(i, "quantity", e.target.value)} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeComp(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addComp}><Plus className="h-4 w-4 mr-1" /> Adicionar componente</Button>
            </div>
            <div className="md:col-span-2 border rounded p-3 space-y-3">
              <Label className="text-sm">Canais de venda</Label>
              {orgChannels.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Ainda não há canais. Cria canais na página "Canais".</p>
              ) : orgChannels.map((ch) => {
                const s = channelSel[ch.id] ?? { on: false, sku: "", price: "" };
                return (
                  <div key={ch.id} className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={s.on} onCheckedChange={(v) => setChannelSel((m) => ({ ...m, [ch.id]: { ...s, on: !!v } }))} />
                      <span className="text-sm">{ch.name}</span>
                    </label>
                    {s.on && (
                      <div className="grid grid-cols-2 gap-2 pl-6">
                        <Input placeholder="SKU no canal (opcional)" value={s.sku} onChange={(e) => setChannelSel((m) => ({ ...m, [ch.id]: { ...s, sku: e.target.value } }))} maxLength={80} />
                        <Input type="number" step="0.01" min="0" placeholder="Preço no canal (ref.)" value={s.price} onChange={(e) => setChannelSel((m) => ({ ...m, [ch.id]: { ...s, price: e.target.value } }))} />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground">O preço por canal é apenas informativo; não é usado no cálculo das encomendas.</p>
            </div>
            <div className="md:col-span-2">
              <Label>Grupo de preço</Label>
              <Select value={form.price_group_id || "__none__"} onValueChange={(v) => setForm({ ...form, price_group_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="— Nenhum —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {priceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Preço sem IVA</Label>
              <Input type="number" step="0.01" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
            </div>
            <div>
              <Label>Custo unitário</Label>
              <Input type="number" step="0.01" min="0" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
            </div>
            <div>
              <Label>Taxa IVA (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" disabled={form.is_tax_exempt}
                value={form.is_tax_exempt ? "0" : form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="exempt" checked={form.is_tax_exempt} onCheckedChange={(v) => setForm({ ...form, is_tax_exempt: !!v })} />
              <Label htmlFor="exempt" className="font-normal cursor-pointer">Isento de IVA</Label>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Preço com IVA: <span className="font-semibold text-foreground">{fmtMoney(priceWithTax, activeOrg?.currency || "EUR")}</span></span>
              {cost > 0 && (
                <span>Margem bruta: <span className="font-semibold text-foreground">{fmtMoney(price - cost, activeOrg?.currency || "EUR")}</span>
                  {price > 0 && <> ({Math.round((price - cost) / price * 100)}%)</>}
                </span>
              )}
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <Checkbox id="stock" checked={form.tracks_stock} onCheckedChange={(v) => setForm({ ...form, tracks_stock: !!v })} />
              <Label htmlFor="stock" className="font-normal cursor-pointer">Controla stock</Label>
            </div>
            {form.tracks_stock && (
              <>
                <div>
                  <Label>Quantidade em stock</Label>
                  <Input type="number" step="0.001" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
                </div>
                <div>
                  <Label>Alerta de stock baixo (quantidade)</Label>
                  <Input type="number" step="0.001" min="0" value={form.low_stock_threshold} placeholder="opcional"
                    onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
                </div>
              </>
            )}

            <div className="md:col-span-2 flex items-center gap-2">
              <Checkbox id="active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
              <Label htmlFor="active" className="font-normal cursor-pointer">Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{product ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Products() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [rows, setRows] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; parent_product_id: string | null }[]>([]);
  const [kitIds, setKitIds] = useState<Set<string>>(new Set());
  const [channelCounts, setChannelCounts] = useState<Map<string, number>>(new Map());

  const loadAux = useCallback(async () => {
    if (!activeOrg) return;
    const { data: ap } = await supabase.from("products").select("id, name, parent_product_id").eq("organization_id", activeOrg.id);
    setAllProducts((ap ?? []) as { id: string; name: string; parent_product_id: string | null }[]);
    const { data: kc } = await supabase.from("product_components").select("kit_product_id").eq("organization_id", activeOrg.id);
    setKitIds(new Set(((kc ?? []) as any[]).map((r) => r.kit_product_id)));
    const { data: psc } = await supabase.from("product_sales_channels").select("product_id").eq("organization_id", activeOrg.id);
    const cc = new Map<string, number>();
    ((psc ?? []) as any[]).forEach((r) => cc.set(r.product_id, (cc.get(r.product_id) ?? 0) + 1));
    setChannelCounts(cc);
  }, [activeOrg]);

  const productName = useMemo(() => new Map(allProducts.map((p) => [p.id, p.name])), [allProducts]);
  const variantCounts = useMemo(() => {
    const m = new Map<string, number>();
    allProducts.forEach((p) => { if (p.parent_product_id) m.set(p.parent_product_id, (m.get(p.parent_product_id) ?? 0) + 1); });
    return m;
  }, [allProducts]);

  const loadCategories = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase
      .from("products").select("category")
      .eq("organization_id", activeOrg.id).not("category", "is", null);
    const set = new Set<string>();
    (data ?? []).forEach((r: { category: string | null }) => { if (r.category) set.add(r.category); });
    setCategories(Array.from(set).sort());
  }, [activeOrg]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    let q = supabase.from("products").select("*", { count: "exact" })
      .eq("organization_id", activeOrg.id).order("name");
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);
    }
    if (typeFilter !== "__all__") q = q.eq("product_type", typeFilter as ProductType);
    if (categoryFilter !== "__all__") q = q.eq("category", categoryFilter);
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count: c, error } = await q;
    setLoading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setRows((data ?? []) as Product[]);
    setCount(c ?? 0);
  }, [activeOrg, search, typeFilter, categoryFilter, page]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadAux(); }, [loadAux]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currency = activeOrg?.currency || "EUR";

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setDialogOpen(true); };

  const toggleActive = async (p: Product) => {
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const remove = async (p: Product) => {
    if (!confirm(`Eliminar o produto "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Produto eliminado" });
    load();
    loadCategories();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-3xl font-bold tracking-tight">Produtos</h1>
        {canWrite && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo produto</Button>}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Pesquisar por nome ou SKU…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço (s/ IVA)</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem produtos.</TableCell></TableRow>}
              {!loading && rows.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => canWrite && openEdit(p)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      {kitIds.has(p.id) && <Badge variant="secondary">Kit</Badge>}
                    </div>
                    {(p as any).parent_product_id ? (
                      <div className="text-xs text-muted-foreground">↳ Variante de {productName.get((p as any).parent_product_id) ?? "—"}{(p as any).variant_label ? ` · ${(p as any).variant_label}` : ""}</div>
                    ) : variantCounts.get(p.id) ? (
                      <div className="text-xs text-muted-foreground">{variantCounts.get(p.id)} variante(s)</div>
                    ) : null}
                    {channelCounts.get(p.id) ? (
                      <div className="text-xs text-muted-foreground">{channelCounts.get(p.id)} canal(is)</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.sku || "—"}</TableCell>
                  <TableCell>{TYPES.find((t) => t.v === p.product_type)?.l ?? p.product_type}</TableCell>
                  <TableCell>{p.category || "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoney(Number(p.unit_price), p.currency || currency)}</TableCell>
                  <TableCell className="text-right text-xs">{p.is_tax_exempt ? "Isento" : `${Number(p.tax_rate)}%`}</TableCell>
                  <TableCell className="text-right text-xs">
                    {p.tracks_stock ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums">{Number(p.stock_quantity)}</span>
                        {(() => {
                          const s = Number(p.stock_quantity);
                          const th = (p as any).low_stock_threshold;
                          if (s < 0) return <Badge variant="destructive">Em falta</Badge>;
                          if (th != null && s <= Number(th)) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Stock baixo</Badge>;
                          return <Badge variant="secondary">Em stock</Badge>;
                        })()}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="flex gap-1">
                    {canWrite && p.tracks_stock && (
                      <Button size="sm" variant="ghost" title="Ajustar stock"
                        onClick={() => { setStockProduct(p); setStockDialogOpen(true); }}>
                        <Boxes className="h-4 w-4" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                        {p.is_active ? "Desativar" : "Ativar"}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} {count === 1 ? "produto" : "produtos"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSaved={() => { load(); loadCategories(); loadAux(); }}
      />
      <StockAdjustDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        productId={stockProduct?.id ?? null}
        productName={stockProduct?.name ?? ""}
        currentStock={Number(stockProduct?.stock_quantity ?? 0)}
        onAdjusted={() => { load(); loadAux(); }}
      />
    </div>
  );
}