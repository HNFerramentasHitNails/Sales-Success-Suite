CREATE OR REPLACE FUNCTION public.generate_prospect_followups_for_org(_org uuid, _date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid; v_assigned uuid; v_count int := 0; p RECORD;
BEGIN
  SELECT created_by INTO v_owner FROM public.organizations WHERE id = _org;
  FOR p IN
    SELECT pr.*
      FROM public.prospects pr
     WHERE pr.organization_id = _org
       AND pr.pipeline_stage NOT IN ('ganho','perdido')
       AND pr.assigned_member_id IS NOT NULL
       AND (pr.last_interaction_at IS NULL OR pr.last_interaction_at < now() - interval '7 days')
       AND NOT EXISTS (
         SELECT 1 FROM public.activities a
          WHERE a.organization_id = _org AND a.prospect_id = pr.id AND a.status = 'scheduled'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.sales_calls sc
          WHERE sc.organization_id = _org AND sc.prospect_id = pr.id AND sc.status IN ('pending','rescheduled')
       )
  LOOP
    SELECT user_id INTO v_assigned FROM public.organization_members WHERE id = p.assigned_member_id;
    v_assigned := COALESCE(v_assigned, v_owner);

    INSERT INTO public.activities(organization_id, type, title, start_at, end_at, all_day, assigned_to, prospect_id, status, created_by, notes)
    VALUES (_org, 'followup',
            'Seguimento: ' || COALESCE(NULLIF(trim(p.name),''),'(sem nome)'),
            (_date::timestamp + time '09:00'),
            (_date::timestamp + time '09:30'),
            false, v_assigned, p.id, 'scheduled', v_owner,
            'Seguimento automático · etapa ' || p.pipeline_stage::text ||
              CASE WHEN p.last_interaction_at IS NULL THEN ' · sem interação registada'
                   ELSE ' · sem interação há ' || EXTRACT(DAY FROM (now() - p.last_interaction_at))::int || ' dias' END);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.cron_generate_prospect_followups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.generate_prospect_followups_for_org(o.id, current_date);
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='daily-prospect-followups') THEN
    PERFORM cron.unschedule('daily-prospect-followups');
  END IF;
END $$;
SELECT cron.schedule('daily-prospect-followups', '5 6 * * *', $$select public.cron_generate_prospect_followups();$$);