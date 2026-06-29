import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Partner = {
  id: string;
  name: string;
  type: "distributor" | "reseller" | "agent" | "other";
  status: "prospect" | "active" | "inactive" | "suspended";
  region: string | null;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  notes: string | null;
  customers?: { id: string; name: string } | null;
};

type Contract = {
  id: string;
  partner_id: string;
  title: string;
  status: "draft" | "active" | "expired" | "terminated";
  start_date: string | null;
  end_date: string | null;
  commission_pct: number | null;
  discount_pct: number | null;
  terms: string | null;
  document_url: string | null;
};

type Member = { user_id: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  distributor: "Distribuidor",
  reseller: "Revendedor",
  agent: "Agente",
  other: "Outro",
};
const STATUS_LABEL: Record<string, string> = {
  prospect: "Prospect",
  active: "Ativo",
  inactive: "Inativo",
  suspended: "Suspenso",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  prospect: "outline",
  active: "default",
  inactive: "secondary",
  suspended: "destructive",
};
const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  expired: "Expirado",
  terminated: "Terminado",
};
const CONTRACT_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  active: "default",
  expired: "secondary",
  terminated: "destructive",
};

function emptyPartner(): Partner {
  return {
    id: "",
    name: "",
    type: "reseller",
    status: "prospect",
    region: "",
    email: "",
    phone: "",
    vat_number: "",
    customer_id: null,
    assigned_to: null,
    notes: "",
  };
}

function emptyContract(partnerId: string): Contract {
  return {
    id: "",
    partner_id: partnerId,
    title: "",
    status: "draft",
    start_date: null,
    end_date: null,
    commission_pct: null,
    discount_pct: null,
    terms: "",
    document_url: "",
  };
}

/* ---------- Customer search (inline) ---------- */
function CustomerSearch({
  value,
  initialLabel,
  onChange,
}: {
  value: string | null;
  initialLabel?: string | null;
  onChange: (id: string | null, label: string | null) => void;
}) {
  const { activeOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [opts, setOpts] = useState<Array<{ id: string; label: string }>>([]);
  const [label, setLabel] = useState<string | null>(initialLabel ?? null);

  useEffect(() => {
    if (!activeOrg) return;
    const t = setTimeout(async () => {
      let q = supabase
        .from("customers")
        .select("id, name, company_name")
        .eq("organization_id", activeOrg.id)
        .order("name")
        .limit(15);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q;
      setOpts(
        (data ?? []).map((r: any) => ({
          id: r.id,
          label: r.company_name ? `${r.name} · ${r.company_name}` : r.name,
        }))
      );
    }, 200);
    return () => clearTimeout(t);
  }, [search, activeOrg?.id]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Pesquisar cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {value && label && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          Selecionado: {label}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(null, null);
              setLabel(null);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="max-h-32 overflow-y-auto rounded border">
        {opts.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">Sem resultados</div>
        ) : (
          opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id, o.label);
                setLabel(o.label);
              }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-muted ${
                value === o.id ? "bg-muted font-medium" : ""
              }`}
            >
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================ */
export default function DistributionPartners() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Partner[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [fStatus, setFStatus] = useState("__all__");
  const [fType, setFType] = useState("__all__");
  const [fRegion, setFRegion] = useState("");

  // partner dialog
  const [partnerDlg, setPartnerDlg] = useState(false);
  const [draft, setDraft] = useState<Partner>(emptyPartner());
  const [draftCustomerLabel, setDraftCustomerLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // detail dialog
  const [detail, setDetail] = useState<Partner | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractDlg, setContractDlg] = useState(false);
  const [contractDraft, setContractDraft] = useState<Contract | null>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("distribution_partners")
      .select(
        "id, name, type, status, region, email, phone, vat_number, customer_id, assigned_to, notes, customers(id, name)"
      )
      .eq("organization_id", activeOrg.id)
      .order("name");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((data ?? []) as any as Partner[]);
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeOrg) return;
    (async () => {
      const { data: oms } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", activeOrg.id)
        .eq("status", "active");
      const ids = (oms ?? []).map((m: any) => m.user_id);
      let profs: any[] = [];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        profs = data ?? [];
      }
      const pmap: Record<string, any> = Object.fromEntries(profs.map((p: any) => [p.id, p]));
      setMembers(
        (oms ?? []).map((m: any) => ({
          user_id: m.user_id,
          name: pmap[m.user_id]?.full_name || pmap[m.user_id]?.email || "—",
        }))
      );
    })();
  }, [activeOrg?.id]);

  const memberName = (uid: string | null) =>
    members.find((m) => m.user_id === uid)?.name ?? "—";

  const filtered = useMemo(() => {
    const region = fRegion.trim().toLowerCase();
    return items.filter(
      (p) =>
        (fStatus === "__all__" || p.status === fStatus) &&
        (fType === "__all__" || p.type === fType) &&
        (!region || (p.region ?? "").toLowerCase().includes(region))
    );
  }, [items, fStatus, fType, fRegion]);

  /* ---------- partner save/delete ---------- */
  const openCreate = () => {
    setDraft(emptyPartner());
    setDraftCustomerLabel(null);
    setPartnerDlg(true);
  };
  const openEdit = (p: Partner) => {
    setDraft({ ...p });
    setDraftCustomerLabel(p.customers?.name ?? null);
    setPartnerDlg(true);
  };

  const savePartner = async () => {
    if (!activeOrg) return;
    if (!draft.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload: any = {
      organization_id: activeOrg.id,
      name: draft.name.trim(),
      type: draft.type,
      status: draft.status,
      region: draft.region?.trim() || null,
      email: draft.email?.trim() || null,
      phone: draft.phone?.trim() || null,
      vat_number: draft.vat_number?.trim() || null,
      customer_id: draft.customer_id,
      assigned_to: draft.assigned_to,
      notes: draft.notes?.trim() || null,
    };
    const q = draft.id
      ? supabase.from("distribution_partners").update(payload).eq("id", draft.id)
      : supabase.from("distribution_partners").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: draft.id ? "Parceiro atualizado" : "Parceiro criado" });
    setPartnerDlg(false);
    load();
  };

  const deletePartner = async (p: Partner) => {
    if (!confirm(`Eliminar parceiro "${p.name}"? Os contratos associados também serão removidos.`))
      return;
    const { error } = await supabase.from("distribution_partners").delete().eq("id", p.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Parceiro eliminado" });
    load();
  };

  /* ---------- detail + contracts ---------- */
  const openDetail = async (p: Partner) => {
    setDetail(p);
    const { data } = await supabase
      .from("distribution_contracts")
      .select("id, partner_id, title, status, start_date, end_date, commission_pct, discount_pct, terms, document_url")
      .eq("partner_id", p.id)
      .order("created_at", { ascending: false });
    setContracts(
      ((data ?? []) as any[]).map((c) => ({
        ...c,
        commission_pct: c.commission_pct != null ? Number(c.commission_pct) : null,
        discount_pct: c.discount_pct != null ? Number(c.discount_pct) : null,
      })) as Contract[]
    );
  };

  const reloadContracts = async () => {
    if (!detail) return;
    const { data } = await supabase
      .from("distribution_contracts")
      .select("id, partner_id, title, status, start_date, end_date, commission_pct, discount_pct, terms, document_url")
      .eq("partner_id", detail.id)
      .order("created_at", { ascending: false });
    setContracts(
      ((data ?? []) as any[]).map((c) => ({
        ...c,
        commission_pct: c.commission_pct != null ? Number(c.commission_pct) : null,
        discount_pct: c.discount_pct != null ? Number(c.discount_pct) : null,
      })) as Contract[]
    );
  };

  const openContractCreate = () => {
    if (!detail) return;
    setContractDraft(emptyContract(detail.id));
    setContractDlg(true);
  };
  const openContractEdit = (c: Contract) => {
    setContractDraft({ ...c });
    setContractDlg(true);
  };

  const saveContract = async () => {
    if (!activeOrg || !contractDraft || !detail) return;
    if (!contractDraft.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload: any = {
      organization_id: activeOrg.id,
      partner_id: detail.id,
      title: contractDraft.title.trim(),
      status: contractDraft.status,
      start_date: contractDraft.start_date || null,
      end_date: contractDraft.end_date || null,
      commission_pct: contractDraft.commission_pct,
      discount_pct: contractDraft.discount_pct,
      terms: contractDraft.terms?.trim() || null,
      document_url: contractDraft.document_url?.trim() || null,
    };
    const q = contractDraft.id
      ? supabase.from("distribution_contracts").update(payload).eq("id", contractDraft.id)
      : supabase.from("distribution_contracts").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: contractDraft.id ? "Contrato atualizado" : "Contrato criado" });
    setContractDlg(false);
    reloadContracts();
  };

  const deleteContract = async (c: Contract) => {
    if (!confirm(`Eliminar contrato "${c.title}"?`)) return;
    const { error } = await supabase.from("distribution_contracts").delete().eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contrato eliminado" });
    reloadContracts();
  };

  /* ====================== UI ====================== */
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<Store className="h-6 w-6" />}
        title="Parceiros"
        description="Distribuidores, revendedores e agentes."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Novo parceiro
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px]">
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os estados</SelectItem>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1">
          <Input
            placeholder="Filtrar por região…"
            value={fRegion}
            onChange={(e) => setFRegion(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="Sem parceiros"
          description={canManage ? "Crie o primeiro parceiro para começar." : "Ainda não há parceiros."}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="p-4 space-y-2 cursor-pointer hover:border-primary/60 transition"
              onClick={() => openDetail(p)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_LABEL[p.type]}</div>
                </div>
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {p.region && <div>Região: {p.region}</div>}
                <div>Responsável: {memberName(p.assigned_to)}</div>
                {p.customers && <div>Cliente: {p.customers.name}</div>}
              </div>
              {canManage && (
                <div className="flex justify-end gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deletePartner(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ============ Partner form dialog ============ */}
      <Dialog open={partnerDlg} onOpenChange={setPartnerDlg}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar parceiro" : "Novo parceiro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={draft.type} onValueChange={(v: any) => setDraft({ ...draft, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={draft.status} onValueChange={(v: any) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Região</Label>
                <Input
                  value={draft.region ?? ""}
                  onChange={(e) => setDraft({ ...draft, region: e.target.value })}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>NIF</Label>
                <Input
                  value={draft.vat_number ?? ""}
                  onChange={(e) => setDraft({ ...draft, vat_number: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Cliente associado (opcional)</Label>
              <CustomerSearch
                value={draft.customer_id}
                initialLabel={draftCustomerLabel}
                onChange={(id, label) => {
                  setDraft({ ...draft, customer_id: id });
                  setDraftCustomerLabel(label);
                }}
              />
            </div>
            <div>
              <Label>Responsável</Label>
              <Select
                value={draft.assigned_to ?? "__none__"}
                onValueChange={(v) => setDraft({ ...draft, assigned_to: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPartnerDlg(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={savePartner} disabled={busy}>
              {busy ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Partner detail dialog ============ */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.name}
              {detail && (
                <Badge variant={STATUS_VARIANT[detail.status]}>
                  {STATUS_LABEL[detail.status]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Tipo" v={TYPE_LABEL[detail.type]} />
                <Info label="Região" v={detail.region} />
                <Info label="Email" v={detail.email} />
                <Info label="Telefone" v={detail.phone} />
                <Info label="NIF" v={detail.vat_number} />
                <Info label="Responsável" v={memberName(detail.assigned_to)} />
                <Info label="Cliente associado" v={detail.customers?.name ?? null} />
              </div>
              {detail.notes && (
                <div className="text-sm border rounded p-2 bg-muted/30 whitespace-pre-wrap">
                  {detail.notes}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Contratos ({contracts.length})
                  </h3>
                  {canManage && (
                    <Button size="sm" onClick={openContractCreate}>
                      <Plus className="h-4 w-4 mr-1" /> Novo contrato
                    </Button>
                  )}
                </div>
                {contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem contratos.</p>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((c) => (
                      <Card key={c.id} className="p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{c.title}</span>
                              <Badge variant={CONTRACT_STATUS_VARIANT[c.status]}>
                                {CONTRACT_STATUS_LABEL[c.status]}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                              {c.start_date && (
                                <span>
                                  Início: {new Date(c.start_date).toLocaleDateString("pt-PT")}
                                </span>
                              )}
                              {c.end_date && (
                                <span>
                                  Fim: {new Date(c.end_date).toLocaleDateString("pt-PT")}
                                </span>
                              )}
                              {c.commission_pct != null && <span>Comissão: {c.commission_pct}%</span>}
                              {c.discount_pct != null && <span>Desconto: {c.discount_pct}%</span>}
                            </div>
                            {c.document_url && (
                              <a
                                href={c.document_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline mt-1 inline-block"
                              >
                                Documento
                              </a>
                            )}
                          </div>
                          {canManage && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" onClick={() => openContractEdit(c)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => deleteContract(c)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Contract form dialog ============ */}
      <Dialog open={contractDlg} onOpenChange={setContractDlg}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contractDraft?.id ? "Editar contrato" : "Novo contrato"}</DialogTitle>
          </DialogHeader>
          {contractDraft && (
            <div className="space-y-3">
              <div>
                <Label>Título *</Label>
                <Input
                  value={contractDraft.title}
                  onChange={(e) => setContractDraft({ ...contractDraft, title: e.target.value })}
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Estado</Label>
                  <Select
                    value={contractDraft.status}
                    onValueChange={(v: any) => setContractDraft({ ...contractDraft, status: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONTRACT_STATUS_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Início</Label>
                  <Input
                    type="date"
                    value={contractDraft.start_date ?? ""}
                    onChange={(e) => setContractDraft({ ...contractDraft, start_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input
                    type="date"
                    value={contractDraft.end_date ?? ""}
                    onChange={(e) => setContractDraft({ ...contractDraft, end_date: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Comissão (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={contractDraft.commission_pct ?? ""}
                    onChange={(e) =>
                      setContractDraft({
                        ...contractDraft,
                        commission_pct: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Desconto (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={contractDraft.discount_pct ?? ""}
                    onChange={(e) =>
                      setContractDraft({
                        ...contractDraft,
                        discount_pct: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Condições</Label>
                <Textarea
                  rows={3}
                  value={contractDraft.terms ?? ""}
                  onChange={(e) => setContractDraft({ ...contractDraft, terms: e.target.value })}
                  maxLength={4000}
                />
              </div>
              <div>
                <Label>URL do documento</Label>
                <Input
                  value={contractDraft.document_url ?? ""}
                  onChange={(e) => setContractDraft({ ...contractDraft, document_url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContractDlg(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={saveContract} disabled={busy}>
              {busy ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, v }: { label: string; v: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{v || "—"}</div>
    </div>
  );
}