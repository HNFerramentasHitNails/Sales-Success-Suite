import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ExternalLink } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { vatBadgeInfo } from "@/lib/vat";

type Row = {
  id: string;
  invoice_number: string | null;
  status: "pending" | "issued" | "error";
  external_status: "not_synced" | "pending" | "synced" | "error";
  currency: string;
  total: number;
  issued_at: string | null;
  created_at: string;
  pdf_url: string | null;
  error_message: string | null;
  orders: { order_number: string } | null;
  customers: { name: string } | null;
};

const STATUSES: { v: string; l: string; cls: string }[] = [
  { v: "pending", l: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { v: "issued",  l: "Emitida",  cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { v: "error",   l: "Erro",     cls: "bg-destructive/15 text-destructive" },
];
const EXTERNAL_STATUSES: Record<string, { l: string; cls: string }> = {
  not_synced: { l: "Não sincronizada", cls: "bg-muted text-muted-foreground" },
  pending:    { l: "A sincronizar",    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  synced:     { l: "Sincronizada",     cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  error:      { l: "Erro sinc.",       cls: "bg-destructive/15 text-destructive" },
};
const PAGE_SIZE = 25;

function fmtMoney(v: number, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; }
}

export default function Invoices() {
  const { activeOrg } = useOrganization();
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [loading, setLoading] = useState(false);
  const currency = activeOrg?.currency || "EUR";

  // Detalhe da fatura
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLines, setDetailLines] = useState<any[]>([]);

  const openDetail = async (invoiceId: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLines([]);
    setDetailLoading(true);
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, external_status, currency, subtotal, tax_total, total, issued_at, created_at, pdf_url, error_message, order_id, customer_id, vat_treatment, vat_exemption_reason, orders(order_number, order_date, notes, vat_destination_rate, ship_to_name, ship_to_address, ship_to_city, ship_to_postal_code, ship_to_country), customers(name, email, vat_number, company_name, address, city, postal_code, country)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error || !inv) {
      setDetailLoading(false);
      toast({ title: "Erro", description: error?.message ?? "Fatura não encontrada", variant: "destructive" });
      return;
    }
    setDetail(inv);
    if (inv.order_id) {
      const { data: lines, error: lErr } = await supabase
        .from("order_lines")
        .select("id, description, quantity, unit_price, tax_rate, discount_percent, line_subtotal, line_tax, line_total")
        .eq("order_id", inv.order_id)
        .order("created_at", { ascending: true });
      if (lErr) toast({ title: "Erro ao carregar linhas", description: lErr.message, variant: "destructive" });
      setDetailLines(lines ?? []);
    }
    setDetailLoading(false);
  };

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    let q = supabase.from("invoices")
      .select("id, invoice_number, status, external_status, currency, total, issued_at, created_at, pdf_url, error_message, orders(order_number), customers(name)", { count: "exact" })
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.ilike("invoice_number", `%${s}%`);
    }
    if (statusFilter !== "__all__") q = q.eq("status", statusFilter);
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count: c, error } = await q;
    setLoading(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setRows((data ?? []) as unknown as Row[]);
    setCount(c ?? 0);
  }, [activeOrg, search, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Faturas</h1>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Pesquisar por nº de fatura…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os estados</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº fatura</TableHead>
                <TableHead className="hidden md:table-cell">Encomenda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Sincronização</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sem faturas.</TableCell></TableRow>}
              {!loading && rows.map((r) => {
                const st = STATUSES.find((s) => s.v === r.status);
                const ext = EXTERNAL_STATUSES[r.external_status] ?? EXTERNAL_STATUSES.not_synced;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(r.id)}
                  >
                    <TableCell className="font-medium">{r.invoice_number ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.orders?.order_number ?? "—"}</TableCell>
                    <TableCell>{r.customers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge className={st?.cls} variant="secondary">{st?.l ?? r.status}</Badge>
                        {r.status === "error" && r.error_message && (
                          <span className="text-[10px] text-destructive truncate max-w-[280px]" title={r.error_message}>{r.error_message}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        <Badge className={ext.cls} variant="secondary">{ext.l}</Badge>
                        {r.external_status === "error" && r.error_message && (
                          <span className="text-[10px] text-destructive truncate max-w-[280px]" title={r.error_message}>{r.error_message}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{fmtDate(r.issued_at ?? r.created_at)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(Number(r.total), r.currency || currency)}</TableCell>
                    <TableCell className="text-right">
                      {r.pdf_url && (
                        <Button size="sm" variant="ghost" asChild title="Abrir PDF" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={r.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} {count === 1 ? "fatura" : "faturas"}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Seguinte</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe da fatura</DialogTitle>
          </DialogHeader>
          {detailLoading && !detail && (
            <div className="py-8 text-center text-muted-foreground text-sm">A carregar…</div>
          )}
          {detail && (() => {
            const st = STATUSES.find((s) => s.v === detail.status);
            const ext = EXTERNAL_STATUSES[detail.external_status] ?? EXTERNAL_STATUSES.not_synced;
            const cur = detail.currency || currency;
            const o = detail.orders;
            const c = detail.customers;
            const addrParts = [
              c?.address,
              [c?.postal_code, c?.city].filter(Boolean).join(" "),
              c?.country,
            ].filter((s) => s && String(s).trim().length > 0);
            return (
              <div className="space-y-6">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{detail.invoice_number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      Emitida em {fmtDate(detail.issued_at ?? detail.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={st?.cls} variant="secondary">{st?.l ?? detail.status}</Badge>
                    <Badge className={ext.cls} variant="secondary">{ext.l}</Badge>
                  </div>
                </div>
                {(detail.status === "error" || detail.external_status === "error") && detail.error_message && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                    {detail.error_message}
                  </div>
                )}

                {/* Encomenda & Cliente */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Encomenda</div>
                    <div className="text-sm">{o?.order_number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(o?.order_date ?? null)}</div>
                    {o?.notes && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{o.notes}</div>}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cliente</div>
                    <div className="text-sm font-medium">{c?.name ?? "—"}</div>
                    {c?.company_name && <div className="text-xs">{c.company_name}</div>}
                    {c?.vat_number && <div className="text-xs text-muted-foreground">NIF: {c.vat_number}</div>}
                    {c?.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                    {addrParts.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {addrParts.map((p, i) => <div key={i}>{p}</div>)}
                      </div>
                    )}
                  </div>
                  {(o?.ship_to_country || o?.ship_to_address) && (
                    <div className="space-y-1 md:col-span-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Morada de entrega</div>
                      {o?.ship_to_name && <div className="text-sm">{o.ship_to_name}</div>}
                      {o?.ship_to_address && <div className="text-xs text-muted-foreground">{o.ship_to_address}</div>}
                      <div className="text-xs text-muted-foreground">
                        {[o?.ship_to_postal_code, o?.ship_to_city].filter(Boolean).join(" ")}
                        {o?.ship_to_country ? ` · ${o.ship_to_country}` : ""}
                      </div>
                    </div>
                  )}
                  {detail.vat_treatment && (() => {
                    const info = vatBadgeInfo(detail.vat_treatment, o?.vat_destination_rate);
                    return (
                      <div className="space-y-1 md:col-span-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Regime de IVA</div>
                        <Badge className={info.className} variant="secondary">{info.label}</Badge>
                        {detail.vat_exemption_reason && (
                          <p className="text-[11px] italic text-muted-foreground">{detail.vat_exemption_reason}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Linhas */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Linhas faturadas</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço unit.</TableHead>
                        <TableHead className="text-right">IVA (%)</TableHead>
                        <TableHead className="text-right">Desc. (%)</TableHead>
                        <TableHead className="text-right">Total linha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailLines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">Sem linhas.</TableCell>
                        </TableRow>
                      )}
                      {detailLines.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.description ?? "—"}</TableCell>
                          <TableCell className="text-right">{l.quantity ?? "—"}</TableCell>
                          <TableCell className="text-right">{l.unit_price != null ? fmtMoney(Number(l.unit_price), cur) : "—"}</TableCell>
                          <TableCell className="text-right">{l.tax_rate != null ? `${Number(l.tax_rate)}%` : "—"}</TableCell>
                          <TableCell className="text-right">{l.discount_percent != null ? `${Number(l.discount_percent)}%` : "—"}</TableCell>
                          <TableCell className="text-right font-medium">{l.line_total != null ? fmtMoney(Number(l.line_total), cur) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Totais */}
                <div className="flex justify-end">
                  <div className="w-full md:w-72 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal (s/IVA)</span>
                      <span>{detail.subtotal != null ? fmtMoney(Number(detail.subtotal), cur) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IVA</span>
                      <span>{detail.tax_total != null ? fmtMoney(Number(detail.tax_total), cur) : "—"}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total</span>
                      <span>{fmtMoney(Number(detail.total ?? 0), cur)}</span>
                    </div>
                  </div>
                </div>

                {detail.pdf_url && (
                  <div className="flex justify-end">
                    <Button asChild variant="outline" size="sm">
                      <a href={detail.pdf_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" /> Abrir PDF
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}