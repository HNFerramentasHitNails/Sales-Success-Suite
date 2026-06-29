import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Movement = {
  created_at: string;
  delta: number;
  reason: string;
  balance_after: number | null;
  notes: string | null;
};

const REASON_LABEL: Record<string, string> = {
  order_committed: "Encomenda",
  order_reverted: "Devolução de encomenda",
  manual_adjustment: "Ajuste manual",
};

export default function StockAdjustDialog({
  open, onOpenChange, productId, productName, currentStock, onAdjusted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName: string;
  currentStock: number;
  onAdjusted: () => void;
}) {
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [movs, setMovs] = useState<Movement[]>([]);

  const loadMovs = useCallback(async () => {
    if (!productId) { setMovs([]); return; }
    const { data } = await supabase
      .from("stock_movements")
      .select("created_at, delta, reason, balance_after, notes")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(15);
    setMovs((data ?? []) as Movement[]);
  }, [productId]);

  useEffect(() => {
    if (open) { setType("entrada"); setQty("1"); setReason(""); loadMovs(); }
  }, [open, loadMovs]);

  const submit = async () => {
    if (!productId) return;
    const q = Number(qty);
    if (!q || q <= 0) { toast({ title: "Quantidade inválida", variant: "destructive" }); return; }
    setBusy(true);
    const delta = type === "entrada" ? q : -q;
    const { data, error } = await supabase.rpc("adjust_product_stock" as any, {
      p_product: productId, p_delta: delta, p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Stock atualizado: ${Number(data) ?? "—"}` });
    onAdjusted();
    loadMovs();
    setQty("1");
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar stock — {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Stock atual: <span className="font-semibold text-foreground tabular-nums">{currentStock}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "entrada" | "saida")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="0" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo (opcional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ex.: receção de mercadoria" />
          </div>

          <div className="pt-3 border-t">
            <div className="text-sm font-medium mb-2">Últimos movimentos</div>
            {movs.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">Sem movimentos.</div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {movs.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <div className="flex flex-col">
                      <span>{new Date(m.created_at).toLocaleString("pt-PT")}</span>
                      <span className="text-muted-foreground">{REASON_LABEL[m.reason] ?? m.reason}{m.notes ? ` — ${m.notes}` : ""}</span>
                    </div>
                    <div className="text-right">
                      <div className={`tabular-nums font-medium ${Number(m.delta) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {Number(m.delta) > 0 ? "+" : ""}{Number(m.delta)}
                      </div>
                      <div className="text-muted-foreground tabular-nums">Saldo: {m.balance_after ?? "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={submit} disabled={busy}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}