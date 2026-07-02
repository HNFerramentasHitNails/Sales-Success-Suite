import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { ROLE_LABELS, ROLE_ORDER, roleLabel } from "@/lib/roles";
import { Copy } from "lucide-react";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLES: AppRole[] = ROLE_ORDER as AppRole[];

type MemberRow = {
  id: string;
  user_id: string;
  role: AppRole;
  status: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  status: string;
  expires_at: string;
};

export default function Team() {
  const { activeOrg, isAdmin } = useOrganization();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("sales_rep");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!activeOrg) return;
    const [m, i] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id, user_id, role, status, created_at")
        .eq("organization_id", activeOrg.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("invitations")
        .select("id, email, role, token, status, expires_at")
        .eq("organization_id", activeOrg.id)
        .eq("status", "pending"),
    ]);
    if (m.error) {
      toast({ title: "Erro ao carregar membros", description: m.error.message, variant: "destructive" });
    }
    if (i.error) {
      toast({ title: "Erro ao carregar convites", description: i.error.message, variant: "destructive" });
    }
    const memberRows = (m.data ?? []) as any[];

    // Buscar perfis em query separada (não há FK organization_members.user_id → profiles.id,
    // por isso o embed do PostgREST falha — juntamos manualmente).
    const userIds = memberRows.map((r) => r.user_id).filter(Boolean);
    let profById = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (pErr) {
        toast({ title: "Erro ao carregar perfis", description: pErr.message, variant: "destructive" });
      }
      profById = new Map((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
    }
    setMembers(
      memberRows.map((r) => ({ ...r, profiles: profById.get(r.user_id) ?? null })) as MemberRow[]
    );
    if (i.data) setInvites(i.data as InviteRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setBusy(true);
    const { data: within, error: limErr } = await supabase.rpc("org_within_user_limit", { _org_id: activeOrg.id });
    if (limErr) {
      setBusy(false);
      toast({ title: "Erro", description: limErr.message, variant: "destructive" });
      return;
    }
    if (within === false) {
      setBusy(false);
      toast({
        title: "Limite de utilizadores atingido",
        description: "O seu plano não permite mais utilizadores. Mude de plano em Administração → Plano.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("invitations")
      .insert({ organization_id: activeOrg.id, email, role });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Convite criado" });
      setEmail("");
      load();
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado" });
  };

  const updateRole = async (memberId: string, newRole: AppRole) => {
    const { error } = await supabase.from("organization_members").update({ role: newRole }).eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Remover este membro?")) return;
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  const cancelInvite = async (id: string) => {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Equipa</h1>
        <p className="text-muted-foreground text-sm">Membros e convites desta organização.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Convidar novo membro</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={invite} className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1">
                <Label htmlFor="invEmail">Email</Label>
                <Input id="invEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="w-full md:w-48">
                <Label>Papel</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={busy}>Convidar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Membros</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.profiles?.full_name ?? "—"}</TableCell>
                  <TableCell>{m.profiles?.email ?? "—"}</TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select value={m.role} onValueChange={(v) => updateRole(m.id, v as AppRole)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)}>Remover</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem membros.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && invites.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Convites pendentes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell><Badge variant="secondary">{roleLabel(i.role)}</Badge></TableCell>
                    <TableCell>{new Date(i.expires_at).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => copyLink(i.token)}>
                        <Copy className="h-3 w-3 mr-1" /> Copiar link
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelInvite(i.id)}>Cancelar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}