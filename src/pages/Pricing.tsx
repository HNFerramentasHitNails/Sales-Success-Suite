import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type PriceGroup = { id: string; name: string; code: string | null; sort_order: number };
type CustomerClass = { id: string; name: string; code: string | null; default_discount_percent: number; sort_order: number };
type MatrixCell = { price_group_id: string; customer_class_id: string; discount_percent: number };
type PromoCampaign = { id: string; name: string; start_date: string; end_date: string; is_active: boolean };
type PromoCell = { campaign_id: string; price_group_id: string; customer_class_id: string; discount_percent: number };
type UpgradeRule = { id: string; target_class_id: string; metric: "total_spent" | "orders_count"; threshold: number; is_active: boolean; sort_order: number };

export default function Pricing() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canEdit = isAdmin || role === "sales_director";

  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [classes, setClasses] = useState<CustomerClass[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({});

  const [groupDlg, setGroupDlg] = useState<{ open: boolean; row: PriceGroup | null }>({ open: false, row: null });
  const [classDlg, setClassDlg] = useState<{ open: boolean; row: CustomerClass | null }>({ open: false, row: null });

  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [campaignDlg, setCampaignDlg] = useState<{ open: boolean; row: PromoCampaign | null }>({ open: false, row: null });
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [promoCells, setPromoCells] = useState<Record<string, number>>({});

  const [upgradeRules, setUpgradeRules] = useState<UpgradeRule[]>([]);
  const [upgradeDlg, setUpgradeDlg] = useState<{ open: boolean; row: UpgradeRule | null }>({ open: false, row: null });

  const key = (g: string, c: string) => `${g}::${c}`;

  const load = async () => {
    if (!activeOrg) return;
    const [g, c, m] = await Promise.all([
      supabase.from("price_groups").select("*").eq("organization_id", activeOrg.id).order("sort_order").order("name"),
      supabase.from("customer_classes").select("*").eq("organization_id", activeOrg.id).order("sort_order").order("name"),
      supabase.from("discount_matrix").select("price_group_id, customer_class_id, discount_percent").eq("organization_id", activeOrg.id),
    ]);
    setGroups((g.data ?? []) as PriceGroup[]);
    setClasses((c.data ?? []) as CustomerClass[]);
    const map: Record<string, number> = {};
    ((m.data ?? []) as MatrixCell[]).forEach((r) => {
      map[key(r.price_group_id, r.customer_class_id)] = Number(r.discount_percent) || 0;
    });
    setMatrix(map);
    const cc = await supabase.from("promo_campaigns").select("*").eq("organization_id", activeOrg.id).order("start_date", { ascending: false });
    setCampaigns((cc.data ?? []) as PromoCampaign[]);
    const ur = await supabase.from("class_upgrade_rules").select("*").eq("organization_id", activeOrg.id).order("sort_order").order("threshold");
    setUpgradeRules((ur.data ?? []) as UpgradeRule[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [activeOrg?.id]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCampaignId) { setPromoCells({}); return; }
      const { data } = await supabase
        .from("promo_discount_cells")
        .select("campaign_id, price_group_id, customer_class_id, discount_percent")
        .eq("campaign_id", selectedCampaignId);
      if (!active) return;
      const map: Record<string, number> = {};
      ((data ?? []) as PromoCell[]).forEach((r) => {
        map[key(r.price_group_id, r.customer_class_id)] = Number(r.discount_percent) || 0;
      });
      setPromoCells(map);
    })();
    return () => { active = false; };
  }, [selectedCampaignId]);

  if (!activeOrg) return null;
  if (!canEdit) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Sem acesso. Esta página é apenas para administradores ou diretor comercial.</CardContent></Card>
      </div>
    );
  }

  const removeGroup = async (id: string) => {
    if (!confirm("Eliminar este grupo de preço? As células da matriz associadas também são removidas.")) return;
    const { error } = await supabase.from("price_groups").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Grupo eliminado");
    load();
  };
  const removeClass = async (id: string) => {
    if (!confirm("Eliminar esta classe de cliente? As células da matriz associadas também são removidas.")) return;
    const { error } = await supabase.from("customer_classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Classe eliminada");
    load();
  };

  const onCellBlur = async (g: string, c: string, raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const { error } = await supabase
      .from("discount_matrix")
      .upsert(
        { organization_id: activeOrg.id, price_group_id: g, customer_class_id: c, discount_percent: v },
        { onConflict: "organization_id,price_group_id,customer_class_id" },
      );
    if (error) return toast.error(error.message);
    setMatrix((m) => ({ ...m, [key(g, c)]: v }));
    toast.success("Guardado");
  };

  const removeCampaign = async (id: string) => {
    if (!confirm("Eliminar esta campanha? Os descontos promocionais associados também são removidos.")) return;
    const { error } = await supabase.from("promo_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selectedCampaignId === id) setSelectedCampaignId(null);
    toast.success("Campanha eliminada");
    load();
  };

  const onPromoCellBlur = async (g: string, c: string, raw: string) => {
    if (!selectedCampaignId) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const { error } = await supabase
      .from("promo_discount_cells")
      .upsert(
        { organization_id: activeOrg.id, campaign_id: selectedCampaignId, price_group_id: g, customer_class_id: c, discount_percent: v },
        { onConflict: "campaign_id,price_group_id,customer_class_id" },
      );
    if (error) return toast.error(error.message);
    setPromoCells((m) => ({ ...m, [key(g, c)]: v }));
    toast.success("Guardado");
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; }
  };
  const isCampaignLive = (c: PromoCampaign) => {
    const today = new Date().toISOString().slice(0, 10);
    return c.is_active && c.start_date <= today && today <= c.end_date;
  };

  const classNameById = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const removeUpgrade = async (id: string) => {
    if (!confirm("Eliminar esta regra de upgrade?")) return;
    const { error } = await supabase.from("class_upgrade_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Regra eliminada");
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Preços & Descontos</h1>
        <p className="text-sm text-muted-foreground">Define grupos de preço para produtos, classes de cliente e a matriz de descontos por combinação.</p>
      </div>

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups">Grupos de produto</TabsTrigger>
          <TabsTrigger value="classes">Classes de cliente</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de descontos</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="upgrades">Upgrades de classe</TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setGroupDlg({ open: true, row: null })}><Plus className="h-4 w-4 mr-1" />Novo grupo</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Código</TableHead><TableHead className="w-24">Ordem</TableHead><TableHead className="w-32 text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {groups.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sem grupos.</TableCell></TableRow>}
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>{g.name}</TableCell>
                    <TableCell className="text-muted-foreground">{g.code || "—"}</TableCell>
                    <TableCell>{g.sort_order}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setGroupDlg({ open: true, row: g })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeGroup(g.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="classes" className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setClassDlg({ open: true, row: null })}><Plus className="h-4 w-4 mr-1" />Nova classe</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Código</TableHead><TableHead className="w-40">Desconto base (%)</TableHead><TableHead className="w-24">Ordem</TableHead><TableHead className="w-32 text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {classes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sem classes.</TableCell></TableRow>}
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.code || "—"}</TableCell>
                    <TableCell>{Number(c.default_discount_percent || 0)}%</TableCell>
                    <TableCell>{c.sort_order}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setClassDlg({ open: true, row: c })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeClass(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="matrix">
          <Card>
            <CardHeader><CardTitle className="text-base">Desconto (%) por grupo de produto × classe de cliente</CardTitle></CardHeader>
            <CardContent>
              {groups.length === 0 || classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cria pelo menos um grupo de produto e uma classe de cliente para preencher a matriz.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-background border p-2 text-left text-muted-foreground">Grupo \ Classe</th>
                        {classes.map((c) => (
                          <th key={c.id} className="border p-2 text-left whitespace-nowrap">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g.id}>
                          <th className="sticky left-0 bg-background border p-2 text-left whitespace-nowrap font-medium">{g.name}</th>
                          {classes.map((c) => {
                            const v = matrix[key(g.id, c.id)] ?? "";
                            return (
                              <td key={c.id} className="border p-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  defaultValue={v === "" ? "" : String(v)}
                                  onBlur={(e) => onCellBlur(g.id, c.id, e.target.value)}
                                  className="h-8 w-24"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Durante a campanha ativa, aplica-se o maior desconto entre a tabela base e a promoção.</p>
            <Button onClick={() => setCampaignDlg({ open: true, row: null })}><Plus className="h-4 w-4 mr-1" />Nova campanha</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Período</TableHead><TableHead className="w-28">Estado</TableHead><TableHead className="w-40 text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {campaigns.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sem campanhas.</TableCell></TableRow>}
                {campaigns.map((c) => {
                  const live = isCampaignLive(c);
                  const selected = selectedCampaignId === c.id;
                  return (
                    <TableRow key={c.id} className={selected ? "bg-muted/40" : ""}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${live ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                          {live ? "Ativa" : "Inativa"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={selected ? "secondary" : "ghost"} onClick={() => setSelectedCampaignId(selected ? null : c.id)}>{selected ? "Fechar" : "Descontos"}</Button>
                        <Button size="icon" variant="ghost" onClick={() => setCampaignDlg({ open: true, row: c })}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => removeCampaign(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>

          {selectedCampaignId && (
            <Card>
              <CardHeader><CardTitle className="text-base">Descontos da campanha (%) por grupo de produto × classe de cliente</CardTitle></CardHeader>
              <CardContent>
                {groups.length === 0 || classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Cria pelo menos um grupo de produto e uma classe de cliente para preencher a grelha.</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="sticky left-0 bg-background border p-2 text-left text-muted-foreground">Grupo \ Classe</th>
                          {classes.map((c) => (
                            <th key={c.id} className="border p-2 text-left whitespace-nowrap">{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => (
                          <tr key={g.id}>
                            <th className="sticky left-0 bg-background border p-2 text-left whitespace-nowrap font-medium">{g.name}</th>
                            {classes.map((c) => {
                              const v = promoCells[key(g.id, c.id)] ?? "";
                              return (
                                <td key={c.id} className="border p-1">
                                  <Input
                                    key={`${selectedCampaignId}-${g.id}-${c.id}`}
                                    type="number"
                                    step="0.01"
                                    defaultValue={v === "" ? "" : String(v)}
                                    onBlur={(e) => onPromoCellBlur(g.id, c.id, e.target.value)}
                                    className="h-8 w-24"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upgrades" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">O cliente sobe automaticamente para a classe destino quando atinge o limiar. Só sobe (nunca desce).</p>
            <Button onClick={() => setUpgradeDlg({ open: true, row: null })}><Plus className="h-4 w-4 mr-1" />Nova regra</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Classe destino</TableHead>
                <TableHead>Critério</TableHead>
                <TableHead className="w-32">Limiar</TableHead>
                <TableHead className="w-24">Ativa</TableHead>
                <TableHead className="w-24">Ordem</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {upgradeRules.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Sem regras.</TableCell></TableRow>}
                {upgradeRules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{classNameById(r.target_class_id)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.metric === "total_spent" ? "Total gasto (€)" : "Nº encomendas"}</TableCell>
                    <TableCell>{r.metric === "total_spent"
                      ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(r.threshold) || 0)
                      : Math.trunc(Number(r.threshold) || 0)}</TableCell>
                    <TableCell>{r.is_active ? "Sim" : "Não"}</TableCell>
                    <TableCell>{r.sort_order}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setUpgradeDlg({ open: true, row: r })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeUpgrade(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <GroupDialog
        open={groupDlg.open}
        row={groupDlg.row}
        orgId={activeOrg.id}
        onOpenChange={(v) => setGroupDlg({ open: v, row: v ? groupDlg.row : null })}
        onSaved={load}
      />
      <ClassDialog
        open={classDlg.open}
        row={classDlg.row}
        orgId={activeOrg.id}
        onOpenChange={(v) => setClassDlg({ open: v, row: v ? classDlg.row : null })}
        onSaved={load}
      />
      <CampaignDialog
        open={campaignDlg.open}
        row={campaignDlg.row}
        orgId={activeOrg.id}
        onOpenChange={(v) => setCampaignDlg({ open: v, row: v ? campaignDlg.row : null })}
        onSaved={load}
      />
      <UpgradeRuleDialog
        open={upgradeDlg.open}
        row={upgradeDlg.row}
        orgId={activeOrg.id}
        classes={classes}
        onOpenChange={(v) => setUpgradeDlg({ open: v, row: v ? upgradeDlg.row : null })}
        onSaved={load}
      />
    </div>
  );
}

function GroupDialog({ open, row, orgId, onOpenChange, onSaved }: {
  open: boolean; row: PriceGroup | null; orgId: string;
  onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setSortOrder(String(row?.sort_order ?? 0));
  }, [open, row]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      code: code.trim() || null,
      sort_order: Number(sortOrder) || 0,
    };
    const { error } = row
      ? await supabase.from("price_groups").update(payload).eq("id", row.id)
      : await supabase.from("price_groups").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Grupo atualizado" : "Grupo criado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar grupo" : "Novo grupo de preço"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
          <div><Label>Código</Label><Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={50} /></div>
          <div><Label>Ordem</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{row ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpgradeRuleDialog({ open, row, orgId, classes, onOpenChange, onSaved }: {
  open: boolean; row: UpgradeRule | null; orgId: string; classes: CustomerClass[];
  onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [targetClassId, setTargetClassId] = useState("");
  const [metric, setMetric] = useState<"total_spent" | "orders_count">("total_spent");
  const [threshold, setThreshold] = useState("0");
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetClassId(row?.target_class_id ?? "");
    setMetric((row?.metric as "total_spent" | "orders_count") ?? "total_spent");
    setThreshold(String(row?.threshold ?? 0));
    setActive(row?.is_active ?? true);
    setSortOrder(String(row?.sort_order ?? 0));
  }, [open, row]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetClassId) return toast.error("Classe destino obrigatória");
    const t = Number(threshold);
    if (!Number.isFinite(t) || t <= 0) return toast.error("Limiar inválido");
    setBusy(true);
    const payload = {
      organization_id: orgId,
      target_class_id: targetClassId,
      metric,
      threshold: t,
      is_active: active,
      sort_order: Number(sortOrder) || 0,
    };
    const { error } = row
      ? await supabase.from("class_upgrade_rules").update(payload).eq("id", row.id)
      : await supabase.from("class_upgrade_rules").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Regra atualizada" : "Regra criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar regra" : "Nova regra de upgrade"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Classe destino *</Label>
            <Select value={targetClassId} onValueChange={setTargetClassId}>
              <SelectTrigger><SelectValue placeholder="Selecionar classe…" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({Number(c.default_discount_percent || 0)}%)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Critério *</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as "total_spent" | "orders_count")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total_spent">Total gasto (€)</SelectItem>
                  <SelectItem value="orders_count">Nº encomendas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Limiar *</Label>
              <Input type="number" step={metric === "total_spent" ? "0.01" : "1"} min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
            </div>
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <Label className="cursor-pointer">Ativa</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div><Label>Ordem</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{row ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({ open, row, orgId, onOpenChange, onSaved }: {
  open: boolean; row: PromoCampaign | null; orgId: string;
  onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setName(row?.name ?? "");
    setStartDate(row?.start_date ?? today);
    setEndDate(row?.end_date ?? today);
    setActive(row?.is_active ?? true);
  }, [open, row]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    if (!startDate || !endDate) return toast.error("Datas obrigatórias");
    if (endDate < startDate) return toast.error("Data fim antes da data início");
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      is_active: active,
    };
    const { error } = row
      ? await supabase.from("promo_campaigns").update(payload).eq("id", row.id)
      : await supabase.from("promo_campaigns").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Campanha atualizada" : "Campanha criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar campanha" : "Nova campanha"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data início *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
            <div><Label>Data fim *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label className="cursor-pointer">Ativa</Label>
              <p className="text-xs text-muted-foreground">Só campanhas ativas e dentro do período aplicam descontos.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{row ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClassDialog({ open, row, orgId, onOpenChange, onSaved }: {
  open: boolean; row: CustomerClass | null; orgId: string;
  onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [disc, setDisc] = useState("0");
  const [sortOrder, setSortOrder] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setDisc(String(row?.default_discount_percent ?? 0));
    setSortOrder(String(row?.sort_order ?? 0));
  }, [open, row]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const payload = {
      organization_id: orgId,
      name: name.trim(),
      code: code.trim() || null,
      default_discount_percent: Number(disc) || 0,
      sort_order: Number(sortOrder) || 0,
    };
    const { error } = row
      ? await supabase.from("customer_classes").update(payload).eq("id", row.id)
      : await supabase.from("customer_classes").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(row ? "Classe atualizada" : "Classe criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Editar classe" : "Nova classe de cliente"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
          <div><Label>Código</Label><Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={50} /></div>
          <div><Label>Desconto base (%)</Label><Input type="number" step="0.01" value={disc} onChange={(e) => setDisc(e.target.value)} /></div>
          <div><Label>Ordem</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{row ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}