import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Target, Package, ShoppingCart, FileText, Wallet, UserCog,
  Plug, Settings as SettingsIcon, CreditCard, Lock, BarChart3, Scale, Phone, History,
  CalendarDays, Sparkles, Shuffle, Tags, AlertCircle, RotateCcw, Ticket, Trophy, Store,
  Calculator, Bot, BookOpen, Repeat, BadgePercent, Percent, PieChart, Filter, Network, Send, Globe, MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Gate = "all" | "analytics" | "postSale" | "admin";
type NavItem = { title: string; url: string; icon: LucideIcon; feature?: string; adminOnly?: boolean };
type NavGroup = { label: string; gate: Gate; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { label: "Início", gate: "all", items: [
    { title: "Painel", url: "/app/dashboard", icon: LayoutDashboard },
    { title: "Objetivos", url: "/app/objectives", icon: Target },
  ]},
  { label: "Clientes & Vendas", gate: "all", items: [
    { title: "Clientes", url: "/app/customers", icon: Users },
    { title: "Prospeção", url: "/app/prospects", icon: Filter },
    { title: "Encomendas", url: "/app/orders", icon: ShoppingCart },
    { title: "Faturas", url: "/app/invoices", icon: FileText },
    { title: "Subscrições", url: "/app/subscriptions", icon: Repeat },
    { title: "Comissões", url: "/app/commissions", icon: Wallet, feature: "module_commissions" },
  ]},
  { label: "Outreach", gate: "all", items: [
    { title: "Leads", url: "/app/leads", icon: Filter, feature: "module_outreach" },
    { title: "Templates", url: "/app/templates", icon: FileText, feature: "module_outreach" },
    { title: "Campanhas", url: "/app/campaigns", icon: Send, feature: "module_outreach" },
    { title: "WhatsApp", url: "/app/whatsapp", icon: MessageCircle, feature: "module_outreach", adminOnly: true },
    { title: "Domínios de envio", url: "/app/outreach-domains", icon: Globe, feature: "module_outreach", adminOnly: true },
  ]},
  { label: "Atividade", gate: "all", items: [
    { title: "Chamadas do dia", url: "/app/calls", icon: Phone },
    { title: "Agenda", url: "/app/calendar", icon: CalendarDays },
    { title: "Histórico de chamadas", url: "/app/call-history", icon: History },
  ]},
  { label: "Catálogo", gate: "all", items: [
    { title: "Produtos", url: "/app/products", icon: Package },
    { title: "Canais de venda", url: "/app/channels", icon: Network },
    { title: "Preços & Descontos", url: "/app/pricing", icon: Percent },
  ]},
  { label: "Análise", gate: "analytics", items: [
    { title: "Análise de Pareto", url: "/app/pareto", icon: BarChart3 },
    { title: "Comparar produtos", url: "/app/product-comparison", icon: Scale },
    { title: "Lead scoring", url: "/app/lead-scoring", icon: Sparkles },
    { title: "Atribuição de leads", url: "/app/lead-assignment", icon: Shuffle },
    { title: "Etiquetas", url: "/app/customer-tags", icon: Tags },
    { title: "Segmentos RFM", url: "/app/segments", icon: PieChart },
  ]},
  { label: "Pós-venda", gate: "postSale", items: [
    { title: "Problemas", url: "/app/issues", icon: AlertCircle },
    { title: "Devoluções", url: "/app/rma", icon: RotateCcw },
    { title: "Vouchers", url: "/app/vouchers", icon: Ticket },
    { title: "Campanhas de carteira", url: "/app/wallet-campaigns", icon: BadgePercent },
    { title: "Conquistas", url: "/app/achievements", icon: Trophy },
  ]},
  { label: "Distribuição", gate: "postSale", items: [
    { title: "Parceiros", url: "/app/distribution/partners", icon: Store },
    { title: "Calculadora", url: "/app/distribution/calculator", icon: Calculator },
    { title: "Análise", url: "/app/distribution/analytics", icon: BarChart3 },
  ]},
  { label: "Inteligência Artificial", gate: "postSale", items: [
    { title: "Agentes IA", url: "/app/agents", icon: Bot },
    { title: "Base de conhecimento", url: "/app/ai-knowledge", icon: BookOpen, adminOnly: true },
    { title: "Configuração de IA", url: "/app/ai-settings", icon: Sparkles, adminOnly: true },
  ]},
  { label: "Administração", gate: "admin", items: [
    { title: "Integrações", url: "/app/integrations", icon: Plug, feature: "module_integrations" },
    { title: "Equipa", url: "/app/team", icon: UserCog },
    { title: "Plano", url: "/app/plan", icon: CreditCard },
    { title: "Definições", url: "/app/settings", icon: SettingsIcon },
  ]},
];

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { activeOrg, isAdmin, role } = useOrganization();
  const { isEnabled, loading: entLoading } = useEntitlements();
  const canSeeAnalytics = isAdmin || role === "sales_director";
  const canSeePostSale = role !== null;

  const gateOk = (gate: Gate) =>
    gate === "all" ? true
    : gate === "analytics" ? canSeeAnalytics
    : gate === "postSale" ? canSeePostSale
    : isAdmin;

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

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

        {GROUPS.filter((g) => gateOk(g.gate)).map((group) => {
          const items = group.items.filter((it) => !it.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
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
                                    <TooltipTrigger asChild>
                                      <Lock className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>Disponível em planos superiores</TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}