import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Send, Plus, Loader2, Play, Pause, Zap, ChevronRight, ChevronLeft, Mail, Trash2, CheckCircle2,
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

type Campaign = Database["public"]["Tables"]["outreach_campaigns"]["Row"];
type Template = Database["public"]["Tables"]["outreach_templates"]["Row"];

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", scheduled: "Agendada", running: "A correr", paused: "Pausada",
  waiting_for_quota: "Aguarda quota", completed: "Concluída",
};
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  draft: "secondary", scheduled: "outline", running: "default", paused: "destructive",
  waiting_for_quota: "outline", completed: "secondary",
};

const COUNTRIES = ["Portugal", "Brasil", "Estados Unidos", "Espanha", "Reino Unido", "México", "Colômbia", "Peru", "Chile", "Equador", "Venezuela", "Costa Rica", "República Dominicana", "El Salvador", "Guatemala", "Honduras", "Nicarágua"];

type Step = { channel: "email"; template_id: string; delay_hours: number };

export default function Campaigns() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;

  const [rows, setRows] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [emailTemplateIds, setEmailTemplateIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // wizard
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [filters, setFilters] = useState({ status: "all", niche: "", country: "all", has_whatsapp: false });
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [steps, setSteps] = useState<Step[]>([{ channel: "email", template_id: "", delay_hours: 0 }]);
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [{ data: camps }, { data: tpls }, { data: vars }] = await Promise.all([
      supabase.from("outreach_campaigns").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false }),
      supabase.from("outreach_templates").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false }),
      supabase.from("outreach_template_variations").select("template_id, channel").eq("organization_id", activeOrg.id).eq("channel", "email"),
    ]);
    setRows((camps ?? []) as Campaign[]);
    setTemplates((tpls ?? []) as Template[]);
    setEmailTemplateIds(new Set((vars ?? []).map((v: any) => v.template_id)));
    // contagem de targets por campanha
    const ids = (camps ?? []).map((c: any) => c.id);
    if (ids.length) {
      const { data: tgts } = await supabase.from("outreach_campaign_targets").select("campaign_id").in("campaign_id", ids);
      const m: Record<string, number> = {};
      for (const t of (tgts ?? []) as any[]) m[t.campaign_id] = (m[t.campaign_id] ?? 0) + 1;
      setCounts(m);
    } else setCounts({});
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const emailTemplates = useMemo(() => templates.filter((t) => emailTemplateIds.has(t.id)), [templates, emailTemplateIds]);

  const buildLeadQuery = useCallback(() => {
    let q = supabase.from("outreach_leads").select("id", { count: "exact" }).eq("organization_id", activeOrg!.id).is("deleted_at", null);
    if (filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.country !== "all") q = q.eq("country", filters.country);
    if (filters.niche.trim()) q = q.ilike("niche", `%${filters.niche.trim()}%`);
    if (filters.has_whatsapp) q = q.eq("has_whatsapp", true);
    return q;
  }, [activeOrg, filters]);

  const refreshCount = useCallback(async () => {
    if (!activeOrg) return;
    const { count } = await buildLeadQuery();
    setAudienceCount(count ?? 0);
  }, [activeOrg, buildLeadQuery]);

  useEffect(() => { if (open && step === 2) refreshCount(); }, [open, step, refreshCount]);

  const openWizard = () => {
    setStep(1); setName(""); setFilters({ status: "all", niche: "", country: "all", has_whatsapp: false });
    setAudienceCount(null); setSteps([{ channel: "email", template_id: "", delay_hours: 0 }]);
    setScheduleMode("immediate"); setScheduledAt(""); setOpen(true);
  };

  const canNext = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return (audienceCount ?? 0) > 0;
    if (step === 3) return steps.length > 0 && steps.every((s) => s.template_id);
    if (step === 4) return scheduleMode === "immediate" || !!scheduledAt;
    return true;
  };

  const launch = async (asDraft = false) => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      const when = scheduleMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();
      const status = asDraft ? "draft" : scheduleMode === "scheduled" ? "scheduled" : "running";
      const { data: camp, error } = await supabase.from("outreach_campaigns").insert({
        organization_id: activeOrg.id, name: name.trim(), channels: ["email"],
        status, audience_filter: filters, steps, schedule_mode: scheduleMode,
        scheduled_at: scheduleMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }).select("id").single();
      if (error || !camp) throw error;

      if (!asDraft) {
        // resolver audiência e criar targets
        const { data: leads } = await buildLeadQuery().limit(5000);
        const targets = (leads ?? []).map((l: any) => ({
          organization_id: activeOrg.id, campaign_id: camp.id, lead_id: l.id,
          status: "pending", current_step: 0, next_action_at: when,
        }));
        for (let i = 0; i < targets.length; i += 500) {
          const { error: tErr } = await supabase.from("outreach_campaign_targets").insert(targets.slice(i, i + 500));
          if (tErr) throw tErr;
        }
        toast({ title: `Campanha criada com ${targets.length} leads` });
        if (scheduleMode === "immediate") {
          // processar já
          await supabase.functions.invoke("outreach-dispatch-worker", { body: { organization_id: activeOrg.id } });
          toast({ title: "Disparo iniciado" });
        }
      } else {
        toast({ title: "Rascunho guardado" });
      }
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao criar campanha", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (c: Campaign, status: string) => {
    setBusyId(c.id);
    const { error } = await supabase.from("outreach_campaigns").update({ status }).eq("id", c.id);
    setBusyId(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const processNow = async (c: Campaign) => {
    if (!activeOrg) return;
    setBusyId(c.id);
    const { data, error } = await supabase.functions.invoke("outreach-dispatch-worker", { body: { organization_id: activeOrg.id } });
    setBusyId(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const res = data as { sent?: number };
    toast({ title: `Processado`, description: `${res?.sent ?? 0} mensagens enviadas` });
    load();
  };

  const kpis = useMemo(() => ({
    total: rows.length,
    running: rows.filter((r) => r.status === "running").length,
    scheduled: rows.filter((r) => r.status === "scheduled").length,
    targets: Object.values(counts).reduce((a, b) => a + b, 0),
  }), [rows, counts]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        description="Campanhas de outreach por email com sequências e A/B."
        icon={<Send className="h-6 w-6" />}
        actions={canWrite && <Button onClick={openWizard}><Plus className="h-4 w-4 mr-2" /> Nova Campanha</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: kpis.total },
          { label: "A correr", value: kpis.running },
          { label: "Agendadas", value: kpis.scheduled },
          { label: "Leads em campanha", value: kpis.targets },
        ].map((k) => (
          <Card key={k.label}><CardContent className="p-4"><div className="text-2xl font-bold">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Canais</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Passos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Sem campanhas.</TableCell></TableRow>
              ) : rows.map((c) => {
                const stepCount = Array.isArray(c.steps) ? (c.steps as any[]).length : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{(c.channels ?? []).map((ch) => <Badge key={ch} variant="secondary" className="mr-1">{ch}</Badge>)}</TableCell>
                    <TableCell>{counts[c.id] ?? 0}</TableCell>
                    <TableCell>{stepCount}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {canWrite && (
                        <>
                          {(c.status === "paused" || c.status === "scheduled" || c.status === "waiting_for_quota") && (
                            <Button size="sm" variant="ghost" title="Retomar" disabled={busyId === c.id} onClick={() => setStatus(c, "running")}><Play className="h-4 w-4" /></Button>
                          )}
                          {c.status === "running" && (
                            <Button size="sm" variant="ghost" title="Pausar" disabled={busyId === c.id} onClick={() => setStatus(c, "paused")}><Pause className="h-4 w-4" /></Button>
                          )}
                          {(c.status === "running" || c.status === "scheduled") && (
                            <Button size="sm" variant="ghost" title="Processar agora" disabled={busyId === c.id} onClick={() => processNow(c)}><Zap className="h-4 w-4" /></Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Wizard */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Campanha — Passo {step}/5</DialogTitle>
          </DialogHeader>

          {/* indicador de passos */}
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded ${s <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label>Nome da campanha *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Restaurantes Lisboa — Q3" />
              </div>
              <div className="grid gap-1.5">
                <Label>Canais</Label>
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5"><Checkbox checked disabled /> <Mail className="h-4 w-4" /> Email</label>
                  <span className="text-muted-foreground self-center">SMS e WhatsApp — em breve</span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Segmenta os leads que vão entrar na campanha.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="contactado">Contactado</SelectItem>
                      <SelectItem value="respondeu">Respondeu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>País</Label>
                  <Select value={filters.country} onValueChange={(v) => setFilters({ ...filters, country: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Nicho contém</Label>
                  <Input value={filters.niche} onChange={(e) => setFilters({ ...filters, niche: e.target.value })} placeholder="Restaurantes…" />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <Checkbox id="wa2" checked={filters.has_whatsapp} onCheckedChange={(v) => setFilters({ ...filters, has_whatsapp: !!v })} />
                  <Label htmlFor="wa2">Só com WhatsApp</Label>
                </div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                {audienceCount === null ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <><strong>{audienceCount}</strong> leads correspondem a este filtro.</>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Define a sequência. O 1º passo dispara de imediato; os seguintes após o atraso indicado.</p>
              {emailTemplates.length === 0 && (
                <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm">Não há templates de email. Cria um em Templates primeiro.</div>
              )}
              {steps.map((s, i) => (
                <div key={i} className="border rounded-md p-3 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-1 text-sm font-semibold pt-6">#{i + 1}</div>
                  <div className="col-span-6 grid gap-1.5">
                    <Label className="text-xs">Template (email)</Label>
                    <Select value={s.template_id} onValueChange={(v) => setSteps(steps.map((x, j) => j === i ? { ...x, template_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                      <SelectContent>{emailTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 grid gap-1.5">
                    <Label className="text-xs">Atraso (horas)</Label>
                    <Input type="number" min={0} value={s.delay_hours} disabled={i === 0}
                      onChange={(e) => setSteps(steps.map((x, j) => j === i ? { ...x, delay_hours: Math.max(0, Number(e.target.value)) } : x))} />
                  </div>
                  <div className="col-span-2">
                    {steps.length > 1 && <Button size="sm" variant="ghost" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setSteps([...steps, { channel: "email", template_id: "", delay_hours: 24 }])}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar passo
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <Label>Quando disparar?</Label>
              <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as any)}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Imediatamente</SelectItem>
                  <SelectItem value="scheduled">Agendar</SelectItem>
                </SelectContent>
              </Select>
              {scheduleMode === "scheduled" && (
                <div className="grid gap-1.5 max-w-xs">
                  <Label>Data/hora</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2 text-sm">
              <div className="font-semibold text-base">Revisão</div>
              <div className="rounded-md border p-3 space-y-1">
                <div><span className="text-muted-foreground">Nome:</span> {name}</div>
                <div><span className="text-muted-foreground">Audiência:</span> {audienceCount ?? 0} leads</div>
                <div><span className="text-muted-foreground">Sequência:</span> {steps.length} passo(s) de email</div>
                <div><span className="text-muted-foreground">Disparo:</span> {scheduleMode === "immediate" ? "Imediato" : `Agendado para ${scheduledAt}`}</div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ao lançar, os leads são inscritos e o 1º email é processado.</p>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {step > 1 && <Button variant="ghost" onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>}
            </div>
            <div className="flex gap-2">
              {step < 5 && <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>Seguinte <ChevronRight className="h-4 w-4 ml-1" /></Button>}
              {step === 5 && (
                <>
                  <Button variant="outline" onClick={() => launch(true)} disabled={saving}>Guardar rascunho</Button>
                  <Button onClick={() => launch(false)} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar e Lançar</Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
