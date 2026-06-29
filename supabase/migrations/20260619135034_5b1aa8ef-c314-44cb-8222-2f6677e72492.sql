
-- hr_employees
CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  position text,
  department text,
  hire_date date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','suspenso')),
  manager_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  birth_date date,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employees TO authenticated;
GRANT ALL ON public.hr_employees TO service_role;
SELECT public.apply_tenant_rls('public.hr_employees');
CREATE TRIGGER trg_hr_employees_touch BEFORE UPDATE ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_hr_employees_org ON public.hr_employees(organization_id);

-- hr_leave_requests
CREATE TABLE public.hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('ferias','doenca','pessoal','parental','outro')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_requests TO authenticated;
GRANT ALL ON public.hr_leave_requests TO service_role;
SELECT public.apply_tenant_rls('public.hr_leave_requests');
CREATE TRIGGER trg_hr_leaves_touch BEFORE UPDATE ON public.hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_hr_leaves_org ON public.hr_leave_requests(organization_id);
CREATE INDEX idx_hr_leaves_emp ON public.hr_leave_requests(employee_id);

-- hr_attendance
CREATE TABLE public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT current_date,
  check_in timestamptz,
  check_out timestamptz,
  hours numeric,
  status text NOT NULL DEFAULT 'presente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_attendance TO authenticated;
GRANT ALL ON public.hr_attendance TO service_role;
SELECT public.apply_tenant_rls('public.hr_attendance');
CREATE INDEX idx_hr_attendance_org ON public.hr_attendance(organization_id);
CREATE INDEX idx_hr_attendance_emp_date ON public.hr_attendance(employee_id, work_date);
