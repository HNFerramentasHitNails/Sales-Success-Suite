-- 1a: Update CHECK constraints on ai_nudges
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.ai_nudges'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%type%'
       AND pg_get_constraintdef(oid) ILIKE '%purchase_overdue%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_nudges DROP CONSTRAINT %I', v_name);
  END LOOP;

  FOR v_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.ai_nudges'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_nudges DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE public.ai_nudges
  ADD CONSTRAINT ai_nudges_type_check
  CHECK (type IN ('purchase_overdue','no_contact','hot_lead','agenda_reminder'));

ALTER TABLE public.ai_nudges
  ADD CONSTRAINT ai_nudges_entity_type_check
  CHECK (entity_type IN ('customer','prospect','activity'));

-- 1b: Recreate _generate_nudges_for_org with the 4th block added
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

  -- agenda_reminder (atividades agendadas para hoje)
  INSERT INTO public.ai_nudges (organization_id, member_id, nudge_date, type, priority, title, body, entity_type, entity_id)
  SELECT _org_id, x.member_id, current_date, 'agenda_reminder', 'high', x.title, x.body, 'activity', x.id
    FROM (
      SELECT a.id, om.id AS member_id,
             'Hoje: ' || COALESCE(a.title,'(sem título)') ||
               CASE WHEN a.all_day THEN ' (dia inteiro)'
                    ELSE ' às ' || to_char(a.start_at AT TIME ZONE 'Europe/Lisbon','HH24:MI') END AS title,
             (CASE a.type WHEN 'meeting' THEN 'Reunião' WHEN 'call' THEN 'Chamada'
                          WHEN 'task' THEN 'Tarefa' WHEN 'followup' THEN 'Follow-up' ELSE 'Atividade' END)
               || COALESCE(' · ' || NULLIF(a.location,''), '')
               || COALESCE(' · ' || c.name, '')
               || COALESCE(' · ' || p.name, '') AS body,
             ROW_NUMBER() OVER (PARTITION BY om.id ORDER BY a.start_at ASC) AS rn
        FROM public.activities a
        JOIN public.organization_members om
          ON om.organization_id = a.organization_id AND om.user_id = a.assigned_to AND om.status = 'active'
        LEFT JOIN public.customers c ON c.id = a.customer_id
        LEFT JOIN public.prospects p ON p.id = a.prospect_id
       WHERE a.organization_id = _org_id
         AND a.status = 'scheduled'
         AND a.assigned_to IS NOT NULL
         AND a.start_at >= current_date::timestamp
         AND a.start_at <  (current_date + 1)::timestamp
    ) x
   WHERE x.rn <= 5
  ON CONFLICT (organization_id, member_id, type, entity_id, nudge_date) DO NOTHING;
END;
$function$;