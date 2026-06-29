
-- =========================================================
-- Automação #5 — Subscrições recorrentes
-- =========================================================

CREATE TABLE public.recurring_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  assigned_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text,
  unit_price numeric(14,2),
  tax_rate numeric(5,2),
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  interval_unit text NOT NULL CHECK (interval_unit IN ('week','month','quarter','year')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_run_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled')),
  paused_at timestamptz,
  canceled_at timestamptz,
  last_run_at timestamptz,
  runs_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rsub_content_chk CHECK (
    product_id IS NOT NULL
    OR (description IS NOT NULL AND length(trim(description)) > 0
        AND unit_price IS NOT NULL AND tax_rate IS NOT NULL)
  )
);

CREATE INDEX idx_rsub_due ON public.recurring_subscriptions (organization_id, status, next_run_date);
CREATE INDEX idx_rsub_customer ON public.recurring_subscriptions (organization_id, customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_subscriptions TO authenticated;
GRANT ALL ON public.recurring_subscriptions TO service_role;

ALTER TABLE public.recurring_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsub_select_members" ON public.recurring_subscriptions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "rsub_insert_members" ON public.recurring_subscriptions
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "rsub_update_members" ON public.recurring_subscriptions
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "rsub_delete_members" ON public.recurring_subscriptions
  FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

CREATE TRIGGER trg_rsub_touch
  BEFORE UPDATE ON public.recurring_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.recurring_subscription_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.recurring_subscriptions(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('created','skipped','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, run_date)
);

CREATE INDEX idx_rsub_runs_org ON public.recurring_subscription_runs (organization_id, created_at DESC);

GRANT SELECT ON public.recurring_subscription_runs TO authenticated;
GRANT ALL ON public.recurring_subscription_runs TO service_role;

ALTER TABLE public.recurring_subscription_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsub_runs_select_members" ON public.recurring_subscription_runs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Atualizar CHECKs de ai_nudges (nomes conhecidos)
ALTER TABLE public.ai_nudges DROP CONSTRAINT IF EXISTS ai_nudges_type_check;
ALTER TABLE public.ai_nudges
  ADD CONSTRAINT ai_nudges_type_check
  CHECK (type IN ('purchase_overdue','no_contact','hot_lead','agenda_reminder','subscription_due'));

ALTER TABLE public.ai_nudges DROP CONSTRAINT IF EXISTS ai_nudges_entity_type_check;
ALTER TABLE public.ai_nudges
  ADD CONSTRAINT ai_nudges_entity_type_check
  CHECK (entity_type IN ('customer','prospect','activity','order'));

-- Função: processa UMA subscrição
CREATE OR REPLACE FUNCTION public.run_due_subscription(_subscription_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  s public.recurring_subscriptions;
  v_run_date date;
  v_unit_price numeric(14,2);
  v_tax_rate numeric(5,2);
  v_description text;
  v_currency text;
  v_product RECORD;
  v_order_number text;
  v_next integer;
  v_order_id uuid;
  v_member_id uuid;
  v_customer_name text;
  v_customer_member uuid;
  v_new_next date;
BEGIN
  SELECT * INTO s FROM public.recurring_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;
  IF s.status <> 'active' OR s.next_run_date > current_date THEN
    RETURN NULL;
  END IF;

  v_run_date := s.next_run_date;

  BEGIN
    INSERT INTO public.recurring_subscription_runs
      (organization_id, subscription_id, run_date, status)
    VALUES (s.organization_id, s.id, v_run_date, 'created');
  EXCEPTION WHEN unique_violation THEN
    RETURN NULL;
  END;

  IF s.product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.products WHERE id = s.product_id;
    IF v_product.id IS NULL THEN
      IF s.description IS NULL OR s.unit_price IS NULL OR s.tax_rate IS NULL THEN
        UPDATE public.recurring_subscription_runs
           SET status='error', error_message='produto apagado e sem descrição livre'
         WHERE subscription_id = s.id AND run_date = v_run_date;
        UPDATE public.recurring_subscriptions
           SET status='paused', paused_at=now(), updated_at=now()
         WHERE id = s.id;
        RETURN NULL;
      END IF;
      v_description := s.description;
      v_unit_price := s.unit_price;
      v_tax_rate := s.tax_rate;
      v_currency := 'EUR';
    ELSE
      v_description := COALESCE(s.description, v_product.name);
      v_unit_price := COALESCE(s.unit_price, v_product.unit_price);
      v_tax_rate := COALESCE(s.tax_rate,
                             CASE WHEN v_product.is_tax_exempt THEN 0 ELSE v_product.tax_rate END);
      v_currency := COALESCE(v_product.currency, 'EUR');
    END IF;
  ELSE
    v_description := s.description;
    v_unit_price := s.unit_price;
    v_tax_rate := s.tax_rate;
    v_currency := 'EUR';
  END IF;

  INSERT INTO public.org_order_counters(organization_id, last_number)
  VALUES (s.organization_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = public.org_order_counters.last_number + 1
  RETURNING last_number INTO v_next;
  v_order_number := 'ENC-' || lpad(v_next::text, 5, '0');

  SELECT c.name, c.assigned_member_id INTO v_customer_name, v_customer_member
    FROM public.customers c WHERE c.id = s.customer_id;
  v_member_id := COALESCE(s.assigned_member_id, v_customer_member);

  INSERT INTO public.orders (
    organization_id, order_number, customer_id, status,
    order_date, currency, notes, created_by, assigned_member_id
  ) VALUES (
    s.organization_id, v_order_number, s.customer_id, 'rascunho',
    current_date, v_currency,
    'Gerada automaticamente pela subscrição recorrente.',
    s.created_by, v_member_id
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.order_lines (
    organization_id, order_id, product_id, description,
    quantity, unit_price, tax_rate, discount_percent
  ) VALUES (
    s.organization_id, v_order_id, s.product_id, v_description,
    s.quantity, v_unit_price, v_tax_rate, s.discount_percent
  );

  v_new_next := (v_run_date + (
    CASE s.interval_unit
      WHEN 'week'    THEN make_interval(weeks => s.interval_count)
      WHEN 'month'   THEN make_interval(months => s.interval_count)
      WHEN 'quarter' THEN make_interval(months => s.interval_count * 3)
      WHEN 'year'    THEN make_interval(years => s.interval_count)
    END
  ))::date;

  UPDATE public.recurring_subscriptions
     SET last_run_at = now(),
         runs_count = runs_count + 1,
         next_run_date = v_new_next,
         status = CASE WHEN end_date IS NOT NULL AND v_new_next > end_date THEN 'canceled' ELSE status END,
         canceled_at = CASE WHEN end_date IS NOT NULL AND v_new_next > end_date THEN now() ELSE canceled_at END,
         updated_at = now()
   WHERE id = s.id;

  UPDATE public.recurring_subscription_runs
     SET order_id = v_order_id
   WHERE subscription_id = s.id AND run_date = v_run_date;

  IF v_member_id IS NOT NULL THEN
    INSERT INTO public.ai_nudges (
      organization_id, member_id, nudge_date, type, priority,
      title, body, entity_type, entity_id
    ) VALUES (
      s.organization_id, v_member_id, current_date,
      'subscription_due', 'high',
      'Subscrição executada: ' || COALESCE(v_customer_name, '(sem nome)'),
      'Encomenda ' || v_order_number || ' criada em rascunho ('
        || COALESCE(v_description,'') || '). Reveja e confirme.',
      'order', v_order_id
    )
    ON CONFLICT (organization_id, member_id, type, entity_id, nudge_date) DO NOTHING;
  END IF;

  RETURN v_order_id;
END;
$function$;

-- Função: processa todas as devidas
CREATE OR REPLACE FUNCTION public.run_due_subscriptions(_org_id uuid DEFAULT NULL)
RETURNS TABLE(processed integer, created integer, errors integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r RECORD;
  v_proc int := 0;
  v_created int := 0;
  v_err int := 0;
  v_order uuid;
BEGIN
  IF _org_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  FOR r IN
    SELECT id FROM public.recurring_subscriptions
     WHERE status = 'active'
       AND next_run_date <= current_date
       AND (_org_id IS NULL OR organization_id = _org_id)
  LOOP
    v_proc := v_proc + 1;
    BEGIN
      v_order := public.run_due_subscription(r.id);
      IF v_order IS NOT NULL THEN v_created := v_created + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  processed := v_proc; created := v_created; errors := v_err;
  RETURN NEXT;
END;
$function$;

-- Cron diário às 05:30
DO $$
BEGIN
  PERFORM cron.unschedule('daily-recurring-subscriptions');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-recurring-subscriptions',
  '30 5 * * *',
  $cron$ SELECT public.run_due_subscriptions(NULL); $cron$
);
