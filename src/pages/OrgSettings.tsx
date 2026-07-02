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
import { ColorPickerField } from "@/components/settings/ColorPickerField";

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

  // ---- Identidade legal (vendedor) ----
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [legalEmail, setLegalEmail] = useState("");
  const [legalPhone, setLegalPhone] = useState("");
  const [returnPolicy, setReturnPolicy] = useState("");
  const [withdrawalDays, setWithdrawalDays] = useState(14);
  const [rmaThreshold, setRmaThreshold] = useState("");
  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whCity, setWhCity] = useState("");
  const [whPostal, setWhPostal] = useState("");
  const [whCountry, setWhCountry] = useState("");
  const [legalBusy, setLegalBusy] = useState(false);

  // ---- Privacidade de colaboradores ----
  const [rankingsHideNames, setRankingsHideNames] = useState(false);
  const [rankBusy, setRankBusy] = useState(false);

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
      const o = activeOrg as any;
      setLegalName(o.legal_name ?? "");
      setTaxId(o.tax_id ?? "");
      setLegalAddress(o.legal_address ?? "");
      setLegalEmail(o.legal_email ?? "");
      setLegalPhone(o.legal_phone ?? "");
      setReturnPolicy(o.return_policy ?? "");
      setWithdrawalDays(Number(o.withdrawal_days ?? 14));
      setRmaThreshold(o.rma_dual_approval_threshold != null ? String(o.rma_dual_approval_threshold) : "");
      setWhName(o.warehouse_name ?? "");
      setWhAddress(o.warehouse_address ?? "");
      setWhCity(o.warehouse_city ?? "");
      setWhPostal(o.warehouse_postal_code ?? "");
      setWhCountry(o.warehouse_country ?? "");
      setRankingsHideNames(!!o.rankings_hide_names);
    }
  }, [activeOrg]);

  const saveRankings = async (next: boolean) => {
    if (!isAdmin || !activeOrg) return;
    setRankBusy(true);
    setRankingsHideNames(next);
    const { error } = await supabase
      .from("organizations")
      .update({ rankings_hide_names: next } as never)
      .eq("id", activeOrg.id);
    setRankBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setRankingsHideNames(!next); }
    else { toast({ title: "Definição guardada" }); await refresh(); }
  };

  const saveLegal = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setLegalBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        legal_name: legalName.trim() || null,
        tax_id: taxId.trim() || null,
        legal_address: legalAddress.trim() || null,
        legal_email: legalEmail.trim() || null,
        legal_phone: legalPhone.trim() || null,
        return_policy: returnPolicy.trim() || null,
        withdrawal_days: Number.isFinite(withdrawalDays) ? withdrawalDays : 14,
        rma_dual_approval_threshold: rmaThreshold.trim() === "" ? null : Number(rmaThreshold),
        warehouse_name: whName.trim() || null,
        warehouse_address: whAddress.trim() || null,
        warehouse_city: whCity.trim() || null,
        warehouse_postal_code: whPostal.trim() || null,
        warehouse_country: whCountry.trim() || null,
      } as never)
      .eq("id", activeOrg!.id);
    setLegalBusy(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Identidade legal guardada" });
      await refresh();
    }
  };

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
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Definições da Organização</h1>
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
              <Label htmlFor="color">Cor primária</Label>
              <ColorPickerField value={primaryColor} onChange={setPrimaryColor} disabled={!isAdmin} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* ============ Identidade legal (vendedor) ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Identidade legal e venda ao consumidor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveLegal} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Estes dados identificam a sua organização como <strong>vendedor</strong> e são apresentados ao
              cliente final no momento do pagamento (informação pré-contratual — DL 24/2014).
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="legal_name">Denominação legal</Label>
                <Input id="legal_name" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!isAdmin} placeholder="Ex.: Exemplo, Lda." />
              </div>
              <div>
                <Label htmlFor="tax_id">NIF</Label>
                <Input id="tax_id" value={taxId} onChange={(e) => setTaxId(e.target.value)} disabled={!isAdmin} placeholder="500000000" />
              </div>
            </div>
            <div>
              <Label htmlFor="legal_address">Morada / sede</Label>
              <Input id="legal_address" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} disabled={!isAdmin} placeholder="Rua, código postal, localidade, país" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="legal_email">Email de contacto</Label>
                <Input id="legal_email" type="email" value={legalEmail} onChange={(e) => setLegalEmail(e.target.value)} disabled={!isAdmin} placeholder="geral@exemplo.pt" />
              </div>
              <div>
                <Label htmlFor="legal_phone">Telefone</Label>
                <Input id="legal_phone" value={legalPhone} onChange={(e) => setLegalPhone(e.target.value)} disabled={!isAdmin} placeholder="+351 …" />
              </div>
            </div>
            <div className="grid md:grid-cols-[1fr_180px] gap-3">
              <div>
                <Label htmlFor="return_policy">Política de devoluções/reembolsos</Label>
                <Textarea id="return_policy" rows={2} value={returnPolicy} onChange={(e) => setReturnPolicy(e.target.value)} disabled={!isAdmin} maxLength={500} placeholder="Condições de devolução e reembolso aplicáveis às suas vendas." />
              </div>
              <div>
                <Label htmlFor="withdrawal_days">Livre resolução (dias)</Label>
                <Input id="withdrawal_days" type="number" min={0} max={365} value={withdrawalDays} onChange={(e) => setWithdrawalDays(parseInt(e.target.value || "0", 10))} disabled={!isAdmin} />
                <p className="text-[11px] text-muted-foreground mt-1">Por defeito 14 dias (consumidores).</p>
              </div>
            </div>
            <div className="grid md:grid-cols-[1fr_180px] gap-3">
              <div className="flex items-end">
                <p className="text-[11px] text-muted-foreground">Acima deste valor, a devolução tem de ser aprovada e regularizada por um responsável diferente de quem a criou (segregação de funções).</p>
              </div>
              <div>
                <Label htmlFor="rma_threshold">Limite p/ dupla aprovação (devoluções)</Label>
                <Input id="rma_threshold" type="number" min={0} step="0.01" value={rmaThreshold} onChange={(e) => setRmaThreshold(e.target.value)} disabled={!isAdmin} placeholder="sem limite" />
                <p className="text-[11px] text-muted-foreground mt-1">Vazio = controlo desligado.</p>
              </div>
            </div>

            {/* Morada de armazém (origem de carga para envios por transportadora) */}
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">Morada de armazém (origem de carga)</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label htmlFor="wh_name">Nome do armazém</Label>
                  <Input id="wh_name" value={whName} onChange={(e) => setWhName(e.target.value)} disabled={!isAdmin} placeholder="Ex.: Armazém Central" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="wh_address">Morada</Label>
                  <Input id="wh_address" value={whAddress} onChange={(e) => setWhAddress(e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <Label htmlFor="wh_city">Cidade</Label>
                  <Input id="wh_city" value={whCity} onChange={(e) => setWhCity(e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <Label htmlFor="wh_postal">Código Postal</Label>
                  <Input id="wh_postal" value={whPostal} onChange={(e) => setWhPostal(e.target.value)} disabled={!isAdmin} placeholder="0000-000" />
                </div>
                <div>
                  <Label htmlFor="wh_country">País (ISO)</Label>
                  <Input id="wh_country" value={whCountry} onChange={(e) => setWhCountry(e.target.value)} disabled={!isAdmin} placeholder="PT" maxLength={2} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Usada como morada de carga nos dados de transporte da fatura (envios por transportadora).</p>
            </div>

            {isAdmin ? (
              <Button type="submit" disabled={legalBusy}>Guardar</Button>
            ) : (
              <p className="text-sm text-muted-foreground">Apenas administradores podem editar.</p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ============ Privacidade de colaboradores ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Privacidade de colaboradores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 border rounded p-3">
            <div className="space-y-1">
              <Label className="text-sm">Ocultar nomes nos rankings</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, os comerciais veem os rankings de equipa de forma anónima (ex.: "Comercial #1");
                apenas gestores (admin/diretor) veem os nomes. Evita exposição desproporcionada entre colegas.
              </p>
            </div>
            <Switch checked={rankingsHideNames} onCheckedChange={saveRankings} disabled={!isAdmin || rankBusy} />
          </div>
          <p className="text-xs text-muted-foreground">
            Consulte o{" "}
            <a href="/colaboradores" target="_blank" rel="noopener noreferrer" className="underline">
              Aviso de Privacidade para Colaboradores
            </a>.
          </p>
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