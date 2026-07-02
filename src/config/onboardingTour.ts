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
          "Vamos fazer uma visita guiada completa pela plataforma. Podes fechar esta visita a qualquer momento (não volta a aparecer sozinha) e revê-la sempre que quiseres a partir do teu menu de utilizador, no canto superior direito.",
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
    path: "/app/objectives",
    label: "Objetivos",
    steps: [
      {
        selector: '[data-tour="objectives-filters"]',
        title: "Ano, métrica e âmbito",
        description:
          "Escolhe o ano, se queres analisar por vendas (encomendas) ou faturado (faturas), e se vês a meta da empresa toda ou de um comercial específico.",
        side: "bottom",
      },
      {
        selector: '[data-tour="objectives-kpis"]',
        title: "Ponto de situação",
        description: "Meta anual, valor já realizado, percentagem de cumprimento e a comparação com o ano anterior, sempre de acordo com os filtros escolhidos acima.",
      },
      {
        selector: '[data-tour="objectives-targets"]',
        title: "Definir metas",
        description:
          "Como administrador ou diretor de vendas, defines aqui a meta anual e distribuis o valor pelos 12 meses — manualmente ou com o botão \"Distribuir igualmente\". Um aviso avisa-te se a soma das mensais não bater certo com a meta anual.",
      },
      {
        selector: '[data-tour="objectives-chart"]',
        title: "Meta vs Realizado",
        description: "O gráfico compara, mês a mês, a meta definida com o valor realizado e com o mesmo período do ano anterior.",
      },
    ],
  },
  {
    path: "/app/inbox",
    label: "Inbox",
    steps: [
      {
        selector: '[data-tour="inbox-board"]',
        title: "Conversas de WhatsApp",
        description:
          "À esquerda tens a lista de conversas com os teus leads (com contador de mensagens por ler); à direita, o histórico da conversa selecionada e uma caixa para responderes diretamente por WhatsApp. A lista atualiza-se automaticamente a cada poucos segundos.",
      },
    ],
  },
  {
    path: "/app/leads",
    label: "Leads",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Gerir leads",
        description: "Importa leads em massa a partir de um ficheiro Excel/CSV, cria um lead manualmente, ou consulta a lixeira de leads eliminados.",
        side: "bottom",
      },
      {
        selector: '[data-tour="leads-kpis"]',
        title: "Indicadores de leads",
        description: "Total de leads, quantos têm WhatsApp disponível, e a distribuição por estado (novo, contactado, respondeu).",
      },
      {
        selector: '[data-tour="leads-filters"]',
        title: "Filtrar leads",
        description: "Pesquisa por nome, email ou empresa, e filtra por estado ou país.",
      },
      {
        selector: '[data-tour="leads-table"]',
        title: "Lista de leads",
        description:
          "Cada linha mostra o contacto, se tem WhatsApp e o estado. Nas ações podes promover um lead a prospect (entra no funil de vendas), marcá-lo como \"não contactar\" (opt-out RGPD), ou movê-lo para a lixeira.",
      },
    ],
  },
  {
    path: "/app/marketplace",
    label: "Marketplace de leads",
    steps: [
      {
        selector: '[data-tour="marketplace-search"]',
        title: "Procurar leads em diretórios",
        description:
          "Escolhe categoria de negócio, país, cidade, quantidade e um rating mínimo para encontrar potenciais leads em diretórios públicos (Google Maps, via Outscraper). A pesquisa pode demorar alguns minutos a primeira vez — repetições da mesma pesquisa costumam ser mais rápidas.",
        side: "bottom",
      },
      {
        selector: '[data-tour="marketplace-results"]',
        title: "Resultados e importação",
        description:
          "Depois de uma pesquisa, os resultados aparecem aqui já pré-selecionados. Desmarca os que não interessam e usa \"Importar selecionados\" para os enviar diretamente para a tua lista de Leads.",
      },
    ],
  },
  {
    path: "/app/campaigns",
    label: "Campanhas",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova campanha",
        description:
          "Cria uma campanha de outreach por email ou WhatsApp através de um assistente passo a passo: nome e canais, audiência (leads, clientes ou prospects), sequência de mensagens com templates, agendamento e revisão final.",
        side: "bottom",
      },
      {
        selector: '[data-tour="campaigns-kpis"]',
        title: "Indicadores de campanhas",
        description: "Total de campanhas, quantas estão a correr ou agendadas, e o total de leads inscritos em campanhas.",
      },
      {
        selector: '[data-tour="campaigns-table"]',
        title: "Lista de campanhas",
        description:
          "Cada linha mostra os canais, quantos leads abrange, o número de passos da sequência e o estado. Podes pausar, retomar, ou forçar o processamento imediato de uma campanha a partir das ações à direita. Antes do primeiro envio em massa, é pedida uma confirmação de conformidade (RGPD e regras de marketing eletrónico).",
      },
    ],
  },
  {
    path: "/app/templates",
    label: "Templates",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo template com IA",
        description:
          "Gera mensagens de outreach (email, SMS, WhatsApp) com IA a partir de uma descrição da tua oferta, do problema que resolves e do público-alvo. Podes gerar várias variações por canal e editá-las antes de guardar.",
        side: "bottom",
      },
      {
        selector: '[data-tour="templates-kpis"]',
        title: "Indicadores de templates",
        description: "Número total de templates e quantas variações existem por canal (email, SMS, WhatsApp).",
      },
      {
        selector: '[data-tour="templates-table"]',
        title: "Lista de templates",
        description: "Cada linha mostra o nicho, o estágio do lead, o objetivo e os canais com conteúdo gerado. Usa estes templates depois nas Campanhas.",
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
    path: "/app/subscriptions",
    label: "Subscrições",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova subscrição",
        description: "Cria aqui um serviço recorrente que gera encomendas em rascunho automaticamente, de acordo com a periodicidade escolhida.",
        side: "bottom",
      },
      {
        selector: '[data-tour="subscriptions-filters"]',
        title: "Filtrar por estado",
        description: "Vê apenas as subscrições ativas, pausadas ou canceladas — ou todas de uma vez.",
      },
      {
        selector: '[data-tour="subscriptions-board"]',
        title: "Lista de subscrições",
        description:
          "Cada cartão mostra o cliente, o produto/descrição, a periodicidade, a próxima data de execução e o responsável. Usa \"Executar agora\" para forçar a geração da encomenda antes da data, pausa ou cancela a subscrição, e consulta o \"Histórico\" para veres todas as execuções passadas (incluindo eventuais erros).",
      },
    ],
  },
  {
    path: "/app/commissions",
    label: "Comissões",
    steps: [
      {
        selector: '[data-tour="commissions-tabs"]',
        title: "Áreas de comissão",
        description:
          "Resumo (por comercial, no período), Por produto, Extratos (fecho de período) e, para administradores e diretores de vendas, Ajustes manuais e Regras de comissão.",
      },
      {
        selector: '[data-tour="commissions-resumo-table"]',
        title: "Resumo por comercial",
        description:
          "Total de base e comissão por comercial no período escolhido. Clica numa linha para expandir e ver o detalhe encomenda a encomenda, incluindo ajustes manuais aplicados.",
      },
      {
        selector: '[data-tour="commissions-extratos-table"]',
        title: "Extratos de comissão",
        description:
          "Um administrador ou diretor de vendas \"fecha\" o período para gerar os extratos oficiais de cada comercial. Extratos já marcados como pagos ficam bloqueados e não são alterados num novo fecho.",
      },
    ],
  },
  {
    path: "/app/reconciliation",
    label: "Conciliação",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Atualizar",
        description: "Os dados de conciliação não são em tempo real — usa este botão para recalcular tudo com a informação mais recente.",
        side: "bottom",
      },
      {
        selector: '[data-tour="reconciliation-kpis"]',
        title: "Margem e inventário",
        description:
          "Margem, receita líquida, COGS e valor do inventário ao custo no período escolhido (o seletor de período está no cartão de Margem).",
      },
      {
        selector: '[data-tour="reconciliation-exceptions"]',
        title: "Exceções financeiras",
        description:
          "Tie-outs automáticos entre encomendas, faturas, faturação certificada, carteira, devoluções, stock, comissões e pagamentos. Cada exceção mostra a gravidade, o tipo, a referência e o valor envolvido — quando não há nada aqui, está tudo a conciliar.",
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
    ],
  },
  {
    path: "/app/calendar",
    label: "Agenda",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova atividade",
        description: "Agenda aqui uma reunião, chamada, tarefa ou follow-up associado a um cliente ou prospect.",
        side: "bottom",
      },
      {
        selector: '[data-tour="calendar-filters"]',
        title: "Filtrar a agenda",
        description:
          "Filtra por tipo e estado da atividade. Administradores e diretores de vendas podem ainda filtrar por responsável e alternar entre ver só as suas atividades ou as de toda a equipa.",
      },
      {
        selector: '[data-tour="calendar-board"]',
        title: "Atividades agendadas",
        description:
          "Lista agrupada por dia, com as próximas atividades (30 dias, ou o dia escolhido no mini-calendário ao lado). Marca como concluída ou cancelada, edita ou elimina diretamente em cada cartão.",
      },
      {
        selector: '[data-tour="calendar-mini"]',
        title: "Vista de calendário",
        description: "Os dias com atividades aparecem marcados com um ponto. Clica num dia para veres só as atividades desse dia.",
        side: "left",
      },
    ],
  },
  {
    path: "/app/call-history",
    label: "Histórico de chamadas",
    steps: [
      {
        selector: '[data-tour="call-history-filters"]',
        title: "Filtrar chamadas",
        description: "Filtra o histórico por intervalo de datas, estado, responsável, ou pesquisa pelo nome do cliente/prospect.",
      },
      {
        selector: '[data-tour="call-history-table"]',
        title: "Histórico de chamadas",
        description:
          "Todas as chamadas realizadas (ou agendadas) no período escolhido, com o estado, o resultado e as notas registadas por quem a atendeu.",
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
    path: "/app/channels",
    label: "Canais de venda",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Criar canal de venda",
        description:
          "Um canal representa um sítio onde vendes (ex.: Loja Online, Marketplace, Loja física). Podes associar produtos a canais específicos e depois filtrar o catálogo por canal.",
        side: "bottom",
      },
      {
        selector: '[data-tour="channels-table"]',
        title: "Lista de canais",
        description:
          "Ativa ou desativa um canal com o interruptor — um canal inativo deixa de estar disponível para novas atribuições de produtos. Eliminar um canal remove também as atribuições de produtos a esse canal.",
      },
    ],
  },
  {
    path: "/app/pricing",
    label: "Preços & Descontos",
    steps: [
      {
        selector: '[data-tour="pricing-tabs"]',
        title: "Cinco áreas de configuração",
        description:
          "Grupos de produto e Classes de cliente são as duas dimensões que cruzas na Matriz de descontos. As Campanhas aplicam descontos promocionais temporários, e os Upgrades de classe promovem clientes automaticamente com base no seu histórico.",
        side: "bottom",
      },
      {
        selector: '[data-tour="pricing-groups-table"]',
        title: "Grupos de produto",
        description:
          "Um grupo de preço agrupa produtos (ex.: \"Eletrónica\", \"Consumíveis\") para lhes aplicares o mesmo tratamento de desconto na matriz, em vez de o definires produto a produto.",
      },
      {
        selector: null,
        title: "Matriz, campanhas e upgrades",
        description:
          "Na Matriz de descontos defines a % de desconto para cada combinação de grupo de produto × classe de cliente. As Campanhas sobrepõem-se à matriz base durante um período (aplica-se sempre o maior desconto entre a tabela base e a promoção ativa). As regras de Upgrade sobem automaticamente um cliente para uma classe superior quando atinge um limiar de gasto total ou de número de encomendas — nunca descem sozinhas.",
      },
    ],
  },
  {
    path: "/app/shipping",
    label: "Portes de envio",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova regra de portes",
        description: "Cria aqui uma regra para calcular automaticamente o custo de envio de uma encomenda.",
        side: "bottom",
      },
      {
        selector: '[data-tour="shipping-table"]',
        title: "Regras de cálculo de portes",
        description:
          "Cada regra aplica-se consoante o país de destino, um intervalo de peso e/ou de valor da encomenda — a regra de maior prioridade que corresponder é a usada. Podes definir um valor a partir do qual o envio passa a ser grátis (\"Grátis acima\") e a taxa de IVA própria dos portes. Sem regras criadas, as encomendas ficam sem custo de envio calculado.",
      },
    ],
  },
  {
    path: "/app/pareto",
    label: "Análise de Pareto",
    steps: [
      {
        selector: '[data-tour="pareto-filters"]',
        title: "Clientes ou produtos, e período",
        description: "Alterna a análise entre Clientes e Produtos, e escolhe o período de dados a considerar.",
      },
      {
        selector: '[data-tour="pareto-kpis"]',
        title: "Resumo da classificação",
        description: "O valor total do período e quantos itens caem em cada classe A, B ou C.",
      },
      {
        selector: '[data-tour="pareto-chart"]',
        title: "Curva de Pareto (regra 80/20)",
        description:
          "As barras mostram o valor de cada cliente ou produto (do maior para o menor) e a linha mostra a percentagem acumulada da receita. A regra de Pareto diz que uma pequena parte da carteira costuma gerar a maior parte do valor — esta curva ajuda a ver isso rapidamente.",
      },
      {
        selector: '[data-tour="pareto-table"]',
        title: "Classificação ABC",
        description:
          "Cada linha é classificada em A (contribui até 80% do valor acumulado), B (até 95%) ou C (o restante). Usa isto para priorizar: dá mais atenção comercial aos A, mantém os B, e evita gastar demasiado esforço nos C.",
      },
    ],
  },
  {
    path: "/app/product-comparison",
    label: "Comparar produtos",
    steps: [
      {
        selector: '[data-tour="product-comparison-search"]',
        title: "Adicionar produtos à comparação",
        description: "Pesquisa por nome ou SKU e adiciona os produtos que queres comparar lado a lado.",
      },
      {
        selector: '[data-tour="product-comparison-table"]',
        title: "Tabela comparativa",
        description:
          "Para cada produto adicionado vês o preço, unidades vendidas, receita e número de encomendas no período escolhido. Remove um produto da comparação com o ícone X.",
      },
      {
        selector: '[data-tour="product-comparison-chart"]',
        title: "Gráfico comparativo",
        description:
          "Assim que tiveres pelo menos um produto na comparação, aparece aqui um gráfico de barras. Usa o seletor de métrica para alternar entre receita, unidades vendidas e preço unitário.",
      },
    ],
  },
  {
    path: "/app/lead-scoring",
    label: "Lead scoring",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Lead scoring",
        description:
          "Cada prospect recebe automaticamente uma pontuação de 0 a 100 (Quente ≥ 70 · Morno 40–69 · Frio < 40) com base em regras que defines aqui — etapa no pipeline, valor estimado, dados de contacto e atividade recente. Usa \"Recalcular agora\" para aplicar imediatamente as regras atuais a todos os prospects, e \"Guardar\" para gravar alterações às regras.",
        side: "bottom",
      },
      {
        selector: '[data-tour="lead-scoring-config"]',
        title: "Regras de pontuação",
        description:
          "Podes desativar o scoring por completo (todos os prospects ficam a 0) ou ajustar o peso de cada critério. As pontuações recalculam-se automaticamente à medida que os prospects avançam no funil.",
      },
      {
        selector: '[data-tour="lead-scoring-stages"]',
        title: "Pontos por etapa do pipeline",
        description:
          "Define quantos pontos um prospect ganha só por estar em cada etapa (Novo, Contactado, Qualificado, Proposta, Negociação, Ganho, Perdido). Etapas mais avançadas no funil devem valer mais.",
      },
      {
        selector: '[data-tour="lead-scoring-tiers"]',
        title: "Escalões de valor e bónus",
        description:
          "Atribui pontos extra consoante o valor estimado da oportunidade (o escalão mais alto atingido é o que conta), mais bónus por ter email/telefone preenchidos e por haver atividade recente (chamadas ou tarefas) nos últimos N dias.",
      },
    ],
  },
  {
    path: "/app/lead-assignment",
    label: "Atribuição de leads",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Atribuição automática de leads",
        description:
          "Quando um prospect novo entra sem comercial atribuído (manualmente, por importação ou via API), o sistema pode distribuí-lo automaticamente em round-robin pelos comerciais do pool. Usa \"Guardar\" para aplicar as alterações a esta configuração.",
        side: "bottom",
      },
      {
        selector: '[data-tour="lead-assignment-config"]',
        title: "Como funciona a rotação",
        description:
          "Ativa ou desativa a atribuição automática. A atribuição manual continua sempre disponível, mesmo com a automática ligada.",
      },
      {
        selector: '[data-tour="lead-assignment-pool"]',
        title: "Pool de comerciais",
        description:
          "Escolhe quais os membros ativos que participam na rotação e define a sua ordem com as setas. O próximo lead sem comercial vai para o primeiro da lista após o último atribuído, voltando ao início quando chega ao fim (wrap-around).",
      },
      {
        selector: '[data-tour="lead-assignment-status"]',
        title: "Estado da rotação",
        description:
          "Mostra qual foi o último comercial a receber um lead automaticamente, para acompanhares se a rotação está a distribuir de forma equilibrada.",
      },
    ],
  },
  {
    path: "/app/customer-tags",
    label: "Etiquetas",
    steps: [
      {
        selector: '[data-tour="customer-tags-tree"]',
        title: "Árvore de etiquetas",
        description:
          "Organiza as etiquetas de clientes em hierarquia — cria etiquetas-pai e sub-etiquetas (ex.: \"VIP\" > \"VIP Ouro\"). Usa \"Nova etiqueta\" para criar uma no topo, ou o ícone + em cada linha para adicionar uma sub-etiqueta.",
      },
      {
        selector: '[data-tour="customer-tags-rules"]',
        title: "Regras de upgrade automático",
        description:
          "Cria regras que atribuem (e opcionalmente removem) etiquetas automaticamente quando um cliente atinge uma métrica — receita total, número de encomendas ou quantidade, num determinado período. \"Aplicar regras agora\" corre todas as regras ativas de imediato; caso contrário, aplicam-se nas rotinas automáticas da plataforma.",
      },
    ],
  },
  {
    path: "/app/segments",
    label: "Segmentos RFM",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Segmentação RFM",
        description:
          "RFM classifica clientes por Recência (há quantos dias compraram), Frequência (quantas vezes) e valor Monetário (quanto gastaram), atribuindo-os automaticamente a segmentos como \"Campeões\" ou \"Em risco\". Se ainda não tens segmentos, usa \"Criar predefinidos\" para partir de um conjunto sugerido. \"Recalcular agora\" reclassifica todos os clientes com as regras atuais, e \"Novo segmento\" cria uma regra à medida.",
        side: "bottom",
      },
      {
        selector: '[data-tour="segments-table"]',
        title: "Lista de segmentos",
        description:
          "Cada linha define os intervalos de Recência (dias), Frequência e Monetário (€) que um cliente tem de cumprir para pertencer ao segmento, mais a prioridade que lhe é dada nas chamadas de retenção. A primeira regra (por ordem) que o cliente cumprir é a aplicada — por isso a ordem importa. Edita ou elimina um segmento com os ícones à direita.",
      },
    ],
  },
  {
    path: "/app/issues",
    label: "Problemas",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo problema",
        description: "Regista aqui uma reclamação ou incidência reportada por um cliente.",
        side: "bottom",
      },
      {
        selector: '[data-tour="issues-filters"]',
        title: "Filtrar problemas",
        description: "Filtra por prioridade (baixa, normal, alta, urgente) ou pelo responsável atribuído.",
      },
      {
        selector: '[data-tour="issues-board"]',
        title: "Fluxo de problemas",
        description:
          "Os problemas avançam por 4 colunas: Abertos → Em Investigação → Resolvidos → Fechados. Cada cartão mostra a prioridade, o cliente/encomenda associado e o responsável — muda o estado diretamente no seletor do cartão.",
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
    path: "/app/vouchers",
    label: "Vouchers",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo voucher",
        description: "Cria um voucher de crédito comercial, com ou sem cliente atribuído, e uma validade opcional.",
        side: "bottom",
      },
      {
        selector: '[data-tour="vouchers-filters"]',
        title: "Filtrar vouchers",
        description: "Filtra por estado: ativos, resgatados, expirados ou cancelados.",
      },
      {
        selector: '[data-tour="vouchers-list"]',
        title: "Lista de vouchers",
        description:
          "Cada voucher mostra o código, o valor e o estado. Vouchers ativos podem ser resgatados — o valor é creditado na carteira do cliente — ou cancelados, consoante a tua permissão. Se o voucher não tiver cliente atribuído, é pedido ao resgatar.",
      },
    ],
  },
  {
    path: "/app/wallet-campaigns",
    label: "Campanhas de carteira",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova campanha",
        description:
          "Cria uma regra de cashback automático: define o valor mínimo da encomenda, a recompensa (percentagem ou valor fixo) e, opcionalmente, um teto e tags de clientes elegíveis.",
        side: "bottom",
      },
      {
        selector: '[data-tour="wallet-campaigns-list"]',
        title: "Campanhas ativas",
        description:
          "O crédito é aplicado automaticamente quando uma encomenda do cliente passa a paga ou faturada — no máximo uma vez por encomenda. Ativa/desativa cada campanha com o interruptor, sem precisar de a eliminar.",
      },
    ],
  },
  {
    path: "/app/achievements",
    label: "Conquistas",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Gerir conquistas",
        description:
          "Cria uma nova conquista (ex.: faturação, nº de encomendas, negócios ganhos) ou força o recálculo imediato das atribuições em vez de esperar pelo processamento automático.",
        side: "bottom",
      },
      {
        selector: '[data-tour="achievements-ranking"]',
        title: "Ranking da equipa",
        description:
          "Como administrador ou diretor de vendas, vês aqui a tabela classificativa dos comerciais no período escolhido (mês, ano ou sempre).",
      },
      {
        selector: '[data-tour="achievements-grid"]',
        title: "Conquistas da equipa",
        description:
          "Cada cartão mostra o critério (métrica, período e limiar) e quem já a atingiu. As tuas conquistas obtidas ficam destacadas com uma borda e o selo \"Obtida ✓\".",
      },
    ],
  },
  {
    path: "/app/distribution/partners",
    label: "Parceiros",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Novo parceiro",
        description:
          "A Distribuição gere a tua rede de revenda B2B — distribuidores, revendedores e agentes — separada da tua carteira direta de clientes finais.",
        side: "bottom",
      },
      {
        selector: '[data-tour="distribution-partners-filters"]',
        title: "Filtrar parceiros",
        description: "Filtra por estado (prospect, ativo, inativo, suspenso), tipo de parceiro ou região.",
      },
      {
        selector: '[data-tour="distribution-partners-list"]',
        title: "Lista de parceiros",
        description:
          "Clica num cartão para abrir a ficha completa do parceiro, onde podes gerir os seus contratos: título, vigência, percentagem de comissão/desconto e condições. Nota legal: podes definir descontos por volume, mas nunca impor um preço mínimo de revenda ao parceiro.",
      },
    ],
  },
  {
    path: "/app/distribution/calculator",
    label: "Calculadora",
    steps: [
      {
        selector: '[data-tour="distribution-calculator-form"]',
        title: "Simular um preço de revenda",
        description:
          "Escolhe o preço base (manual ou de um produto do catálogo), a quantidade e a fonte do desconto: automático por escalão de volume, pelo contrato ativo de um parceiro, ou manual.",
      },
      {
        selector: '[data-tour="distribution-calculator-results"]',
        title: "Resultados da simulação",
        description:
          "Vês o preço unitário e total ao parceiro, o valor do desconto, a tua margem (se indicares o custo) e a margem do parceiro (se indicares um PVP de revenda sugerido).",
      },
      {
        selector: '[data-tour="distribution-calculator-tiers"]',
        title: "Escalões de volume",
        description:
          "Define aqui os escalões de desconto por quantidade mínima — são aplicados automaticamente na simulação sempre que a fonte do desconto escolhida for \"por escalão\".",
      },
    ],
  },
  {
    path: "/app/distribution/analytics",
    label: "Análise (Distribuição)",
    steps: [
      {
        selector: '[data-tour="distribution-analytics-kpis"]',
        title: "Indicadores da rede de distribuição",
        description: "Total de parceiros, parceiros ativos, contratos ativos e contratos a expirar nos próximos 60 dias.",
      },
      {
        selector: '[data-tour="distribution-analytics-region"]',
        title: "Cobertura por região",
        description: "Vê como os teus parceiros de distribuição estão distribuídos geograficamente.",
      },
      {
        selector: '[data-tour="distribution-analytics-top"]',
        title: "Top parceiros por receita",
        description:
          "Classificação dos parceiros que mais faturam, calculada a partir das encomendas do cliente associado a cada parceiro — só aparece para parceiros ligados a uma ficha de cliente.",
      },
    ],
  },
  {
    path: "/app/agents",
    label: "Agentes IA",
    steps: [
      {
        selector: '[data-tour="agents-tabs"]',
        title: "Os teus agentes de IA",
        description:
          "Tens três agentes especializados: Vendas (abordagens, objeções, follow-ups), Treino (role-play e coaching) e Estratégia (priorização de contas e planos de ação). Muda de agente aqui — cada um mantém o seu próprio histórico de conversas.",
        side: "bottom",
      },
      {
        selector: '[data-tour="agents-workspace"]',
        title: "Conversar com o agente",
        description:
          "À esquerda tens o histórico de conversas com este agente — cria uma nova a qualquer momento. À direita está o chat: escreve a tua pergunta ou usa uma das sugestões iniciais. As respostas são geradas por IA com base nos dados da tua organização, por isso confirma sempre antes de agir.",
      },
    ],
  },
  {
    path: "/app/ai-knowledge",
    label: "Base de conhecimento",
    steps: [
      {
        selector: '[data-tour="page-actions"]',
        title: "Nova entrada",
        description: "Adiciona um novo documento ou nota de conhecimento sobre a tua empresa, produtos ou processos.",
        side: "bottom",
      },
      {
        selector: '[data-tour="knowledge-list"]',
        title: "Conhecimento da tua organização",
        description:
          "Cada entrada aqui é injetada no contexto dos Agentes de IA, para que respondam com informação específica da tua empresa em vez de respostas genéricas. Organiza por categoria (Empresa, Produtos, Processos, FAQ, Tom de voz), e desativa uma entrada com o interruptor sem a apagar, se quiseres deixar de a usar temporariamente.",
      },
    ],
  },
  {
    path: "/app/settings",
    label: "Definições",
    steps: [
      {
        selector: '[data-tour="settings-tabs"]',
        title: "Definições da organização",
        description:
          "Tudo o que precisas para configurar a plataforma está aqui: Organização (dados fiscais e preferências gerais), Equipa (convites e papéis dos membros), Plano (subscrição e limites), IA (ligação ao fornecedor e créditos), WhatsApp (canal de outreach) e Domínios de envio (autenticação de email). Só administradores têm acesso a esta área.",
        side: "bottom",
      },
    ],
  },
  {
    path: "/app/integrations",
    label: "Integrações",
    steps: [
      {
        selector: '[data-tour="integrations-list"]',
        title: "Ligações a ferramentas externas",
        description:
          "Liga a tua organização a serviços como Stripe (pagamentos), Moloni (faturação certificada) e outros conectores disponíveis por categoria. Cada cartão mostra o estado da ligação — clica em \"Ligar\" para configurar credenciais, ou \"Editar\"/\"Desativar\" numa ligação já existente. Alguns conectores têm um botão \"Testar ligação\" para confirmar que as credenciais estão corretas.",
      },
      {
        selector: '[data-tour="integrations-webhook"]',
        title: "Webhook de entrada",
        description: "Um endpoint público único para a tua organização, para receber eventos de sistemas externos. Podes regenerar o segredo ou desativá-lo a qualquer momento.",
      },
      {
        selector: '[data-tour="integrations-logs"]',
        title: "Registos de sincronização",
        description: "Os últimos 50 eventos de entrada e saída entre a plataforma e os conectores ligados — útil para diagnosticar falhas de sincronização.",
      },
      {
        selector: null,
        title: "Fim da visita! 🎉",
        description:
          "Percorremos toda a plataforma — desde o Painel até às Integrações. Não precisas de decorar tudo: podes rever este tour a qualquer momento no teu menu de utilizador, no canto superior direito.",
      },
    ],
  },
];
