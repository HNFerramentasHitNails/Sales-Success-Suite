import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Globe, Plus, Loader2, RefreshCw, ShieldCheck, Trash2, CheckCircle2 } from "lucide-react";
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

type Domain = Database["public"]["Tables"]["outreach_email_domains"]["Row"];
type DnsRecord = { record?: string; name?: string; type?: string; value?: string; ttl?: string; status?: string; priority?: number };

function scoreBadge(score: number) {
  if (score >= 100) return <Badge variant="default">Verificado</Badge>;
  if (score >= 50) return <Badge variant="outline">Pendente</Badge>;
  return <Badge variant="destructive">Problema</Badge>;
}

export default function OutreachDomains() {
  const { activeOrg, isAdmin } = useOrganization();
  const [rows, setRows] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ domain: "", from_name: "", daily_cap: 200 });
  const [records, setRecords] = useState<DnsRecord[] | null>(null);
  const [recordsFor, setRecordsFor] = useState<string>("");

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data } = await supabase.from("outreach_email_domains").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false });
    setRows((data ?? []) as Domain[]);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) return <Navigate to="/app/dashboard" replace />;

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("outreach-domains", { body: { organization_id: activeOrg!.id, ...body } });
    if (error) throw new Error(error.message);
    const res = data as any;
    if (res?.error) throw new Error(res.message || res.error);
    return res;
  };

  const addDomain = async () => {
    if (!form.domain.trim()) { toast({ title: "Indica o domínio", variant: "destructive" }); return; }
    setBusy("add");
    try {
      const res = await call({ action: "add", domain: form.domain.trim().toLowerCase(), from_name: form.from_name.trim(), daily_cap: form.daily_cap });
      toast({ title: "Domínio adicionado", description: "Configura os registos DNS abaixo e depois verifica." });
      setRecords(res.records ?? []);
      setRecordsFor(form.domain.trim().toLowerCase());
      setForm({ domain: "", from_name: "", daily_cap: 200 });
      setAddOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const refresh = async (d: Domain, verify = false) => {
    setBusy(d.id);
    try {
      const res = await call({ action: verify ? "verify" : "refresh", domain_id: d.id });
      setRecords(res.records ?? []);
      setRecordsFor(d.domain);
      toast({ title: verify ? "Verificação pedida" : "Atualizado", description: `Estado: ${res.status ?? "—"}` });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const toggleActive = async (d: Domain, value: boolean) => {
    setBusy(d.id);
    try {
      await call({ action: "set_active", domain_id: d.id, is_active: value });
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const remove = async (d: Domain) => {
    setBusy(d.id);
    try {
      await call({ action: "delete", domain_id: d.id });
      toast({ title: "Domínio removido" });
      if (recordsFor === d.domain) setRecords(null);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domínios de Envio"
        description="Domínios verificados no Resend usados para enviar as campanhas de email."
        icon={<Globe className="h-6 w-6" />}
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Adicionar domínio</Button>}
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          Sem um domínio verificado, as campanhas usam um remetente de teste do Resend que só entrega ao email da tua conta.
          Adiciona o teu domínio, configura os registos DNS e verifica para enviar a destinatários reais.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domínio</TableHead>
                <TableHead>Remetente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Limite/dia</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Sem domínios. Adiciona o primeiro.</TableCell></TableRow>
              ) : rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.domain}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.from_name ? `${d.from_name} <outreach@${d.domain}>` : `outreach@${d.domain}`}</TableCell>
                  <TableCell>{scoreBadge(d.health_score)}</TableCell>
                  <TableCell>{d.daily_cap}</TableCell>
                  <TableCell>
                    <Switch checked={d.is_active} disabled={busy === d.id || d.health_score < 100} onCheckedChange={(v) => toggleActive(d, v)} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" title="Ver DNS / atualizar" disabled={busy === d.id} onClick={() => refresh(d, false)}><RefreshCw className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Verificar" disabled={busy === d.id} onClick={() => refresh(d, true)}><CheckCircle2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title="Remover" disabled={busy === d.id} onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {records && (
        <Card>
          <CardHeader><CardTitle className="text-base">Registos DNS — {recordsFor}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Adiciona estes registos no teu fornecedor de DNS e depois clica em "Verificar".</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nome / Host</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Prioridade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-muted-foreground">Sem registos.</TableCell></TableRow>
                  ) : records.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.type}</TableCell>
                      <TableCell className="font-mono text-xs break-all">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs break-all">{r.value}</TableCell>
                      <TableCell className="font-mono text-xs">{r.priority ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar domínio de envio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Domínio</Label>
              <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="mail.ateulado.pt" />
            </div>
            <div className="grid gap-1.5">
              <Label>Nome do remetente</Label>
              <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="Hit Nails" />
            </div>
            <div className="grid gap-1.5 max-w-[140px]">
              <Label>Limite/dia</Label>
              <Input type="number" min={1} value={form.daily_cap} onChange={(e) => setForm({ ...form, daily_cap: Math.max(1, Number(e.target.value)) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addDomain} disabled={busy === "add"}>{busy === "add" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar no Resend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
