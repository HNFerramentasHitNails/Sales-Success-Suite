// Configuração legal centralizada — dados da entidade e ligações úteis.
// IMPORTANTE: substituir os [PLACEHOLDERS] pelos dados reais da empresa.
// Os textos legais são rascunhos de trabalho e devem ser revistos por advogado
// antes de produção.
export const LEGAL = {
  entidadeLegal: "[NOME LEGAL DA EMPRESA, p. ex. HN Hit Nails, Lda.]",
  marcaComercial: "Sales Success Suite",
  nif: "[NIF]",
  morada: "[MORADA COMPLETA, CÓDIGO POSTAL, PORTUGAL]",
  comarca: "[COMARCA, p. ex. Lisboa]",
  email: "[EMAIL DE CONTACTO, p. ex. suporte@salesdna.pt]",
  emailPrivacidade: "[EMAIL DE PRIVACIDADE/DPO, p. ex. privacidade@salesdna.pt]",
  telefone: "[TELEFONE OU REMOVER]",
  dominio: "[DOMÍNIO OFICIAL, p. ex. https://salesdna.pt]",
  dataAtualizacao: "[AAAA-MM-DD]",
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
