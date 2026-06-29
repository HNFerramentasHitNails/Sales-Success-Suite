
# Métricas do cliente após venda/chamada — Plano

## 1. O que JÁ existe (e o que NÃO existe)

### Cron jobs registados (`cron.job`)
| jobid | nome | schedule | comando |
|---|---|---|---|
| 1 | `daily-call-tasks` | `0 6 * * *` | `select public.cron_generate_daily_call_tasks();` |
| 3 | `rfm-recalc-daily` | `0 4 * * *` | `select public.cron_recalculate_rfm_all();` |
| 2 | `monthly-commission-cards` | `0 3 1 * *` | `select public.cron_generate_monthly_commission_cards();` |
| 4 | `daily-missed-calls` | `0 5 * * *` | `select public.cron_process_missed_calls();` |

### ⚠️ Achado crítico
**Três dos quatro cron jobs estão partidos.** As funções `cron_generate_daily_call_tasks()`, `cron_recalculate_rfm_all()` e `cron_generate_monthly_commission_cards()` **não existem** no `pg_proc` atual. Nem as tabelas que elas pressupõem (`calls`, `call_tasks`, `commissions`, `commission_cards`) existem.

Estão em migrações antigas (`20260618…`, `20260619…`, `20260620…`, `20260622…`) que referenciam um esquema diferente (uma versão anterior do produto): usavam `public.calls` em vez de `public.sales_calls`, funções `is_org_admin(uid, org)` em vez da assinatura atual `is_org_admin(org)`, `is_platform_admin`, `apply_tenant_rls`, etc. Foram aparentemente **abandonadas/substituídas**, mas os jobs do `pg_cron` ficaram apontados para nomes que já não existem. Hoje o único cron funcional é o `daily-missed-calls` (jobid 4), que foi feito recentemente com a assinatura nova.

Só apareceu **uma** chamada com `outcome` no histórico (texto livre, sem enum) — confirma que esta área está praticamente vazia.

### O que existe de facto na BD atual
- `customers`: **NÃO** tem nenhuma coluna de métricas. Tem apenas `segment text` (genérico, sem ligação a RFM). Sem `last_purchase_date`, `purchase_frequency`, `monetary`, `rfm_*`, `recurrence_interval_days`, `last_contact_at`.
- `sales_calls`: tem `status` (`pending`/`rescheduled`/`completed`), `outcome text` (livre), `scheduled_for`, `duration_minutes`, `priority`. Sem `purchased`/`sale_value`/`answered`.
- `orders`: registo de venda real (`status` `paga`/`faturada`, `order_date`, `customer_id`, `total`, `subtotal`).
- Página `Customers.tsx` não mostra nenhuma métrica do cliente — só dados de cadastro.

### Conclusão sobre "o que está calculado"
**Nada.** A automação RFM/daily-call-tasks descrita nas regras do projeto **não está realmente implementada** na BD ativa. Só ficaram os jobs do pg_cron como "fantasmas" (a falhar silenciosamente todos os dias).

---

## 2. O que falta para "métricas do cliente atualizadas após venda/chamada"

Atualizar em tempo real, na ficha do cliente:
- **Última compra** (data + valor)
- **Total gasto** (lifetime, líquido s/IVA)
- **Nº de compras**
- **Recorrência média** (intervalo médio entre encomendas, em dias)
- **Próxima compra esperada** (última + recorrência média)
- **Último contacto** (data da última `sales_calls` com `status='completed'`)
- **Resultado do último contacto** (texto livre `outcome`)

Estes valores devem ser recalculados sempre que:
- Uma `order` passa a `paga`/`faturada` (ou é editada/cancelada).
- Uma `sales_call` muda para `status='completed'` (com ou sem `outcome` de venda).

---

## 3. Proposta

### 3a. Esquema — colunas materializadas em `customers`
Em vez de criar uma tabela `customer_metrics` separada (overhead sem benefício real para os volumes esperados), adicionar colunas materializadas à própria `customers`. Mais simples, RLS já existente, e a ficha do cliente lê-as numa única query.

Colunas novas (todas nullable, defaults zero onde fizer sentido):
- `last_purchase_at date`
- `last_purchase_value numeric(14,2)`
- `total_spent numeric(14,2) NOT NULL DEFAULT 0` (soma de `orders.subtotal` em estados `paga`/`faturada`, alinhado com o Dashboard "S/IVA")
- `orders_count integer NOT NULL DEFAULT 0`
- `avg_recurrence_days integer` (média de intervalos entre encomendas; só calculado a partir de 2 compras)
- `next_purchase_expected_at date` (= `last_purchase_at + avg_recurrence_days`)
- `last_contact_at timestamptz` (da `sales_calls` completada mais recente)
- `last_contact_outcome text`

Índice: `(organization_id, next_purchase_expected_at)` e `(organization_id, last_purchase_at desc)` para futuros relatórios.

### 3b. Recálculo — **triggers**, não cron
Razões: queremos atualização imediata após "venda/chamada" (esse é o pedido). Cron seria sempre desfasado e duplicava lógica.

Função única `recompute_customer_metrics(_org_id uuid, _customer_id uuid)` SECURITY DEFINER que:
1. Lê todas as `orders` pagas/faturadas do cliente → calcula `total_spent`, `orders_count`, `last_purchase_at`, `last_purchase_value`, e `avg_recurrence_days` = média das diferenças entre `order_date` consecutivas (se ≥ 2 encomendas).
2. Calcula `next_purchase_expected_at` = `last_purchase_at + avg_recurrence_days` (NULL se não houver recorrência ainda).
3. Lê a `sales_calls` `completed` mais recente do cliente → `last_contact_at`, `last_contact_outcome`.
4. Faz `UPDATE` na linha do `customers`.

Triggers (AFTER INSERT/UPDATE/DELETE, FOR EACH ROW):
- `orders` → quando `status` muda para/de `paga`/`faturada`, ou quando `customer_id`/`order_date`/`subtotal` mudam. Recalcula para o `customer_id` (e para o antigo, em caso de UPDATE).
- `sales_calls` → quando `status` muda para/de `completed`, ou `outcome` muda, ou `customer_id` muda.

Backfill: uma chamada única no fim da migração (`SELECT recompute_customer_metrics(org_id, c.id) FROM customers c`) para popular o histórico.

### 3c. Limpeza dos cron jobs fantasmas
**Recomendação importante**: desativar (`cron.unschedule`) os jobs 1 e 3 (`daily-call-tasks`, `rfm-recalc-daily`), e o 2 (`monthly-commission-cards`) — todos apontam para funções inexistentes e falham silenciosamente todos os dias. Se mais tarde se quiser repor "tarefas de chamada diárias" e "RFM real", reconstroem-se com o esquema atual. **Confirma comigo antes** de fazer este passo — é uma decisão tua, não puramente técnica.

### 3d. UI — ficha do cliente (`/app/customers`)
Sem reestruturar a página: adicionar um **bloco "Métricas"** no topo do detalhe do cliente (ou novo separador "Visão geral") com cartões compactos:
- Total gasto (S/IVA) · Nº compras · Última compra (data + valor)
- Recorrência média (X dias) · Próxima compra esperada (data + badge "em atraso" se passou)
- Último contacto (data relativa + outcome em texto pequeno)

Formatação: usar `fmtMoney`/`fmtDate` já existentes. Se um valor for `null` mostrar "—".

### 3e. Riscos / conflitos
- **Performance**: triggers em `orders` recalculam para 1 cliente por evento — barato (uma query agregada). Sem locks problemáticos.
- **Idempotência**: recompute é puro (lê tudo de novo), nunca duplica. Seguro reexecutar.
- **Conflito com cron fantasma**: nenhum, porque os crons não correm nada. Mas se um dia se reativarem migrações antigas, vão tentar criar colunas `last_purchase_date`/`purchase_frequency`/`monetary`/`rfm_*` com nomes diferentes dos que proponho — atenção a essa colisão futura.
- **Estados de encomenda**: usar exatamente `('paga','faturada')` para alinhar com `get_commissions_summary` e `get_dashboard_summary`. Encomendas `cancelada` não contam.
- **Multi-tenant**: tudo dentro de `organization_id`. RLS de `customers` já protege a leitura; o `recompute_customer_metrics` é SECURITY DEFINER mas só lê/escreve para o `_customer_id` recebido, que vem dos triggers (não exposto).

---

## Resumo executivo
1. A "automação de métricas" ainda não existe na prática — só restos partidos.
2. Proponho **colunas materializadas em `customers`** + **triggers em `orders` e `sales_calls`** + função `recompute_customer_metrics` + backfill + UI na ficha do cliente.
3. Sugiro também **limpar os 3 cron jobs fantasmas** (decisão tua, à parte).
