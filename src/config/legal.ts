// Configuração legal centralizada — dados da entidade e ligações úteis.
// IMPORTANTE: substituir os [PLACEHOLDERS] pelos dados reais da empresa.
// Os textos legais são rascunhos de trabalho e devem ser revistos por advogado
// antes de produção.
export const LEGAL = {
  entidadeLegal: "Luckytarget, Lda",
  marcaComercial: "HN Hit Nails",
  nif: "508725607",
  morada: "Avenida Egas Moniz - Zona Industrial Parque do Alto, Armazém 1 2135-232 Samora Correia]",
  comarca: "Samora Correia",
  email: "geral@hnhitnails.com",
  emailPrivacidade: "privacidade@hnhitnails.com",
  telefone: "+351 911 176 003",
  dominio: "https://www.hnhitnails.com/",
  dataAtualizacao: "2026-06-30",
  livroReclamacoes: "https://www.livroreclamacoes.pt/",
  resolucaoLitigiosUE: "https://ec.europa.eu/consumers/odr",
  cnpd: "https://www.cnpd.pt",
} as const;

// Versões dos documentos legais — usadas para registar prova de consentimento.
// Incrementar quando o conteúdo material dos termos/privacidade mudar.
export const LEGAL_VERSIONS = {
  terms: "2026-06-30",
  privacy: "2026-06-30",
} as const;
