-- Tarefa 7 (brief financeiro) — Fonte única de verdade para stock.
--
-- products.stock_quantity coexistia com stock_movements sem garantia de coerência:
-- o stock inicial e as edições manuais no formulário escreviam a coluna diretamente,
-- sem registar movimento. Resultado: ledger (Σ delta) ≠ stock_quantity.
--
-- Solução: todo o stock passa a ter movimento correspondente.
--  - Trigger AFTER INSERT em products regista o saldo inicial como movimento.
--  - RPC set_product_stock regista ajustes manuais como movimento (usado pelo form).
--  - Backfill de saldos de abertura para os produtos existentes.
--  - get_stock_discrepancies sinaliza divergências (também usado na reconciliação).

-- Saldo de abertura ao criar produto com stock.
CREATE OR REPLACE FUNCTION public.trg_products_opening_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tracks_stock AND COALESCE(NEW.stock_quantity, 0) <> 0 THEN
    INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after)
    VALUES (NEW.organization_id, NEW.id, NULL, NEW.stock_quantity, 'opening_balance', NEW.stock_quantity);
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_products_opening_stock ON public.products;
CREATE TRIGGER trg_products_opening_stock
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_opening_stock();

-- Ajuste manual de stock ledgerado (define o valor e regista o movimento da diferença).
CREATE OR REPLACE FUNCTION public.set_product_stock(p_product uuid, p_new_qty numeric, p_reason text DEFAULT 'manual_adjustment')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_cur numeric; v_delta numeric;
BEGIN
  SELECT organization_id, stock_quantity INTO v_org, v_cur FROM public.products WHERE id = p_product;
  IF v_org IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  v_delta := COALESCE(p_new_qty, 0) - COALESCE(v_cur, 0);
  IF v_delta = 0 THEN RETURN; END IF;

  UPDATE public.products SET stock_quantity = p_new_qty, updated_at = now() WHERE id = p_product;
  INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after)
  VALUES (v_org, p_product, NULL, v_delta, COALESCE(NULLIF(p_reason,''), 'manual_adjustment'), p_new_qty);
END
$function$;

-- Backfill: regista saldo de abertura para conciliar ledger ↔ stock_quantity dos produtos existentes.
DO $backfill$
DECLARE r record; v_diff numeric;
BEGIN
  FOR r IN
    SELECT p.id, p.organization_id, p.stock_quantity,
           COALESCE((SELECT SUM(sm.delta) FROM public.stock_movements sm WHERE sm.product_id = p.id), 0) AS ledger
      FROM public.products p WHERE p.tracks_stock = true
  LOOP
    v_diff := COALESCE(r.stock_quantity, 0) - r.ledger;
    IF v_diff <> 0 THEN
      INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after)
      VALUES (r.organization_id, r.id, NULL, v_diff, 'opening_balance', r.stock_quantity);
    END IF;
  END LOOP;
END
$backfill$;

-- Verificação de divergências entre a coluna e o ledger.
CREATE OR REPLACE FUNCTION public.get_stock_discrepancies(_org uuid)
RETURNS TABLE(product_id uuid, product_name text, stock_quantity numeric, ledger_balance numeric, diff numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.stock_quantity,
         COALESCE((SELECT SUM(sm.delta) FROM public.stock_movements sm WHERE sm.product_id = p.id), 0),
         p.stock_quantity - COALESCE((SELECT SUM(sm.delta) FROM public.stock_movements sm WHERE sm.product_id = p.id), 0)
    FROM public.products p
   WHERE p.organization_id = _org AND p.tracks_stock = true
     AND p.stock_quantity IS DISTINCT FROM COALESCE((SELECT SUM(sm.delta) FROM public.stock_movements sm WHERE sm.product_id = p.id), 0);
END
$function$;

GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_discrepancies(uuid) TO authenticated;
