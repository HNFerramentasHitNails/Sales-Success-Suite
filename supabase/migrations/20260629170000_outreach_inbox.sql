-- ============================================================
-- OUTREACH — Inbox (conversas WhatsApp: entrada + saída)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outreach_inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','sms')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text NOT NULL DEFAULT '',
  provider_message_id text,
  author_user_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_inbox_lead_idx ON public.outreach_inbox_messages(organization_id, lead_id, created_at);
CREATE INDEX IF NOT EXISTS outreach_inbox_org_idx ON public.outreach_inbox_messages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_inbox_unread_idx ON public.outreach_inbox_messages(organization_id, lead_id) WHERE direction = 'in' AND read = false;

GRANT SELECT, UPDATE ON public.outreach_inbox_messages TO authenticated;
GRANT ALL ON public.outreach_inbox_messages TO service_role;
ALTER TABLE public.outreach_inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oim_sel ON public.outreach_inbox_messages;
CREATE POLICY oim_sel ON public.outreach_inbox_messages FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS oim_upd ON public.outreach_inbox_messages;
CREATE POLICY oim_upd ON public.outreach_inbox_messages FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
-- inserções só via service_role (webhook de entrada / função de resposta)
