import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Plug, RefreshCw, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Definition = Database["public"]["Tables"]["connector_definitions"]["Row"];
type Connection = Database["public"]["Tables"]["connections"]["Row"];
type Webhook = Database["public"]["Tables"]["webhook_endpoints"]["Row"];
type SyncLog = Database["public"]["Tables"]["sync_logs"]["Row"];

type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  online_store: "Loja online",
  invoicing: "Faturação",
  payments: "Pagamentos",
  accounting: "Contabilidade",
  calendar: "Calendário",
  email: "Email",
  other: "Outros",
};

function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Integrations() {
  const { activeOrg, isAdmin } = useOrganization();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogDef, setDialogDef] = useState<Definition | null>(null);
  const [dialogConn, setDialogConn] = useState<Connection | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [existingSecretKeys, setExistingSecretKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const orgId = activeOrg?.id;

  async function load() {
    if (!orgId) return;
    setLoading(true);
    const [defsRes, connsRes, hookRes, logsRes] = await Promise.all([
      supabase.from("connector_definitions").select("*").eq("is_active", true).order("category"),
      supabase.from("connections").select("*").eq("organization_id", orgId),
      supabase.from("webhook_endpoints").select("*").eq("organization_id", orgId).maybeSingle(),
      supabase.from("sync_logs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (defsRes.data) setDefinitions(defsRes.data);
    if (connsRes.data) setConnections(connsRes.data);
    setWebhook(hookRes.data ?? null);
    if (logsRes.data) setLogs(logsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId]);

  const connectionsByKey = useMemo(() => {
    const m: Record<string, Connection> = {};
    for (const c of connections) m[c.connector_key] = c;
    return m;
  }, [connections]);

  const byCategory = useMemo(() => {
    const map: Record<string, Definition[]> = {};
    for (const d of definitions) {
      (map[d.category] ??= []).push(d);
    }
    return map;
  }, [definitions]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrações</CardTitle>
            <CardDescription>Apenas administradores podem gerir integrações.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function openConnect(def: Definition, existing?: Connection) {
    setDialogDef(def);
    setDialogConn(existing ?? null);
    const fields = ((def.config_schema as any)?.fields ?? []) as ConfigField[];
    const initial: Record<string, string> = {};
    const cfg = (existing?.config as Record<string, string> | null) ?? {};
    for (const f of fields) {
      if (!f.secret) initial[f.key] = cfg[f.key] ?? "";
      else initial[f.key] = "";
    }
    setFormValues(initial);
    setExistingSecretKeys([]);
    if (existing) {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connection-secrets?connection_id=${existing.id}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } },
        );
        const js = await res.json();
        setExistingSecretKeys((js?.keys ?? []).map((k: any) => k.key));
      } catch { /* ignore */ }
    }
  }

  async function saveConnection() {
    if (!dialogDef || !orgId) return;
    setSaving(true);
    try {
      const fields = ((dialogDef.config_schema as any)?.fields ?? []) as ConfigField[];
      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const f of fields) {
        const v = formValues[f.key] ?? "";
        if (f.required && !f.secret && !v) throw new Error(`Campo obrigatório: ${f.label}`);
        if (f.secret) {
          if (v) secrets[f.key] = v;
          else if (f.required && !existingSecretKeys.includes(f.key))
            throw new Error(`Campo obrigatório: ${f.label}`);
        } else {
          config[f.key] = v;
        }
      }

      let connectionId = dialogConn?.id;
      if (!connectionId) {
        const { data, error } = await supabase.from("connections").insert({
          organization_id: orgId,
          connector_key: dialogDef.key,
          name: dialogDef.name,
          status: "active",
          config,
        }).select().single();
        if (error) throw error;
        connectionId = data.id;
      } else {
        const { error } = await supabase.from("connections").update({ config, status: "active" }).eq("id", connectionId);
        if (error) throw error;
      }

      if (Object.keys(secrets).length > 0) {
        const { error: secErr } = await supabase.functions.invoke("connection-secrets", {
          body: { connection_id: connectionId, secrets },
        });
        if (secErr) throw secErr;
      }

      toast({ title: "Ligação guardada" });
      setDialogDef(null);
      setDialogConn(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(c: Connection) {
    const newStatus = c.status === "active" ? "disabled" : "active";
    const { error } = await supabase.from("connections").update({ status: newStatus }).eq("id", c.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  }

  async function removeConnection(c: Connection) {
    if (!confirm(`Remover a ligação "${c.name}"? Esta ação apaga também os segredos.`)) return;
    const { error } = await supabase.from("connections").delete().eq("id", c.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  }

  async function ensureWebhook() {
    if (!orgId) return;
    const { data, error } = await supabase.from("webhook_endpoints").insert({
      organization_id: orgId,
      token: randomToken(16),
      secret: randomToken(24),
      description: "Endpoint de entrada predefinido",
    }).select().single();
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { setWebhook(data); toast({ title: "Webhook criado" }); }
  }

  async function regenerateWebhookSecret() {
    if (!webhook) return;
    const newSecret = randomToken(24);
    const { data, error } = await supabase.from("webhook_endpoints")
      .update({ secret: newSecret }).eq("id", webhook.id).select().single();
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { setWebhook(data); toast({ title: "Segredo regenerado" }); }
  }

  async function toggleWebhookActive() {
    if (!webhook) return;
    const { data, error } = await supabase.from("webhook_endpoints")
      .update({ is_active: !webhook.is_active }).eq("id", webhook.id).select().single();
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setWebhook(data);
  }

  async function testMoloni(c: Connection) {
    try {
      const { data, error } = await supabase.functions.invoke("moloni-test-connection", {
        body: { connection_id: c.id },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok) toast({ title: "Ligação Moloni OK", description: `Empresa ${d.company_id}${d.company_name ? " — " + d.company_name : ""} (${d.companies_count} empresa(s) na conta).` });
      else toast({ title: "Falha na ligação Moloni", description: d?.message ?? d?.error ?? "Erro desconhecido", variant: "destructive" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function testStripe(c: Connection) {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-test-connection", {
        body: { connection_id: c.id },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok) toast({ title: "Ligação Stripe OK", description: `Modo: ${d.mode === "live" ? "produção" : "teste"}.` });
      else toast({ title: "Falha na ligação Stripe", description: d?.error ?? "Erro desconhecido", variant: "destructive" });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  const webhookUrl = webhook
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inbound-webhook/${webhook.token}`
    : "";

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado" });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrações</h1>
        <p className="text-sm text-muted-foreground">Liga as ferramentas externas que a tua organização utiliza.</p>
      </div>

      <div data-tour="integrations-list">
      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([cat, defs]) => (
            <section key={cat} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground">{CATEGORY_LABELS[cat] ?? cat}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {defs.map((d) => {
                  const c = connectionsByKey[d.key];
                  return (
                    <Card key={d.key}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Plug className="h-4 w-4" /> {d.name}
                            </CardTitle>
                            <CardDescription>{d.description}</CardDescription>
                          </div>
                          {c && (
                            <Badge variant={c.status === "active" ? "default" : c.status === "error" ? "destructive" : "secondary"}>
                              {c.status === "active" ? "Ativo" : c.status === "error" ? "Erro" : "Desativado"}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {c ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openConnect(d, c)}>Editar</Button>
                            <Button size="sm" variant="outline" onClick={() => toggleStatus(c)}>
                              {c.status === "active" ? "Desativar" : "Ativar"}
                            </Button>
                            {d.key === "stripe" && c.status === "active" && (
                              <Button size="sm" variant="outline" onClick={() => testStripe(c)}>
                                Testar ligação
                              </Button>
                            )}
                            {d.key === "moloni" && c.status === "active" && (
                              <Button size="sm" variant="outline" onClick={() => testMoloni(c)}>
                                Testar ligação
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => removeConnection(c)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {c.last_error && (
                              <p className="text-xs text-destructive w-full">{c.last_error}</p>
                            )}
                            {d.key === "stripe" && webhook && (
                              <div className="w-full pt-2 border-t mt-1">
                                <Label className="text-xs">URL do webhook Stripe (configurar no painel Stripe)</Label>
                                <div className="flex gap-2">
                                  <Input readOnly className="text-xs"
                                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook/${webhook.token}`} />
                                  <Button variant="outline" size="icon"
                                    onClick={() => copy(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook/${webhook.token}`)}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Eventos sugeridos: <code>checkout.session.completed</code>, <code>payment_intent.succeeded</code>.
                                </p>
                              </div>
                            )}
                          </>
                        ) : (
                          <Button size="sm" onClick={() => openConnect(d)}>Ligar</Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}

          <Card data-tour="integrations-webhook">
            <CardHeader>
              <CardTitle>Webhook de entrada</CardTitle>
              <CardDescription>URL público para recebimento de eventos de sistemas externos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!webhook ? (
                <Button onClick={ensureWebhook}>Criar endpoint</Button>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={webhookUrl} />
                      <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Segredo (cabeçalho <code>x-webhook-secret</code>)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={webhook.secret} />
                      <Button variant="outline" size="icon" onClick={() => copy(webhook.secret)}><Copy className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" onClick={regenerateWebhookSecret}><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={webhook.is_active} onCheckedChange={toggleWebhookActive} />
                    <span className="text-sm">{webhook.is_active ? "Ativo" : "Desativado"}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-tour="integrations-logs">
            <CardHeader>
              <CardTitle>Registos de sincronização</CardTitle>
              <CardDescription>Últimos 50 eventos.</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registos ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Direção</TableHead>
                      <TableHead>Conector</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-PT")}</TableCell>
                        <TableCell>{l.direction === "inbound" ? "Entrada" : "Saída"}</TableCell>
                        <TableCell>{l.connector_key ?? "—"}</TableCell>
                        <TableCell>{l.action ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === "success" ? "default" : "destructive"}>
                            {l.status === "success" ? "OK" : "Erro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{l.message ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </div>

      <Dialog open={!!dialogDef} onOpenChange={(o) => { if (!o) { setDialogDef(null); setDialogConn(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogConn ? "Editar ligação" : "Ligar"} — {dialogDef?.name}</DialogTitle>
            <DialogDescription>Os campos secretos são guardados encriptados e nunca devolvidos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialogDef && (((dialogDef.config_schema as any)?.fields ?? []) as ConfigField[]).map((f) => {
              const isSet = existingSecretKeys.includes(f.key);
              return (
                <div key={f.key}>
                  <Label>
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                    {f.secret && isSet && (
                      <span className="ml-2 text-xs text-muted-foreground">(definido — preencher para alterar)</span>
                    )}
                  </Label>
                  <Input
                    type={f.type === "password" ? "password" : f.type === "url" ? "url" : "text"}
                    value={formValues[f.key] ?? ""}
                    onChange={(e) => setFormValues((s) => ({ ...s, [f.key]: e.target.value }))}
                    placeholder={f.secret && isSet ? "•••••• (manter)" : ""}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogDef(null); setDialogConn(null); }}>Cancelar</Button>
            <Button onClick={saveConnection} disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}