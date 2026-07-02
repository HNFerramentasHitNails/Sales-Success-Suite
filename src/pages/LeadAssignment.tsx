import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Shuffle, Save, ArrowUp, ArrowDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = {
  user_id: string;
  name: string;
  in_pool: boolean;
  is_active: boolean;
  sort_order: number;
};

export default function LeadAssignment() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const canManage = isAdmin || role === "sales_director";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [lastUser, setLastUser] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);

    const [s, m, p, st] = await Promise.all([
      supabase.from("lead_assignment_settings").select("id, enabled").eq("organization_id", activeOrg.id).maybeSingle(),
      supabase.from("organization_members").select("user_id").eq("organization_id", activeOrg.id).eq("status", "active"),
      supabase.from("lead_assignment_pool").select("user_id, is_active, sort_order").eq("organization_id", activeOrg.id),
      supabase.from("lead_assignment_state").select("last_user_id").eq("organization_id", activeOrg.id).maybeSingle(),
    ]);

    setSettingsId((s.data as any)?.id ?? null);
    setEnabled((s.data as any)?.enabled ?? false);

    const memberUids = ((m.data ?? []) as any[]).map((x) => x.user_id as string);
    let profs: { id: string; full_name: string | null; email: string | null }[] = [];
    if (memberUids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", memberUids);
      profs = (data ?? []) as any;
    }
    const nameOf = (uid: string) => {
      const pr = profs.find((x) => x.id === uid);
      return pr?.full_name || pr?.email || "—";
    };

    const poolMap = new Map<string, { is_active: boolean; sort_order: number }>();
    ((p.data ?? []) as any[]).forEach((r) => poolMap.set(r.user_id, { is_active: r.is_active, sort_order: r.sort_order }));

    const merged: Row[] = memberUids.map((uid) => {
      const pp = poolMap.get(uid);
      return {
        user_id: uid,
        name: nameOf(uid),
        in_pool: !!pp,
        is_active: pp?.is_active ?? true,
        sort_order: pp?.sort_order ?? 999,
      };
    });
    merged.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    // normalize order indices for UI
    merged.forEach((r, i) => (r.sort_order = i));
    setRows(merged);

    const lastUid = (st.data as any)?.last_user_id ?? null;
    if (lastUid) {
      setLastUser({ id: lastUid, name: nameOf(lastUid) });
    } else {
      setLastUser(null);
    }
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => { load(); }, [load]);

  if (!canManage) return <Navigate to="/app/dashboard" replace />;

  function toggleInPool(uid: string, v: boolean) {
    setRows((rs) => rs.map((r) => r.user_id === uid ? { ...r, in_pool: v, is_active: v ? true : r.is_active } : r));
  }
  function move(uid: string, dir: -1 | 1) {
    setRows((rs) => {
      const arr = [...rs];
      const i = arr.findIndex((r) => r.user_id === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return rs;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      arr.forEach((r, k) => (r.sort_order = k));
      return arr;
    });
  }

  async function save() {
    if (!activeOrg) return;
    setSaving(true);

    // 1) settings
    const settingsPayload = { organization_id: activeOrg.id, enabled };
    let err1 = settingsId
      ? (await supabase.from("lead_assignment_settings").update(settingsPayload).eq("id", settingsId)).error
      : (await supabase.from("lead_assignment_settings").insert(settingsPayload)).error;
    if (err1) {
      setSaving(false);
      toast({ title: "Erro a guardar definições", description: err1.message, variant: "destructive" });
      return;
    }

    // 2) pool — upsert in-pool, delete not-in-pool
    const inPool = rows.filter((r) => r.in_pool);
    const outPool = rows.filter((r) => !r.in_pool);

    if (outPool.length) {
      const { error } = await supabase.from("lead_assignment_pool")
        .delete()
        .eq("organization_id", activeOrg.id)
        .in("user_id", outPool.map((r) => r.user_id));
      if (error) {
        setSaving(false);
        toast({ title: "Erro a remover do pool", description: error.message, variant: "destructive" });
        return;
      }
    }
    if (inPool.length) {
      const payload = inPool.map((r) => ({
        organization_id: activeOrg.id,
        user_id: r.user_id,
        is_active: r.is_active,
        sort_order: r.sort_order,
      }));
      const { error } = await supabase.from("lead_assignment_pool")
        .upsert(payload, { onConflict: "organization_id,user_id" });
      if (error) {
        setSaving(false);
        toast({ title: "Erro a guardar o pool", description: error.message, variant: "destructive" });
        return;
      }
    }

    setSaving(false);
    toast({ title: "Configuração guardada" });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<Shuffle className="h-6 w-6" />}
        title="Atribuição de leads"
        description="Round-robin: distribui automaticamente novos prospects pelos comerciais do pool."
        actions={
          <Button onClick={save} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "A guardar..." : "Guardar"}
          </Button>
        }
      />

      <div data-tour="lead-assignment-config">
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className="p-5 space-y-4" data-tour="lead-assignment-pool">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Atribuição automática (round-robin)</div>
                <div className="text-sm text-muted-foreground">
                  Aplica-se apenas a prospects/leads criados sem comercial atribuído (inclui importações e API). A atribuição manual continua disponível.
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="border-t pt-4">
              <div className="font-semibold mb-2">Pool de comerciais</div>
              <div className="text-sm text-muted-foreground mb-3">
                Selecione quem participa na rotação e a ordem. Apenas membros ativos da organização.
              </div>

              {rows.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border rounded">Sem membros ativos.</div>
              ) : (
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <div key={r.user_id} className="flex items-center gap-3 p-2 border rounded">
                      <Checkbox
                        id={`p-${r.user_id}`}
                        checked={r.in_pool}
                        onCheckedChange={(v) => toggleInPool(r.user_id, !!v)}
                      />
                      <Label htmlFor={`p-${r.user_id}`} className="flex-1 cursor-pointer">
                        {r.name}
                      </Label>
                      {r.in_pool && (
                        <span className="text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => move(r.user_id, -1)} disabled={i === 0 || !r.in_pool}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move(r.user_id, 1)} disabled={i === rows.length - 1 || !r.in_pool}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 space-y-3 h-fit" data-tour="lead-assignment-status">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4" /> Estado da rotação
            </div>
            <div className="text-sm">
              {lastUser ? (
                <>
                  Última atribuição: <span className="font-medium">{lastUser.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Ainda não houve atribuições automáticas.</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground border-t pt-3">
              A rotação segue a ordem definida no pool. Após o último, volta ao primeiro (wrap-around). Quando o pool está vazio, o lead fica sem responsável.
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}