
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_formadora boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note_type text NOT NULL DEFAULT 'Nota',
  content text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_notes_customer_created_idx
  ON public.customer_notes (customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_notes_select_same_org ON public.customer_notes
  FOR SELECT USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY customer_notes_insert_member ON public.customer_notes
  FOR INSERT WITH CHECK (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY customer_notes_update_member ON public.customer_notes
  FOR UPDATE USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY customer_notes_delete_member ON public.customer_notes
  FOR DELETE USING (organization_id = public.get_user_org(auth.uid()));
