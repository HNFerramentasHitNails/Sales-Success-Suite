import {
  LayoutDashboard, Users, Target, Package, ShoppingCart, FileText, Wallet, Plug,
  Settings as SettingsIcon, BarChart3, Scale, Phone, History, CalendarDays, Sparkles,
  Shuffle, Tags, AlertCircle, RotateCcw, Ticket, Trophy, Store, Calculator, Bot, BookOpen,
  Repeat, BadgePercent, Percent, PieChart, Filter, Network, Send, Inbox, MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Gate = "all" | "analytics" | "postSale" | "admin";
export type NavItem = { title: string; url: string; icon: LucideIcon; feature?: string; adminOnly?: boolean };
export type NavGroup = { label: string; gate: Gate; items: NavItem[] };

// Navegação reorganizada: ~tarefas em cima, configuração concentrada em "Definições".
export const GROUPS: NavGroup[] = [
  { label: "Início", gate: "all", items: [
    { title: "Painel", url: "/app/dashboard", icon: LayoutDashboard },
    { title: "Objetivos", url: "/app/objectives", icon: Target },
  ]},
  { label: "Outreach", gate: "all", items: [
    { title: "Inbox", url: "/app/inbox", icon: Inbox, feature: "module_outreach" },
    { title: "Leads", url: "/app/leads", icon: Filter, feature: "module_outreach" },
    { title: "Marketplace de leads", url: "/app/marketplace", icon: Store, feature: "module_outreach" },
    { title: "Campanhas", url: "/app/campaigns", icon: Send, feature: "module_outreach" },
    { title: "Templates", url: "/app/templates", icon: FileText, feature: "module_outreach" },
  ]},
  { label: "Clientes & Vendas", gate: "all", items: [
    { title: "Clientes", url: "/app/customers", icon: Users },
    { title: "Prospeção", url: "/app/prospects", icon: Filter },
    { title: "Encomendas", url: "/app/orders", icon: ShoppingCart },
    { title: "Faturas", url: "/app/invoices", icon: FileText },
    { title: "Subscrições", url: "/app/subscriptions", icon: Repeat },
    { title: "Comissões", url: "/app/commissions", icon: Wallet, feature: "module_commissions" },
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
  ]},
  { label: "Definições", gate: "admin", items: [
    { title: "Definições", url: "/app/settings", icon: SettingsIcon },
    { title: "Integrações", url: "/app/integrations", icon: Plug, feature: "module_integrations" },
  ]},
];

export type NavCtx = { isAdmin: boolean; role: string | null };

export function gateOk(gate: Gate, ctx: NavCtx): boolean {
  const canAnalytics = ctx.isAdmin || ctx.role === "sales_director";
  const canPostSale = ctx.role !== null;
  return gate === "all" ? true : gate === "analytics" ? canAnalytics : gate === "postSale" ? canPostSale : ctx.isAdmin;
}

// grupos visíveis para o utilizador (aplica gate de grupo + adminOnly por item)
export function visibleGroups(ctx: NavCtx): NavGroup[] {
  return GROUPS
    .filter((g) => gateOk(g.gate, ctx))
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.adminOnly || ctx.isAdmin) }))
    .filter((g) => g.items.length > 0);
}
