import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Upload, Combine } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CustomerFormDialog, { MemberOption } from "@/components/customers/CustomerFormDialog";
import CustomerDetailDialog from "@/components/customers/CustomerDetailDialog";
import CustomerImportDialog from "@/components/customers/CustomerImportDialog";
import CustomerMergeDialog from "@/components/customers/CustomerMergeDialog";
import { Checkbox } from "@/components/ui/checkbox";
import CustomerBulkBar from "@/components/customers/CustomerBulkBar";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type TagDef = Database["public"]["Tables"]["customer_tag_definitions"]["Row"];

const PAGE_SIZE = 25;

export default function Customers() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [rows, setRows] = useState<Customer[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [memberFilter, setMemberFilter] = useState<string>("__all__");
  const [tagDefs, setTagDefs] = useState<TagDef[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [segmentColors, setSegmentColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadAux = useCallback(async () => {
    if (!activeOrg) return;
    const [t, m, sg] = await Promise.all([
      supabase.from("customer_tag_definitions").select("*").eq("organization_id", activeOrg.id).order("name"),
      supabase
        .from("organization_members")
        .select("id, user_id")
        .eq("organization_id", activeOrg.id)
        .eq("status", "active"),
      supabase.from("rfm_segments" as any).select("name, color").eq("organization_id", activeOrg.id),
    ]);
    setTagDefs((t.data ?? []) as TagDef[]);
    const cmap: Record<string, string> = {};
    (((sg.data ?? []) as unknown) as Array<{ name: string; color: string | null }>).forEach((s) => {
      if (s.name) cmap[s.name] = s.color || "#64748b";
    });
    setSegmentColors(cmap);
    const memberRows = (m.data ?? []) as Array<{ id: string; user_id: string }>;
    const userIds = memberRows.map((x) => x.user_id);
    let profs: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (userIds.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      profs = (p ?? []) as typeof profs;
    }
    const profMap = new Map(profs.map((p) => [p.id, p]));
    setMembers(memberRows.map((x) => {
      const p = profMap.get(x.user_id);
      return { id: x.id, label: p?.full_name || p?.email || "—" };
    }));
  }, [activeOrg]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    setSelectedIds(new Set());
    let q = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false });

    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,company_name.ilike.%${s}%`);
    }
    if (tagFilter !== "__all__") q = q.contains("tags", [tagFilter]);
    if (memberFilter !== "__all__") q = q.eq("assigned_member_id", memberFilter);

    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count: c, error } = await q;
    setLoading(false);
    if (error) {
      toast({ title: "Erro a carregar clientes", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data ?? []) as Customer[]);
    setCount(c ?? 0);
  }, [activeOrg, search, tagFilter, memberFilter, page]);

  useEffect(() => { loadAux(); }, [loadAux]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const memberLabel = useMemo(() => new Map(members.map((m) => [m.id, m.label])), [members]);

  const selectedCustomers = rows.filter((c) => selectedIds.has(c.id));
  const allOnPageSelected = rows.length > 0 && rows.every((c) => selectedIds.has(c.id));
  const colCount = canWrite ? 7 : 6;
  const toggleAll = (v: boolean) => setSelectedIds((prev) => { const n = new Set(prev); rows.forEach((c) => v ? n.add(c.id) : n.delete(c.id)); return n; });
  const toggleOne = (id: string, v: boolean) => setSelectedIds((prev) => { const n = new Set(prev); v ? n.add(id) : n.delete(id); return n; });

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openRow = (c: Customer) => { setSelected(c); setDetailOpen(true); };
  const editFromDetail = () => { setEditing(selected); setDetailOpen(false); setFormOpen(true); };

  const remove = async (c: Customer) => {
    if (!confirm(`Eliminar cliente "${c.name}"?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cliente eliminado" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Clientes</h1>
        {canWrite && (
          <div className="flex items-center gap-2">
            {(isAdmin || role === "sales_director") && (
              <Button variant="outline" onClick={() => setMergeOpen(true)}>
                <Combine className="h-4 w-4 mr-1" /> Fundir duplicados
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo cliente</Button>
          </div>
        )}
      </div>

      {canWrite && selectedIds.size > 0 && (
        <CustomerBulkBar
          selected={selectedCustomers}
          members={members}
          tagDefs={tagDefs}
          onDone={() => { setSelectedIds(new Set()); load(); }}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Pesquisar por nome, email ou empresa…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
            <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as etiquetas</SelectItem>
                {tagDefs.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={memberFilter} onValueChange={(v) => { setMemberFilter(v); setPage(0); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Comercial" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os comerciais</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                {canWrite && (
                  <TableHead className="w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={(v) => toggleAll(!!v)} aria-label="Selecionar todos" />
                  </TableHead>
                )}
                <TableHead>Nome</TableHead>
                <TableHead>Email / Telefone</TableHead>
                <TableHead className="hidden md:table-cell">Segmento</TableHead>
                <TableHead className="hidden lg:table-cell">Etiquetas</TableHead>
                <TableHead className="hidden md:table-cell">Comercial</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">Sem clientes.</TableCell></TableRow>
              )}
              {!loading && rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openRow(c)}>
                  {canWrite && (
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={(v) => toggleOne(c.id, !!v)} aria-label="Selecionar" />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    {c.name}
                    {c.company_name && <div className="text-xs text-muted-foreground">{c.company_name}</div>}
                  </TableCell>
                  <TableCell>
                    <div>{c.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.phone || ""}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {c.segment ? (
                      <Badge style={{ backgroundColor: segmentColors[c.segment] || "#64748b", color: "#fff" }}>
                        {c.segment}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).slice(0, 3).map((t) => {
                        const def = tagDefs.find((d) => d.name === t);
                        return (
                          <Badge key={t} style={def ? { backgroundColor: def.color, color: "#fff" } : undefined} variant={def ? "default" : "secondary"}>
                            {t}
                          </Badge>
                        );
                      })}
                      {(c.tags?.length ?? 0) > 3 && <span className="text-xs text-muted-foreground">+{(c.tags?.length ?? 0) - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{c.assigned_member_id ? memberLabel.get(c.assigned_member_id) ?? "—" : "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} {count === 1 ? "cliente" : "clientes"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        tagDefs={tagDefs}
        members={members}
        onSaved={load}
        onTagsChanged={loadAux}
      />
      <CustomerDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        customer={selected}
        members={members}
        tagDefs={tagDefs}
        onEdit={editFromDetail}
      />
      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => { load(); loadAux(); }}
      />
      <CustomerMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        onMerged={() => { load(); loadAux(); }}
      />
    </div>
  );
}