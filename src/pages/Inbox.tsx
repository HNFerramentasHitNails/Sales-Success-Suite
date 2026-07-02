import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Inbox as InboxIcon, Send, Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Msg = {
  id: string; lead_id: string; direction: "in" | "out"; body: string; created_at: string; read: boolean;
  lead?: { id: string; name: string | null; phone: string | null } | null;
};
type Thread = { lead_id: string; name: string; phone: string | null; lastBody: string; lastAt: string; unread: number };

function timeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Inbox() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    const { data } = await supabase
      .from("outreach_inbox_messages")
      .select("id, lead_id, direction, body, created_at, read, lead:outreach_leads(id, name, phone)")
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false })
      .limit(800);
    setMsgs((data ?? []) as unknown as Msg[]);
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);
  // polling a cada 5s
  useEffect(() => {
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    // msgs vêm desc; o primeiro por lead é o mais recente
    for (const m of msgs) {
      let th = map.get(m.lead_id);
      if (!th) {
        th = { lead_id: m.lead_id, name: m.lead?.name || m.lead?.phone || "—", phone: m.lead?.phone ?? null, lastBody: m.body, lastAt: m.created_at, unread: 0 };
        map.set(m.lead_id, th);
      }
      if (m.direction === "in" && !m.read) th.unread++;
    }
    return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [msgs]);

  const threadMsgs = useMemo(
    () => msgs.filter((m) => m.lead_id === selected).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [msgs, selected],
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [threadMsgs.length, selected]);

  const openThread = async (leadId: string) => {
    setSelected(leadId);
    // marcar lidas
    await supabase.from("outreach_inbox_messages").update({ read: true })
      .eq("organization_id", activeOrg!.id).eq("lead_id", leadId).eq("direction", "in").eq("read", false);
    load();
  };

  const send = async () => {
    if (!activeOrg || !selected || !reply.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("outreach-reply", {
      body: { organization_id: activeOrg.id, lead_id: selected, text: reply.trim() },
    });
    setSending(false);
    if (error) { toast({ title: "Falha ao enviar", description: error.message, variant: "destructive" }); return; }
    const res = data as { ok?: boolean; error?: string; message?: any };
    if (res?.error) { toast({ title: "Erro", description: res.error, variant: "destructive" }); return; }
    setReply("");
    load();
  };

  const selThread = threads.find((t) => t.lead_id === selected);

  return (
    <div className="space-y-4">
      <PageHeader title="Inbox" description="Conversas de WhatsApp com os teus leads." icon={<InboxIcon className="h-6 w-6" />} />

      <Card className="grid grid-cols-1 md:grid-cols-[320px_1fr] overflow-hidden" style={{ height: "calc(100vh - 230px)" }} data-tour="inbox-board">
        {/* Lista de conversas */}
        <div className="border-r overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Sem conversas ainda.</div>
          ) : threads.map((t) => (
            <button key={t.lead_id} onClick={() => openThread(t.lead_id)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 ${selected === t.lead_id ? "bg-muted" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{t.name}</span>
                {t.unread > 0 && <Badge variant="default" className="shrink-0">{t.unread}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{t.lastBody || "—"}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{timeShort(t.lastAt)}</div>
            </button>
          ))}
        </div>

        {/* Conversa */}
        <div className="flex flex-col min-h-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center"><MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />Escolhe uma conversa</div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b">
                <div className="font-medium">{selThread?.name}</div>
                <div className="text-xs text-muted-foreground">{selThread?.phone}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {threadMsgs.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                      {m.body}
                      <div className={`text-[10px] mt-1 ${m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{timeShort(m.created_at)}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t flex gap-2">
                <Input
                  value={reply} onChange={(e) => setReply(e.target.value)} disabled={!canWrite || sending}
                  placeholder={canWrite ? "Escreve uma resposta…" : "Sem permissão para responder"}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                />
                <Button onClick={send} disabled={!canWrite || sending || !reply.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
