
-- projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ativo',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
SELECT public.apply_tenant_rls('public.projects');
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_projects_org ON public.projects(organization_id);

-- project_stages
CREATE TABLE public.project_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_stages TO authenticated;
GRANT ALL ON public.project_stages TO service_role;
SELECT public.apply_tenant_rls('public.project_stages');
CREATE INDEX idx_project_stages_project ON public.project_stages(project_id, position);

-- project_tasks
CREATE TABLE public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.project_stages(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta')),
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
SELECT public.apply_tenant_rls('public.project_tasks');
CREATE TRIGGER trg_project_tasks_touch BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id, stage_id, position);

-- seed default stages on project insert
CREATE OR REPLACE FUNCTION public.seed_default_project_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_stages (organization_id, project_id, name, position, color) VALUES
    (NEW.organization_id, NEW.id, 'A Fazer',    0, '220 60% 55%'),
    (NEW.organization_id, NEW.id, 'Em Curso',   1, '38 92% 50%'),
    (NEW.organization_id, NEW.id, 'Concluído',  2, '142 71% 45%');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_projects_seed_stages AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.seed_default_project_stages();
