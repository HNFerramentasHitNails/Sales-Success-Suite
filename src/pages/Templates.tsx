import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Sparkles, Loader2, Trash2, Mail, MessageSquare, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["outreach_templates"]["Row"];
type Variation = Database["public"]["Tables"]["outreach_template_variations"]["Row"];
type Channel = "email" | "sms" | "whatsapp";

const CHANNEL_META: Record<Channel, { label: string; icon: any; limit: number }> = {
  email: { label: "Email", icon: Mail, limit: 5000 },
  sms: { label: "SMS", icon: MessageSquare, limit: 160 },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, limit: 360 },
};

const LEAD_STAGES = ["Frio", "Aware", "Engajado", "Cotado", "Inativo"];
const OBJECTIVES = ["Iniciar conversa", "Agendar reunião", "Enviar material", "Qualificar lead", "Fechar negócio"];
const TONES = ["Humano", "Direto", "Consultivo", "Curto"];
const LANGUAGES = [
  { v: "pt-PT", l: "Português (PT)" },
  { v: "pt-BR", l: "Português (BR)" },
  { v: "en", l: "English" },
  { v: "es", l: "Español" },
];
const MERGE_TAGS = ["{{name}}", "{{full_name}}", "{{company}}", "{{city}}", "{{email}}", "{{phone}}", "{{niche}}"];

type GenVar = { angle: string; subject?: string; body: string };
type GenMap = Partial<Record<Channel, GenVar[]>>;

const emptyParams = {
  name: "", niche: "", lead_stage: "Frio", objective: "Iniciar conversa", tone: "Humano",
  language: "pt-PT", about_offer: "", about_problem: "", about_proof: "",
  channels: { email: true, sms: false, whatsapp: false } as Record<Channel, boolean>,
  variations: 2,
};

export default function Templates() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [params, setParams] = useState({ ...emptyParams });
  const [generating, setGenerating] = useState(false);
  const [gen, setGen] = useState<GenMap>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [{ data: tpls }, { data: vars }] = await Promise.all([
      supabase.from("outreach_templates").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false }),
      supabase.from("outreach_template_variations").select("*").eq("organization_id", activeOrg.id),
    ]);
    setTemplates((tpls ?? []) as Template[]);
    setVariations((vars ?? []) as Variation[]);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => ({
    total: templates.length,
    email: variations.filter((v) => v.channel === "email").length,
    sms: variations.filter((v) => v.channel === "sms").length,
    whatsapp: variations.filter((v) => v.channel === "whatsapp").length,
  }), [templates, variations]);

  const selectedChannels = (Object.keys(params.channels) as Channel[]).filter((c) => params.channels[c]);

  const openNew = () => { setParams({ ...emptyParams, channels: { email: true, sms: false, whatsapp: false } }); setGen({}); setOpen(true); };

  const generate = async (onlyChannel?: Channel) => {
    if (!activeOrg) return;
    const channels = onlyChannel ? [onlyChannel] : selectedChannels;
    if (channels.length === 0) { toast({ title: "Seleciona pelo menos um canal", variant: "destructive" }); return; }
    if (!params.about_offer.trim() || !params.about_problem.trim()) {
      toast({ title: "Preenche 'O que ofereces' e 'Que problema resolve'", variant: "destructive" }); return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("outreach-generate", {
      body: {
        organization_id: activeOrg.id,
        niche: params.niche, lead_stage: params.lead_stage, objective: params.objective,
        tone: params.tone, language: params.language,
        about_offer: params.about_offer, about_problem: params.about_problem, about_proof: params.about_proof,
        channels, variations: params.variations,
      },
    });
    setGenerating(false);
    if (error) { toast({ title: "Falha ao gerar", description: error.message, variant: "destructive" }); return; }
    const res = data as { channels?: GenMap; error?: string; message?: string };
    if (res?.error) {
      toast({ title: "Erro da IA", description: res.message ?? res.error, variant: "destructive" }); return;
    }
    setGen((prev) => ({ ...prev, ...(res.channels ?? {}) }));
    toast({ title: "Conteúdo gerado" });
  };

  const updateVar = (ch: Channel, idx: number, field: "subject" | "body", value: string) => {
    setGen((prev) => {
      const arr = [...(prev[ch] ?? [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [ch]: arr };
    });
  };

  const save = async () => {
    if (!activeOrg) return;
    if (!params.name.trim()) { toast({ title: "Dá um nome ao template", variant: "destructive" }); return; }
    const channelsWithContent = (Object.keys(gen) as Channel[]).filter((c) => (gen[c] ?? []).some((v) => v.body.trim()));
    if (channelsWithContent.length === 0) { toast({ title: "Gera conteúdo primeiro", variant: "destructive" }); return; }
    setSaving(true);
    const { data: tpl, error: tErr } = await supabase.from("outreach_templates").insert({
      organization_id: activeOrg.id,
      name: params.name.trim(),
      niche: params.niche.trim() || null,
      lead_stage: params.lead_stage,
      objective: params.objective,
      tone: params.tone,
      language: params.language,
      channels: channelsWithContent,
    }).select("id").single();
    if (tErr || !tpl) { setSaving(false); toast({ title: "Erro ao guardar", description: tErr?.message, variant: "destructive" }); return; }

    const rows = channelsWithContent.flatMap((ch) =>
      (gen[ch] ?? []).filter((v) => v.body.trim()).map((v, i) => ({
        organization_id: activeOrg.id,
        template_id: tpl.id,
        channel: ch,
        variation_index: i,
        angle: v.angle ?? null,
        subject: ch === "email" ? (v.subject ?? null) : null,
        body: v.body,
      })),
    );
    const { error: vErr } = await supabase.from("outreach_template_variations").insert(rows);
    setSaving(false);
    if (vErr) { toast({ title: "Erro ao guardar variações", description: vErr.message, variant: "destructive" }); return; }
    toast({ title: "Template guardado" });
    setOpen(false);
    load();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("outreach_templates").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Template removido" });
    load();
  };

  const channelsOf = (tplId: string) => {
    const set = new Set(variations.filter((v) => v.template_id === tplId).map((v) => v.channel));
    return Array.from(set);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Mensagens multicanal geradas com IA (email, SMS, WhatsApp)."
        icon={<FileText className="h-6 w-6" />}
        actions={canWrite && <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Template</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Templates", value: kpis.total },
          { label: "Variações Email", value: kpis.email },
          { label: "Variações SMS", value: kpis.sms },
          { label: "Variações WhatsApp", value: kpis.whatsapp },
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
                <TableHead>Nicho</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead>Canais</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              ) : templates.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Sem templates. Cria o primeiro com IA.</TableCell></TableRow>
              ) : templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.niche || "—"}</TableCell>
                  <TableCell>{t.lead_stage || "—"}</TableCell>
                  <TableCell>{t.objective || "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {channelsOf(t.id).map((c) => <Badge key={c} variant="secondary">{CHANNEL_META[c as Channel]?.label ?? c}</Badge>)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Novo Template com IA */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Template (gerado com IA)</DialogTitle></DialogHeader>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Nome do Template *</Label>
              <Input value={params.name} onChange={(e) => setParams({ ...params, name: e.target.value })} placeholder="Ex: Frio - Restaurantes" />
            </div>
            <div className="grid gap-1.5">
              <Label>Nicho</Label>
              <Input value={params.niche} onChange={(e) => setParams({ ...params, niche: e.target.value })} placeholder="Restaurantes, Clínicas…" />
            </div>
            <div className="grid gap-1.5">
              <Label>Estágio do Lead</Label>
              <Select value={params.lead_stage} onValueChange={(v) => setParams({ ...params, lead_stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Objetivo</Label>
              <Select value={params.objective} onValueChange={(v) => setParams({ ...params, objective: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OBJECTIVES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tom de Voz</Label>
              <Select value={params.tone} onValueChange={(v) => setParams({ ...params, tone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TONES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Idioma do Conteúdo</Label>
              <Select value={params.language} onValueChange={(v) => setParams({ ...params, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>O que ofereces *</Label>
              <Textarea rows={2} value={params.about_offer} onChange={(e) => setParams({ ...params, about_offer: e.target.value })} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Que problema resolve *</Label>
              <Textarea rows={2} value={params.about_problem} onChange={(e) => setParams({ ...params, about_problem: e.target.value })} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Prova / diferencial (opcional)</Label>
              <Textarea rows={2} value={params.about_proof} onChange={(e) => setParams({ ...params, about_proof: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-t pt-3">
            <div className="grid gap-1.5">
              <Label>Canais</Label>
              <div className="flex gap-3">
                {(Object.keys(CHANNEL_META) as Channel[]).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={params.channels[c]} onCheckedChange={(v) => setParams({ ...params, channels: { ...params.channels, [c]: !!v } })} />
                    {CHANNEL_META[c].label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Variações por canal</Label>
              <Select value={String(params.variations)} onValueChange={(v) => setParams({ ...params, variations: Number(v) })}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={() => generate()} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Gerar conteúdo
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">Merge tags disponíveis: {MERGE_TAGS.join("  ")}</p>

          {/* Editor por canal */}
          {(Object.keys(gen) as Channel[]).filter((c) => (gen[c] ?? []).length > 0).map((ch) => {
            const Meta = CHANNEL_META[ch];
            const Icon = Meta.icon;
            return (
              <div key={ch} className="border rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4" /> {Meta.label}</div>
                  <Button size="sm" variant="outline" onClick={() => generate(ch)} disabled={generating}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Regenerar
                  </Button>
                </div>
                {(gen[ch] ?? []).map((v, i) => (
                  <div key={i} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Variação {i + 1}</Badge>
                      {v.angle && <span className="text-xs text-muted-foreground">ângulo: {v.angle}</span>}
                    </div>
                    {ch === "email" && (
                      <Input value={v.subject ?? ""} onChange={(e) => updateVar(ch, i, "subject", e.target.value)} placeholder="Assunto" />
                    )}
                    <Textarea rows={ch === "email" ? 5 : 3} value={v.body} onChange={(e) => updateVar(ch, i, "body", e.target.value)} />
                    <div className={`text-xs text-right ${v.body.length > Meta.limit ? "text-destructive" : "text-muted-foreground"}`}>
                      {v.body.length}/{Meta.limit}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
