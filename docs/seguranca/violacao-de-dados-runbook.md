# Runbook — Resposta a Violação de Dados Pessoais (RGPD art. 33/34)

> Documento interno. Rever por DPO/advogado. Manter atualizado.

## 1. Princípios
- **Prazo:** notificar a **CNPD em 72 horas** após tomar conhecimento de uma violação que represente risco para os direitos e liberdades dos titulares (art. 33.º).
- **Titulares:** comunicar **sem demora injustificada** quando a violação for suscetível de implicar um **risco elevado** (art. 34.º).
- Registar **todas** as violações (mesmo as não notificáveis) no registo interno.

## 2. Deteção e classificação
1. Quem detetar uma suspeita comunica imediatamente ao responsável de segurança / DPO.
2. Classificar: confidencialidade (acesso/divulgação indevida), integridade (alteração) ou disponibilidade (perda/indisponibilidade).
3. Avaliar o risco (categorias e volume de dados, sensibilidade, possibilidade de identificação, consequências).

## 3. Contenção e remediação
- Revogar credenciais/segredos comprometidos (Stripe, Evolution, IA, Resend, Supabase service role).
  - Os segredos de conectores estão cifrados em repouso (AES-GCM, `CONNECTOR_SECRETS_KEY`).
- Isolar contas/sessões afetadas; forçar reposição de palavras-passe se aplicável.
- Repor a partir de backups quando haja perda de integridade/disponibilidade.

## 4. Notificação
- **CNPD** (≤72h): natureza da violação, categorias e n.º aproximado de titulares e registos, contactos do DPO, consequências prováveis, medidas tomadas/propostas. Portal: https://www.cnpd.pt
- **Titulares** (risco elevado): linguagem clara, mesmas informações essenciais e recomendações de proteção.
- Se a notificação faseada for necessária, indicar que seguirá informação adicional.

## 5. Registo (obrigatório, art. 33.º/5)
Manter, por incidente: data/hora de deteção, descrição, dados e titulares afetados, avaliação de risco, medidas, decisão de notificar (e fundamentação), comunicações efetuadas.

## 6. Pós-incidente
- Análise de causa raiz e plano de correção.
- Rever controlos de acesso, RLS, funções `SECURITY DEFINER`, rotação de segredos e backups.
- Atualizar este runbook com lições aprendidas.

## 7. Contactos
- DPO / Privacidade: ver `src/config/legal.ts` (`emailPrivacidade`).
- Autoridade de controlo: CNPD — www.cnpd.pt
