import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

export default function RequireFeature({
  feature,
  children,
}: {
  feature: string;
  children: ReactNode;
}) {
  const { loading, isEnabled } = useEntitlements();
  if (loading) return null;
  if (isEnabled(feature)) return <>{children}</>;
  return (
    <div className="space-y-4">
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          Esta funcionalidade não está incluída no seu plano atual. Veja os planos disponíveis para a desbloquear.
        </AlertDescription>
      </Alert>
      <Navigate to="/app/plan" replace />
    </div>
  );
}