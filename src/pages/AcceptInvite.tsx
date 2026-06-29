import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { refresh, switchOrg } = useOrganization();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) toast({ title: "Token em falta", variant: "destructive" });
  }, [token]);

  const accept = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setDone(true);
    await refresh();
    if (data) switchOrg(data as string);
    setTimeout(() => navigate("/app/dashboard", { replace: true }), 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Aceitar convite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Foi convidado para uma organização. Clique abaixo para aceitar.</p>
          <Button onClick={accept} disabled={!token || busy || done} className="w-full">
            {done ? "Concluído" : "Aceitar convite"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}