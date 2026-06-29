import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Campos de destino na BD
const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "name", label: "Nome", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "company_name", label: "Empresa" },
  { key: "vat_number", label: "NIF" },
  { key: "country", label: "País" },
  { key: "segment", label: "Segmento" },
  { key: "address", label: "Morada" },
  { key: "city", label: "Cidade" },
  { key: "postal_code", label: "Código Postal" },
  { key: "notes_short", label: "Notas" },
];

// Sinónimos por cabeçalho (lowercase, sem acentos)
const SYNONYMS: Record<string, string[]> = {
  name: ["nome", "name", "cliente", "customer"],
  email: ["email", "e-mail", "correio"],
  phone: ["telefone", "telemovel", "phone", "contacto", "tel", "no"],
  company_name: ["empresa", "company", "sociedade"],
  vat_number: ["nif", "vat", "contribuinte", "nipc"],
  country: ["pais", "country"],
  segment: ["segmento", "segment"],
  address: ["morada", "address", "rua"],
  city: ["cidade", "city", "localidade"],
  postal_code: ["codigo postal", "cp", "postal", "zip"],
  notes_short: ["notas", "notes", "observacoes"],
};

const IGNORE = "__ignore__";
const BATCH = 500;

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const norm = headers.map((h) => ({ raw: h, n: stripAccents(String(h)) }));
  for (const f of FIELDS) {
    const syns = SYNONYMS[f.key] || [];
    const found = norm.find((h) => syns.some((s) => h.n === s || h.n.includes(s)));
    map[f.key] = found ? found.raw : IGNORE;
  }
  return map;
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
};

export default function CustomerImportDialog({ open, onOpenChange, onImported }: Props) {
  const { activeOrg } = useOrganization();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [matchKey, setMatchKey] = useState<"email" | "phone" | "vat_number" | "none">("email");
  const [onDup, setOnDup] = useState<"update" | "skip">("update");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMatchKey("email");
    setOnDup("update");
    setBusy(false);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const onFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sh = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" });
      if (!json.length) {
        toast({ title: "Ficheiro vazio", description: "Não foram encontradas linhas.", variant: "destructive" });
        return;
      }
      const hdr = Object.keys(json[0]);
      setHeaders(hdr);
      setRows(json);
      setMapping(autoMap(hdr));
      setFileName(file.name);
    } catch (e) {
      toast({ title: "Erro a ler ficheiro", description: (e as Error).message, variant: "destructive" });
    }
  }, []);

  const mappedRows = useMemo(() => {
    return rows.map((r) => {
      const o: Record<string, string> = {};
      for (const f of FIELDS) {
        const col = mapping[f.key];
        if (!col || col === IGNORE) continue;
        const v = r[col];
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (s) o[f.key] = s;
      }
      return o;
    });
  }, [rows, mapping]);

  const preview = useMemo(() => mappedRows.slice(0, 5), [mappedRows]);
  const mappedFields = useMemo(() => FIELDS.filter((f) => mapping[f.key] && mapping[f.key] !== IGNORE), [mapping]);
  const nameMapped = mapping.name && mapping.name !== IGNORE;

  const runImport = async () => {
    if (!activeOrg) return;
    setBusy(true);
    let ins = 0, upd = 0, skip = 0, total = 0;
    try {
      for (let i = 0; i < mappedRows.length; i += BATCH) {
        const chunk = mappedRows.slice(i, i + BATCH);
        const { data, error } = await supabase.rpc("import_customers", {
          p_org: activeOrg.id,
          p_rows: chunk as never,
          p_match: matchKey === "none" ? "none" : matchKey,
          p_on_dup: onDup,
        });
        if (error) throw error;
        const d = data as { inserted: number; updated: number; skipped: number; total: number };
        ins += d.inserted; upd += d.updated; skip += d.skipped; total += d.total;
      }
      setResult({ inserted: ins, updated: upd, skipped: skip, total });
      toast({ title: "Importação concluída", description: `${ins} inseridos · ${upd} atualizados · ${skip} ignorados` });
    } catch (e) {
      toast({ title: "Erro na importação", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onImported();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-2">
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
                <Label className="text-xs">Chave de correspondência</Label>
                <Select value={matchKey} onValueChange={(v) => setMatchKey(v as typeof matchKey)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="vat_number">NIF</SelectItem>
                    <SelectItem value="none">Nenhuma (inserir sempre)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Se já existir</Label>
                <Select value={onDup} onValueChange={(v) => setOnDup(v as typeof onDup)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="update">Atualizar</SelectItem>
                    <SelectItem value="skip">Ignorar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!nameMapped && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>O campo <strong>Nome</strong> é obrigatório. Escolha a coluna de origem.</span>
              </div>
            )}

            <div>
              <Label className="text-xs">Pré-visualização (5 primeiras linhas)</Label>
              <div className="border rounded-md overflow-x-auto mt-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {mappedFields.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {mappedFields.map((f) => <TableCell key={f.key} className="text-sm">{r[f.key] || "—"}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              <Button disabled={!nameMapped} onClick={() => setStep(3)}>Seguinte</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!result && (
              <div className="text-sm text-muted-foreground">
                Pronto para importar <strong>{mappedRows.length}</strong> clientes da organização <strong>{activeOrg?.name}</strong>.
              </div>
            )}
            {result && (
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Importação concluída</span>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div><div className="text-2xl font-bold tabular-nums">{result.inserted}</div><div className="text-muted-foreground">Inseridos</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.updated}</div><div className="text-muted-foreground">Atualizados</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.skipped}</div><div className="text-muted-foreground">Ignorados</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{result.total}</div><div className="text-muted-foreground">Total</div></div>
                </div>
              </div>
            )}
            <DialogFooter>
              {!result && <Button variant="outline" onClick={() => setStep(2)} disabled={busy}>Voltar</Button>}
              {!result && (
                <Button onClick={runImport} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar {mappedRows.length} clientes
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