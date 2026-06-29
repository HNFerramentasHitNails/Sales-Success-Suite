-- Conversations
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('sales_agent','trainer','strategist')),
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  prospect_id UUID,
  customer_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conv_org_user ON public.ai_conversations(organization_id, user_id, agent, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conv_select_own_or_admin ON public.ai_conversations
FOR SELECT TO authenticated
USING (
  organization_id = public.get_user_org(auth.uid())
  AND (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
);

CREATE POLICY conv_insert_self ON public.ai_conversations
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_org(auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY conv_update_own ON public.ai_conversations
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND organization_id = public.get_user_org(auth.uid()));

CREATE POLICY conv_delete_own_or_admin ON public.ai_conversations
FOR DELETE TO authenticated
USING (
  organization_id = public.get_user_org(auth.uid())
  AND (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
);

CREATE TRIGGER ai_conv_touch BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Messages
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_msg_conv ON public.ai_messages(conversation_id, created_at);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY msg_select_via_conv ON public.ai_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
      AND c.organization_id = public.get_user_org(auth.uid())
      AND (c.user_id = auth.uid() OR public.is_org_admin(auth.uid(), c.organization_id))
  )
);

CREATE POLICY msg_insert_via_conv ON public.ai_messages
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_org(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
      AND c.user_id = auth.uid()
      AND c.organization_id = public.get_user_org(auth.uid())
  )
);

CREATE POLICY msg_delete_via_conv ON public.ai_messages
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = ai_messages.conversation_id
      AND c.organization_id = public.get_user_org(auth.uid())
      AND (c.user_id = auth.uid() OR public.is_org_admin(auth.uid(), c.organization_id))
  )
);