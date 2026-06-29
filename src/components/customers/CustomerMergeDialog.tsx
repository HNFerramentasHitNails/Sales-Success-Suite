import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type CustomerLite = { id: string; name: string; email: string | null };
type CustomerFull = Record<string, any> & { id: string };

const FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "company_name", label: "Empresa" },
  { key: "vat_number", label: "NIF" },
  { key: "country", label: "País" },
  { key: "customer_type", label: "Tipo de cliente" },
  { key: "address", label: "Morada" },
  { key: "city", label: "Cidade" },
  { key: "postal_code", label: "Código Postal" },
  { key: "notes_short", label: "Notas curtas" },
];

function display(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export default function CustomerMergeDialog({
  open, onOpenChange, onMerged,
}: { open: boolean; onOpenChange: (v: boolean) => void; onMerged: () => void }) {
  const { activeOrg } = useOrganization();
  const [list, setList] = useState<CustomerLite[]>([]);
  const [primaryId, setPrimaryId] = useState("");
  const [secondaryId, setSecondaryId] = useState("");
  const [primary, setPrimary] = useState<CustomerFull | null>(null);
  const [secondary, setSecondary] = useState<CustomerFull | null>(null);
  const [picks, setPicks] = useState<Record<string, "p" | "s">>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !activeOrg) return;
    setPrimaryId(""); setSecondaryId(""); setPrimary(null); setSecondary(null); setPicks({});
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, email")
        .eq("organization_id", activeOrg.id)
        .order("name");
      setList((data ?? []) as CustomerLite[]);
    })();
  }, [open, activeOrg]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!primaryId || !secondaryId || primaryId === secondaryId) {
        setPrimary(null); setSecondary(null); setPicks({}); return;
      }
      const cols = ["id", ...FIELDS.map((f) => f.key)].join(", ");
      const { data } = await supabase
        .from("customers")
        .select(cols)
        .in("id", [primaryId, secondaryId]);
      if (!active) return;
      const arr = ((data ?? []) as unknown) as CustomerFull[];
      const p = arr.find((x) => x.id === primaryId) ?? null;
      const s = arr.find((x) => x.id === secondaryId) ?? null;
      setPrimary(p); setSecondary(s);
      const init: Record<string, "p" | "s"> = {};
      FIELDS.forEach((f) => { init[f.key] = "p"; });
      setPicks(init);
    })();
    return () => { active = false; };
  }, [primaryId, secondaryId]);

  const secondaryOptions = useMemo(() => list.filter((c) => c.id !== primaryId), [list, primaryId]);
  const primaryOptions = useMemo(() => list.filter((c) => c.id !== secondaryId), [list, secondaryId]);

  const submit = async () => {
    if (!primaryId || !secondaryId || primaryId === secondaryId) return;
    setBusy(true);
    try {
      const updates: Record<string, any> = {};
      if (primary && secondary) {
        FIELDS.forEach((f) => {
          if (picks[f.key] === "s") updates[f.key] = secondary[f.key] ?? null;
        });
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("customers").update(updates as never).eq("id", primaryId);
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc("merge_customers", { p_primary: primaryId, p_secondary: secondaryId });
      if (error) throw error;
      const r = (data ?? {}) as { orders?: number; invoices?: number };
      toast.success(`Clientes fundidos — ${r.orders ?? 0} encomendas, ${r.invoices ?? 0} faturas movidas`);
      onMerged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao fundir clientes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Fundir clientes duplicados</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cliente a MANTER (primário)</Label>
              <Select value={primaryId} onValueChange={setPrimaryId}>
                <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {primaryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cliente a REMOVER (secundário)</Label>
              <Select value={secondaryId} onValueChange={setSecondaryId}>
                <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {secondaryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {primary && secondary && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Campo</TableHead>
                    <TableHead>Primário (manter)</TableHead>
                    <TableHead>Secundário (remover)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FIELDS.map((f) => {
                    const vp = primary[f.key] ?? null;
                    const vs = secondary[f.key] ?? null;
                    const same = (vp ?? "") === (vs ?? "");
                    return (
                      <TableRow key={f.key}>
                        <TableCell className="font-medium">{f.label}</TableCell>
                        {same ? (
                          <TableCell colSpan={2} className="text-muted-foreground">{display(vp)}</TableCell>
                        ) : (
                          <>
                            <TableCell>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`pick-${f.key}`}
                                  checked={(picks[f.key] ?? "p") === "p"}
                                  onChange={() => setPicks((m) => ({ ...m, [f.key]: "p" }))}
                                />
                                <span>{display(vp)}</span>
                              </label>
                            </TableCell>
                            <TableCell>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`pick-${f.key}`}
                                  checked={picks[f.key] === "s"}
                                  onChange={() => setPicks((m) => ({ ...m, [f.key]: "s" }))}
                                />
                                <span>{display(vs)}</span>
                              </label>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>O cliente secundário será ELIMINADO. Encomendas, faturas, chamadas, carteira (saldo somado) e notas passam para o primário. Esta ação é irreversível.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !primaryId || !secondaryId || primaryId === secondaryId}>
            {busy ? "A fundir…" : "Fundir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}