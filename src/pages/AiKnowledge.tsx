import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { BookOpen, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Entry = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const CATEGORY_SUGGESTIONS = ["Empresa", "Produtos", "Processos", "FAQ", "Tom de voz"];

export default function AiKnowledge() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("Empresa");
  const [customCategory, setCustomCategory] = useState("");
  const [isActive, setIsActive] = useState(true);

  const load = async () => {
    if (!activeOrg?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_knowledge_entries")
      .select("*")
      .eq("organization_id", activeOrg.id)
      .order("category", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar entradas");
    else setEntries((data ?? []) as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  if (!canManage) return <Navigate to="/app/dashboard" replace />;

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setCategory("Empresa");
    setCustomCategory("");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (e: Entry) => {
    setEditing(e);
    setTitle(e.title);
    setContent(e.content);
    const cat = e.category ?? "";
    if (cat && !CATEGORY_SUGGESTIONS.includes(cat)) {
      setCategory("__custom__");
      setCustomCategory(cat);
    } else {
      setCategory(cat || "Empresa");
      setCustomCategory("");
    }
    setIsActive(e.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!activeOrg?.id) return;
    if (!title.trim() || !content.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }
    setSaving(true);
    const finalCategory =
      category === "__custom__" ? customCategory.trim() || null : category || null;
    const payload = {
      organization_id: activeOrg.id,
      title: title.trim(),
      content: content.trim(),
      category: finalCategory,
      is_active: isActive,
    };
    const { error } = editing
      ? await supabase.from("ai_knowledge_entries").update(payload).eq("id", editing.id)
      : await supabase.from("ai_knowledge_entries").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao guardar entrada");
      return;
    }
    toast.success(editing ? "Entrada atualizada" : "Entrada criada");
    setDialogOpen(false);
    load();
  };

  const handleToggleActive = async (e: Entry) => {
    const { error } = await supabase
      .from("ai_knowledge_entries")
      .update({ is_active: !e.is_active })
      .eq("id", e.id);
    if (error) {
      toast.error("Erro ao atualizar estado");
      return;
    }
    setEntries((prev) =>
      prev.map((x) => (x.id === e.id ? { ...x, is_active: !e.is_active } : x))
    );
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("ai_knowledge_entries")
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error("Erro ao eliminar entrada");
      return;
    }
    toast.success("Entrada eliminada");
    setDeleteId(null);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Base de Conhecimento"
        description="Adiciona contexto sobre a empresa, produtos e processos para os agentes de IA responderem com precisão."
        icon={<BookOpen className="h-6 w-6" />}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nova entrada
          </Button>
        }
      />

      <div data-tour="knowledge-list">
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="mb-1 font-medium text-foreground">Sem entradas ainda</p>
            <p className="text-sm">
              Adiciona conhecimento sobre a tua empresa e produtos para os agentes de IA
              responderem com precisão.
            </p>
            <Button onClick={openCreate} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar primeira entrada
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium truncate">{e.title}</h3>
                    {e.category && <Badge variant="secondary">{e.category}</Badge>}
                    {!e.is_active && <Badge variant="outline">Inativa</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                    {e.content}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 mr-2">
                    <Switch
                      checked={e.is_active}
                      onCheckedChange={() => handleToggleActive(e)}
                    />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteId(e.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar entrada" : "Nova entrada"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex.: Sobre a empresa"
              />
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Outra (personalizada)</SelectItem>
                </SelectContent>
              </Select>
              {category === "__custom__" && (
                <Input
                  className="mt-2"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Nome da categoria"
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Descreve aqui o conhecimento que queres que a IA use."
              />
              <p className="text-xs text-muted-foreground">
                Este conteúdo é injetado no prompt dos agentes para fundamentar as respostas.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="cursor-pointer" onClick={() => setIsActive((v) => !v)}>
                Ativa (incluir no contexto dos agentes)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. A entrada deixará de estar disponível para os
              agentes de IA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}