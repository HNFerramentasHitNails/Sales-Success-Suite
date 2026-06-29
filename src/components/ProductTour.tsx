import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "tour_done_v1";

type Step = { element?: string; title: string; description: string; side?: "top" | "bottom" | "left" | "right" };

const STEPS: Step[] = [
  { title: "Bem-vindo! 👋", description: "Vamos dar uma volta rápida pela plataforma para saberes onde está cada coisa. Podes sair a qualquer momento e rever este tour no botão <b>?</b> no topo." },
  { element: '[data-tour="sidebar-toggle"]', title: "Menu lateral", description: "Aqui recolhes ou expandes o menu. Os grupos abrem e fecham — só fica aberta a secção onde estás, para não te perderes.", side: "bottom" },
  { element: '[data-tour="search"]', title: "Pesquisa rápida (⌘K / Ctrl+K)", description: "O caminho mais rápido: escreve o nome de qualquer página ou ação e salta lá directamente. Funciona em todo o lado.", side: "bottom" },
  { element: '[data-tour="inicio"]', title: "Início", description: "O teu <b>Painel</b> com a visão geral do negócio e os teus <b>Objetivos</b>. É a tua página inicial.", side: "right" },
  { element: '[data-tour="outreach"]', title: "Outreach — captação e campanhas", description: "O coração da prospeção: <b>Inbox</b> (conversas WhatsApp), <b>Leads</b>, <b>Marketplace</b> (capturar leads do Google Maps), <b>Campanhas</b> (email + WhatsApp) e <b>Templates</b> (gerados com IA).", side: "right" },
  { element: '[data-tour="vendas"]', title: "Clientes & Vendas", description: "A tua base comercial: <b>Clientes</b>, <b>Prospeção</b> (funil), <b>Encomendas</b>, <b>Faturas</b>, <b>Subscrições</b> e <b>Comissões</b>.", side: "right" },
  { element: '[data-tour="atividade"]', title: "Atividade", description: "O dia-a-dia comercial: <b>Chamadas do dia</b>, <b>Agenda</b> e o <b>Histórico de chamadas</b>.", side: "right" },
  { element: '[data-tour="catalogo"]', title: "Catálogo", description: "Os teus <b>Produtos</b>, <b>Canais de venda</b> e a tabela de <b>Preços & Descontos</b>.", side: "right" },
  { element: '[data-tour="analise"]', title: "Análise", description: "Inteligência sobre o negócio: <b>Pareto</b>, comparação de produtos, <b>lead scoring</b>, atribuição de leads, etiquetas e <b>segmentos RFM</b>.", side: "right" },
  { element: '[data-tour="posvenda"]', title: "Pós-venda", description: "Depois da venda: <b>Problemas</b>, <b>Devoluções</b>, <b>Vouchers</b>, campanhas de carteira e conquistas.", side: "right" },
  { element: '[data-tour="distribuicao"]', title: "Distribuição", description: "Gestão de <b>parceiros/revendedores</b>, calculadora e análise da distribuição.", side: "right" },
  { element: '[data-tour="ia"]', title: "Inteligência Artificial", description: "Os <b>Agentes IA</b> (vendas, treino, estratégia) e a <b>Base de conhecimento</b> que alimenta as respostas.", side: "right" },
  { element: '[data-tour="definicoes"]', title: "Definições — tudo num só sítio", description: "Aqui configuras a <b>Organização</b>, <b>Equipa</b>, <b>Plano</b>, <b>IA</b>, <b>WhatsApp</b>, <b>Domínios de envio</b> e <b>Integrações</b>. É onde se liga tudo.", side: "right" },
  { element: '[data-tour="org-switcher"]', title: "Organização ativa", description: "Se pertences a mais do que uma organização, trocas aqui entre elas.", side: "bottom" },
  { element: '[data-tour="user-menu"]', title: "A tua conta", description: "Perfil, preferências e terminar sessão.", side: "bottom" },
  { element: '[data-tour="checklist"]', title: "Primeiros passos", description: "Este cartão guia-te na configuração inicial: ligar o WhatsApp, verificar um domínio, capturar leads e criar a primeira campanha. Desaparece quando estiver tudo feito.", side: "top" },
  { title: "Pronto! 🚀", description: "É isto. Sempre que precisares, clica no botão <b>?</b> no topo para rever o tour, ou usa a <b>pesquisa (⌘K)</b> para chegar a qualquer sítio num instante." },
];

export default function ProductTour() {
  const { pathname } = useLocation();

  const start = () => {
    const steps: DriveStep[] = STEPS
      .filter((s) => !s.element || document.querySelector(s.element))
      .map((s) => ({
        element: s.element,
        popover: { title: s.title, description: s.description, side: s.side, align: "start" },
      }));
    if (!steps.length) return;
    const d = driver({
      showProgress: true,
      progressText: "{{current}} de {{total}}",
      nextBtnText: "Seguinte",
      prevBtnText: "Anterior",
      doneBtnText: "Concluir",
      steps,
    });
    d.drive();
  };

  // botão "?" no cabeçalho dispara este evento
  useEffect(() => {
    const handler = () => start();
    window.addEventListener("app:start-tour", handler);
    return () => window.removeEventListener("app:start-tour", handler);
  }, []);

  // auto-arranque uma vez para utilizadores novos
  useEffect(() => {
    if (!pathname.startsWith("/app")) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = window.setTimeout(() => {
      localStorage.setItem(TOUR_KEY, "1");
      start();
    }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
