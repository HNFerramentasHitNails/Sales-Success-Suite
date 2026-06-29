import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X, UserCog, Tag, BadgeCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import type { MemberOption } from "./CustomerFormDialog";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type TagDef = Database["public"]["Tables"]["customer_tag_definitions"]["Row"];

type Props = {
  selected: Customer[];
  members: MemberOption[];
  tagDefs: TagDef[];
  onDone: () => void;
  onClear: () => void;
};

export default function CustomerBulkBar({ selected, members, tagDefs, onDone, onClear }: Props) {
  const [memberId, setMemberId] = useState<string>("");
  const [tagName, setTagName] = useState<string>("");
  const [busy, setBusy] = useState<null | "assign" | "addtag" | "removetag" | "vies">(null);
  const ids = selected.map((c) => c.id);

  const assign = async () => {
    if (!memberId) return;
    setBusy("assign");
    const { error } = await supabase
      .from("customers")
      .update({ assigned_member_id: memberId === "__none__" ? null : memberId })
      .in("id", ids);
    setBusy(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Comercial atribuído a ${ids.length} cliente(s)` });
    onDone();
  };

  const applyTag = async (mode: "add" | "remove") => {
    if (!tagName) return;
    setBusy(mode === "add" ? "addtag" : "removetag");
    const { error } = await supabase.rpc("bulk_customer_tags" as any, {
      p_ids: ids,
      p_add: mode === "add" ? [tagName] : [],
      p_remove: mode === "remove" ? [tagName] : [],
    });
    setBusy(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: mode === "add" ? `Etiqueta adicionada a ${ids.length} cliente(s)` : `Etiqueta removida de ${ids.length} cliente(s)` });
    onDone();
  };

  const validateVies = async () => {
    const withVat = selected.filter((c) => c.vat_number && c.vat_number.trim());
    if (withVat.length === 0) { toast({ title: "Nenhum dos selecionados tem NIF", variant: "destructive" }); return; }
    setBusy("vies");
    let ok = 0, invalid = 0, failed = 0;
    for (const c of withVat) {
      const country_code = (c.country?.trim() || "PT").toUpperCase();
      const { data, error } = await supabase.functions.invoke("validate-vat", {
        body: { country_code, vat_number: c.vat_number!.trim() },
      });
      if (error || !data) { failed++; continue; }
      const res = data as { vies_valid: boolean | null; name: string | null };
      const { error: upErr } = await supabase
        .from("customers")
        .update({ vat_valid: res.vies_valid, vat_validated_at: new Date().toISOString(), vat_validated_name: res.name })
        .eq("id", c.id);
      if (upErr) { failed++; continue; }
      if (res.vies_valid) ok++; else invalid++;
    }
    setBusy(null);
    toast({ title: "Validação VIES concluída", description: `${ok} válidos · ${invalid} inválidos${failed ? ` · ${failed} falharam` : ""}` });
    onDone();
  };

  return (
    <Card className="border-primary/40">
      <CardContent className="p-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{selected.length} selecionado(s)</span>

        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Comercial…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Remover atribuição —</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!memberId || busy !== null} onClick={assign}>
            {busy === "assign" ? "A atribuir…" : "Atribuir"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <Select value={tagName} onValueChange={setTagName}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Etiqueta…" /></SelectTrigger>
            <SelectContent>
              {tagDefs.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!tagName || busy !== null} onClick={() => applyTag("add")}>
            {busy === "addtag" ? "…" : "Adicionar"}
          </Button>
          <Button size="sm" variant="outline" disabled={!tagName || busy !== null} onClick={() => applyTag("remove")}>
            {busy === "removetag" ? "…" : "Remover"}
          </Button>
        </div>

        <Button size="sm" variant="outline" disabled={busy !== null} onClick={validateVies}>
          <BadgeCheck className="h-4 w-4 mr-1" />
          {busy === "vies" ? "A validar…" : "Validar NIF/VIES"}
        </Button>

        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear} disabled={busy !== null}>
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      </CardContent>
    </Card>
  );
}