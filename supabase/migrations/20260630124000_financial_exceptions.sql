-- Tarefa 9 (brief financeiro) — Reconciliação automática de exceções financeiras.
--
-- RPC única que corre os tie-outs e devolve as exceções, para um painel de controlo.
-- Categorias: integridade encomenda↔fatura, faturas não certificadas (F1), carteira,
-- devoluções por regularizar (F2), stock, comissões e pagamentos.

CREATE OR REPLACE FUNCTION public.get_financial_exceptions(_org uuid)
RETURNS TABLE(category text, severity text, entity text, detail text, amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  -- 1) Cabeçalho da encomenda ≠ soma das linhas
  SELECT 'cabecalho_vs_linhas', 'alta', o.order_number,
         'Cabeçalho difere da soma das linhas', o.total
    FROM public.orders o
    JOIN LATERAL (SELECT COALESCE(SUM(line_subtotal),0) ls, COALESCE(SUM(line_tax),0) lt
                    FROM public.order_lines WHERE order_id = o.id) s ON true
   WHERE o.organization_id = _org
     AND (abs(o.subtotal - s.ls) > 0.005 OR abs(o.tax_total - s.lt) > 0.005)

  UNION ALL
  -- 2) Encomenda faturada sem fatura ativa
  SELECT 'faturada_sem_fatura', 'alta', o.order_number,
         'Encomenda faturada sem fatura associada', o.total
    FROM public.orders o
   WHERE o.organization_id = _org AND o.status = 'faturada'
     AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.order_id = o.id AND i.status <> 'error')

  UNION ALL
  -- 3) Fatura órfã (sem encomenda)
  SELECT 'fatura_orfa', 'alta', i.invoice_number,
         'Fatura sem encomenda associada', i.total
    FROM public.invoices i
   WHERE i.organization_id = _org AND i.status <> 'error'
     AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = i.order_id)

  UNION ALL
  -- 4) Total da fatura ≠ total da encomenda
  SELECT 'fatura_total_divergente', 'media', i.invoice_number,
         'Total da fatura difere do total da encomenda', i.total
    FROM public.invoices i
    JOIN public.orders o ON o.id = i.order_id
   WHERE i.organization_id = _org AND i.status <> 'error'
     AND abs(COALESCE(i.total,0) - COALESCE(o.total,0)) > 0.005

  UNION ALL
  -- 5) Fatura emitida mas não certificada (sem external_id/pdf_url) — F1
  SELECT 'fatura_nao_certificada', 'critica', i.invoice_number,
         'Fatura emitida sem sincronização com software certificado (sem external_id/pdf_url)', i.total
    FROM public.invoices i
   WHERE i.organization_id = _org AND i.status = 'issued'
     AND (i.external_id IS NULL OR i.pdf_url IS NULL OR i.external_status = 'not_synced')

  UNION ALL
  -- 6) Saldo de carteira ≠ último balance_after dos movimentos
  SELECT 'saldo_carteira_divergente', 'alta', COALESCE(c.name, w.customer_id::text),
         'Saldo da carteira difere do último movimento', w.balance
    FROM public.customer_wallets w
    LEFT JOIN public.customers c ON c.id = w.customer_id
   WHERE w.organization_id = _org
     AND w.balance IS DISTINCT FROM COALESCE(
       (SELECT t.balance_after FROM public.customer_wallet_transactions t
         WHERE t.wallet_id = w.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1), 0)

  UNION ALL
  -- 7) Encomenda com crédito de carteira aplicado mas sem débito correspondente
  SELECT 'carteira_aplicada_sem_debito', 'alta', o.order_number,
         'wallet_balance_applied sem débito de carteira correspondente', o.wallet_balance_applied
    FROM public.orders o
   WHERE o.organization_id = _org AND COALESCE(o.wallet_balance_applied,0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.customer_wallet_transactions t
                      WHERE t.source_type = 'order' AND t.source_id = o.id)

  UNION ALL
  -- 8) RMA aprovada por regularizar (sem nota de crédito — F2)
  SELECT 'rma_por_regularizar', 'alta', r.id::text,
         'Devolução aprovada (' || COALESCE(r.resolution,'?') || ') por regularizar: nota de crédito/reembolso/stock/comissão', NULL::numeric
    FROM public.rma r
   WHERE r.organization_id = _org AND r.status = 'approved'

  UNION ALL
  -- 9) Comissões por gerar em encomendas faturadas
  SELECT 'comissoes_por_gerar', 'media', 'comissões',
         'Existem encomendas faturadas com comercial atribuído e nenhum mapa de comissão gerado', NULL::numeric
   WHERE EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.organization_id = _org AND o.status IN ('faturada','paga') AND o.assigned_member_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.commission_statements cs WHERE cs.organization_id = _org)

  UNION ALL
  -- 10) Stock: divergências coluna ↔ ledger
  SELECT 'stock_divergente', 'media', p.name,
         'stock_quantity difere do saldo dos movimentos', (p.stock_quantity - COALESCE(l.s,0))
    FROM public.products p
    LEFT JOIN (SELECT product_id, SUM(delta) s FROM public.stock_movements GROUP BY product_id) l
           ON l.product_id = p.id
   WHERE p.organization_id = _org AND p.tracks_stock = true
     AND p.stock_quantity IS DISTINCT FROM COALESCE(l.s,0)

  UNION ALL
  -- 11) Pagamentos: encomendas pagas/faturadas sem paid_at
  SELECT 'pagamento_' || pr.issue, 'media', pr.order_number, 'Conciliação de pagamento', pr.total
    FROM public.get_payment_reconciliation(_org) pr
   WHERE pr.issue IS NOT NULL;
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_financial_exceptions(uuid) TO authenticated;
