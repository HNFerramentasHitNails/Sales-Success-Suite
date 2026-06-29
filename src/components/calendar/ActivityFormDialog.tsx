import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Copy, Mail, Video } from "lucide-react";

type Option = { id: string; label: string };
type Member = { user_id: string; name: string };

interface Activity {
  id?: string;
  title?: string;
  type?: string;
  customer_id?: string | null;
  prospect_id?: string | null;
  assigned_to?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  notes?: string | null;
  meeting_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  initial?: Activity | null;
  defaultDate?: Date | null;
}

function toLocalInput(iso: string | null | undefined, dateOnly = false) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (dateOnly) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(defaultDate?: Date | null) {
  const d = defaultDate ? new Date(defaultDate) : new Date();
  if (defaultDate) {
    d.setHours(9, 0, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d.toISOString();
}

export default function ActivityFormDialog({ open, onOpenChange, onSaved, initial, defaultDate }: Props) {
  const { activeOrg } = useOrganization();
  const { user } = useAuth();

  const editing = !!initial?.id;
  const [title, setTitle] = useState("");
  const [type, setType] = useState("meeting");
  const [target, setTarget] = useState<"none" | "customer" | "prospect">("none");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setType(initial?.type ?? "meeting");
    const tgt: "none" | "customer" | "prospect" = initial?.customer_id
      ? "customer"
      : initial?.prospect_id
      ? "prospect"
      : "none";
    setTarget(tgt);
    setSelected(initial?.customer_id ?? initial?.prospect_id ?? null);
    setAllDay(!!initial?.all_day);
    const startIso = initial?.start_at ?? defaultStart(defaultDate);
    setStartAt(toLocalInput(startIso, !!initial?.all_day));
    setEndAt(initial?.end_at ? toLocalInput(initial.end_at, !!initial?.all_day) : "");
    setLocation(initial?.location ?? "");
    setNotes(initial?.notes ?? "");
    setAssignedTo(initial?.assigned_to ?? user?.id ?? "");
    setSearch("");
    setMeetingUrl(initial?.meeting_url ?? "");
    setRecipientEmail("");
  }, [open]);

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

  useEffect(() => {
    if (!activeOrg || target === "none") {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      const tbl = target === "customer" ? "customers" : "prospects";
      let q = supabase
        .from(tbl)
        .select("id, name, company_name")
        .eq("organization_id", activeOrg.id)
        .order("name")
        .limit(20);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data } = await q;
      setOptions(
        (data ?? []).map((r: any) => ({
          id: r.id,
          label: r.company_name ? `${r.name} · ${r.company_name}` : r.name,
        }))
      );
    }, 200);
    return () => clearTimeout(t);
  }, [search, target, activeOrg?.id]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === selected)?.label,
    [options, selected]
  );

  // Pré-preenche o email do destinatário com o email do cliente/prospect selecionado
  useEffect(() => {
    if (!activeOrg || target === "none" || !selected) return;
    (async () => {
      const tbl = target === "customer" ? "customers" : "prospects";
      const { data } = await supabase
        .from(tbl)
        .select("email")
        .eq("id", selected)
        .maybeSingle();
      const email = (data as any)?.email;
      if (email) {
        setRecipientEmail((prev) => (prev ? prev : email));
      }
    })();
  }, [selected, target, activeOrg?.id]);

  async function save() {
    if (!activeOrg || !user) return;
    if (!title.trim()) {
      toast({ title: "Indique um título", variant: "destructive" });
      return;
    }
    if (!startAt) {
      toast({ title: "Indique a data de início", variant: "destructive" });
      return;
    }
    setSaving(true);
    const startIso = allDay
      ? new Date(startAt + "T00:00:00").toISOString()
      : new Date(startAt).toISOString();
    const endIso = endAt
      ? allDay
        ? new Date(endAt + "T23:59:59").toISOString()
        : new Date(endAt).toISOString()
      : null;
    const payload: any = {
      organization_id: activeOrg.id,
      title: title.trim(),
      type,
      customer_id: target === "customer" ? selected : null,
      prospect_id: target === "prospect" ? selected : null,
      assigned_to: assignedTo || null,
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      location: location || null,
      notes: notes || null,
      meeting_url: meetingUrl.trim() || null,
    };
    let error;
    if (editing && initial?.id) {
      ({ error } = await supabase.from("activities").update(payload).eq("id", initial.id));
    } else {
      payload.created_by = user.id;
      ({ error } = await supabase.from("activities").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Atividade atualizada" : "Atividade criada" });
    onSaved();
    onOpenChange(false);
  }

  async function sendInvite() {
    if (!meetingUrl || !recipientEmail) return;
    setSendingEmail(true);
    try {
      const startIso = allDay
        ? new Date(startAt + "T00:00:00").toISOString()
        : new Date(startAt).toISOString();
      const endIso = endAt
        ? allDay
          ? new Date(endAt + "T23:59:59").toISOString()
          : new Date(endAt).toISOString()
        : null;
      const { data, error } = await supabase.functions.invoke("send-meeting-email", {
        body: {
          to: recipientEmail,
          recipient_name: selectedLabel ?? null,
          title: title.trim() || "Reunião",
          start_at: startIso,
          end_at: endIso,
          meeting_url: meetingUrl.trim(),
          location: location || null,
          notes: notes || null,
          org_name: activeOrg?.name,
        },
      });
      if (error || (data as any)?.ok === false) {
        const msg = (data as any)?.error ?? error?.message ?? "Falha ao enviar convite";
        toast({ title: "Erro ao enviar", description: msg, variant: "destructive" });
      } else {
        toast({ title: `Convite enviado para ${recipientEmail}` });
      }
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reunião com cliente" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Reunião</SelectItem>
                  <SelectItem value="call">Chamada</SelectItem>
                  <SelectItem value="task">Tarefa</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Escolher..." /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="all-day" checked={allDay} onCheckedChange={(v) => {
              setAllDay(v);
              // re-format existing values
              if (startAt) setStartAt(toLocalInput(new Date(startAt).toISOString(), v));
              if (endAt) setEndAt(toLocalInput(new Date(endAt).toISOString(), v));
            }} />
            <Label htmlFor="all-day">Dia inteiro</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fim (opcional)</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Local</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sala, morada, link..." />
          </div>

          {type === "meeting" && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Video className="h-4 w-4" /> Reunião online (Google Meet)
              </Label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    window.open("https://meet.google.com/new", "_blank", "noopener");
                    toast({
                      title: "Crie a reunião no separador aberto",
                      description: "Copie o link (meet.google.com/...) e cole aqui.",
                    });
                  }}
                >
                  Criar Google Meet
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!meetingUrl}
                  onClick={() => {
                    navigator.clipboard.writeText(meetingUrl);
                    toast({ title: "Link copiado" });
                  }}
                  aria-label="Copiar link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Abra o Google Meet, copie o link gerado e cole-o aqui. O link fica guardado na reunião.
              </p>

              <div className="space-y-1">
                <Label className="text-sm">Email do destinatário</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="cliente@exemplo.pt"
                />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={!meetingUrl || !recipientEmail || sendingEmail}
                onClick={sendInvite}
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendingEmail ? "A enviar..." : "Enviar convite por email"}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Ligar a (opcional)</Label>
            <Tabs value={target} onValueChange={(v) => { setTarget(v as any); setSelected(null); setSearch(""); }}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="none">Nenhum</TabsTrigger>
                <TabsTrigger value="customer">Cliente</TabsTrigger>
                <TabsTrigger value="prospect">Prospect</TabsTrigger>
              </TabsList>
              {target !== "none" && (
                <TabsContent value={target} className="mt-3 space-y-2">
                  <Input placeholder="Nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="max-h-32 overflow-y-auto rounded border">
                    {options.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
                    ) : (
                      options.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelected(o.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${selected === o.id ? "bg-muted font-medium" : ""}`}
                        >
                          {o.label}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedLabel && (
                    <div className="text-xs text-muted-foreground">Selecionado: {selectedLabel}</div>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </div>

          <div className="space-y-1">
            <Label>Nota</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "A guardar..." : editing ? "Guardar" : "Criar atividade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}