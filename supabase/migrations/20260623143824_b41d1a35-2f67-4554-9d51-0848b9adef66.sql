CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  agent_type text NOT NULL CHECK (agent_type IN ('sales','trainer','strategist')),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_agent_idx
  ON public.ai_conversations (organization_id, user_id, agent_type, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conversations select"
  ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own conversations insert"
  ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own conversations update"
  ON public.ai_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own conversations delete"
  ON public.ai_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

CREATE TRIGGER ai_conversations_touch_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversation_messages_conv_idx
  ON public.ai_conversation_messages (conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_messages TO authenticated;
GRANT ALL ON public.ai_conversation_messages TO service_role;

ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages select"
  ON public.ai_conversation_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own messages insert"
  ON public.ai_conversation_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own messages update"
  ON public.ai_conversation_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "own messages delete"
  ON public.ai_conversation_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));