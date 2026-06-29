import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Brain,
  GraduationCap,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type AgentType = "sales" | "trainer" | "strategist";
type ChatMessage = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string | null;
  agent_type: AgentType;
  updated_at: string;
};

type AgentDef = {
  id: AgentType;
  label: string;
  icon: typeof Target;
  intro: string;
  suggestions: string[];
};

const AGENTS: AgentDef[] = [
  {
    id: "sales",
    label: "Vendas",
    icon: Target,
    intro:
      "Sou o teu assistente de vendas. Ajudo com abordagens comerciais, respostas a objeções, follow-ups e organização do pipeline.",
    suggestions: [
      "Como abordo um cliente que não responde há 2 semanas?",
      "Dá-me 3 formas de responder à objeção \"está caro\".",
      "Sugere um follow-up após uma reunião comercial.",
    ],
  },
  {
    id: "trainer",
    label: "Treino",
    icon: GraduationCap,
    intro:
      "Sou o teu coach de vendas. Faço role-plays, simulo chamadas e dou-te feedback prático com próximos passos de treino.",
    suggestions: [
      "Vamos simular uma chamada fria a um novo cliente.",
      "Faz role-play: cliente irritado com atraso na entrega.",
      "Dá-me um exercício para melhorar a escuta ativa.",
    ],
  },
  {
    id: "strategist",
    label: "Estratégia",
    icon: Brain,
    intro:
      "Sou o teu analista de estratégia. Ajudo a priorizar contas, identificar oportunidades e planear ações com base em dados.",
    suggestions: [
      "Que critérios devo usar para priorizar contas este mês?",
      "Como faço uma análise ABC à minha carteira de clientes?",
      "Plano de ação para recuperar clientes inativos.",
    ],
  },
];

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString("pt-PT");
}

export default function AiAgents() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state ?? {}) as { prompt?: string; agent?: AgentType };
  const validAgent = navState.agent && ["sales", "trainer", "strategist"].includes(navState.agent) ? navState.agent : undefined;
  const [tab, setTab] = useState<AgentType>(validAgent ?? "sales");
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(typeof navState.prompt === "string" ? navState.prompt : undefined);
  const canManageAi = isAdmin || role === "sales_director";

  // limpar o estado de navegação para não reaplicar o prompt em refresh/re-render
  useEffect(() => {
    if (navState.prompt || navState.agent) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!activeOrg) return <Navigate to="/app/dashboard" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agentes IA"
        description="Conversa com os teus assistentes de IA para vendas, treino e estratégia."
        icon={<Sparkles className="h-6 w-6" />}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AgentType)}>
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          {AGENTS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="flex items-center gap-2">
              <a.icon className="h-4 w-4" />
              <span>{a.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {AGENTS.map((a) => (
          <TabsContent key={a.id} value={a.id} className="mt-4">
            <AgentWorkspace
              agent={a}
              orgId={activeOrg.id}
              canManageAi={canManageAi}
              active={tab === a.id}
              initialPrompt={a.id === tab ? pendingPrompt : undefined}
              onPromptConsumed={() => setPendingPrompt(undefined)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

type AgentWorkspaceProps = {
  agent: AgentDef;
  orgId: string;
  canManageAi: boolean;
  active: boolean;
  initialPrompt?: string;
  onPromptConsumed?: () => void;
};

function AgentWorkspace({ agent, orgId, canManageAi, active, initialPrompt, onPromptConsumed }: AgentWorkspaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const didInitRef = useRef(false);

  // Carregar lista
  const loadConversations = useCallback(
    async (opts?: { autoOpen?: boolean }) => {
      setLoadingList(true);
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, agent_type, updated_at")
        .eq("organization_id", orgId)
        .eq("agent_type", agent.id)
        .order("updated_at", { ascending: false });
      setLoadingList(false);
      if (error) {
        toast.error("Erro ao carregar conversas");
        return;
      }
      const list = (data ?? []) as Conversation[];
      setConversations(list);
      if (opts?.autoOpen && list.length > 0 && activeConvId === null) {
        await openConversation(list[0].id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, agent.id]
  );

  const openConversation = useCallback(async (convId: string) => {
    setActiveConvId(convId);
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from("ai_conversation_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setLoadingMessages(false);
    if (error) {
      toast.error("Erro ao carregar mensagens");
      setMessages([]);
      return;
    }
    setMessages((data ?? []) as ChatMessage[]);
  }, []);

  // Init when tab becomes active (first time)
  useEffect(() => {
    if (!active || didInitRef.current) return;
    didInitRef.current = true;
    loadConversations({ autoOpen: !initialPrompt });
  }, [active, loadConversations]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (active) textareaRef.current?.focus();
  }, [active, activeConvId]);


  const startNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    setSending(true);
    let convId = activeConvId;
    const userMsg: ChatMessage = { role: "user", content: text };
    const nextHistory = [...messages, userMsg];

    try {
      // 1) criar conversa se necessário
      if (!convId) {
        const title = text.slice(0, 50);
        const { data: created, error: convErr } = await supabase
          .from("ai_conversations")
          .insert({
            organization_id: orgId,
            agent_type: agent.id,
            title,
          })
          .select("id, title, agent_type, updated_at")
          .single();
        if (convErr || !created) {
          toast.error("Erro ao criar conversa");
          setSending(false);
          return;
        }
        convId = created.id;
        setActiveConvId(convId);
        setConversations((prev) => [created as Conversation, ...prev]);
      }

      // 2) persistir mensagem do utilizador
      const { error: insErr } = await supabase
        .from("ai_conversation_messages")
        .insert({
          conversation_id: convId,
          organization_id: orgId,
          role: "user",
          content: text,
        });
      if (insErr) {
        toast.error("Erro ao guardar mensagem");
        setSending(false);
        return;
      }

      setMessages(nextHistory);
      setInput("");

      // 3) invocar agente
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: {
          organization_id: orgId,
          agent_type: agent.id,
          messages: nextHistory,
        },
      });

      if (error) {
        toast.error("Falha ao contactar o serviço de IA");
        return;
      }

      const res = data as { reply?: string; error?: string; message?: string };
      if (res?.error === "ai_not_configured") {
        toast.warning("A IA ainda não está configurada para esta organização.");
        return;
      }
      if (res?.error === "rate_limited") {
        toast.error("Limite de pedidos atingido, tenta daqui a pouco.");
        return;
      }
      if (res?.error === "credits_exhausted") {
        toast.error("Créditos de IA esgotados.");
        return;
      }
      if (res?.error) {
        toast.error(res.message ?? "Erro no fornecedor de IA");
        return;
      }

      const reply = (res?.reply ?? "").trim();
      if (!reply) {
        toast.error("O agente não devolveu resposta.");
        return;
      }

      // 4) persistir resposta + reordenar lista
      const { error: replyErr } = await supabase
        .from("ai_conversation_messages")
        .insert({
          conversation_id: convId,
          organization_id: orgId,
          role: "assistant",
          content: reply,
        });
      if (replyErr) {
        toast.error("Erro ao guardar resposta");
        return;
      }
      // touch updated_at to trigger sort
      const nowIso = new Date().toISOString();
      await supabase
        .from("ai_conversations")
        .update({ updated_at: nowIso })
        .eq("id", convId);

      setMessages([...nextHistory, { role: "assistant", content: reply }]);
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === convId ? { ...c, updated_at: nowIso } : c
        );
        return [...updated].sort((a, b) =>
          b.updated_at.localeCompare(a.updated_at)
        );
      });
    } catch (e) {
      toast.error("Erro inesperado a contactar o agente.");
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // prompt vindo do Painel ("Perguntar ao Agente"): envia automaticamente numa nova conversa
  const promptAppliedRef = useRef(false);
  useEffect(() => {
    if (!active || !initialPrompt || promptAppliedRef.current) return;
    promptAppliedRef.current = true;
    onPromptConsumed?.();
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    void sendMessage(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, initialPrompt]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Erro ao eliminar conversa");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
    toast.success("Conversa eliminada");
  };

  const hasMessages = messages.length > 0;
  const Icon = agent.icon;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Lista de conversas */}
        <Card className="h-fit md:sticky md:top-4">
          <CardContent className="p-3 space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={startNewConversation}
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Nova conversa
            </Button>
            <div className="text-xs uppercase tracking-wide text-muted-foreground px-1 pt-2">
              Histórico
            </div>
            <ScrollArea className="h-[420px] pr-1">
              {loadingList ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> A carregar…
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2">
                  Ainda não tens conversas com este agente.
                </div>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((c) => {
                    const isActive = c.id === activeConvId;
                    return (
                      <li key={c.id}>
                        <div
                          className={cn(
                            "group flex items-start gap-1 rounded-md px-2 py-1.5 text-sm",
                            isActive
                              ? "bg-muted"
                              : "hover:bg-muted/50 cursor-pointer"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => openConversation(c.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="truncate font-medium">
                              {c.title || "Conversa sem título"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelative(c.updated_at)}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(c.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-background"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium truncate">
                  {activeConvId
                    ? conversations.find((c) => c.id === activeConvId)?.title ||
                      "Conversa sem título"
                    : `Agente de ${agent.label}`}
                </span>
              </div>
              {activeConvId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(activeConvId)}
                  disabled={sending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar
                </Button>
              )}
            </div>

            <ScrollArea className="h-[480px]">
              <div
                ref={scrollRef}
                className="h-[480px] overflow-y-auto px-4 py-4 space-y-4"
              >
                {loadingMessages ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> A carregar conversa…
                  </div>
                ) : !hasMessages ? (
                  <EmptyAgentState agent={agent} onSuggestion={(s) => sendMessage(s)} />
                ) : (
                  messages.map((m, i) => <MessageBubble key={i} message={m} />)
                )}
                {sending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A escrever…
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-3 space-y-2">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Escreve uma mensagem para o agente de ${agent.label}…`}
                  rows={2}
                  disabled={sending}
                  className="resize-none"
                />
                <Button onClick={() => sendMessage()} disabled={sending || !input.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Enviar</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter para enviar · Shift+Enter para nova linha
                {!canManageAi && (
                  <> · Se a IA não estiver configurada, contacta um administrador.</>
                )}
                {canManageAi && (
                  <>
                    {" "}·{" "}
                    <Link to="/app/ai-settings" className="underline">
                      Configurar IA
                    </Link>
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e remove todas as mensagens desta conversa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyAgentState({
  agent,
  onSuggestion,
}: {
  agent: AgentDef;
  onSuggestion: (s: string) => void;
}) {
  const Icon = agent.icon;
  return (
    <div className="flex flex-col items-center text-center py-8 space-y-4">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="font-semibold">Agente de {agent.label}</h3>
        <p className="text-sm text-muted-foreground">{agent.intro}</p>
      </div>
      <div className="w-full max-w-lg space-y-2">
        <p className="text-xs uppercase text-muted-foreground tracking-wide">Sugestões</p>
        <div className="grid gap-2">
          {agent.suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="text-left text-sm rounded-md border bg-card hover:bg-muted/50 transition-colors px-3 py-2"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[80%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}