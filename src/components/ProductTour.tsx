import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useOrganization } from "@/contexts/OrganizationContext";
import { GROUPS, visibleGroups, type NavCtx } from "@/config/nav";
import { getPageTour, CAMPAIGN_WIZARD_TOUR, type TourStep } from "@/config/tours";

const TOUR_KEY = "tour_done_v1";
const GROUP_IDS = new Set(GROUPS.map((g) => g.tourId).filter(Boolean) as string[]);

function ctxForRole(pr: string): NavCtx | null {
  if (pr === "admin") return { isAdmin: true, role: "admin" };
  if (pr === "sales_director") return { isAdmin: false, role: "sales_director" };
  if (pr === "sales_rep") return { isAdmin: false, role: "sales_rep" };
  if (pr === "read_only") return { isAdmin: false, role: "read_only" };
  return null;
}

function roleSummary(isAdmin: boolean, role: string | null): { label: string; text: string } {
  if (isAdmin) return { label: "Administrador", text: "tens acesso total: vendas, outreach, análise, pós-venda, distribuição, IA e todas as definições (equipa, plano, integrações, WhatsApp e domínios)." };
  if (role === "sales_director") return { label: "Diretor de Vendas", text: "tens acesso a vendas, outreach, análise, pós-venda e IA, incluindo os objetivos e o desempenho da equipa." };
  if (role === "sales_rep" || role === "sales") return { label: "Comercial", text: "tens acesso ao teu dia-a-dia: clientes, prospeção, outreach, atividade, pós-venda e os agentes de IA." };
  if (role === "read_only") return { label: "Consulta", text: "podes ver os dados e relatórios, mas sem editar." };
  return { label: "Utilizador", text: "vamos ver as áreas a que tens acesso." };
}

function globalSteps(isAdmin: boolean, role: string | null): TourStep[] {
  const r = roleSummary(isAdmin, role);
  return [
    { title: "Bem-vindo! 👋", description: `Como <b>${r.label}</b>, ${r.text}<br/><br/>Vamos ver onde está cada coisa — mostro-te só o que podes usar. (Podes rever este tour no botão <b>?</b> no topo.)` },
    { element: '[data-tour="sidebar-toggle"]', title: "Menu lateral", description: "Recolhes/expandes o menu. Os grupos abrem e fecham — só fica aberta a secção onde estás.", side: "bottom" },
    { element: '[data-tour="search"]', title: "Pesquisa rápida (⌘K / Ctrl+K)", description: "Escreve o nome de qualquer página ou ação e salta lá diretamente.", side: "bottom" },
    { element: '[data-tour="inicio"]', title: "Início", description: "O teu <b>Painel</b> com a visão geral e os teus <b>Objetivos</b>.", side: "right" },
    { element: '[data-tour="outreach"]', title: "Outreach", description: "Prospeção e campanhas: <b>Inbox</b>, <b>Leads</b>, <b>Marketplace</b>, <b>Campanhas</b> e <b>Templates</b>.", side: "right" },
    { element: '[data-tour="vendas"]', title: "Clientes & Vendas", description: "<b>Clientes</b>, <b>Prospeção</b>, <b>Encomendas</b>, <b>Faturas</b>, <b>Subscrições</b> e <b>Comissões</b>.", side: "right" },
    { element: '[data-tour="atividade"]', title: "Atividade", description: "<b>Chamadas do dia</b>, <b>Agenda</b> e <b>Histórico de chamadas</b>.", side: "right" },
    { element: '[data-tour="catalogo"]', title: "Catálogo", description: "<b>Produtos</b>, <b>Canais de venda</b> e <b>Preços & Descontos</b>.", side: "right" },
    { element: '[data-tour="analise"]', title: "Análise", description: "Inteligência sobre o negócio: Pareto, lead scoring, segmentos RFM e mais. (Disponível para gestão.)", side: "right" },
    { element: '[data-tour="posvenda"]', title: "Pós-venda", description: "Problemas, devoluções, vouchers, campanhas de carteira e conquistas.", side: "right" },
    { element: '[data-tour="distribuicao"]', title: "Distribuição", description: "Parceiros/revendedores, calculadora e análise da distribuição.", side: "right" },
    { element: '[data-tour="ia"]', title: "Inteligência Artificial", description: "Os <b>Agentes IA</b> e a <b>Base de conhecimento</b> que os alimenta.", side: "right" },
    { element: '[data-tour="definicoes"]', title: "Definições", description: "Configuração concentrada: Organização, Equipa, Plano, IA, WhatsApp, Domínios e Integrações. (Só administradores.)", side: "right" },
    { element: '[data-tour="org-switcher"]', title: "Organização ativa", description: "Trocas aqui entre organizações, se pertenceres a mais do que uma.", side: "bottom" },
    { element: '[data-tour="user-menu"]', title: "A tua conta", description: "Perfil, preferências e terminar sessão.", side: "bottom" },
    { element: '[data-tour="checklist"]', title: "Primeiros passos", description: "Guia-te na configuração inicial. Desaparece quando estiver tudo feito.", side: "top" },
    { title: "Pronto! 🚀", description: "Dica: em cada página, abre o botão <b>?</b> → <b>Tour desta página</b> para uma explicação detalhada dessa área." },
  ];
}

function groupIdOf(selector?: string): string | null {
  if (!selector) return null;
  const m = selector.match(/data-tour="([^"]+)"/);
  const id = m?.[1];
  return id && GROUP_IDS.has(id) ? id : null;
}

function runSteps(raw: TourStep[], allowedGroups?: Set<string>) {
  const steps: DriveStep[] = raw
    .filter((s) => {
      const gid = groupIdOf(s.element);
      if (gid && allowedGroups && !allowedGroups.has(gid)) return false; // secção sem acesso para este papel
      return !s.element || document.querySelector(s.element);
    })
    .map((s) => ({ element: s.element, popover: { title: s.title, description: s.description, side: s.side, align: "start" } }));
  if (!steps.length) return;
  driver({
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Seguinte",
    prevBtnText: "Anterior",
    doneBtnText: "Concluir",
    steps,
  }).drive();
}

export default function ProductTour() {
  const { pathname } = useLocation();
  const { isAdmin, role } = useOrganization();

  useEffect(() => {
    const onGlobal = (e: Event) => {
      const pr = e instanceof CustomEvent ? (e.detail?.previewRole as string | undefined) : undefined;
      const ctx = pr ? ctxForRole(pr) : { isAdmin, role: role ?? null };
      if (!ctx) return;
      const allowed = new Set(visibleGroups(ctx).map((g) => g.tourId).filter(Boolean) as string[]);
      runSteps(globalSteps(ctx.isAdmin, ctx.role), allowed);
    };
    const onPage = () => { const t = getPageTour(pathname); if (t) runSteps(t); };
    const onWizard = () => runSteps(CAMPAIGN_WIZARD_TOUR);
    window.addEventListener("app:start-tour", onGlobal);
    window.addEventListener("app:start-page-tour", onPage);
    window.addEventListener("app:tour-campaign-wizard", onWizard);
    return () => {
      window.removeEventListener("app:start-tour", onGlobal);
      window.removeEventListener("app:start-page-tour", onPage);
      window.removeEventListener("app:tour-campaign-wizard", onWizard);
    };
  }, [isAdmin, role, pathname]);

  // auto-arranque uma vez para utilizadores novos
  useEffect(() => {
    if (!pathname.startsWith("/app")) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = window.setTimeout(() => {
      localStorage.setItem(TOUR_KEY, "1");
      const ctx = { isAdmin, role: role ?? null };
      const allowed = new Set(visibleGroups(ctx).map((g) => g.tourId).filter(Boolean) as string[]);
      runSteps(globalSteps(isAdmin, role ?? null), allowed);
    }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
