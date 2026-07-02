import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Channel = { id: string; name: string; is_active: boolean };

export default function Channels() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [rows, setRows] = useState<Channel[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase.from("sales_channels").select("id, name, is_active").eq("organization_id", activeOrg.id).order("name");
    setRows((data ?? []) as Channel[]);
  }, [activeOrg]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!activeOrg || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("sales_channels").insert({ organization_id: activeOrg.id, name: name.trim() });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setName(""); load();
  };
  const toggle = async (c: Channel) => {
    const { error } = await supabase.from("sales_channels").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };
  const remove = async (c: Channel) => {
    if (!confirm(`Eliminar o canal "${c.name}"? As atribuições de produtos a este canal serão removidas.`)) return;
    const { error } = await supabase.from("sales_channels").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Canais de venda</h1>
          <p className="text-sm text-muted-foreground">Canais onde os produtos são vendidos · {activeOrg?.name}</p>
        </div>
      </div>
      {canWrite && (
        <Card><CardContent className="p-4 flex gap-2 items-end">
          <div className="flex-1 max-w-sm">
            <Input placeholder="Nome do canal (ex.: Loja Online, Marketplace)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <Button onClick={add} disabled={busy || !name.trim()}><Plus className="h-4 w-4 mr-1" /> Adicionar canal</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Canal</TableHead><TableHead className="w-32">Ativo</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Sem canais.</TableCell></TableRow>}
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Switch checked={c.is_active} onCheckedChange={() => canWrite && toggle(c)} disabled={!canWrite} /></TableCell>
                <TableCell>{canWrite && <Button size="sm" variant="ghost" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}