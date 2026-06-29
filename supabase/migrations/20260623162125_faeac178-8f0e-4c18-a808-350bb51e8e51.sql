
-- 1a. Tabela ai_nudges
CREATE TABLE public.ai_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  nudge_date date NOT NULL DEFAULT current_date,
  type text NOT NULL CHECK (type IN ('purchase_overdue','no_contact','hot_lead')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  title text NOT NULL,
  body text,
  entity_type text CHECK (entity_type IN ('customer','prospect')),
  entity_id uuid,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','done','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX ai_nudges_idem_idx
  ON public.ai_nudges (organization_id, member_id, type, entity_id, nudge_date);
CREATE INDEX ai_nudges_member_status_date_idx
  ON public.ai_nudges (member_id, status, nudge_date DESC);

GRANT SELECT, UPDATE ON public.ai_nudges TO authenticated;
GRANT ALL ON public.ai_nudges TO service_role;

ALTER TABLE public.ai_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner member can view own nudges"
  ON public.ai_nudges FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.id = ai_nudges.member_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner member can update own nudges"
  ON public.ai_nudges FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.id = ai_nudges.member_id AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.id = ai_nudges.member_id AND om.user_id = auth.uid()
    )
  );

-- 1b. Geração por org
CREATE OR REPLACE FUNCTION public._generate_nudges_for_org(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- purchase_overdue
  INSERT INTO public.ai_nudges (organization_id, member_id, nudge_date, type, priority, title, body, entity_type, entity_id)
  SELECT _org_id, x.assigned_member_id, current_date, 'purchase_overdue',
         CASE WHEN (current_date - x.next_purchase_expected_at) > 14 THEN 'high' ELSE 'normal' END,
         'Compra em atraso: ' || COALESCE(x.name,'(sem nome)'),
         'Esperada em ' || to_char(x.next_purchase_expected_at,'DD/MM/YYYY')
           || ' (' || (current_date - x.next_purchase_expected_at) || ' dias). Total gasto: '
           || to_char(COALESCE(x.total_spent,0), 'FM999G999G990D00'),
         'customer', x.id
    FROM (
      SELECT c.*,
             ROW_NUMBER() OVER (PARTITION BY c.assigned_member_id
                                ORDER BY (current_date - c.next_purchase_expected_at) DESC, c.id) AS rn
        FROM public.customers c
        JOIN public.organization_members om ON om.id = c.assigned_member_id AND om.status = 'active'
       WHERE c.organization_id = _org_id
         AND c.assigned_member_id IS NOT NULL
         AND c.next_purchase_expected_at IS NOT NULL
         AND c.next_purchase_expected_at < current_date
    ) x
   WHERE x.rn <= 5
  ON CONFLICT (organization_id, member_id, type, entity_id, nudge_date) DO NOTHING;

  -- no_contact
  INSERT INTO public.ai_nudges (organization_id, member_id, nudge_date, type, priority, title, body, entity_type, entity_id)
  SELECT _org_id, x.assigned_member_id, current_date, 'no_contact', 'normal',
         'Sem contacto: ' || COALESCE(x.name,'(sem nome)'),
         CASE WHEN x.last_contact_at IS NULL THEN 'Nunca contactado.'
              ELSE 'Sem contacto há ' || EXTRACT(DAY FROM (now() - x.last_contact_at))::int || ' dias.' END,
         'customer', x.id
    FROM (
      SELECT c.*,
             ROW_NUMBER() OVER (PARTITION BY c.assigned_member_id
                                ORDER BY (c.last_contact_at IS NULL) DESC,
                                         c.last_contact_at ASC NULLS FIRST, c.id) AS rn
        FROM public.customers c
        JOIN public.organization_members om ON om.id = c.assigned_member_id AND om.status = 'active'
       WHERE c.organization_id = _org_id
         AND c.assigned_member_id IS NOT NULL
         AND c.orders_count > 0
         AND (c.last_contact_at IS NULL OR c.last_contact_at < now() - interval '30 days')
    ) x
   WHERE x.rn <= 5
  ON CONFLICT (organization_id, member_id, type, entity_id, nudge_date) DO NOTHING;

  -- hot_lead
  INSERT INTO public.ai_nudges (organization_id, member_id, nudge_date, type, priority, title, body, entity_type, entity_id)
  SELECT _org_id, x.assigned_member_id, current_date, 'hot_lead', 'high',
         'Lead quente: ' || COALESCE(x.name,'(sem nome)') || ' (score ' || x.lead_score || ')',
         'Etapa: ' || x.pipeline_stage::text || '. '
           || CASE WHEN x.last_interaction_at IS NULL THEN 'Sem interação registada.'
                   ELSE 'Sem interação há ' || EXTRACT(DAY FROM (now() - x.last_interaction_at))::int || ' dias.' END,
         'prospect', x.id
    FROM (
      SELECT p.*,
             ROW_NUMBER() OVER (PARTITION BY p.assigned_member_id
                                ORDER BY p.lead_score DESC, p.id) AS rn
        FROM public.prospects p
        JOIN public.organization_members om ON om.id = p.assigned_member_id AND om.status = 'active'
       WHERE p.organization_id = _org_id
         AND p.assigned_member_id IS NOT NULL
         AND p.lead_score >= 70
         AND p.pipeline_stage NOT IN ('ganho','perdido')
         AND (p.last_interaction_at IS NULL OR p.last_interaction_at < now() - interval '7 days')
    ) x
   WHERE x.rn <= 5
  ON CONFLICT (organization_id, member_id, type, entity_id, nudge_date) DO NOTHING;
END;
$function$;

-- 1c. Cron + RPC manual
CREATE OR REPLACE FUNCTION public.cron_generate_daily_nudges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE r record;
BEGIN
  DELETE FROM public.ai_nudges WHERE nudge_date < current_date - 14;
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public._generate_nudges_for_org(r.id);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_org_nudges(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  PERFORM public._generate_nudges_for_org(_org_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_org_nudges(uuid) TO authenticated;

-- Cron: agendar 07:00
DO $$
BEGIN
  PERFORM cron.unschedule('daily-nudges');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('daily-nudges', '0 7 * * *', $$ SELECT public.cron_generate_daily_nudges(); $$);
