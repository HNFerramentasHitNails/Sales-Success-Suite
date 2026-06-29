import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Lock, ChevronDown } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { visibleGroups, type NavItem } from "@/config/nav";

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { activeOrg, isAdmin, role } = useOrganization();
  const { isEnabled, loading: entLoading } = useEntitlements();

  const groups = visibleGroups({ isAdmin, role: role ?? null });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  // abrir automaticamente o grupo da página ativa (ex.: durante a visita guiada)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const active = groups.find((g) => g.items.some((it) => isActive(it.url)));
    if (active) setOpenMap((m) => ({ ...m, [active.label]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const renderItem = (item: NavItem) => {
    const locked = !entLoading && item.feature ? !isEnabled(item.feature) : false;
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={collapsed ? item.title : undefined}>
          <NavLink to={item.url} className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {!collapsed && (
              <span className="flex-1 flex items-center gap-2">
                {item.title}
                {locked && (
                  <Tooltip>
                    <TooltipTrigger asChild><Lock className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent>Disponível em planos superiores</TooltipContent>
                  </Tooltip>
                )}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-3 py-4">
          {activeOrg?.logo_url ? (
            <img src={activeOrg.logo_url} alt={activeOrg.name} className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="h-8 w-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              {activeOrg?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          {!collapsed && <div className="truncate text-sm font-semibold">{activeOrg?.name ?? "—"}</div>}
        </div>

        {groups.map((group) => {
          const hasActive = group.items.some((it) => isActive(it.url));
          // sidebar em modo ícone: lista plana (sem colapsáveis)
          if (collapsed) {
            return (
              <SidebarGroup key={group.label} data-tour={group.tourId}>
                <SidebarGroupContent>
                  <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }
          return (
            <Collapsible
              key={group.label}
              open={openMap[group.label] ?? hasActive}
              onOpenChange={(o) => setOpenMap((m) => ({ ...m, [group.label]: o }))}
              className="group/collapsible"
            >
              <SidebarGroup data-tour={group.tourId}>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-sidebar-foreground/70 hover:text-sidebar-foreground">
                    {group.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
