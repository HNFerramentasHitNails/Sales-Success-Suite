import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

type OrderRow = {
  id: string; order_number: string | null; order_date: string | null;
  status: string | null; subtotal: number | null; tax_total: number | null; total: number | null; currency: string | null;
};
type InvoiceRow = {
  id: string; invoice_number: string | null; status: string | null;
  subtotal: number | null; tax_total: number | null; total: number | null; issued_at: string | null; pdf_url: string | null; currency: string | null;
};

function eur(n: number | null | undefined, cur = "EUR") {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur || "EUR" }).format(Number(n));
}
function d(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-PT");
}
function orderStatusVariant(s: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!s) return "secondary";
  if (s === "paga" || s === "faturada") return "default";
  if (s === "cancelada") return "destructive";
  return "secondary";
}

export default function CustomerStatementTab({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, i] = await Promise.all([
      supabase.from("orders")
        .select("id, order_number, order_date, status, subtotal, tax_total, total, currency")
        .eq("customer_id", customerId)
        .order("order_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("invoices")
        .select("id, invoice_number, status, subtotal, tax_total, total, issued_at, pdf_url, currency")
        .eq("customer_id", customerId)
        .order("issued_at", { ascending: false }),
    ]);
    setOrders(((o.data ?? []) as unknown) as OrderRow[]);
    setInvoices(((i.data ?? []) as unknown) as InvoiceRow[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const cur = orders[0]?.currency || invoices[0]?.currency || "EUR";
  const totalOrders = orders.reduce((s, r) => s + Number(r.total ?? r.subtotal ?? 0), 0);
  const totalInvoiced = invoices.reduce((s, r) => s + Number(r.total ?? 0), 0);

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">A carregar…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm border rounded p-3 bg-muted/20">
        <div><div className="text-xs text-muted-foreground">Nº de encomendas</div><div className="font-medium">{orders.length}</div></div>
        <div><div className="text-xs text-muted-foreground">Total encomendado</div><div className="font-medium">{eur(totalOrders, cur)}</div></div>
        <div><div className="text-xs text-muted-foreground">Nº de faturas</div><div className="font-medium">{invoices.length}</div></div>
        <div><div className="text-xs text-muted-foreground">Total faturado</div><div className="font-medium">{eur(totalInvoiced, cur)}</div></div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Encomendas</h4>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">S/IVA</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sem encomendas.</TableCell></TableRow>)}
              {orders.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{d(r.order_date)}</TableCell>
                  <TableCell className="font-medium">{r.order_number || "—"}</TableCell>
                  <TableCell><Badge variant={orderStatusVariant(r.status)}>{r.status || "—"}</Badge></TableCell>
                  <TableCell className="text-right">{eur(r.subtotal, r.currency || cur)}</TableCell>
                  <TableCell className="text-right">{eur(r.tax_total, r.currency || cur)}</TableCell>
                  <TableCell className="text-right">{eur(r.total ?? r.subtotal, r.currency || cur)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Faturas</h4>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nº</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sem faturas.</TableCell></TableRow>)}
              {invoices.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{d(r.issued_at)}</TableCell>
                  <TableCell className="font-medium">{r.invoice_number || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status || "—"}</Badge></TableCell>
                  <TableCell className="text-right">{eur(r.total, r.currency || cur)}</TableCell>
                  <TableCell>
                    {r.pdf_url ? (
                      <a href={r.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
                        PDF <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}