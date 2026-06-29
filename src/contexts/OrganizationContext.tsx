import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

type Membership = {
  organization_id: string;
  role: AppRole;
  organizations: Organization;
};

type OrgCtx = {
  loading: boolean;
  memberships: Membership[];
  activeOrg: Organization | null;
  role: AppRole | null;
  isAdmin: boolean;
  switchOrg: (orgId: string) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<OrgCtx>({
  loading: true,
  memberships: [],
  activeOrg: null,
  role: null,
  isAdmin: false,
  switchOrg: () => {},
  refresh: async () => {},
});

const ACTIVE_KEY = "active_org_id";

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem(ACTIVE_KEY));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (error) {
      console.error("Failed to load memberships", error);
      setMemberships([]);
    } else {
      const m = (data ?? []).filter((x) => x.organizations) as unknown as Membership[];
      setMemberships(m);
      if (m.length > 0 && !m.find((x) => x.organization_id === activeId)) {
        setActiveId(m[0].organization_id);
        localStorage.setItem(ACTIVE_KEY, m[0].organization_id);
      }
    }
    setLoading(false);
  }, [user, activeId]);

  useEffect(() => {
    if (!authLoading) refresh();
  }, [user, authLoading, refresh]);

  const switchOrg = (orgId: string) => {
    setActiveId(orgId);
    localStorage.setItem(ACTIVE_KEY, orgId);
  };

  const activeMembership = memberships.find((m) => m.organization_id === activeId) ?? memberships[0] ?? null;
  const activeOrg = activeMembership?.organizations ?? null;
  const role = activeMembership?.role ?? null;

  useEffect(() => {
    if (activeOrg?.primary_color) {
      document.documentElement.style.setProperty("--primary", activeOrg.primary_color);
      document.documentElement.style.setProperty("--ring", activeOrg.primary_color);
    }
  }, [activeOrg?.primary_color]);

  return (
    <Ctx.Provider
      value={{
        loading: authLoading || loading,
        memberships,
        activeOrg,
        role,
        isAdmin: role === "owner" || role === "admin",
        switchOrg,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useOrganization = () => useContext(Ctx);