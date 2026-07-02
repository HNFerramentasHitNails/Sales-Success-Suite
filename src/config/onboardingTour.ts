// Conteúdo do tour de boas-vindas (primeira entrada na plataforma).
// Cada "página" navega para um URL e mostra os seus passos em sequência; passos cujo
// elemento não existe no momento (ex.: funcionalidade sem permissão, secção sem dados)
// são automaticamente ignorados — ver OnboardingTour.tsx.

export type TourStep = {
  selector: string | null; // null = popover centrado, sem elemento associado
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
};

export type TourPage = {
  path: string;
  label: string;
  steps: TourStep[];
};

export const ONBOARDING_TOUR: TourPage[] = [
  {
    path: "/app/dashboard",
    label: "Painel",
    steps: [
      {
        selector: null,
        title: "Bem-vindo(a) à Sales Success Suite! 👋",
        description:
          "Vamos fazer uma visita guiada pelas principais áreas da plataforma. Podes fechar esta visita a qualquer momento (não volta a aparecer sozinha) e revê-la sempre que quiseres a partir do teu menu de utilizador, no canto superior direito.",
      },
      {
        selector: '[data-tour="app-sidebar"]',
        title: "Navegação principal",
        description:
          "Aqui tens todas as áreas da plataforma, organizadas por grupo (Clientes & Vendas, Catálogo, Análise, Pós-venda, etc.). Os grupos podem ser dobrados/expandidos clicando no título, e os itens que vês dependem do teu papel e do plano da organização — alguns podem aparecer com um cadeado 🔒 se pertencerem a um plano superior.",
        side: "right",
      },
      {
        selector: '[data-tour="header-search"]',
        title: "Pesquisa rápida",
        description:
          "Usa este botão — ou o atalho Ctrl+K (⌘K no Mac) — para saltar imediatamente para qualquer cliente, encomenda, produto ou página, sem tirares as mãos do teclado.",
        side: "bottom",
      },
      {
        selector: '[data-tour="header-org-switcher"]',
        title: "Trocar de organização",
        description: "Pertences a mais do que uma organização. Usa este seletor para alternar entre elas a qualquer momento.",
        side: "bottom",
      },
      {
        selector: '[data-tour="header-user-menu"]',
        title: "O teu menu",
        description:
          "Aqui acedes ao teu perfil e terminas sessão. É também aqui que podes rever este tour outra vez sempre que precisares.",
        side: "bottom",
      },
      {
        selector: '[data-tour="dash-checklist"]',
        title: "Primeiros passos",
        description:
          "Esta lista de verificação acompanha a configuração inicial da tua organização (dados fiscais, catálogo, equipa, etc.). Desaparece sozinha quando terminares tudo.",
      },
      {
        selector: '[data-tour="dash-preset"]',
        title: "Período de análise",
        description: "Escolhe o intervalo de datas — este mês, mês passado, este ano ou últimos 12 meses. Todos os números abaixo atualizam-se de acordo com esta escolha.",
        side: "left",
      },
      {
        selector: '[data-tour="dash-kpis"]',
        title: "Indicadores principais",
        description:
          "Faturado, valor por faturar, vendas, número de encomendas, ticket médio, clientes ativos, pipeline em aberto e taxa de conversão — a fotografia rápida do negócio no período escolhido.",
      },
      {
        selector: '[data-tour="dash-nudges"]',
        title: "Sugestões do dia",
        description:
          "A IA analisa a tua carteira todos os dias e sugere ações concretas: leads quentes, prospects parados, clientes sem contacto, propostas sem resposta, etc. Podes ver o registo, dispensar a sugestão, ou pedir ao Agente de IA os próximos passos.",
      },
      {
        selector: '[data-tour="dash-evolution"]',
        title: "Evolução mensal",
        description: "Compara vendas e valor faturado mês a mês, para veres a tendência do negócio ao longo do tempo.",
      },
      {
        selector: '[data-tour="dash-top-customers"]',
        title: "Top clientes",
        description: "Os clientes que mais compraram no período selecionado, por número de encomendas e valor total.",
      },
      {
        selector: '[data-tour="dash-top-products"]',
        title: "Top produtos (ABC / Pareto)",
        description:
          "Os produtos mais vendidos, classificados em A/B/C consoante o seu peso na receita acumulada (análise de Pareto) — útil para priorizar stock e promoções.",
      },
      {
        selector: '[data-tour="dash-team"]',
        title: "Ranking da equipa",
        description: "Como administrador ou diretor de vendas, vês aqui o desempenho de cada comercial no período escolhido.",
      },
    ],
  },
  {
    path: "/app/customers",
    label: "Clientes",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Gerir clientes",
        description:
          "Importa clientes em massa a partir de um ficheiro, funde fichas duplicadas, ou cria um cliente novo manualmente.",
        side: "bottom",
      },
      {
        selector: '[data-tour="customers-filters"]',
        title: "Filtrar clientes",
        description: "Pesquisa por nome, email ou empresa, e filtra por etiqueta ou pelo comercial responsável.",
      },
      {
        selector: '[data-tour="customers-table"]',
        title: "Lista de clientes",
        description:
          "Cada linha mostra o contacto, o segmento RFM, as etiquetas e o comercial responsável. Marca várias linhas com a caixa de seleção para aplicar etiquetas ou reatribuir comercial em massa. Clica numa linha para abrir a ficha completa do cliente.",
      },
    ],
  },
  {
    path: "/app/prospects",
    label: "Prospeção",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo prospect",
        description: "Regista aqui uma nova oportunidade de negócio antes de se tornar cliente.",
        side: "bottom",
      },
      {
        selector: '[data-tour="prospects-filters"]',
        title: "Filtrar prospects",
        description: "Pesquisa por nome ou empresa, e filtra por comercial responsável ou origem do lead.",
      },
      {
        selector: '[data-tour="prospects-board"]',
        title: "Pipeline de vendas",
        description:
          "Um quadro kanban com as etapas do funil (Novo → Contactado → Qualificado → Proposta → Negociação → Ganho/Perdido). Arrasta os cartões entre colunas para avançar uma oportunidade; mover para Ganho ou Perdido pede confirmação. Cada cartão mostra o valor estimado e a pontuação do lead (lead score).",
      },
    ],
  },
  {
    path: "/app/orders",
    label: "Encomendas",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Gerir encomendas",
        description: "Importa histórico de encomendas de outro sistema, ou cria uma encomenda nova.",
        side: "bottom",
      },
      {
        selector: '[data-tour="orders-filters"]',
        title: "Filtrar encomendas",
        description: "Pesquisa por número de encomenda e filtra por estado (rascunho, confirmada, paga, faturada, cancelada).",
      },
      {
        selector: '[data-tour="orders-table"]',
        title: "Lista de encomendas",
        description:
          "Cada linha mostra o cliente, a data, o estado (com selos extra como \"Reembolsada\" quando há nota de crédito, ou \"Carteira\" quando parte foi paga com saldo) e o total. Na última coluna encontras as ações disponíveis consoante o estado: pagar com a carteira do cliente, gerar link de pagamento Stripe, emitir fatura, ou cancelar.",
      },
      {
        selector: '[data-tour="orders-pagination"]',
        title: "Paginação",
        description: "A lista está paginada — usa estes botões para navegar quando houver muitas encomendas.",
      },
    ],
  },
  {
    path: "/app/invoices",
    label: "Faturas",
    steps: [
      {
        selector: '[data-tour="invoices-filters"]',
        title: "Filtrar faturas",
        description: "Pesquisa por número de fatura e filtra por estado.",
      },
      {
        selector: '[data-tour="invoices-table"]',
        title: "Lista de faturas",
        description:
          "Vês o estado interno da fatura e o estado de sincronização com o sistema de faturação certificada (Moloni), quando ligado. Clica no ícone de PDF para abrir o documento.",
      },
    ],
  },
  {
    path: "/app/products",
    label: "Produtos",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo produto",
        description: "Cria aqui um produto ou serviço novo para o teu catálogo.",
        side: "bottom",
      },
      {
        selector: '[data-tour="products-filters"]',
        title: "Filtrar produtos",
        description: "Pesquisa por nome ou SKU, e filtra por tipo ou categoria.",
      },
      {
        selector: '[data-tour="products-table"]',
        title: "Lista de produtos",
        description:
          "Vês o preço sem IVA, a taxa de IVA e o stock (com aviso quando está baixo ou em falta). Ajusta o stock, ativa/desativa um produto, ou remove-o diretamente a partir desta linha.",
      },
    ],
  },
  {
    path: "/app/rma",
    label: "Devoluções",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova devolução",
        description: "Regista aqui um pedido de devolução (RMA) associado a um cliente ou a uma encomenda.",
        side: "bottom",
      },
      {
        selector: '[data-tour="rma-board"]',
        title: "Fluxo de devoluções",
        description:
          "As devoluções avançam por 4 colunas: Pendentes → Recebidos → Em Inspeção → Fechados. Depois de aprovada, um administrador pode \"Regularizar\": isso emite a nota de crédito, repõe o stock e reverte a comissão automaticamente. Se a resolução for reembolso ao método original de pagamento (ex.: Stripe), aparece um botão dedicado para processar esse reembolso.",
      },
    ],
  },
  {
    path: "/app/calls",
    label: "Chamadas do dia",
    steps: [
      {
        selector: '[data-tour="calls-kpis"]',
        title: "Indicadores de retenção",
        description: "Ticket médio previsto, valor já obtido e taxa de efetividade das chamadas realizadas.",
      },
      {
        selector: '[data-tour="calls-actions"]',
        title: "Gerar chamadas do dia",
        description:
          "Todas as madrugadas o sistema gera automaticamente chamadas para clientes ativos em risco de churn alto ou crítico. Usa este botão para forçar a geração manualmente, ou adiciona uma chamada avulsa.",
        side: "bottom",
      },
      {
        selector: '[data-tour="calls-filters"]',
        title: "Filtrar a lista de chamadas",
        description: "Filtra por estado, segmento ou fase do cliente, e exporta a lista em RFV quando precisares.",
      },
      {
        selector: null,
        title: "Fim da visita! 🎉",
        description:
          "Isto cobre o essencial para começares a trabalhar. Há mais áreas por explorar — Outreach, Análise avançada, Distribuição e Definições — que podes descobrir à medida que precisares. Podes rever este tour a qualquer momento no teu menu de utilizador.",
      },
    ],
  },
];
