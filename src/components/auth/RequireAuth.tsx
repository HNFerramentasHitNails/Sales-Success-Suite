import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

export default function RequireAuth({
  children,
  requireOrg = true,
}: {
  children: ReactNode;
  requireOrg?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const { loading: orgLoading, memberships } = useOrganization();
  const location = useLocation();

  if (authLoading || (requireOrg && orgLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        A carregar...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireOrg && memberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}