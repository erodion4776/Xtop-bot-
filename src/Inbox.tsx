import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { MessageSquare, Send, RefreshCw, UserRound, Bot } from "lucide-react";

type Message = {
  id: string;
  direction: string;
  body?: string | null;
  message_text?: string | null;
  created_at: string;
};

type Contact = {
  id: string;
  phone: string;
  name?: string | null;
  agent_mode?: boolean;
  last_message?: Message | null;
};

export default function Inbox() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function loadInbox(keepSelection = true) {
    setLoading(true);
    setError("");
    const { data, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=inbox-list",
      { method: "GET" }
    );
    if (apiError || data?.error) {
      setError(data?.error || apiError?.message || "Could not load messages.");
      setLoading(false);
      return;
    }
    const rows = Array.isArray(data?.data) ? data.data as Contact[] : [];
    setContacts(rows);
    if (keepSelection && selected) {
      const next = rows.find((item) => item.id === selected.id);
      if (next) setSelected(next);
    }
    setLoading(false);
  }

  async function loadChat(contact: Contact) {
    setSelected(contact);
    setChatLoading(true);
    setError("");
    const { data, error: apiError } = await supabase.functions.invoke(
      `xtop-dashboard?action=chat&contact_id=${encodeURIComponent(contact.id)}`,
      { method: "GET" }
    );
    if (apiError || data?.error) {
      setError(data?.error || apiError?.message || "Could not load this conversation.");
      setMessages([]);
    } else {
      setMessages(Array.isArray(data?.data) ? data.data as Message[] : []);
    }
    setChatLoading(false);
  }

  useEffect(() => {
    void loadInbox(false);
    // Load once when the Inbox page is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendReply() {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    const message = draft.trim();
    const { data, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=send-message",
      { body: { contact_id: selected.id, message } }
    );
    if (apiError || data?.error || !data?.success) {
      setError(data?.error || apiError?.message || "Message could not be sent.");
    } else {
      setDraft("");
      await loadChat(selected);
      await loadInbox();
    }
    setSending(false);
  }

  async function toggleTakeover() {
    if (!selected) return;
    const enabled = !selected.agent_mode;
    const { data, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=toggle-customer-takeover",
      { body: { contact_id: selected.id, enabled } }
    );
    if (apiError || data?.error || !data?.success) {
      setError(data?.error || apiError?.message || "Could not update bot control.");
      return;
    }
    const updated = { ...selected, agent_mode: enabled };
    setSelected(updated);
    setContacts((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  return (
    <div className="inbox-layout">
      <section className="panel inbox-list-panel">
        <div className="inbox-heading">
          <div><h2>Customer conversations</h2><p>Messages from your connected WhatsApp store.</p></div>
          <button className="icon-action" onClick={() => void loadInbox()} title="Refresh"><RefreshCw size={17}/></button>
        </div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        {loading ? <p className="empty-state">Loading conversations…</p> :
          contacts.length === 0 ? <div className="empty-state"><MessageSquare size={28}/><strong>No conversations yet</strong><span>Customer chats will appear here when they message your business number.</span></div> :
          <div className="conversation-list">
            {contacts.map((contact) => (
              <button key={contact.id} className={`conversation-item ${selected?.id === contact.id ? "selected" : ""}`} onClick={() => void loadChat(contact)}>
                <span className="contact-avatar"><UserRound size={18}/></span>
                <span className="conversation-copy">
                  <strong>{contact.name || contact.phone || "WhatsApp customer"}</strong>
                  <small>{contact.last_message?.body || contact.last_message?.message_text || contact.phone || "No message preview"}</small>
                </span>
                {contact.agent_mode && <span className="takeover-dot" title="Human takeover active"/>}
              </button>
            ))}
          </div>
        }
      </section>
      <section className="panel chat-panel">
        {!selected ? <div className="empty-state chat-empty"><MessageSquare size={32}/><strong>Open a conversation</strong><span>Select a customer to read and reply to their messages.</span></div> :
          <>
            <div className="chat-header">
              <div><strong>{selected.name || selected.phone}</strong><small>{selected.phone}</small></div>
              <button className={`takeover-button ${selected.agent_mode ? "enabled" : ""}`} onClick={() => void toggleTakeover()}><Bot size={16}/>{selected.agent_mode ? "Human takeover on" : "Bot active"}</button>
            </div>
            <div className="chat-messages">
              {chatLoading ? <p className="empty-state">Loading messages…</p> :
                messages.length === 0 ? <p className="empty-state">No messages in this conversation yet.</p> :
                messages.map((message) => <div key={message.id} className={`chat-bubble ${message.direction === "OUTBOUND" ? "outgoing" : "incoming"}`}><p>{message.body || message.message_text || "Unsupported message"}</p><small>{new Date(message.created_at).toLocaleString()}</small></div>)}
            </div>
            <div className="reply-box">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a WhatsApp reply…" rows={2} maxLength={4096}/>
              <button onClick={() => void sendReply()} disabled={!draft.trim() || sending}><Send size={17}/>{sending ? "Sending…" : "Send"}</button>
            </div>
            <p className="inbox-footnote">Replies are sent from this merchant's connected WhatsApp number. Connect a business number in Settings if sending is unavailable.</p>
          </>
        }
      </section>
    </div>
  );
}
