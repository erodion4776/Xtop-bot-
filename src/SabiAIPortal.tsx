import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Bot, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { supabase } from "./lib/supabase";
import SabiAI from "./SabiAI";

const LOGO_URL = "https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png";

export default function SabiAIPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "recovery">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("recovery") === "1" ? "recovery" : params.get("signup") === "1" ? "signup" : "login";
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  function switchMode(next: "login" | "signup" | "reset") {
    setMode(next);
    setMessage("");
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("ai", "1");
    if (next === "signup") url.searchParams.set("signup", "1");
    else url.searchParams.delete("signup");
    url.searchParams.delete("recovery");
    window.history.replaceState({}, "", url.toString());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Please enter your name.");
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const redirect = new URL("/?ai=1", window.location.origin).toString();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect, data: { full_name: name.trim(), account_type: "sabi_ai_customer" } }
        });
        if (signUpError) throw signUpError;
        if (data.session) setSession(data.session);
        else {
          setMessage("Your account has been created. Check your email and confirm your address, then return here to log in.");
          setMode("login");
        }
      } else if (mode === "recovery") {
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Your password has been updated. You can now continue with Sabi AI.");
        window.history.replaceState({}, "", "/?ai=1");
        setMode("login");
      } else if (mode === "reset") {
        if (!email.trim()) throw new Error("Enter your email address first.");
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL("/?ai=1&recovery=1", window.location.origin).toString()
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, a password reset link has been sent.");
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (loginError) throw loginError;
        setSession(data.session);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setMode("login");
    setMessage("You have signed out.");
  }

  if (checking) return <div className="sabi-ai-auth-page"><div className="sabi-ai-auth-card">Loading Sabi AI…</div></div>;

  if (session) {
    return (
      <main className="sabi-ai-portal">
        <header className="sabi-ai-portal-header">
          <a href="/" className="sabi-ai-portal-brand"><img src={LOGO_URL} alt="Sabi by XTOP" /><span>Sabi <small>by XTOP</small></span></a>
          <div className="sabi-ai-portal-user"><span>{session.user.email}</span><button type="button" onClick={logout}>Sign out</button></div>
        </header>
        <div className="sabi-ai-portal-content">
          <SabiAI tenantId="" />
        </div>
        <footer className="sabi-ai-portal-footer">Sabi AI · Powered by Arena · XTOP Retail Technologies</footer>
      </main>
    );
  }

  const title = mode === "signup" ? "Create your Sabi AI account" : mode === "reset" ? "Reset your password" : mode === "recovery" ? "Choose a new password" : "Welcome back";
  const subtitle = mode === "signup" ? "Create an account to start chatting and save your conversations." : mode === "reset" ? "We’ll send a secure password reset link to your email." : mode === "recovery" ? "Choose a new password for your Sabi AI account." : "Sign in to continue your private Sabi AI conversations.";

  return (
    <main className="sabi-ai-auth-page">
      <a href="/" className="sabi-ai-back-home"><ArrowLeft size={16} /> Back to Sabi by XTOP</a>
      <section className="sabi-ai-auth-card">
        <div className="sabi-ai-auth-brand"><img src={LOGO_URL} alt="Sabi by XTOP" /><span><strong>Sabi AI</strong><small>Your intelligent business and shopping assistant</small></span></div>
        <div className="sabi-ai-auth-icon"><Bot size={24} /></div>
        <h1>{title}</h1>
        <p className="sabi-ai-auth-subtitle">{subtitle}</p>
        <form onSubmit={submit} className="sabi-ai-auth-form">
          {mode === "signup" && <label>Your name<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" required /></label>}
          {mode !== "recovery" && <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>}
          {mode !== "reset" && <label>{mode === "recovery" ? "New password" : "Password"}<span className="sabi-ai-password-wrap"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "recovery" ? "At least 8 characters" : "Enter your password"} minLength={8} required /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>}
          {error && <div className="sabi-ai-auth-error" role="alert">{error}</div>}
          {message && <div className="sabi-ai-auth-message" role="status">{message}</div>}
          <button className="sabi-ai-auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? <><UserPlus size={17}/> Create account</> : mode === "reset" ? "Send reset link" : mode === "recovery" ? "Update password" : <><LogIn size={17}/> Sign in to Sabi AI</>}</button>
        </form>
        {mode === "login" && <button className="sabi-ai-auth-link" type="button" onClick={() => switchMode("reset")}>Forgot password?</button>}
        {mode === "reset" && <button className="sabi-ai-auth-link" type="button" onClick={() => switchMode("login")}>Back to login</button>}
        {mode === "recovery" && <button className="sabi-ai-auth-link" type="button" onClick={() => switchMode("login")}>Back to login</button>}
        {mode !== "recovery" && mode !== "reset" && <p className="sabi-ai-auth-switch">{mode === "login" ? "New to Sabi AI?" : "Already have an account?"} <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create account" : "Sign in"}</button></p>}
        <p className="sabi-ai-auth-legal">By continuing, you agree to use Sabi AI responsibly. Never share passwords, OTPs or payment PINs in chat.</p>
      </section>
      <p className="sabi-ai-auth-footer">XTOP Retail Technologies · Sabi by XTOP</p>
    </main>
  );
}
