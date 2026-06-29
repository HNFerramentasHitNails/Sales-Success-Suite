import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function Onboarding() {
  const { user } = useAuth();
  const { memberships, refresh, switchOrg } = useOrganization();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (memberships.length > 0) return <Navigate to="/app/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", { p_name: name.trim() });
    setBusy(false);
    if (error || !data) {
      toast({ title: "Erro a criar organização", description: error?.message, variant: "destructive" });
      return;
    }
    switchOrg(data.id);
    await refresh();
    navigate("/app/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bem-vindo!</CardTitle>
          <CardDescription>Vamos criar a sua organização para começar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="orgName">Nome da empresa</Label>
              <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
              Criar organização
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}