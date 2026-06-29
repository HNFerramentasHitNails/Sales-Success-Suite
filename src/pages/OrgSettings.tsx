import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import CountrySelect from "@/components/CountrySelect";

type InvoiceMode = Database["public"]["Enums"]["invoice_mode"];

// Textos por omissão para as menções legais — iguais aos defaults da BD.
// As colunas correspondentes em org_vat_settings são NOT NULL, por isso
// nunca podemos enviar null/string vazia ao gravar.
const DEFAULT_RC =
  "Isento ao abrigo do artigo 14.º do RITI (transmissão intracomunitária de bens). IVA devido pelo adquirente — autoliquidação (reverse charge).";
const DEFAULT_EXPORT = "Isento — exportação de bens, artigo 14.º do CIVA.";
const DEFAULT_OSS = "IVA do país de destino ao abrigo do regime OSS (One-Stop-Shop).";

const INVOICE_MODE_OPTIONS: { value: InvoiceMode; label: string; description: string }[] = [
  {
    value: "manual",
    label: "Manual",
    description: "As faturas são emitidas apenas quando clicar em \"Emitir fatura\" numa encomenda.",
  },
  {
    value: "on_confirm",
    label: "Automática ao confirmar",
    description: "Logo que uma encomenda passa a \"Confirmada\", o sistema emite a fatura através do conector de faturação.",
  },
  {
    value: "on_paid",
    label: "Automática ao receber pagamento",
    description: "A fatura é emitida assim que a encomenda for marcada como \"Paga\" (por verificação ou webhook).",
  },
];

export default function OrgSettings() {
  const { activeOrg, isAdmin, role, refresh } = useOrganization();
  // Pode editar definições fiscais: admin/owner e diretor comercial.
  const canEditVat = role === "owner" || role === "admin" || role === "sales_director";
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [locale, setLocale] = useState("pt-PT");
  const [currency, setCurrency] = useState("EUR");
  const [country, setCountry] = useState("PT");
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("manual");
  const [busy, setBusy] = useState(false);

  // ---- IVA / Fiscalidade ----
  const [vatBusy, setVatBusy] = useState(false);
  const [vatLoaded, setVatLoaded] = useState(false);
  const [ossEnabled, setOssEnabled] = useState(false);
  const [textReverseCharge, setTextReverseCharge] = useState("");
  const [textExport, setTextExport] = useState("");
  const [textOss, setTextOss] = useState("");
  const [euRates, setEuRates] = useState<Array<{ country_code: string; country_name: string; standard_rate: number | string }>>([]);

  useEffect(() => {
    if (activeOrg) {
      setName(activeOrg.name);
      setLogoUrl(activeOrg.logo_url ?? "");
      setPrimaryColor(activeOrg.primary_color);
      setLocale(activeOrg.locale);
      setCurrency(activeOrg.currency);
      setCountry(activeOrg.country);
      setInvoiceMode(((activeOrg as any).invoice_mode as InvoiceMode) ?? "manual");
    }
  }, [activeOrg]);

  // Carrega definições fiscais + taxas UE de referência.
  useEffect(() => {
    if (!activeOrg) return;
    (async () => {
      const [s, r] = await Promise.all([
        supabase.from("org_vat_settings").select("*").eq("organization_id", activeOrg.id).maybeSingle(),
        supabase.from("eu_vat_rates").select("country_code, country_name, standard_rate").order("country_name"),
      ]);
      if (s.data) {
        setOssEnabled(!!(s.data as any).oss_enabled);
        setTextReverseCharge((s.data as any).text_reverse_charge ?? DEFAULT_RC);
        setTextExport((s.data as any).text_export ?? DEFAULT_EXPORT);
        setTextOss((s.data as any).text_oss ?? DEFAULT_OSS);
      } else {
        // Ainda não existe linha — pré-preenche com os defaults para que o
        // admin veja o texto efetivo e possa editá-lo antes de gravar.
        setOssEnabled(false);
        setTextReverseCharge(DEFAULT_RC);
        setTextExport(DEFAULT_EXPORT);
        setTextOss(DEFAULT_OSS);
      }
      setEuRates((r.data ?? []) as any);
      setVatLoaded(true);
    })();
  }, [activeOrg]);

  if (!activeOrg) return null;

  const saveVat = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditVat) return;
    setVatBusy(true);
    const { error } = await supabase
      .from("org_vat_settings")
      .upsert(
        {
          organization_id: activeOrg.id,
          oss_enabled: ossEnabled,
          // Colunas NOT NULL — se o utilizador apagar o texto, voltamos ao default.
          text_reverse_charge: textReverseCharge.trim() || DEFAULT_RC,
          text_export: textExport.trim() || DEFAULT_EXPORT,
          text_oss: textOss.trim() || DEFAULT_OSS,
        },
        { onConflict: "organization_id" },
      );
    setVatBusy(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Definições fiscais guardadas" });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        locale,
        currency,
        country,
        invoice_mode: invoiceMode,
      })
      .eq("id", activeOrg.id);
    setBusy(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Definições guardadas" });
      await refresh();
    }
  };

  const currentModeDesc = INVOICE_MODE_OPTIONS.find((o) => o.value === invoiceMode)?.description ?? "";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Definições da Organização</h1>
        <p className="text-muted-foreground text-sm">Marca, idioma, moeda e país.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} required />
            </div>
            <div>
              <Label htmlFor="logo">URL do logótipo</Label>
              <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!isAdmin} placeholder="https://..." />
            </div>
            <div>
              <Label htmlFor="color">Cor primária (HSL, ex.: 220 50% 23%)</Label>
              <div className="flex gap-2 items-center">
                <Input id="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!isAdmin} />
                <div className="h-9 w-9 rounded border" style={{ background: `hsl(${primaryColor})` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="locale">Idioma</Label>
                <Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} disabled={!isAdmin} />
              </div>
              <div>
                <Label htmlFor="cur">Moeda</Label>
                <Input id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!isAdmin} />
              </div>
              <div>
                <Label htmlFor="ctry">País</Label>
                <CountrySelect value={country} onChange={setCountry} disabled={!isAdmin} id="ctry" />
              </div>
            </div>
            <div>
              <Label htmlFor="invmode">Emissão de faturas</Label>
              <Select
                value={invoiceMode}
                onValueChange={(v) => setInvoiceMode(v as InvoiceMode)}
                disabled={!isAdmin}
              >
                <SelectTrigger id="invmode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{currentModeDesc}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nos modos automáticos é necessário ter o conector de faturação ativo em <strong>Integrações</strong>.
                Se algo falhar, pode sempre emitir manualmente a partir da encomenda.
              </p>
            </div>
            {isAdmin ? (
              <Button type="submit" disabled={busy}>Guardar</Button>
            ) : (
              <p className="text-sm text-muted-foreground">Apenas administradores podem editar.</p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ============ IVA / Fiscalidade ============ */}
      <Card>
        <CardHeader>
          <CardTitle>IVA / Fiscalidade</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveVat} className="space-y-5">
            <p className="text-xs text-muted-foreground">
              O país do vendedor é definido em <strong>Geral</strong> (acima) e determina o tratamento
              fiscal aplicado às encomendas.
            </p>

            <div className="flex items-start justify-between gap-4 border rounded p-3">
              <div className="space-y-1">
                <Label className="text-sm">Regime OSS ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Com OSS ativo, as vendas a consumidores finais de outros países da UE são tributadas à
                  taxa do país de destino. Sem OSS, aplica-se a taxa de {country || "Portugal"}.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Aplicável a vendas B2C intra-UE acima de 10.000€/ano.
                </p>
              </div>
              <Switch
                checked={ossEnabled}
                onCheckedChange={setOssEnabled}
                disabled={!canEditVat || !vatLoaded}
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="txt_rc">Menção legal — Autoliquidação intra-UE</Label>
                <Textarea
                  id="txt_rc"
                  rows={2}
                  value={textReverseCharge}
                  onChange={(e) => setTextReverseCharge(e.target.value)}
                  disabled={!canEditVat}
                  placeholder='ex.: "IVA — autoliquidação (artigo 196.º Diretiva 2006/112/CE)"'
                  maxLength={500}
                />
              </div>
              <div>
                <Label htmlFor="txt_ex">Menção legal — Exportação (fora da UE)</Label>
                <Textarea
                  id="txt_ex"
                  rows={2}
                  value={textExport}
                  onChange={(e) => setTextExport(e.target.value)}
                  disabled={!canEditVat}
                  placeholder='ex.: "Isento de IVA — exportação (artigo 14.º do CIVA)"'
                  maxLength={500}
                />
              </div>
              <div>
                <Label htmlFor="txt_oss">Menção legal — OSS / IVA do destino</Label>
                <Textarea
                  id="txt_oss"
                  rows={2}
                  value={textOss}
                  onChange={(e) => setTextOss(e.target.value)}
                  disabled={!canEditVat}
                  placeholder='ex.: "IVA cobrado à taxa do país de destino (regime OSS)"'
                  maxLength={500}
                />
              </div>
            </div>

            {canEditVat ? (
              <Button type="submit" disabled={vatBusy || !vatLoaded}>Guardar</Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Apenas administradores e diretor comercial podem editar.
              </p>
            )}
          </form>

          <div className="mt-6">
            <div className="text-sm font-medium mb-2">Taxas normais de referência (UE)</div>
            <p className="text-xs text-muted-foreground mb-2">
              Taxas normais de referência — confirme sempre com a sua contabilidade. As taxas reduzidas por
              categoria de produto não são aplicadas automaticamente.
            </p>
            <div className="border rounded max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>País</TableHead>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead className="text-right w-28">Taxa normal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {euRates.map((r) => (
                    <TableRow key={r.country_code}>
                      <TableCell>{r.country_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.country_code}</TableCell>
                      <TableCell className="text-right">{Number(r.standard_rate)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}