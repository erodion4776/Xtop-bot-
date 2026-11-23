import { useState } from "react";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

const panel: React.CSSProperties = { width: "min(460px, calc(100% - 32px))", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 24, boxSizing: "border-box", boxShadow: "0 16px 45px rgba(15,23,42,.08)" };

export default function PublicNewsletter() {
  const tenantId = new URLSearchParams(window.location.search).get("newsletter") || "";
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!tenantId) { setError("This store subscription link is incomplete."); return; }
    if (!consent) { setError("Please confirm that you want to receive this store's email updates."); return; }
    setBusy(true);
    try {
      const { data, error: callError } = await supabase.functions.invoke("sabi-newsletter-public", {
        body: { action: "subscribe", tenant_id: tenantId, email: email.trim().toLowerCase(), consent: true, source: "STORE_WEBSITE" }
      });
      if (callError) throw new Error(callError.message || "The subscription request could not reach Sabi.");
      if (!data?.success) throw new Error(data?.error || "Subscription could not be saved.");
      setEmail("");
      setConsent(false);
      setSuccess("You're subscribed! You can unsubscribe from any newsletter email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription could not be saved. Please try again.");
    } finally { setBusy(false); }
  }

  return <main style={{ minHeight: "100vh", background: "#f4f7f5", display: "grid", placeItems: "center", padding: 16, fontFamily: "Arial, sans-serif", color: "#172033" }}>
    <section style={panel}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: "#e5f3eb", color: "#145b3b", display: "grid", placeItems: "center" }}><Mail size={23}/></div>
      <p style={{ color: "#145b3b", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, margin: "18px 0 7px" }}>STORE NEWSLETTER</p>
      <h1 style={{ fontSize: 25, margin: "0 0 10px" }}>Get store updates</h1>
      <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>Sign up to receive product news, offers and important updates from this store. You can unsubscribe at any time.</p>
      <form onSubmit={subscribe}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Email address
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={{ width: "100%", boxSizing: "border-box", padding: 13, marginTop: 7, border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 15 }}/>
        </label>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, margin: "16px 0", fontSize: 13, lineHeight: 1.5, color: "#475569" }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }}/>
          I agree to receive email newsletters and store updates. I understand I can unsubscribe at any time.
        </label>
        <button type="submit" disabled={busy || !tenantId || !email.trim() || !consent} style={{ width: "100%", border: 0, borderRadius: 10, padding: 14, background: "#145b3b", color: "#fff", fontWeight: 700, fontSize: 14, opacity: busy || !tenantId || !email.trim() || !consent ? .55 : 1 }}>{busy ? "Subscribing…" : "Subscribe"}</button>
      </form>
      {error && <p role="alert" style={{ color: "#b42318", fontSize: 13, display: "flex", gap: 7, alignItems: "center", marginBottom: 0 }}><AlertCircle size={16}/>{error}</p>}
      {success && <p role="status" style={{ color: "#145b3b", fontSize: 13, display: "flex", gap: 7, alignItems: "center", marginBottom: 0 }}><CheckCircle2 size={16}/>{success}</p>}
      <p style={{ color: "#94a3b8", fontSize: 11, margin: "20px 0 0", textAlign: "center" }}>Powered by Sabi by XTOP</p>
    </section>
  </main>;
}
