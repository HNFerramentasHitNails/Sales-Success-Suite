import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Provider = "lovable" | "anthropic" | "openai";

export default function AiSettings() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [testReply, setTestReply] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrg?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_ai_settings", { _org_id: activeOrg.id });
      if (error) {
        toast.error("Erro ao carregar configuração de IA");
      } else if (data && data.length > 0) {
        const row = data[0] as { provider: string; model: string | null; has_key: boolean };
        setProvider((row.provider as Provider) || "lovable");
        setModel(row.model ?? "");
        setHasKey(!!row.has_key);
      }
      setLoading(false);
    })();
  }, [activeOrg?.id]);

  if (!canManage) return <Navigate to="/app/dashboard" replace />;

  const placeholder =
    provider === "lovable"
      ? "google/gemini-2.5-flash"
      : provider === "anthropic"
      ? "claude-opus-4-8"
      : "gpt-4o-mini";

  const handleSave = async () => {
    if (!activeOrg?.id) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_ai_settings", {
      _org_id: activeOrg.id,
      _provider: provider,
      _model: model || null,
      _api_key: apiKey ? apiKey : null,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao guardar configuração");
      return;
    }
    toast.success("Configuração guardada");
    if (apiKey) setHasKey(true);
    setApiKey("");
  };

  const handleTest = async () => {
    if (!activeOrg?.id) return;
    setTesting(true);
    setTestReply(null);
    const { data, error } = await supabase.functions.invoke("ai-agent", {
      body: {
        organization_id: activeOrg.id,
        agent_type: "sales",
        messages: [{ role: "user", content: "Responde apenas: OK" }],
      },
    });
    setTesting(false);
    if (error) {
      toast.error("Falha ao contactar o serviço de IA");
      return;
    }
    const res = data as { reply?: string; error?: string; message?: string };
    if (res?.error === "ai_not_configured") {
      toast.warning("Configura primeiro a chave de IA");
      setTestReply("Configura primeiro a chave de IA.");
      return;
    }
    if (res?.error === "rate_limited" || res?.error === "credits_exhausted" || res?.error === "provider_error") {
      toast.error(`Erro do fornecedor: ${res.message ?? ""}`);
      setTestReply(`Erro do fornecedor: ${res.message ?? "desconhecido"}`);
      return;
    }
    setTestReply(res?.reply ?? "(sem resposta)");
    toast.success("Ligação OK");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração de IA"
        description="Por defeito usas a IA incluída no Lovable. Podes também ligar uma chave própria de Anthropic ou OpenAI."
        icon={<Bot className="h-6 w-6" />}
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          A chave é guardada de forma segura no servidor e nunca é exposta no navegador.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Fornecedor de IA
            {provider !== "lovable" && hasKey && <Badge variant="secondary">Chave configurada</Badge>}
            {provider === "lovable" && <Badge variant="secondary">Pronto a usar</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : (
            <>
              <div className="grid gap-2 max-w-sm">
                <Label>Fornecedor</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lovable">Lovable AI (incluído)</SelectItem>
                    <SelectItem value="anthropic">Anthropic (chave própria)</SelectItem>
                    <SelectItem value="openai">OpenAI (chave própria)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {provider === "lovable" && (
                <Alert>
                  <AlertDescription>
                    Sem configuração necessária — usa a IA incluída na plataforma.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2 max-w-sm">
                <Label>Modelo</Label>
                {provider === "lovable" ? (
                  <>
                    <Select value={model || "google/gemini-2.5-flash"} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google/gemini-2.5-flash">google/gemini-2.5-flash (rápido)</SelectItem>
                        <SelectItem value="google/gemini-2.5-pro">google/gemini-2.5-pro (mais capaz)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Por defeito: <code>google/gemini-2.5-flash</code>
                    </p>
                  </>
                ) : (
                  <>
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={placeholder}
                    />
                    <p className="text-xs text-muted-foreground">
                      Sugestão: <code>{placeholder}</code>
                    </p>
                  </>
                )}
              </div>

              {provider !== "lovable" && (
                <div className="grid gap-2 max-w-sm">
                  <Label>Chave de API</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasKey ? "•••• configurada (deixa vazio para manter)" : "Cola aqui a chave"}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    A chave fica guardada apenas no servidor e nunca é devolvida ao navegador.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
                <Button variant="outline" onClick={handleTest} disabled={testing}>
                  {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Testar ligação
                </Button>
              </div>

              {testReply && (
                <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Resposta do teste</div>
                  {testReply}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}