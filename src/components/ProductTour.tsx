import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { GROUPS, visibleGroups, type NavCtx } from "@/config/nav";
import { getPageTour, CAMPAIGN_WIZARD_TOUR, type TourStep } from "@/config/tours";

const TOUR_KEY = "tour_done_v1";
const GROUP_IDS = new Set(GROUPS.map((g) => g.tourId).filter(Boolean) as string[]);

const BTN = { nextBtnText: "Seguinte", prevBtnText: "Anterior", doneBtnText: "Concluir" };

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
    { title: "Bem-vindo! 👋", description: `Como <b>${r.label}</b>, ${r.text}<br/><br/>Vamos ver onde está cada coisa — mostro-te só o que podes usar. (Podes rever no botão <b>?</b> no topo, ou fazer a <b>Visita guiada completa</b> que percorre cada página.)` },
    { element: '[data-tour="sidebar-toggle"]', title: "Menu lateral", description: "Recolhes/expandes o menu. Os grupos abrem e fecham — só fica aberta a secção onde estás.", side: "bottom" },
    { element: '[data-tour="search"]', title: "Pesquisa rápida (⌘K / Ctrl+K)", description: "Escreve o nome de qualquer página ou ação e salta lá diretamente.", side: "bottom" },
    { element: '[data-tour="inicio"]', title: "Início", description: "O teu <b>Painel</b> com a visão geral e os teus <b>Objetivos</b>.", side: "right" },
    { element: '[data-tour="outreach"]', title: "Outreach", description: "Prospeção e campanhas: <b>Inbox</b>, <b>Leads</b>, <b>Marketplace</b>, <b>Campanhas</b> e <b>Templates</b>.", side: "right" },
    { element: '[data-tour="vendas"]', title: "Clientes & Vendas", description: "<b>Clientes</b>, <b>Prospeção</b>, <b>Encomendas</b>, <b>Faturas</b>, <b>Subscrições</b> e <b>Comissões</b>.", side: "right" },
    { element: '[data-tour="atividade"]', title: "Atividade", description: "<b>Chamadas do dia</b>, <b>Agenda</b> e <b>Histórico de chamadas</b>.", side: "right" },
    { element: '[data-tour="catalogo"]', title: "Catálogo", description: "<b>Produtos</b>, <b>Canais de venda</b> e <b>Preços & Descontos</b>.", side: "right" },
    { element: '[data-tour="analise"]', title: "Análise", description: "Inteligência sobre o negócio: Pareto, lead scoring, segmentos RFM e mais.", side: "right" },
    { element: '[data-tour="posvenda"]', title: "Pós-venda", description: "Problemas, devoluções, vouchers, campanhas de carteira e conquistas.", side: "right" },
    { element: '[data-tour="distribuicao"]', title: "Distribuição", description: "Parceiros/revendedores, calculadora e análise da distribuição.", side: "right" },
    { element: '[data-tour="ia"]', title: "Inteligência Artificial", description: "Os <b>Agentes IA</b> e a <b>Base de conhecimento</b> que os alimenta.", side: "right" },
    { element: '[data-tour="definicoes"]', title: "Definições", description: "Configuração concentrada: Organização, Equipa, Plano, IA, WhatsApp, Domínios e Integrações.", side: "right" },
    { element: '[data-tour="org-switcher"]', title: "Organização ativa", description: "Trocas aqui entre organizações, se pertenceres a mais do que uma.", side: "bottom" },
    { element: '[data-tour="user-menu"]', title: "A tua conta", description: "Perfil, preferências e terminar sessão.", side: "bottom" },
    { element: '[data-tour="checklist"]', title: "Primeiros passos", description: "Guia-te na configuração inicial. Desaparece quando estiver tudo feito.", side: "top" },
    { title: "Pronto! 🚀", description: "Para uma explicação página a página, abre o botão <b>?</b> → <b>Visita guiada completa</b>." },
  ];
}

function groupIdOf(selector?: string): string | null {
  if (!selector) return null;
  const m = selector.match(/data-tour="([^"]+)"/);
  const id = m?.[1];
  return id && GROUP_IDS.has(id) ? id : null;
}

function toDriveSteps(raw: TourStep[], allowedGroups?: Set<string>): DriveStep[] {
  return raw
    .filter((s) => {
      const gid = groupIdOf(s.element);
      if (gid && allowedGroups && !allowedGroups.has(gid)) return false;
      return !s.element || document.querySelector(s.element);
    })
    .map((s) => ({ element: s.element, popover: { title: s.title, description: s.description, side: s.side, align: "start" } }));
}

function runSteps(raw: TourStep[], allowedGroups?: Set<string>) {
  const steps = toDriveSteps(raw, allowedGroups);
  if (!steps.length) return;
  driver({ showProgress: true, progressText: "{{current}} de {{total}}", ...BTN, steps }).drive();
}

function waitFor(selector: string | undefined, timeout = 3500): Promise<void> {
  return new Promise((resolve) => {
    if (!selector) return resolve();
    const start = Date.now();
    const tick = () => {
      if (document.querySelector(selector) || Date.now() - start > timeout) return resolve();
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

// espera que a rota (URL) mude para a página alvo antes de destacar
function waitForRoute(url: string, timeout = 4000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const p = window.location.pathname;
      if (p === url || p.startsWith(url + "/") || Date.now() - start > timeout) return resolve();
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

// Visita guiada completa: navega página a página e mostra o tour de cada uma.
function runGuided(stops: { url: string; steps: TourStep[] }[], navigate: (u: string) => void) {
  let i = 0;
  const showStop = async () => {
    if (i >= stops.length) return;
    const stop = stops[i];
    navigate(stop.url);
    await waitForRoute(stop.url); // garantir que a navegação aconteceu (todas as páginas têm page-header)
    await delay(200);             // deixar a nova página renderizar
    const firstSel = stop.steps.find((s) => s.element)?.element;
    await waitFor(firstSel);
    const steps = toDriveSteps(stop.steps);
    if (!steps.length) { i++; return showStop(); }
    const isLast = i === stops.length - 1;
    const d = driver({
      showProgress: true,
      progressText: `Página ${i + 1}/${stops.length} · {{current}} de {{total}}`,
      nextBtnText: "Seguinte",
      prevBtnText: "Anterior",
      doneBtnText: isLast ? "Concluir" : "Próxima página →",
      steps,
      onDestroyStarted: () => {
        const completed = !d.hasNextStep();
        d.destroy();
        if (completed && !isLast) { i++; showStop(); }
      },
    });
    d.drive();
  };
  showStop();
}

export default function ProductTour() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin, role } = useOrganization();
  const { isEnabled } = useEntitlements();

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
    const onGuided = () => {
      const ctx = { isAdmin, role: role ?? null };
      const stops: { url: string; steps: TourStep[] }[] = [];
      for (const g of visibleGroups(ctx)) {
        for (const it of g.items) {
          if (it.feature && !isEnabled(it.feature)) continue;
          const steps = getPageTour(it.url);
          if (steps && steps.length) stops.push({ url: it.url, steps });
        }
      }
      if (stops.length) runGuided(stops, navigate);
    };
    window.addEventListener("app:start-tour", onGlobal);
    window.addEventListener("app:start-page-tour", onPage);
    window.addEventListener("app:tour-campaign-wizard", onWizard);
    window.addEventListener("app:start-guided", onGuided);
    return () => {
      window.removeEventListener("app:start-tour", onGlobal);
      window.removeEventListener("app:start-page-tour", onPage);
      window.removeEventListener("app:tour-campaign-wizard", onWizard);
      window.removeEventListener("app:start-guided", onGuided);
    };
  }, [isAdmin, role, pathname, isEnabled, navigate]);

  // auto-arranque UMA ÚNICA VEZ (utilizadores novos); depois só manualmente pelo botão "?"
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoRef.current || !pathname.startsWith("/app")) return;
    autoRef.current = true;
    if (localStorage.getItem(TOUR_KEY)) return; // já visto -> nunca mais auto-arranca
    localStorage.setItem(TOUR_KEY, "1"); // marca como visto JÁ (robusto a navegação/redirects)
    const ctx = { isAdmin, role: role ?? null };
    const allowed = new Set(visibleGroups(ctx).map((g) => g.tourId).filter(Boolean) as string[]);
    window.setTimeout(() => runSteps(globalSteps(isAdmin, role ?? null), allowed), 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
