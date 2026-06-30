import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Users, Plus, Upload, Trash2, Search, RotateCcw, MessageCircle, ArrowUpRight, Loader2, BellOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["outreach_leads"]["Row"];

const COUNTRIES = [
  "Portugal", "Brasil", "Estados Unidos", "Espanha", "Reino Unido", "México", "Colômbia",
  "Peru", "Chile", "Equador", "Venezuela", "Costa Rica", "República Dominicana",
  "El Salvador", "Guatemala", "Honduras", "Nicarágua",
];

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo", contactado: "Contactado", respondeu: "Respondeu",
};
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  novo: "secondary", contactado: "outline", respondeu: "default",
};

const IMPORT_FIELDS = [
  { key: "name", label: "Nome *" },
  { key: "full_name", label: "Nome completo" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "company", label: "Empresa" },
  { key: "niche", label: "Nicho" },
  { key: "state", label: "Estado/Região" },
  { key: "city", label: "Cidade" },
] as const;

const emptyForm = {
  name: "", full_name: "", email: "", phone: "", company: "",
  country: "Portugal", state: "", city: "", niche: "", has_whatsapp: false,
  legal_basis: "consent",
};

const LEGAL_BASIS_OPTS = [
  { v: "consent", l: "Consentimento" },
  { v: "legitimate_interest", l: "Interesse legítimo" },
  { v: "pre_contractual", l: "Relação pré-contratual" },
] as const;

export default function Leads() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const isAdmin = role === "owner" || role === "admin";

  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [showTrash, setShowTrash] = useState(false);

  // novo lead
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  // import
  const [importOpen, setImportOpen] = useState(false);
  const [importCountry, setImportCountry] = useState("Portugal");
  const [importLegalBasis, setImportLegalBasis] = useState("legitimate_interest");
  const [importRows, setImportRows] = useState<Record<string, any>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    let q = supabase
      .from("outreach_leads")
      .select("*")
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false })
      .limit(500);
    q = showTrash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar leads", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as Lead[]);
    }
    setLoading(false);
  }, [activeOrg, showTrash]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (countryFilter !== "all" && r.country !== countryFilter) return false;
      if (!s) return true;
      return [r.name, r.email, r.company, r.niche, r.city]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(s));
    });
  }, [rows, search, statusFilter, countryFilter]);

  const kpis = useMemo(() => ({
    total: rows.length,
    whatsapp: rows.filter((r) => r.has_whatsapp).length,
    novo: rows.filter((r) => r.status === "novo").length,
    contactado: rows.filter((r) => r.status === "contactado").length,
    respondeu: rows.filter((r) => r.status === "respondeu").length,
  }), [rows]);

  const saveLead = async () => {
    if (!activeOrg) return;
    if (!form.name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (!form.email.trim() && !form.phone.trim()) {
      toast({ title: "Indica email ou telefone", variant: "destructive" }); return;
    }
    setBusy(true);
    const { error } = await supabase.from("outreach_leads").insert({
      organization_id: activeOrg.id,
      name: form.name.trim(),
      full_name: form.full_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      country: form.country || null,
      state: form.state.trim() || null,
      city: form.city.trim() || null,
      niche: form.niche.trim() || null,
      has_whatsapp: form.has_whatsapp,
      legal_basis: form.legal_basis,
      source: "manual",
    });
    setBusy(false);
    if (error) { toast({ title: "Erro ao criar lead", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lead criado" });
    setFormOpen(false);
    setForm({ ...emptyForm });
    load();
  };

  const softDelete = async (lead: Lead) => {
    const { error } = await supabase
      .from("outreach_leads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lead movido para a lixeira" });
    load();
  };

  const restore = async (lead: Lead) => {
    const { error } = await supabase
      .from("outreach_leads")
      .update({ deleted_at: null })
      .eq("id", lead.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lead restaurado" });
    load();
  };

  const promote = async (lead: Lead) => {
    const { data, error } = await supabase.rpc("promote_lead_to_prospect", { _lead_id: lead.id });
    if (error) { toast({ title: "Erro ao promover", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lead promovido a prospect", description: "Disponível no funil de vendas." });
    load();
    return data;
  };

  const optOut = async (lead: Lead) => {
    if (!window.confirm(`Marcar "${lead.name}" como não contactar? O email/telefone serão adicionados à lista de supressão.`)) return;
    const { error } = await supabase.rpc("outreach_lead_opt_out", { _lead_id: lead.id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lead marcado como não contactar" });
    load();
  };

  // ---- Import ----
  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        if (!data.length) { toast({ title: "Ficheiro vazio", variant: "destructive" }); return; }
        const headers = Object.keys(data[0]);
        setImportHeaders(headers);
        setImportRows(data);
        // auto-map por nome de cabeçalho aproximado
        const auto: Record<string, string> = {};
        for (const f of IMPORT_FIELDS) {
          const hit = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "").includes(f.key.replace("_", "")));
          if (hit) auto[f.key] = hit;
        }
        setMapping(auto);
      } catch (err: any) {
        toast({ title: "Erro a ler ficheiro", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  };

  const doImport = async () => {
    if (!activeOrg) return;
    if (!mapping.name) { toast({ title: "Mapeia pelo menos a coluna Nome", variant: "destructive" }); return; }
    setBusy(true);
    const payload = importRows.map((r) => {
      const get = (k: string) => (mapping[k] ? String(r[mapping[k]] ?? "").trim() : "");
      const name = get("name");
      const email = get("email");
      const phone = get("phone");
      if (!name || (!email && !phone)) return null;
      return {
        organization_id: activeOrg.id,
        name,
        full_name: get("full_name") || null,
        email: email || null,
        phone: phone || null,
        company: get("company") || null,
        niche: get("niche") || null,
        state: get("state") || null,
        city: get("city") || null,
        country: importCountry || null,
        legal_basis: importLegalBasis,
        source: "imported" as const,
      };
    }).filter(Boolean) as any[];

    if (!payload.length) { setBusy(false); toast({ title: "Nenhuma linha válida (precisa de nome + email/telefone)", variant: "destructive" }); return; }

    // inserir em lotes de 500
    let inserted = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error } = await supabase.from("outreach_leads").insert(chunk);
      if (error) { setBusy(false); toast({ title: "Erro na importação", description: error.message, variant: "destructive" }); return; }
      inserted += chunk.length;
    }
    setBusy(false);
    toast({ title: `${inserted} leads importados` });
    setImportOpen(false);
    setImportRows([]); setImportHeaders([]); setMapping({});
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Leads de prospeção (frios, importados e do marketplace)."
        icon={<Users className="h-6 w-6" />}
        actions={
          <>
            <Button variant={showTrash ? "default" : "outline"} onClick={() => setShowTrash((v) => !v)}>
              <Trash2 className="h-4 w-4 mr-2" /> {showTrash ? "Ver ativos" : "Lixeira"}
            </Button>
            {canWrite && !showTrash && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Importar
                </Button>
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Lead
                </Button>
              </>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: kpis.total },
          { label: "Com WhatsApp", value: kpis.whatsapp },
          { label: "Novo", value: kpis.novo },
          { label: "Contactado", value: kpis.contactado },
          { label: "Respondeu", value: kpis.respondeu },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* filtros */}
      <div className="flex flex-wrap gap-2 items-center" data-tour="leads-filters">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Procurar nome, email, empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="novo">Novo</SelectItem>
            <SelectItem value="contactado">Contactado</SelectItem>
            <SelectItem value="respondeu">Respondeu</SelectItem>
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="País" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os países</SelectItem>
            {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>WA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Sem leads.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}{r.prospect_id && <Badge variant="outline" className="ml-2">prospect</Badge>}</TableCell>
                  <TableCell className="text-sm">
                    {r.email && <div>{r.email}</div>}
                    {r.phone && <div className="text-muted-foreground">{r.phone}</div>}
                  </TableCell>
                  <TableCell>{r.company || "—"}</TableCell>
                  <TableCell>{r.niche || "—"}</TableCell>
                  <TableCell className="text-sm">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell>{r.has_whatsapp ? <MessageCircle className="h-4 w-4 text-green-600" /> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                      {(r as Lead & { opted_out?: boolean }).opted_out && (
                        <Badge variant="outline" className="gap-1 text-destructive border-destructive/40" title="Não contactar">
                          <BellOff className="h-3 w-3" /> Opt-out
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {showTrash ? (
                      isAdmin && <Button size="sm" variant="ghost" onClick={() => restore(r)}><RotateCcw className="h-4 w-4" /></Button>
                    ) : (
                      <>
                        {canWrite && !r.prospect_id && (
                          <Button size="sm" variant="ghost" title="Promover a prospect" onClick={() => promote(r)}>
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        )}
                        {canWrite && !(r as Lead & { opted_out?: boolean }).opted_out && (
                          <Button size="sm" variant="ghost" title="Marcar como não contactar (opt-out)" onClick={() => optOut(r)}>
                            <BellOff className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" title="Lixeira" onClick={() => softDelete(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Novo Lead */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5 col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>País</Label>
              <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+351…" />
            </div>
            <div className="grid gap-1.5">
              <Label>Estado/Região</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Nicho</Label>
              <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Restaurantes, Clínicas…" />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Checkbox id="wa" checked={form.has_whatsapp} onCheckedChange={(v) => setForm({ ...form, has_whatsapp: !!v })} />
              <Label htmlFor="wa">Tem WhatsApp</Label>
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Base legal (RGPD)</Label>
              <Select value={form.legal_basis} onValueChange={(v) => setForm({ ...form, legal_basis: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEGAL_BASIS_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Base legal para contactar este lead.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={saveLead} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Importar */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Importar Leads (CSV / Excel)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-1.5 max-w-xs flex-1 min-w-[180px]">
                <Label>País (formatação de telefones)</Label>
                <Select value={importCountry} onValueChange={setImportCountry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 max-w-xs flex-1 min-w-[180px]">
                <Label>Base legal (RGPD)</Label>
                <Select value={importLegalBasis} onValueChange={setImportLegalBasis}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEGAL_BASIS_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Ficheiro (cabeçalhos na 1ª linha)</Label>
              <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </div>
            {importHeaders.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Mapeamento de colunas ({importRows.length} linhas)</div>
                <div className="grid grid-cols-2 gap-2">
                  {IMPORT_FIELDS.map((f) => (
                    <div key={f.key} className="grid gap-1">
                      <Label className="text-xs">{f.label}</Label>
                      <Select value={mapping[f.key] ?? "none"} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— ignorar —</SelectItem>
                          {importHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={doImport} disabled={busy || importRows.length === 0}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
