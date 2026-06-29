import React, { FormEvent, useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import type { MemberOption } from "./CustomerFormDialog";
import CustomerWalletTab from "./CustomerWalletTab";
import CustomerStatementTab from "./CustomerStatementTab";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Note = Database["public"]["Tables"]["customer_notes"]["Row"] & {
  author_label?: string | null;
};
type TagDef = Database["public"]["Tables"]["customer_tag_definitions"]["Row"];

const NOTE_TYPES = [
  { v: "nota", l: "Nota" },
  { v: "reuniao", l: "Reunião" },
  { v: "chamada", l: "Chamada" },
  { v: "outro", l: "Outro" },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  members: MemberOption[];
  tagDefs: TagDef[];
  onEdit: () => void;
};

export default function CustomerDetailDialog({ open, onOpenChange, customer, members, tagDefs, onEdit }: Props) {
  const { activeOrg, isAdmin, role } = useOrganization();
  const { user } = useAuth();
  const canWrite = role !== "read_only" && role !== null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState("nota");
  const [busy, setBusy] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!customer) return;
    const { data } = await supabase
      .from("customer_notes")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    const raw = (data ?? []) as Database["public"]["Tables"]["customer_notes"]["Row"][];
    const userIds = Array.from(new Set(raw.map((n) => n.created_by).filter((x): x is string => !!x)));
    let profs: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (userIds.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      profs = (p ?? []) as typeof profs;
    }
    const m = new Map(profs.map((p) => [p.id, p.full_name || p.email || "—"]));
    setNotes(raw.map((n) => ({ ...n, author_label: n.created_by ? m.get(n.created_by) ?? "—" : "—" })));
  }, [customer]);

  useEffect(() => { if (open) loadNotes(); }, [open, loadNotes]);

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!customer || !activeOrg || !user || !content.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("customer_notes").insert({
      organization_id: activeOrg.id,
      customer_id: customer.id,
      content: content.trim(),
      note_type: noteType,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setContent("");
    loadNotes();
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from("customer_notes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    loadNotes();
  };

  if (!customer) return null;
  const assigned = members.find((m) => m.id === customer.assigned_member_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="conta">Conta</TabsTrigger>
            <TabsTrigger value="notas">Notas ({notes.length})</TabsTrigger>
            <TabsTrigger value="carteira">Carteira</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-3">
            <CustomerMetricsBlock customer={customer} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Email" v={customer.email} />
              <Info label="Telefone" v={customer.phone} />
              <Info label="Empresa" v={customer.company_name} />
              <Info
                label="NIF"
                v={customer.vat_number}
                extra={
                  customer.vat_validated_at ? (
                    <Badge
                      variant={customer.vat_valid ? "default" : "secondary"}
                      className="mt-1"
                    >
                      {customer.vat_valid ? "NIF validado" : "NIF não validado"} ·{" "}
                      {new Date(customer.vat_validated_at).toLocaleDateString("pt-PT")}
                      {customer.vat_validated_name ? ` · ${customer.vat_validated_name}` : ""}
                    </Badge>
                  ) : null
                }
              />
              <Info label="Tipo" v={customer.customer_type} />
              <Info label="Segmento" v={customer.segment} />
              <Info label="Comercial" v={assigned?.label ?? "—"} />
              <Info label="País" v={customer.country} />
              <Info label="Morada" v={[customer.address, customer.postal_code, customer.city].filter(Boolean).join(", ") || null} />
              <Info label="Estado" v={customer.is_active ? "Ativo" : "Inativo"} />
            </div>
            {customer.notes_short && (
              <div className="text-sm border rounded p-2 bg-muted/30">{customer.notes_short}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {customer.tags?.map((t) => {
                const def = tagDefs.find((d) => d.name === t);
                return (
                  <Badge key={t} style={def ? { backgroundColor: def.color, color: "#fff" } : undefined} variant={def ? "default" : "secondary"}>
                    {t}
                  </Badge>
                );
              })}
            </div>
            {canWrite && (
              <div className="pt-2">
                <Button variant="outline" onClick={onEdit}>Editar</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="notas" className="space-y-3">
            {canWrite && (
              <form onSubmit={addNote} className="space-y-2 border rounded p-3">
                <div className="flex gap-2">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva uma nota…" rows={3} maxLength={2000} />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy || !content.trim()}>Adicionar nota</Button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">Sem notas.</p>}
              {notes.map((n) => {
                const canDel = isAdmin || n.created_by === user?.id;
                return (
                  <div key={n.id} className="border rounded p-3 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-2">{NOTE_TYPES.find((t) => t.v === n.note_type)?.l ?? n.note_type}</Badge>
                        {new Date(n.created_at).toLocaleString("pt-PT")} · {n.author_label ?? "—"}
                      </div>
                      {canDel && (
                        <Button size="sm" variant="ghost" onClick={() => deleteNote(n.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{n.content}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="carteira">
            <CustomerWalletTab customerId={customer.id} />
          </TabsContent>

          <TabsContent value="conta">
            <CustomerStatementTab customerId={customer.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, v, extra }: { label: string; v: string | null | undefined; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{v || "—"}</div>
      {extra}
    </div>
  );
}

function fmtEur(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n));
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-PT");
}

function CustomerMetricsBlock({ customer }: { customer: Customer }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nextDate = customer.next_purchase_expected_at ? new Date(customer.next_purchase_expected_at) : null;
  const overdue = nextDate ? nextDate.getTime() < today.getTime() : false;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm border rounded p-3 bg-muted/20">
      <Metric label="Total gasto (S/IVA)" value={fmtEur(customer.total_spent)} />
      <Metric label="Nº de compras" value={String(customer.orders_count ?? 0)} />
      <Metric
        label="Última compra"
        value={
          customer.last_purchase_at
            ? `${fmtDate(customer.last_purchase_at)}${customer.last_purchase_value != null ? ` · ${fmtEur(customer.last_purchase_value)}` : ""}`
            : "—"
        }
      />
      <Metric
        label="Recorrência média"
        value={customer.avg_recurrence_days ? `${customer.avg_recurrence_days} dias` : "—"}
      />
      <Metric
        label="Próxima compra esperada"
        value={fmtDate(customer.next_purchase_expected_at)}
        extra={overdue ? <Badge variant="destructive" className="mt-1">Em atraso</Badge> : null}
      />
      <Metric
        label="Último contacto"
        value={fmtDateTime(customer.last_contact_at)}
        extra={customer.last_contact_outcome ? <div className="text-xs text-muted-foreground mt-1 truncate" title={customer.last_contact_outcome}>{customer.last_contact_outcome}</div> : null}
      />
    </div>
  );
}

function Metric({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {extra}
    </div>
  );
}