import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Tags, Plus, Trash2, Pencil, Play, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type TagDef = Database["public"]["Tables"]["customer_tag_definitions"]["Row"];
type Rule = Database["public"]["Tables"]["customer_tag_upgrade_rules"]["Row"];

const METRICS: { v: Rule["metric"]; l: string }[] = [
  { v: "total_revenue", l: "Receita total (€)" },
  { v: "num_orders", l: "Nº de encomendas" },
  { v: "total_quantity", l: "Quantidade total" },
];
const PERIODS: { v: Rule["period"]; l: string }[] = [
  { v: "all_time", l: "Sempre" },
  { v: "last_12_months", l: "Últimos 12 meses" },
  { v: "this_year", l: "Este ano" },
];
const OPERATORS = [">=", ">", "=", "<", "<="] as const;

function buildTree(tags: TagDef[]) {
  const byParent = new Map<string | null, TagDef[]>();
  tags.forEach((t) => {
    const k = t.parent_id ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(t);
  });
  byParent.forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name, "pt")));
  return byParent;
}

function descendantIds(tags: TagDef[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of tags) {
      if (t.parent_id && out.has(t.parent_id) && !out.has(t.id)) {
        out.add(t.id);
        added = true;
      }
    }
  }
  return out;
}

export default function CustomerTags() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);

  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagDef | null>(null);
  const [tagForm, setTagForm] = useState({ name: "", color: "#64748b", parent_id: "" as string });

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    target_tag_id: "",
    metric: "total_revenue" as Rule["metric"],
    period: "all_time" as Rule["period"],
    operator: ">=" as string,
    threshold: "0",
    remove_tag_id: "" as string,
    is_active: true,
  });
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [{ data: td }, { data: rd }] = await Promise.all([
      supabase.from("customer_tag_definitions").select("*").eq("organization_id", activeOrg.id),
      supabase
        .from("customer_tag_upgrade_rules")
        .select("*")
        .eq("organization_id", activeOrg.id)
        .order("created_at", { ascending: false }),
    ]);
    setTags((td ?? []) as TagDef[]);
    setRules((rd ?? []) as Rule[]);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const tree = useMemo(() => buildTree(tags), [tags]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  if (!canManage) return <Navigate to="/app/dashboard" replace />;

  const openCreateTag = (parent_id = "") => {
    setEditingTag(null);
    setTagForm({ name: "", color: "#64748b", parent_id });
    setTagDialogOpen(true);
  };
  const openEditTag = (t: TagDef) => {
    setEditingTag(t);
    setTagForm({ name: t.name, color: t.color, parent_id: t.parent_id ?? "" });
    setTagDialogOpen(true);
  };

  const submitTag = async () => {
    if (!activeOrg) return;
    const name = tagForm.name.trim();
    if (!name) {
      toast({ title: "Indique um nome", variant: "destructive" });
      return;
    }
    // Anti-ciclo: não permitir pai = própria ou descendente
    if (editingTag && tagForm.parent_id) {
      const banned = descendantIds(tags, editingTag.id);
      if (banned.has(tagForm.parent_id)) {
        toast({ title: "Pai inválido", description: "Não pode ser a própria etiqueta ou um seu descendente.", variant: "destructive" });
        return;
      }
    }
    const payload = {
      organization_id: activeOrg.id,
      name,
      color: tagForm.color,
      parent_id: tagForm.parent_id || null,
    };
    const { error } = editingTag
      ? await supabase.from("customer_tag_definitions").update(payload).eq("id", editingTag.id)
      : await supabase.from("customer_tag_definitions").insert(payload);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingTag ? "Etiqueta atualizada" : "Etiqueta criada" });
    setTagDialogOpen(false);
    load();
  };

  const deleteTag = async (t: TagDef) => {
    if (!confirm(`Eliminar etiqueta "${t.name}"?`)) return;
    const { error } = await supabase.from("customer_tag_definitions").delete().eq("id", t.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({
      name: "",
      target_tag_id: tags[0]?.id ?? "",
      metric: "total_revenue",
      period: "all_time",
      operator: ">=",
      threshold: "1000",
      remove_tag_id: "",
      is_active: true,
    });
    setRuleDialogOpen(true);
  };
  const openEditRule = (r: Rule) => {
    setEditingRule(r);
    setRuleForm({
      name: r.name,
      target_tag_id: r.target_tag_id,
      metric: r.metric as Rule["metric"],
      period: r.period as Rule["period"],
      operator: r.operator,
      threshold: String(r.threshold),
      remove_tag_id: r.remove_tag_id ?? "",
      is_active: r.is_active,
    });
    setRuleDialogOpen(true);
  };

  const submitRule = async () => {
    if (!activeOrg) return;
    const name = ruleForm.name.trim();
    const threshold = Number(ruleForm.threshold);
    if (!name || !ruleForm.target_tag_id || Number.isNaN(threshold)) {
      toast({ title: "Preencha nome, etiqueta alvo e limiar", variant: "destructive" });
      return;
    }
    const payload = {
      organization_id: activeOrg.id,
      name,
      target_tag_id: ruleForm.target_tag_id,
      metric: ruleForm.metric,
      period: ruleForm.period,
      operator: ruleForm.operator,
      threshold,
      remove_tag_id: ruleForm.remove_tag_id || null,
      is_active: ruleForm.is_active,
    };
    const { error } = editingRule
      ? await supabase.from("customer_tag_upgrade_rules").update(payload).eq("id", editingRule.id)
      : await supabase.from("customer_tag_upgrade_rules").insert(payload);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingRule ? "Regra atualizada" : "Regra criada" });
    setRuleDialogOpen(false);
    load();
  };

  const deleteRule = async (r: Rule) => {
    if (!confirm(`Eliminar regra "${r.name}"?`)) return;
    const { error } = await supabase.from("customer_tag_upgrade_rules").delete().eq("id", r.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const applyNow = async () => {
    if (!activeOrg) return;
    setApplying(true);
    const { data, error } = await supabase.rpc("apply_tag_upgrade_rules", { _org_id: activeOrg.id });
    setApplying(false);
    if (error) {
      toast({ title: "Erro a aplicar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Regras aplicadas", description: `${data ?? 0} cliente(s) atualizado(s).` });
  };

  const renderTree = (parentId: string | null, depth: number): JSX.Element[] => {
    const children = tree.get(parentId) ?? [];
    return children.flatMap((t) => [
      <div
        key={t.id}
        className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/40"
        style={{ paddingLeft: 8 + depth * 20 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <Badge style={{ backgroundColor: t.color, color: "#fff" }}>{t.name}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => openCreateTag(t.id)} title="Adicionar sub-etiqueta">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEditTag(t)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => deleteTag(t)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>,
      ...renderTree(t.id, depth + 1),
    ]);
  };

  const tagPath = (id: string): string => {
    const path: string[] = [];
    let cur = tagById.get(id);
    let guard = 0;
    while (cur && guard++ < 20) {
      path.unshift(cur.name);
      cur = cur.parent_id ? tagById.get(cur.parent_id) : undefined;
    }
    return path.join(" / ");
  };

  // For tag dialog: parent options exclude self+descendants
  const parentOptions = (() => {
    if (!editingTag) return tags;
    const banned = descendantIds(tags, editingTag.id);
    return tags.filter((t) => !banned.has(t.id));
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Tags className="h-6 w-6" />}
        title="Etiquetas e regras de upgrade"
        description="Organize as etiquetas em hierarquia e crie regras para atribuir automaticamente etiquetas a clientes."
      />

      <Card className="p-5" data-tour="customer-tags-tree">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold">Árvore de etiquetas</h2>
            <p className="text-sm text-muted-foreground">Crie etiquetas-pai e sub-etiquetas.</p>
          </div>
          <Button onClick={() => openCreateTag("")}>
            <Plus className="h-4 w-4 mr-1" /> Nova etiqueta
          </Button>
        </div>
        <Separator className="mb-2" />
        {loading ? (
          <Skeleton className="h-32" />
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem etiquetas. Crie a primeira.</p>
        ) : (
          <div>{renderTree(null, 0)}</div>
        )}
      </Card>

      <Card className="p-5" data-tour="customer-tags-rules">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h2 className="font-semibold">Regras de upgrade</h2>
            <p className="text-sm text-muted-foreground">
              Atribui automaticamente uma etiqueta quando o cliente atinge a métrica definida.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={applyNow} disabled={applying || rules.length === 0}>
              <Play className="h-4 w-4 mr-1" /> {applying ? "A aplicar…" : "Aplicar regras agora"}
            </Button>
            <Button onClick={openCreateRule} disabled={tags.length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Nova regra
            </Button>
          </div>
        </div>
        <Separator className="mb-2" />
        {loading ? (
          <Skeleton className="h-24" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem regras configuradas.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded p-3 text-sm">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    {!r.is_active && <Badge variant="secondary">Inativa</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {METRICS.find((m) => m.v === r.metric)?.l} · {PERIODS.find((p) => p.v === r.period)?.l} ·{" "}
                    {r.operator} {Number(r.threshold).toLocaleString("pt-PT")} → atribui{" "}
                    <Badge
                      style={{
                        backgroundColor: tagById.get(r.target_tag_id)?.color ?? "#64748b",
                        color: "#fff",
                      }}
                    >
                      {tagPath(r.target_tag_id) || "—"}
                    </Badge>
                    {r.remove_tag_id && (
                      <>
                        {" "}
                        e remove{" "}
                        <Badge variant="outline">{tagPath(r.remove_tag_id) || "—"}</Badge>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEditRule(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRule(r)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tag dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={tagForm.name}
                onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                maxLength={60}
              />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <Label>Cor</Label>
                <input
                  type="color"
                  value={tagForm.color}
                  onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                  className="h-9 w-14 rounded border block"
                />
              </div>
              <div className="flex-1">
                <Label>Etiqueta-pai (opcional)</Label>
                <Select
                  value={tagForm.parent_id || "__none__"}
                  onValueChange={(v) => setTagForm({ ...tagForm, parent_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Nenhuma —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma —</SelectItem>
                    {parentOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {tagPath(t.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitTag}>{editingTag ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Etiqueta alvo</Label>
                <Select
                  value={ruleForm.target_tag_id}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, target_tag_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{tagPath(t.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Remover etiqueta (opcional)</Label>
                <Select
                  value={ruleForm.remove_tag_id || "__none__"}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, remove_tag_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma —</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{tagPath(t.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Métrica</Label>
                <Select
                  value={ruleForm.metric}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, metric: v as Rule["metric"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Período</Label>
                <Select
                  value={ruleForm.period}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, period: v as Rule["period"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operador</Label>
                <Select
                  value={ruleForm.operator}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, operator: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Limiar</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={ruleForm.threshold}
                  onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ruleForm.is_active}
                onCheckedChange={(v) => setRuleForm({ ...ruleForm, is_active: v })}
              />
              <Label>Regra ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRuleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submitRule}>{editingRule ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}