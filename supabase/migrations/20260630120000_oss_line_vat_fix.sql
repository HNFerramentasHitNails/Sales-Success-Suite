-- Tarefa 3 (brief financeiro) — Corrigir IVA ao nível da linha por tratamento de IVA.
--
-- Problema: o cabeçalho da encomenda aplicava a taxa correta (ex.: OSS 19% destino),
-- mas as order_lines mantinham a taxa do produto (23% PT). Resultado: soma das linhas
-- (€123) ≠ cabeçalho (€119). As order_lines têm tax_rate "livre" e line_subtotal/line_tax/
-- line_total como colunas GERADAS a partir de tax_rate — logo basta acertar tax_rate.
--
-- Solução:
--  1. apply_order_line_vat(order) — acerta tax_rate de cada linha consoante o tratamento de
--     IVA da encomenda (rede de segurança, idempotente). As colunas geradas recalculam-se.
--  2. recalc_order_totals_for — passa a usar SEMPRE cabeçalho = soma das linhas, garantindo
--     o invariante "soma das linhas = cabeçalho" em todos os tratamentos.
--
-- Anti-recursão: o UPDATE só toca em linhas cuja taxa efetiva diverge (IS DISTINCT FROM).
-- Quando já estão normalizadas, 0 linhas são afetadas e o trigger AFTER UPDATE não dispara,
-- limitando a reentrância a uma passagem corretiva.

CREATE OR REPLACE FUNCTION public.apply_order_line_vat(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_treat text;
  v_dest  numeric;
BEGIN
  SELECT vat_treatment, vat_destination_rate
    INTO v_treat, v_dest
  FROM public.orders WHERE id = p_order_id;

  IF v_treat IS NULL THEN RETURN; END IF;

  UPDATE public.order_lines ol
     SET tax_rate = eff.rate
  FROM (
    SELECT l.id,
           CASE v_treat
             WHEN 'oss_destination' THEN COALESCE(v_dest, 0)
             WHEN 'reverse_charge'  THEN 0
             WHEN 'export'          THEN 0
             WHEN 'exempt'          THEN 0
             ELSE  -- domestic: taxa do produto (ou da própria linha, se for linha avulsa)
               COALESCE(
                 (SELECT CASE WHEN p.is_tax_exempt THEN 0 ELSE p.tax_rate END
                    FROM public.products p WHERE p.id = l.product_id),
                 l.tax_rate)
           END AS rate
      FROM public.order_lines l
     WHERE l.order_id = p_order_id
  ) eff
  WHERE ol.id = eff.id
    AND ol.order_id = p_order_id
    AND ol.tax_rate IS DISTINCT FROM eff.rate;
END
$function$;

-- Cabeçalho = soma das linhas (após normalização das linhas pelo tratamento).
CREATE OR REPLACE FUNCTION public.recalc_order_totals_for(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub numeric(14,2);
  v_tax numeric(14,2);
BEGIN
  -- 1) normaliza o IVA das linhas de acordo com o tratamento da encomenda
  PERFORM public.apply_order_line_vat(p_order_id);

  -- 2) cabeçalho derivado das linhas (invariante: cabeçalho = soma das linhas)
  SELECT COALESCE(SUM(line_subtotal), 0)::numeric(14,2),
         COALESCE(SUM(line_tax), 0)::numeric(14,2)
    INTO v_sub, v_tax
  FROM public.order_lines
  WHERE order_id = p_order_id;

  UPDATE public.orders
     SET subtotal  = v_sub,
         tax_total = v_tax,
         total     = v_sub + v_tax,
         updated_at = now()
   WHERE id = p_order_id;
END
$function$;

-- Backfill seguro: re-normaliza linhas e cabeçalhos de todas as encomendas existentes.
-- Domésticas ficam inalteradas (taxa efetiva = taxa atual); apenas OSS/isenções convergem.
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.recalc_order_totals_for(r.id);
  END LOOP;
END
$backfill$;
