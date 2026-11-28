import { useEffect, useRef, useState } from "react";
import { Bot, Plus, Send, MessageSquare, Sparkles, ChevronLeft } from "lucide-react";
import { supabase } from "./lib/supabase";

type Conversation = {
  id: string;
  title: string;
  role: "customer" | "merchant";
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export default function SabiAI({ tenantId }: { tenantId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    async function loadConversations() {
      setLoadingHistory(true);
      setError("");
      const { data, error: invokeError } = await supabase.functions.invoke("sabi-ai-core", {
        body: { action: "history", tenant_id: tenantId }
      });
      if (cancelled) return;
      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "Unable to load your Sabi AI history.");
      } else {
        setConversations(data?.conversations || []);
      }
      setLoadingHistory(false);
    }
    loadConversations();
    return () => { cancelled = true; };
  }, [tenantId]);

  async function openConversation(id: string) {
    if (loading) return;
    setError("");
    setLoadingHistory(true);
    const { data, error: invokeError } = await supabase.functions.invoke("sabi-ai-core", {
      body: { action: "history", tenant_id: tenantId, conversation_id: id }
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Unable to open this conversation.");
    } else {
      setActiveId(id);
      setMessages(data?.messages || []);
    }
    setLoadingHistory(false);
  }

  function startNewChat() {
    setActiveId("");
    setMessages([]);
    setDraft("");
    setError("");
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    setError("");
    setMessages(current => [...current, { role: "user", content: text }]);
    setLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke("sabi-ai-core", {
      body: {
        action: "message",
        tenant_id: tenantId,
        conversation_id: activeId || null,
        message: text
      }
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Sabi AI could not respond. Please try again.");
    } else {
      setActiveId(data.conversation_id);
      setMessages(current => [...current, { role: "assistant", content: data.reply }]);
      const { data: historyData } = await supabase.functions.invoke("sabi-ai-core", {
        body: { action: "history", tenant_id: tenantId }
      });
      if (historyData?.conversations) setConversations(historyData.conversations);
    }
    setLoading(false);
  }

  return (
    <div className="sabi-ai-layout">
      <aside className="sabi-ai-history">
        <div className="sabi-ai-history-top">
          <div className="sabi-ai-brand"><span><Bot size={20} /></span><div><strong>Sabi AI</strong><small>Your business assistant</small></div></div>
          <button type="button" className="sabi-ai-new" onClick={startNewChat}><Plus size={17} /> New chat</button>
        </div>
        <div className="sabi-ai-history-label">RECENT CONVERSATIONS</div>
        <div className="sabi-ai-conversation-list">
          {loadingHistory && <p className="sabi-ai-muted">Loading history…</p>}
          {!loadingHistory && conversations.length === 0 && <p className="sabi-ai-muted">Your conversations will appear here.</p>}
          {conversations.map(item => (
            <button type="button" key={item.id} className={`sabi-ai-conversation ${activeId === item.id ? "selected" : ""}`} onClick={() => openConversation(item.id)}>
              <MessageSquare size={16} /><span>{item.title || "New conversation"}</span>
            </button>
          ))}
        </div>
        <div className="sabi-ai-history-foot">Private to your signed-in account</div>
      </aside>

      <section className="sabi-ai-chat">
        <header className="sabi-ai-chat-head">
          <div><p className="sabi-ai-kicker">SABI BY XTOP</p><h2>Ask Sabi AI</h2><p>Get practical guidance for running your business.</p></div>
          <span className="sabi-ai-online"><i /> Arena AI</span>
        </header>

        <div className="sabi-ai-messages">
          {messages.length === 0 && (
            <div className="sabi-ai-welcome">
              <div className="sabi-ai-welcome-icon"><Sparkles size={25} /></div>
              <h3>How can I help your business today?</h3>
              <p>Ask about setting up your Sabi store, product listings, WhatsApp commerce, customer experience or growing your sales.</p>
              <div className="sabi-ai-prompts">
                {["How do I improve my product listings?","How can I get more customers on Sabi Discover?","Give me a checklist for setting up my store."].map(prompt => (
                  <button type="button" key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((item, index) => (
            <div key={item.id || index} className={`sabi-ai-message-row ${item.role}`}>
              {item.role === "assistant" && <span className="sabi-ai-message-avatar"><Bot size={17} /></span>}
              <div className="sabi-ai-bubble">{item.content}</div>
            </div>
          ))}
          {loading && <div className="sabi-ai-typing"><span /> Sabi AI is thinking…</div>}
          <div ref={bottomRef} />
        </div>

        {error && <div className="sabi-ai-error" role="alert">{error}</div>}
        <form className="sabi-ai-composer" onSubmit={sendMessage}>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Message Sabi AI…" rows={2} maxLength={4000} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(event as unknown as React.FormEvent); } }} />
          <button type="submit" disabled={!draft.trim() || loading} aria-label="Send message"><Send size={18} /></button>
          <small>Sabi AI can make mistakes. Verify important business and payment information.</small>
        </form>
      </section>
    </div>
  );
}
