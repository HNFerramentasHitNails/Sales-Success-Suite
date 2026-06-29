-- 1) call_tasks
CREATE TABLE public.call_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida','excluida')),
  assigned_to uuid NULL,
  objetivo text NULL,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id, scheduled_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_tasks TO authenticated;
GRANT ALL ON public.call_tasks TO service_role;

SELECT public.apply_tenant_rls('public.call_tasks');

CREATE INDEX idx_call_tasks_org_date_status
  ON public.call_tasks (organization_id, scheduled_date, status);

CREATE TRIGGER call_tasks_touch_updated_at
  BEFORE UPDATE ON public.call_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Extra columns on calls (nullable)
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS call_task_id uuid NULL REFERENCES public.call_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answered boolean NULL,
  ADD COLUMN IF NOT EXISTS purchased boolean NULL,
  ADD COLUMN IF NOT EXISTS cross_sold boolean NULL,
  ADD COLUMN IF NOT EXISTS reason text NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_for date NULL;

-- 3) generate_call_tasks RPC
CREATE OR REPLACE FUNCTION public.generate_call_tasks(p_org uuid, p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (public.is_org_member(p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.call_tasks (organization_id, customer_id, scheduled_date, status, source)
  SELECT p_org, c.id, p_date, 'pendente', 'auto'
    FROM public.customers c
   WHERE c.organization_id = p_org
     AND c.exclude_from_calls = false
     AND c.phone IS NOT NULL
     AND c.phone <> ''
     AND (
       -- recurrence overdue
       (c.last_purchase_date IS NOT NULL
         AND (p_date - c.last_purchase_date) >= COALESCE(c.recurrence_interval_days, 60))
       OR c.rfm_segment IN ('Em Risco','Hibernação','Precisam Atenção')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.call_tasks t
        WHERE t.organization_id = p_org
          AND t.customer_id = c.id
          AND t.scheduled_date = p_date
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_call_tasks(uuid, date) TO authenticated;
