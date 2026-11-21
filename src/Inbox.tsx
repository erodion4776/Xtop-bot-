import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  MessageSquare, Send, RefreshCw, UserRound, Bot, CheckCheck,
  Search, Clock3, ShoppingBag, RotateCcw
} from "lucide-react";

type ServiceStatus = "NEEDS_REPLY" | "OPEN" | "HUMAN" | "RESOLVED";

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
  service_status?: ServiceStatus;
  last_message?: Message | null;
};

type CustomerOrder = {
  id: string;
  order_number?: string | null;
  status?: string | null;
  payment_status?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  total?: number | string | null;
  created_at: string;
  delivery_address?: string | null;
};

const filters = [
  { id: "ALL", label: "All chats" },
  { id: "NEEDS_REPLY", label: "Needs reply" },
  { id: "HUMAN", label: "Human takeover" },
  { id: "RESOLVED", label: "Resolved" },
] as const;

function money(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function messageText(message?: Message | null) {
  return message?.body || message?.message_text || "No message preview";
}

function statusLabel(status?: ServiceStatus) {
  if (status === "NEEDS_REPLY") return "Needs reply";
  if (status === "HUMAN") return "Human takeover";
  if (status === "RESOLVED") return "Resolved";
  return "Open";
}

export default function Inbox() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState("");

  async function loadInbox(keepSelection = true) {
    setLoading(true);
    setError("");
    const { data, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=inbox-list",
      { method: "GET" }
    );
    if (apiError || data?.error) {
      setError(data?.error || apiError?.message || "Could not load customer conversations.");
      setLoading(false);
      return;
    }
    const rows = Array.isArray(data?.data) ? data.data as Contact[] : [];
    setContacts(rows);
    if (keepSelection) {
      setSelected((current) => {
        if (!current) return current;
        return rows.find((item) => item.id === current.id) || current;
      });
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
      setOrders([]);
      setCustomer(contact);
    } else {
      setMessages(Array.isArray(data?.data) ? data.data as Message[] : []);
      setOrders(Array.isArray(data?.orders) ? data.orders as CustomerOrder[] : []);
      setCustomer(data?.customer || contact);
    }
    setChatLoading(false);
  }

  useEffect(() => {
    void loadInbox(false);
    // Load once when the Customer Service page is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      const status = contact.service_status || "OPEN";
      const matchesFilter = activeFilter === "ALL" ||
        (activeFilter === "NEEDS_REPLY" && status === "NEEDS_REPLY") ||
        (activeFilter === "HUMAN" && contact.agent_mode === true) ||
        (activeFilter === "RESOLVED" && status === "RESOLVED");
      const matchesSearch = !term ||
        String(contact.name || "").toLowerCase().includes(term) ||
        String(contact.phone || "").toLowerCase().includes(term) ||
        messageText(contact.last_message).toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [contacts, search, activeFilter]);

  const needsReplyCount = contacts.filter((item) => item.service_status === "NEEDS_REPLY").length;
  const humanCount = contacts.filter((item) => item.agent_mode === true).length;

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
      const humanSelected = { ...selected, agent_mode: true };
      setSelected(humanSelected);
      setCustomer((current) => current ? { ...current, agent_mode: true } : current);
      setContacts((items) => items.map((item) => item.id === selected.id
        ? { ...item, agent_mode: true, service_status: "HUMAN" }
        : item));
      await loadChat(humanSelected);
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
    setCustomer(updated);
    setContacts((items) => items.map((item) => item.id === updated.id
      ? { ...item, agent_mode: enabled, service_status: enabled ? "HUMAN" : item.service_status }
      : item));
  }

  async function updateServiceStatus(status: "OPEN" | "RESOLVED") {
    if (!selected || updatingStatus) return;
    setUpdatingStatus(true);
    setError("");
    const { data, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=customer-service-status",
      { body: { contact_id: selected.id, status } }
    );
    if (apiError || data?.error || !data?.success) {
      setError(data?.error || apiError?.message || "Could not update conversation status.");
    } else {
      const updated = { ...selected, service_status: status === "RESOLVED" ? "RESOLVED" : "OPEN" };
      setSelected(updated);
      setContacts((items) => items.map((item) => item.id === updated.id
        ? { ...item, service_status: updated.service_status }
        : item));
    }
    setUpdatingStatus(false);
  }

  return (
    <div className="customer-service-page">
      <div className="customer-service-intro">
        <div>
          <p className="eyebrow">MERCHANT SUPPORT DESK</p>
          <h2>Customer Service</h2>
          <p>Read customer messages and reply from your Sabi dashboard. Replies are delivered to the customer's WhatsApp chat.</p>
        </div>
        <button className="icon-action" onClick={() => void loadInbox()} title="Refresh conversations" aria-label="Refresh conversations">
          <RefreshCw size={17}/>
        </button>
      </div>

      <div className="customer-service-stats">
        <div className="cs-stat"><span>Total conversations</span><strong>{contacts.length}</strong></div>
        <div className="cs-stat"><span>Waiting for reply</span><strong>{needsReplyCount}</strong></div>
        <div className="cs-stat"><span>Human takeover</span><strong>{humanCount}</strong></div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="inbox-layout customer-service-layout">
        <section className="panel inbox-list-panel">
          <div className="inbox-heading">
            <div><h2>Conversations</h2><p>Choose a customer to open the chat.</p></div>
          </div>
          <div className="cs-search">
            <Search size={16}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or message"/>
          </div>
          <div className="cs-filter-tabs">
            {filters.map((filter) => (
              <button key={filter.id} className={activeFilter === filter.id ? "active" : ""} onClick={() => setActiveFilter(filter.id)}>
                {filter.label}
                {filter.id === "NEEDS_REPLY" && needsReplyCount > 0 && <span>{needsReplyCount}</span>}
              </button>
            ))}
          </div>
          {loading ? <p className="empty-state">Loading conversations…</p> :
            filteredContacts.length === 0 ? <div className="empty-state"><MessageSquare size={28}/><strong>{contacts.length ? "No matching conversations" : "No customer conversations yet"}</strong><span>{contacts.length ? "Try another filter or search term." : "Chats from your connected business WhatsApp number will appear here."}</span></div> :
            <div className="conversation-list">
              {filteredContacts.map((contact) => (
                <button key={contact.id} className={`conversation-item ${selected?.id === contact.id ? "selected" : ""}`} onClick={() => void loadChat(contact)}>
                  <span className="contact-avatar"><UserRound size={18}/></span>
                  <span className="conversation-copy">
                    <strong>{contact.name || contact.phone || "WhatsApp customer"}</strong>
                    <small>{messageText(contact.last_message)}</small>
                    <span className={`cs-status cs-status-${(contact.service_status || "OPEN").toLowerCase()}`}>{statusLabel(contact.service_status)}</span>
                  </span>
                  {contact.agent_mode && <span className="takeover-dot" title="Human takeover active"/>}
                </button>
              ))}
            </div>
          }
        </section>

        <section className="panel chat-panel customer-chat-panel">
          {!selected ? <div className="empty-state chat-empty"><MessageSquare size={32}/><strong>Open a conversation</strong><span>Select a customer to read their messages, review recent orders and reply.</span></div> :
            <>
              <div className="chat-header">
                <div className="cs-customer-title">
                  <strong>{customer?.name || selected.name || "WhatsApp customer"}</strong>
                  <small>{customer?.phone || selected.phone}</small>
                  <span className={`cs-status cs-status-${(selected.service_status || "OPEN").toLowerCase()}`}>{statusLabel(selected.service_status)}</span>
                </div>
                <div className="cs-chat-actions">
                  <button className="cs-resolve-button" disabled={updatingStatus} onClick={() => void updateServiceStatus(selected.service_status === "RESOLVED" ? "OPEN" : "RESOLVED")}>
                    {selected.service_status === "RESOLVED" ? <><RotateCcw size={15}/> Reopen</> : <><CheckCheck size={15}/> Resolve</>}
                  </button>
                  <button className={`takeover-button ${selected.agent_mode ? "enabled" : ""}`} onClick={() => void toggleTakeover()}>
                    <Bot size={16}/>{selected.agent_mode ? "Resume bot" : "Pause bot"}
                  </button>
                </div>
              </div>

              <div className="cs-customer-context">
                <div className="cs-context-heading"><UserRound size={15}/><strong>Customer details</strong></div>
                <span>{customer?.phone || selected.phone}</span>
                <div className="cs-context-heading cs-orders-heading"><ShoppingBag size={15}/><strong>Recent orders</strong></div>
                {orders.length === 0 ? <small className="cs-no-orders">No orders linked to this customer yet.</small> :
                  <div className="cs-order-list">
                    {orders.map((order) => (
                      <div className="cs-order-row" key={order.id}>
                        <div><strong>{order.order_number || "Order"}</strong><small>{new Date(order.created_at).toLocaleDateString()} · {order.status || "Pending"} · Payment {order.payment_status || "Unknown"}</small></div>
                        <strong>{money(order.total)}</strong>
                      </div>
                    ))}
                  </div>
                }
              </div>

              <div className="chat-messages">
                {chatLoading ? <p className="empty-state">Loading messages…</p> :
                  messages.length === 0 ? <p className="empty-state">No messages in this conversation yet.</p> :
                  messages.map((message) => <div key={message.id} className={`chat-bubble ${message.direction === "OUTBOUND" ? "outgoing" : "incoming"}`}><p>{messageText(message)}</p><small>{new Date(message.created_at).toLocaleString()}</small></div>)}
              </div>
              <div className="reply-box">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply to your customer…" rows={2} maxLength={4096}/>
                <button onClick={() => void sendReply()} disabled={!draft.trim() || sending || chatLoading}><Send size={17}/>{sending ? "Sending…" : "Send"}</button>
              </div>
              <p className="inbox-footnote"><Clock3 size={13}/> Replies are sent using this merchant's connected WhatsApp number. WhatsApp's customer-service messaging window and template rules still apply.</p>
            </>
          }
        </section>
      </div>
    </div>
  );
}
