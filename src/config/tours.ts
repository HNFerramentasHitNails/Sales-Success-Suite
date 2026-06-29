// Mini-tours por página. Todas as páginas têm [data-tour="page-header"] e, se
// tiverem ações, [data-tour="page-actions"]. Alguns têm alvos específicos.
import { GROUPS } from "./nav";

export type TourStep = { element?: string; title: string; description: string; side?: "top" | "bottom" | "left" | "right" };

const hdr = (title: string, description: string): TourStep => ({ element: '[data-tour="page-header"]', title, description, side: "bottom" });
const acts = (description: string): TourStep => ({ element: '[data-tour="page-actions"]', title: "Ações principais", description, side: "bottom" });

const TOURS: Record<string, TourStep[]> = {
  // ---- Início ----
  "/app/dashboard": [
    hdr("Painel", "A tua visão geral: KPIs do negócio, chamadas do dia, leads quentes e atividade recente."),
    { element: '[data-tour="checklist"]', title: "Primeiros passos", description: "Enquanto a configuração não estiver completa, este cartão guia-te. Desaparece quando terminares.", side: "bottom" },
  ],
  "/app/objectives": [
    hdr("Objetivos", "Define metas de vendas (anuais e mensais) por comercial e acompanha o progresso vs. realizado."),
    acts("Cria e edita objetivos a partir daqui."),
  ],

  // ---- Outreach ----
  "/app/inbox": [
    hdr("Inbox", "Todas as conversas de WhatsApp com os teus leads, num só sítio."),
    { element: '[data-tour="inbox-threads"]', title: "Conversas", description: "Lista de conversas por ordem de recência. O número indica mensagens por ler.", side: "right" },
    { element: '[data-tour="inbox-conversation"]', title: "Responder", description: "Abre uma conversa para ver o histórico e responder. A resposta sai pelo WhatsApp ligado e o lead sai automaticamente da sequência.", side: "left" },
  ],
  "/app/leads": [
    hdr("Leads", "Os teus contactos de prospeção (frios, importados e do marketplace)."),
    acts("Importa um CSV/Excel (com mapeamento de colunas), cria um lead manual, ou abre a Lixeira para restaurar."),
    { element: '[data-tour="leads-filters"]', title: "Procurar e filtrar", description: "Filtra por estado, país ou nicho. Em cada lead podes promovê-lo a prospect (passa para o funil de vendas).", side: "bottom" },
  ],
  "/app/marketplace": [
    hdr("Marketplace de leads", "Captura leads de diretórios de negócio (Google Maps, via Outscraper): escolhe categoria, país, cidade, quantidade e rating mínimo."),
    hdr("Importar", "Depois de pesquisar, seleciona os resultados que queres e importa-os para os teus Leads com um clique."),
  ],
  "/app/templates": [
    hdr("Templates", "Mensagens reutilizáveis para email e WhatsApp."),
    acts("Em 'Novo Template' descreves a oferta e o objetivo, e a IA escreve várias variações por canal (ângulos diferentes para teste A/B). Editas antes de guardar."),
  ],
  "/app/campaigns": [
    hdr("Campanhas", "Disparos automáticos multicanal (email + WhatsApp) com sequências e A/B."),
    acts("'Nova Campanha' abre um assistente em 5 passos: informações, audiência (Leads, Clientes ou Prospects), sequência, agendamento e revisão."),
  ],

  // ---- Clientes & Vendas ----
  "/app/customers": [
    hdr("Clientes", "A tua base de clientes, com segmentos RFM, etiquetas, carteira e histórico."),
    acts("Cria, importa e gere os teus clientes a partir daqui."),
  ],
  "/app/prospects": [
    hdr("Prospeção", "O teu funil de vendas em Kanban: arrasta os prospects entre fases (novo → ganho/perdido) e regista interações."),
  ],
  "/app/orders": [
    hdr("Encomendas", "Cria e acompanha encomendas; stock e faturação ligam-se automaticamente."),
    acts("Nova encomenda e filtros principais."),
  ],
  "/app/invoices": [
    hdr("Faturas", "Emite e consulta faturas, integradas com os teus conectores de faturação (Moloni, Vendus, InvoiceXpress…)."),
    acts("Emitir e gerir faturas."),
  ],
  "/app/subscriptions": [
    hdr("Subscrições", "Gere planos recorrentes dos teus clientes e a respetiva renovação/cobrança."),
    acts("Cria e gere subscrições."),
  ],
  "/app/commissions": [
    hdr("Comissões", "Calcula e acompanha as comissões dos comerciais com base nas vendas."),
    acts("Regras e mapas de comissões."),
  ],

  // ---- Atividade ----
  "/app/calls": [
    hdr("Chamadas do dia", "A tua lista priorizada de chamadas, gerada automaticamente (ex.: clientes em risco de churn)."),
    acts("Atualiza ou gera as chamadas do dia."),
  ],
  "/app/calendar": [
    hdr("Agenda", "As tuas reuniões e tarefas agendadas, com sincronização de calendário."),
    acts("Agenda novas reuniões/tarefas."),
  ],
  "/app/call-history": [
    hdr("Histórico de chamadas", "Registo de todas as chamadas feitas, com resultado e notas, para acompanhares a atividade comercial."),
  ],

  // ---- Catálogo ----
  "/app/products": [
    hdr("Produtos", "O teu catálogo: preços, stock, variantes e kits."),
    acts("Novo produto, importação e gestão do catálogo."),
  ],
  "/app/channels": [
    hdr("Canais de venda", "Define os canais (loja, revenda, online…) e o SKU/preço de cada produto por canal."),
    acts("Cria e gere canais."),
  ],
  "/app/pricing": [
    hdr("Preços & Descontos", "Tabelas de preços por grupo de cliente e matriz de descontos/campanhas promocionais."),
    acts("Cria regras de preço e desconto."),
  ],

  // ---- Análise ----
  "/app/pareto": [
    hdr("Análise de Pareto", "Identifica os 20% de produtos/clientes que geram 80% do valor, para focares o esforço."),
  ],
  "/app/product-comparison": [
    hdr("Comparar produtos", "Compara o desempenho de produtos lado a lado (vendas, margem, rotação)."),
  ],
  "/app/lead-scoring": [
    hdr("Lead scoring", "Pontuação automática dos leads/prospects por probabilidade de conversão, para priorizares."),
  ],
  "/app/lead-assignment": [
    hdr("Atribuição de leads", "Regras para distribuir automaticamente os leads pelos comerciais."),
    acts("Define as regras de atribuição."),
  ],
  "/app/customer-tags": [
    hdr("Etiquetas", "Cria e gere as etiquetas usadas para segmentar clientes e leads."),
    acts("Cria/edita etiquetas."),
  ],
  "/app/segments": [
    hdr("Segmentos RFM", "Segmentação automática de clientes por Recência, Frequência e Valor (campeões, em risco, perdidos…)."),
  ],

  // ---- Pós-venda ----
  "/app/issues": [
    hdr("Problemas", "Regista e acompanha problemas/reclamações de clientes até à resolução."),
    acts("Abrir e gerir problemas."),
  ],
  "/app/rma": [
    hdr("Devoluções", "Gere pedidos de devolução/troca (RMA) e o respetivo fluxo."),
    acts("Criar e processar devoluções."),
  ],
  "/app/vouchers": [
    hdr("Vouchers", "Cria e gere vouchers/créditos para clientes, com validade e estado."),
    acts("Emitir vouchers."),
  ],
  "/app/wallet-campaigns": [
    hdr("Campanhas de carteira", "Campanhas que creditam automaticamente a carteira do cliente conforme regras de compra."),
    acts("Criar campanhas de carteira."),
  ],
  "/app/achievements": [
    hdr("Conquistas", "Gamificação: marcos e recompensas para motivar a equipa e os clientes."),
  ],

  // ---- Distribuição ----
  "/app/distribution/partners": [
    hdr("Parceiros", "Gere distribuidores/revendedores/agentes e os respetivos contratos."),
    acts("Adicionar e gerir parceiros."),
  ],
  "/app/distribution/calculator": [
    hdr("Calculadora de distribuição", "Simula margens e preços ao longo da cadeia de distribuição."),
  ],
  "/app/distribution/analytics": [
    hdr("Análise da distribuição", "KPIs agregados da tua rede de distribuição."),
  ],

  // ---- IA ----
  "/app/agents": [
    hdr("Agentes IA", "Copilotos de vendas, treino e estratégia. Respondem com base na tua Base de conhecimento e nos teus dados."),
    acts("Inicia uma conversa com um agente."),
  ],
  "/app/ai-knowledge": [
    hdr("Base de conhecimento", "O conhecimento da empresa/produtos que alimenta as respostas dos agentes de IA."),
    acts("Adiciona entradas de conhecimento."),
  ],

  // ---- Definições ----
  "/app/settings": [
    hdr("Definições", "Tudo num só sítio, por separadores: Organização, Equipa, Plano, IA, WhatsApp e Domínios de envio."),
  ],
  "/app/integrations": [
    hdr("Integrações", "Liga serviços externos: Stripe, Moloni, Vendus, InvoiceXpress, Shopify, Google Calendar…"),
    acts("Adiciona e configura integrações."),
  ],
};

// Tour do assistente de campanhas (dentro do diálogo)
export const CAMPAIGN_WIZARD_TOUR: TourStep[] = [
  { element: '[data-tour="wizard-progress"]', title: "5 passos", description: "O assistente tem 5 passos: Informações → Audiência → Sequência → Agendamento → Revisão.", side: "bottom" },
  { element: '[data-tour="wizard-body"]', title: "Passo atual", description: "Passo 1 — nome da campanha e canais (Email e/ou WhatsApp). Os passos seguintes escolhem a audiência, montam a sequência e agendam.", side: "top" },
  { element: '[data-tour="wizard-nav"]', title: "Navegação", description: "Avança com 'Seguinte' (ativa quando o passo está válido); no fim, 'Criar e Lançar' inscreve os contactos e dispara a 1ª mensagem.", side: "top" },
];

function navTitle(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const g of GROUPS) {
    for (const it of g.items) {
      if ((pathname === it.url || pathname.startsWith(it.url + "/")) && it.url.length > bestLen) {
        best = it.title;
        bestLen = it.url.length;
      }
    }
  }
  return best;
}

function fallbackTour(pathname: string): TourStep[] {
  const title = navTitle(pathname);
  return [
    hdr(title || "Esta página", `${title ? `Estás em <b>${title}</b>. ` : ""}O título e a descrição no topo indicam sempre o que esta página faz.`),
    acts("Os botões de ação desta página (criar, importar, filtrar…) estão aqui no topo, à direita."),
    { element: '[data-tour="search"]', title: "Ir para outra página", description: "Usa a pesquisa rápida (⌘K) a qualquer momento para saltar para outra área.", side: "bottom" },
  ];
}

export function getPageTour(pathname: string): TourStep[] | null {
  if (!pathname.startsWith("/app")) return null;
  const keys = Object.keys(TOURS).sort((a, b) => b.length - a.length);
  const k = keys.find((key) => pathname === key || pathname.startsWith(key + "/"));
  return k ? TOURS[k] : fallbackTour(pathname);
}

// rotas com tour específico, pela ordem da navegação (para a visita guiada)
export function tourRoutesInOrder(): string[] {
  const out: string[] = [];
  for (const g of GROUPS) for (const it of g.items) if (TOURS[it.url]) out.push(it.url);
  return out;
}
