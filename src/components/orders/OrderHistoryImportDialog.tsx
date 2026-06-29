import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const IGNORE = "__ignore__";
const BATCH = 200;

type MatchKey = "email" | "phone" | "vat_number" | "name";
type OrderStatusOpt = "paga" | "faturada";

const FIELDS: { key: "customer" | "order_date" | "value" | "order_number"; label: string; required?: boolean }[] = [
  { key: "customer", label: "Cliente", required: true },
  { key: "order_date", label: "Data", required: true },
  { key: "value", label: "Valor (líquido s/IVA)", required: true },
  { key: "order_number", label: "Nº encomenda (opcional)" },
];

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const SYN_DATE = ["data", "date", "dia"];
const SYN_VALUE = ["valor", "total", "montante", "liquido", "net", "amount"];
const SYN_ORDNUM = ["encomenda", "order", "fatura", "nº", "no", "numero", "documento", "doc"];
const SYN_CUSTOMER: Record<MatchKey, string[]> = {
  email: ["email", "e-mail", "correio"],
  phone: ["telefone", "telemovel", "phone", "contacto", "tel"],
  vat_number: ["nif", "vat", "contribuinte", "nipc"],
  name: ["cliente", "customer", "nome", "name"],
};

function autoMap(headers: string[], matchKey: MatchKey): Record<string, string> {
  const norm = headers.map((h) => ({ raw: h, n: stripAccents(String(h)) }));
  const findBy = (syns: string[]) =>
    norm.find((h) => syns.some((s) => h.n === s || h.n.includes(s)))?.raw || IGNORE;
  return {
    customer: findBy(SYN_CUSTOMER[matchKey]),
    order_date: findBy(SYN_DATE),
    value: findBy(SYN_VALUE),
    order_number: findBy(SYN_ORDNUM),
  };
}

function normalizeValue(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[€$£\s]/g, "");
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
};

type ImportResult = {
  inserted: number;
  no_customer: number;
  duplicates: number;
  invalid: number;
  customers_touched: number;
  total: number;
};

export default function OrderHistoryImportDialog({ open, onOpenChange, onImported }: Props) {
  const { activeOrg } = useOrganization();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchKey, setMatchKey] = useState<MatchKey>("email");
  const [statusOpt, setStatusOpt] = useState<OrderStatusOpt>("paga");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1); setFileName(""); setHeaders([]); setRows([]); setMapping({});
    setMatchKey("email"); setStatusOpt("paga"); setBusy(false); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleClose = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const onFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sh = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "", raw: false });
      if (!json.length) {
        toast({ title: "Ficheiro vazio", description: "Não foram encontradas linhas.", variant: "destructive" });
        return;
      }
      const hdr = Object.keys(json[0]);
      setHeaders(hdr);
      setRows(json);
      setMapping(autoMap(hdr, matchKey));
      setFileName(file.name);
    } catch (e) {
      toast({ title: "Erro a ler ficheiro", description: (e as Error).message, variant: "destructive" });
    }
  }, [matchKey]);

  // Reaplica auto-map dos campos de cliente quando muda a chave
  const onMatchKeyChange = (v: MatchKey) => {
    setMatchKey(v);
    if (headers.length) {
      setMapping((m) => ({ ...m, customer: autoMap(headers, v).customer || m.customer }));
    }
  };

  const normalizedRows = useMemo(() => {
    return rows.map((r) => {
      const cCol = mapping.customer; const dCol = mapping.order_date;
      const vCol = mapping.value; const nCol = mapping.order_number;
      const customer = cCol && cCol !== IGNORE ? String(r[cCol] ?? "").trim() : "";
      const dRaw = dCol && dCol !== IGNORE ? r[dCol] : null;
      const vRaw = vCol && vCol !== IGNORE ? r[vCol] : null;
      const nRaw = nCol && nCol !== IGNORE ? String(r[nCol] ?? "").trim() : "";
      const order_date = normalizeDate(dRaw);
      const valueNum = normalizeValue(vRaw);
      return {
        customer,
        order_date: order_date ?? "",
        value: valueNum === null ? "" : String(valueNum),
        order_number: nRaw,
      };
    });
  }, [rows, mapping]);

  const preview = useMemo(() => normalizedRows.slice(0, 5), [normalizedRows]);

  const requiredMapped =
    mapping.customer && mapping.customer !== IGNORE &&
    mapping.order_date && mapping.order_date !== IGNORE &&
    mapping.value && mapping.value !== IGNORE;

  const runImport = async () => {
    if (!activeOrg) return;
    setBusy(true);
    const acc: ImportResult = { inserted: 0, no_customer: 0, duplicates: 0, invalid: 0, customers_touched: 0, total: 0 };
    try {
      for (let i = 0; i < normalizedRows.length; i += BATCH) {
        const chunk = normalizedRows.slice(i, i + BATCH);
        const { data, error } = await supabase.rpc("import_orders", {
          p_org: activeOrg.id,
          p_rows: chunk as never,
          p_match: matchKey,
          p_status: statusOpt,
        });
        if (error) throw error;
        const d = data as ImportResult;
        acc.inserted += d.inserted ?? 0;
        acc.no_customer += d.no_customer ?? 0;
        acc.duplicates += d.duplicates ?? 0;
        acc.invalid += d.invalid ?? 0;
        acc.customers_touched += d.customers_touched ?? 0;
        acc.total += d.total ?? 0;
      }
      setResult(acc);
      toast({ title: "Importação concluída", description: `${acc.inserted} inseridas · ${acc.no_customer} sem cliente · ${acc.duplicates} duplicadas` });
    } catch (e) {
      toast({ title: "Erro na importação", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const finish = () => { onImported(); handleClose(false); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar histórico de encomendas</DialogTitle>
          <DialogDescription>
            Passo {step} de 3 — {step === 1 ? "Carregar ficheiro" : step === 2 ? "Mapear colunas e pré-visualizar" : "Importar e resultado"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium">Clique para escolher um ficheiro</p>
              <p className="text-sm text-muted-foreground">Suporta .csv, .xls e .xlsx</p>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
            </div>
            {fileName && (
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{fileName}</span>
                <span className="text-muted-foreground">— {rows.length} linhas detetadas</span>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={!rows.length} onClick={() => setStep(2)}>Seguinte</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {f.label}{f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select value={mapping[f.key] || IGNORE} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>— ignorar —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Corresponder cliente por</Label>
                <Select value={matchKey} onValueChange={(v) => onMatchKeyChange(v as MatchKey)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="vat_number">NIF</SelectItem>
                    <SelectItem value="name">Nome</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado das encomendas</Label>
                <Select value={statusOpt} onValueChange={(v) => setStatusOpt(v as OrderStatusOpt)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paga">Paga</SelectItem>
                    <SelectItem value="faturada">Faturada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!requiredMapped && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>Os campos <strong>Cliente</strong>, <strong>Data</strong> e <strong>Valor</strong> são obrigatórios.</span>
              </div>
            )}

            <div>
              <Label className="text-xs">Pré-visualização (5 primeiras linhas, já normalizadas)</Label>
              <div className="border rounded-md overflow-x-auto mt-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Nº</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{r.customer || "—"}</TableCell>
                        <TableCell className="text-sm">{r.order_date || "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums">{r.value || "—"}</TableCell>
                        <TableCell className="text-sm">{r.order_number || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button disabled={!requiredMapped} onClick={() => setStep(3)}>Seguinte</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!result && (
              <>
                <div className="text-sm text-muted-foreground">
                  Pronto para importar <strong>{normalizedRows.length}</strong> encomendas para <strong>{activeOrg?.name}</strong>.
                </div>
                <div className="flex items-start gap-2 text-sm bg-muted rounded-md p-3">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>As métricas RFM e o risco de churn dos clientes afetados são recalculados automaticamente no fim.</span>
                </div>
              </>
            )}
            {result && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Importação concluída</span>
                </div>
                <div className="grid grid-cols-5 gap-3 text-center text-sm">
                  <div><div className="text-2xl font-bold tabular-nums">{result.inserted}</div><div className="text-muted-foreground">Inseridas</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.no_customer}</div><div className="text-muted-foreground">Sem cliente</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.duplicates}</div><div className="text-muted-foreground">Duplicadas</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.invalid}</div><div className="text-muted-foreground">Inválidas</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.total}</div><div className="text-muted-foreground">Total</div></div>
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  Clientes atualizados: <strong className="text-foreground">{result.customers_touched}</strong>
                </div>
              </div>
            )}
            <DialogFooter>
              {!result && <Button variant="outline" onClick={() => setStep(2)} disabled={busy}>Voltar</Button>}
              {!result && (
                <Button onClick={runImport} disabled={busy || !normalizedRows.length}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar {normalizedRows.length} encomendas
                </Button>
              )}
              {result && <Button onClick={finish}>Concluir</Button>}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}