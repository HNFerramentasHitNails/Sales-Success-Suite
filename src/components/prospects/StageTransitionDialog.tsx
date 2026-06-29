import { FormEvent, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import type { CustomerOption } from "./ProspectFormDialog";

type Prospect = Database["public"]["Tables"]["prospects"]["Row"];
type Stage = Database["public"]["Enums"]["pipeline_stage"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: Prospect | null;
  toStage: Stage | null;
  customers: CustomerOption[];
  onDone: () => void;
};

export default function StageTransitionDialog({ open, onOpenChange, prospect, toStage, customers, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [wonValue, setWonValue] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [lostReason, setLostReason] = useState("");

  useEffect(() => {
    if (open && prospect) {
      setWonValue(prospect.estimated_value != null ? String(prospect.estimated_value) : "");
      setCustomerId(prospect.customer_id ?? "");
      setLostReason("");
    }
  }, [open, prospect]);

  if (!prospect || !toStage) return null;
  const isWon = toStage === "ganho";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const update: Partial<Prospect> = { pipeline_stage: toStage };
    if (isWon) {
      update.won_value = wonValue ? Number(wonValue) : null;
      update.customer_id = customerId || null;
    } else {
      update.lost_reason = lostReason.trim() || null;
    }
    const { error } = await supabase.from("prospects").update(update).eq("id", prospect.id);
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: isWon ? "Marcado como ganho" : "Marcado como perdido" });
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isWon ? "Marcar como ganho" : "Marcar como perdido"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {isWon ? (
            <>
              <div>
                <Label>Valor ganho (€)</Label>
                <Input type="number" step="0.01" min="0" value={wonValue} onChange={(e) => setWonValue(e.target.value)} required />
              </div>
              <div>
                <Label>Associar a cliente existente</Label>
                <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.company_name ? ` · ${c.company_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div>
              <Label>Motivo da perda</Label>
              <Textarea value={lostReason} onChange={(e) => setLostReason(e.target.value)} rows={3} required maxLength={500} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}