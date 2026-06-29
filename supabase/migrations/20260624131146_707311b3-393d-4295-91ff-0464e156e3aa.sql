CREATE TABLE IF NOT EXISTS public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_sessions_active
  ON public.work_sessions(organization_id, member_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_sessions_org_member
  ON public.work_sessions(organization_id, member_id, started_at DESC);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.work_sessions TO authenticated;
GRANT ALL ON public.work_sessions TO service_role;

DROP POLICY IF EXISTS work_sessions_select ON public.work_sessions;
CREATE POLICY work_sessions_select ON public.work_sessions FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
DROP POLICY IF EXISTS work_sessions_insert ON public.work_sessions;
CREATE POLICY work_sessions_insert ON public.work_sessions FOR INSERT TO authenticated
  WITH CHECK (member_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS work_sessions_update ON public.work_sessions;
CREATE POLICY work_sessions_update ON public.work_sessions FOR UPDATE TO authenticated
  USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE OR REPLACE FUNCTION public.work_session_check_in(p_org uuid)
RETURNS public.work_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.work_sessions;
BEGIN
  IF NOT public.is_org_member(p_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO v FROM public.work_sessions WHERE organization_id=p_org AND member_id=auth.uid() AND ended_at IS NULL LIMIT 1;
  IF FOUND THEN RETURN v; END IF;
  INSERT INTO public.work_sessions(organization_id, member_id, started_at) VALUES(p_org, auth.uid(), now()) RETURNING * INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.work_session_check_out(p_org uuid)
RETURNS public.work_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.work_sessions;
BEGIN
  IF NOT public.is_org_member(p_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE public.work_sessions
     SET ended_at=now(), duration_minutes = GREATEST(0, round(extract(epoch FROM (now()-started_at))/60.0))::int
   WHERE organization_id=p_org AND member_id=auth.uid() AND ended_at IS NULL
   RETURNING * INTO v;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.work_session_check_in(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_session_check_out(uuid) TO authenticated;