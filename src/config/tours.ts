// Mini-tours por página/secção. Cada tour é uma lista de passos com seletor opcional.
// Todas as páginas têm [data-tour="page-header"] e (se tiverem ações) [data-tour="page-actions"].

export type TourStep = { element?: string; title: string; description: string; side?: "top" | "bottom" | "left" | "right" };

const TOURS: Record<string, TourStep[]> = {
  "/app/dashboard": [
    { element: '[data-tour="page-header"]', title: "Painel", description: "A tua visão geral: KPIs do negócio, chamadas do dia, leads quentes e atividade recente.", side: "bottom" },
    { element: '[data-tour="checklist"]', title: "Primeiros passos", description: "Enquanto a configuração não estiver completa, este cartão guia-te. Desaparece quando terminares.", side: "bottom" },
  ],
  "/app/inbox": [
    { element: '[data-tour="page-header"]', title: "Inbox", description: "Todas as conversas de WhatsApp com os teus leads, num só sítio.", side: "bottom" },
    { element: '[data-tour="inbox-threads"]', title: "Conversas", description: "Lista de conversas, ordenadas pela mais recente. O número indica mensagens por ler.", side: "right" },
    { element: '[data-tour="inbox-conversation"]', title: "Responder", description: "Abre uma conversa para ver o histórico e responder. A resposta sai pelo WhatsApp ligado e o lead sai automaticamente da sequência.", side: "left" },
  ],
  "/app/leads": [
    { element: '[data-tour="page-header"]', title: "Leads", description: "Os teus contactos de prospeção (frios, importados e do marketplace).", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Importar e criar", description: "Importa um CSV/Excel (com mapeamento de colunas), cria um lead manual, ou abre a Lixeira para restaurar.", side: "bottom" },
    { element: '[data-tour="leads-filters"]', title: "Procurar e filtrar", description: "Filtra por estado, país ou nicho. Em cada lead podes promovê-lo a prospect (passa para o funil de vendas).", side: "bottom" },
  ],
  "/app/marketplace": [
    { element: '[data-tour="page-header"]', title: "Marketplace de leads", description: "Captura leads de diretórios de negócio (Google Maps, via Outscraper): escolhe categoria, país, cidade e quantidade.", side: "bottom" },
    { element: '[data-tour="page-header"]', title: "Procurar e importar", description: "Depois de pesquisar, seleciona os resultados que queres e importa-os para os teus Leads com um clique.", side: "bottom" },
  ],
  "/app/templates": [
    { element: '[data-tour="page-header"]', title: "Templates", description: "Mensagens reutilizáveis para email e WhatsApp.", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Gerar com IA", description: "Em 'Novo Template' descreves a oferta e o objetivo, e a IA escreve várias variações por canal (com ângulos diferentes para teste A/B). Podes editar antes de guardar.", side: "bottom" },
  ],
  "/app/campaigns": [
    { element: '[data-tour="page-header"]', title: "Campanhas", description: "Disparos automáticos multicanal (email + WhatsApp) com sequências e A/B.", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Assistente em 5 passos", description: "Em 'Nova Campanha': 1) nome e canais, 2) audiência (Leads, Clientes ou Prospects), 3) sequência de mensagens, 4) agendamento, 5) revisão e lançamento.", side: "bottom" },
  ],
  "/app/customers": [
    { element: '[data-tour="page-header"]', title: "Clientes", description: "A tua base de clientes — com segmentos, etiquetas e histórico.", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Ações", description: "Cria, importa e gere os teus clientes a partir daqui.", side: "bottom" },
  ],
  "/app/prospects": [
    { element: '[data-tour="page-header"]', title: "Prospeção", description: "O teu funil de vendas em Kanban: arrasta os prospects entre fases (novo → ganho/perdido).", side: "bottom" },
  ],
  "/app/orders": [
    { element: '[data-tour="page-header"]', title: "Encomendas", description: "Cria e acompanha encomendas; o stock e a faturação ligam-se automaticamente.", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Ações", description: "Nova encomenda e filtros principais.", side: "bottom" },
  ],
  "/app/invoices": [
    { element: '[data-tour="page-header"]', title: "Faturas", description: "Emite e consulta faturas, integradas com os teus conectores de faturação.", side: "bottom" },
  ],
  "/app/products": [
    { element: '[data-tour="page-header"]', title: "Produtos", description: "O teu catálogo: preços, stock, variantes e kits.", side: "bottom" },
    { element: '[data-tour="page-actions"]', title: "Ações", description: "Novo produto, importação e gestão do catálogo.", side: "bottom" },
  ],
  "/app/calls": [
    { element: '[data-tour="page-header"]', title: "Chamadas do dia", description: "A tua lista de chamadas prioritárias, gerada automaticamente (ex.: clientes em risco).", side: "bottom" },
  ],
  "/app/pareto": [
    { element: '[data-tour="page-header"]', title: "Análise", description: "Ferramentas analíticas: Pareto, comparação de produtos, lead scoring e segmentos RFM (no menu Análise).", side: "bottom" },
  ],
  "/app/issues": [
    { element: '[data-tour="page-header"]', title: "Pós-venda", description: "Gestão de problemas, devoluções, vouchers e campanhas de fidelização.", side: "bottom" },
  ],
  "/app/distribution/partners": [
    { element: '[data-tour="page-header"]', title: "Distribuição", description: "Gere parceiros/revendedores, contratos e a análise da rede de distribuição.", side: "bottom" },
  ],
  "/app/agents": [
    { element: '[data-tour="page-header"]', title: "Agentes IA", description: "Copilotos de vendas, treino e estratégia. Respondem com base na tua Base de conhecimento.", side: "bottom" },
  ],
  "/app/settings": [
    { element: '[data-tour="page-header"]', title: "Definições", description: "Tudo num só sítio, por separadores: Organização, Equipa, Plano, IA, WhatsApp e Domínios de envio.", side: "bottom" },
  ],
};

// Tour do assistente de campanhas (dentro do diálogo)
export const CAMPAIGN_WIZARD_TOUR: TourStep[] = [
  { element: '[data-tour="wizard-progress"]', title: "5 passos", description: "O assistente tem 5 passos. Esta barra mostra onde estás: Informações → Audiência → Sequência → Agendamento → Revisão.", side: "bottom" },
  { element: '[data-tour="wizard-body"]', title: "Passo atual", description: "Passo 1 — dá um nome à campanha e escolhe os canais (Email e/ou WhatsApp). Os passos seguintes deixam-te escolher a audiência (Leads, Clientes ou Prospects), montar a sequência de mensagens e agendar.", side: "top" },
  { element: '[data-tour="wizard-nav"]', title: "Navegação", description: "Avança com 'Seguinte' (só ativa quando o passo está válido) e, no fim, 'Criar e Lançar' inscreve os contactos e dispara a 1ª mensagem.", side: "top" },
];

export function getPageTour(pathname: string): TourStep[] | null {
  const keys = Object.keys(TOURS).sort((a, b) => b.length - a.length);
  const k = keys.find((key) => pathname === key || pathname.startsWith(key + "/"));
  return k ? TOURS[k] : null;
}
