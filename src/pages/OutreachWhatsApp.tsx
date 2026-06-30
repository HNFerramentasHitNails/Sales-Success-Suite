import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { MessageCircle, Plus, Loader2, RefreshCw, Trash2, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/integrations/supabase/types";

type Instance = Database["public"]["Tables"]["outreach_whatsapp_instances"]["Row"];

function warmupInfo(inst: Instance) {
  if (inst.skip_warmup) return { limit: 100, phase: "Sem aquecimento" };
  if (!inst.connected_at) return { limit: 20, phase: "Dia 1" };
  const days = Math.floor((Date.now() - new Date(inst.connected_at).getTime()) / 86400000);
  if (days <= 3) return { limit: 20, phase: `Semana 1 (dia ${days + 1})` };
  if (days <= 7) return { limit: 40, phase: "Semana 1" };
  if (days <= 14) return { limit: 60, phase: "Semana 2" };
  return { limit: 100, phase: "Aquecido" };
}

const statusBadge = (s: string) =>
  s === "open" ? <Badge variant="default">Ligado</Badge>
  : s === "connecting" ? <Badge variant="outline">A ligar…</Badge>
  : <Badge variant="secondary">Desligado</Badge>;

export default function OutreachWhatsApp() {
  const { activeOrg, isAdmin } = useOrganization();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("https://whatsapp.janeiras.synology.me");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);

  const [newName, setNewName] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrInstanceId, setQrInstanceId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("outreach-whatsapp", { body: { organization_id: activeOrg!.id, ...body } });
    if (error) throw new Error(error.message);
    const res = data as any;
    if (res?.error) throw new Error(res.message || res.error);
    return res;
  };

  const loadInstances = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase.from("outreach_whatsapp_instances").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false });
    setInstances((data ?? []) as Instance[]);
  }, [activeOrg]);

  const loadConfig = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const res = await call({ action: "get_config" });
      setBaseUrl(res.base_url || "https://whatsapp.janeiras.synology.me");
      setHasKey(!!res.has_key);
    } catch (e: any) {
      toast({ title: "Erro a carregar config", description: e.message, variant: "destructive" });
    }
    await loadInstances();
    setLoading(false);
  }, [activeOrg, loadInstances]);

  useEffect(() => { loadConfig(); /* eslint-disable-next-line */ }, [activeOrg?.id]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  if (!isAdmin) return <Navigate to="/app/dashboard" replace />;

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      await call({ action: "set_config", base_url: baseUrl.trim(), api_key: apiKey.trim() || undefined });
      toast({ title: "Configuração guardada" });
      if (apiKey.trim()) setHasKey(true);
      setApiKey("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setSavingCfg(false); }
  };

  const startPolling = (instanceId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await call({ action: "status", instance_id: instanceId });
        if (res.status === "open") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setQrOpen(false);
          toast({ title: "WhatsApp ligado!" });
          loadInstances();
        }
      } catch { /* ignore */ }
    }, 3000);
  };

  const createInstance = async () => {
    if (!newName.trim()) { toast({ title: "Indica um nome", variant: "destructive" }); return; }
    setBusy("create");
    try {
      const res = await call({ action: "create_instance", name: newName.trim() });
      setNewName("");
      await loadInstances();
      if (res.qr) {
        setQr(res.qr); setQrInstanceId(res.instance?.id ?? null); setQrOpen(true);
        if (res.instance?.id) startPolling(res.instance.id);
      } else {
        toast({ title: "Instância criada", description: "Usa 'Ligar' para ver o QR code." });
      }
    } catch (e: any) {
      toast({ title: "Erro ao criar", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const connect = async (inst: Instance) => {
    setBusy(inst.id);
    try {
      const res = await call({ action: "connect", instance_id: inst.id });
      if (res.qr) { setQr(res.qr); setQrInstanceId(inst.id); setQrOpen(true); startPolling(inst.id); }
      else toast({ title: "Sem QR", description: "A instância pode já estar ligada. Atualiza o estado." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const refresh = async (inst: Instance) => {
    setBusy(inst.id);
    try { const res = await call({ action: "status", instance_id: inst.id }); toast({ title: `Estado: ${res.status}` }); loadInstances(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const toggleSkip = async (inst: Instance, skip: boolean) => {
    setBusy(inst.id);
    try { await call({ action: "set_skip_warmup", instance_id: inst.id, skip }); loadInstances(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const remove = async (inst: Instance) => {
    setBusy(inst.id);
    try { await call({ action: "delete", instance_id: inst.id }); toast({ title: "Instância removida" }); loadInstances(); }
    catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Liga o teu WhatsApp via Evolution API para enviar campanhas."
        icon={<MessageCircle className="h-6 w-6" />}
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          A API key do Evolution é guardada de forma segura no servidor e nunca é devolvida ao navegador.
          O uso de WhatsApp não-oficial tem risco de bloqueio — o aquecimento gradual ajuda a proteger o número.
          O recurso a APIs não oficiais pode violar os Termos da Meta; a decisão e o risco são da exclusiva
          responsabilidade do cliente.
        </AlertDescription>
      </Alert>

      {/* Config Evolution */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">Servidor Evolution {hasKey && <Badge variant="secondary">Configurado</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <>
              <div className="grid gap-1.5 max-w-xl">
                <Label>URL base</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://whatsapp.janeiras.synology.me" />
              </div>
              <div className="grid gap-1.5 max-w-xl">
                <Label>API Key (global do Evolution)</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasKey ? "•••• configurada (deixa vazio para manter)" : "Cola a API key"} autoComplete="off" />
              </div>
              <Button onClick={saveConfig} disabled={savingCfg}>{savingCfg && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar configuração</Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Instâncias */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Instâncias</CardTitle>
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="nome-da-instancia" className="w-[200px]" disabled={!hasKey} />
            <Button onClick={createInstance} disabled={busy === "create" || !hasKey}>{busy === "create" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Criar</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Aquecimento</TableHead>
                <TableHead>Saltar warmup</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{hasKey ? "Sem instâncias. Cria a primeira." : "Configura a API key primeiro."}</TableCell></TableRow>
              ) : instances.map((inst) => {
                const w = warmupInfo(inst);
                return (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium flex items-center gap-2"><Smartphone className="h-4 w-4" /> {inst.name}</TableCell>
                    <TableCell>{statusBadge(inst.status)}</TableCell>
                    <TableCell>{inst.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{w.phase} · {inst.daily_sent}/{w.limit} hoje</TableCell>
                    <TableCell><Switch checked={inst.skip_warmup} disabled={busy === inst.id} onCheckedChange={(v) => toggleSkip(inst, v)} /></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" title="Ligar (QR)" disabled={busy === inst.id} onClick={() => connect(inst)}><QrCode className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Atualizar estado" disabled={busy === inst.id} onClick={() => refresh(inst)}><RefreshCw className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Remover" disabled={busy === inst.id} onClick={() => remove(inst)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={(o) => { setQrOpen(o); if (!o && pollRef.current) window.clearInterval(pollRef.current); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Liga o teu WhatsApp</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground text-center">Abre o WhatsApp → Aparelhos ligados → Ligar aparelho, e lê o código.</p>
            {qr ? (
              <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR code" className="w-64 h-64" />
            ) : <Loader2 className="h-8 w-8 animate-spin" />}
            <p className="text-xs text-muted-foreground">À espera da ligação…</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQrOpen(false); if (pollRef.current) window.clearInterval(pollRef.current); }}>Fechar</Button>
            {qrInstanceId && <Button onClick={() => refresh(instances.find((i) => i.id === qrInstanceId)!)}>Já liguei</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
