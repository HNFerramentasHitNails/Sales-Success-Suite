
CREATE TABLE IF NOT EXISTS public.agent_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('sales','trainer','strategist')),
  instructions text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, agent_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_instructions TO authenticated;
GRANT ALL ON public.agent_instructions TO service_role;

SELECT public.apply_tenant_rls('public.agent_instructions');

DROP TRIGGER IF EXISTS touch_agent_instructions ON public.agent_instructions;
CREATE TRIGGER touch_agent_instructions
  BEFORE UPDATE ON public.agent_instructions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
