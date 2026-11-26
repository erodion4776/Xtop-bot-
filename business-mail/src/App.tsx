import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";
import { Archive, ArrowLeft, ArrowUpRight, Check, ChevronDown, Inbox, LogOut, Mail, MailOpen, Menu, PenLine, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const apiUrl = import.meta.env.VITE_MAIL_API_URL as string | undefined;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const OWNER = "ero@sabibyxtop.com.ng";

type AnyRecord = Record<string, any>;
type Thread = AnyRecord & { id?: string; thread_id?: string; subject?: string; snippet?: string; from?: any; participants?: any[]; latest_message_at?: string; last_message_at?: string; unread_count?: number };
type MailMessage = AnyRecord & { id?: string; message_id?: string; from?: any; to?: any; subject?: string; received_at?: string; sent_at?: string; direction?: string; snippet?: string };
const getId = (v: AnyRecord) => String(v.id ?? v.thread_id ?? v.message_id ?? "");
const address = (v: any): string => typeof v === "string" ? v : v?.email ?? v?.address ?? v?.name ?? "";
const displayDate = (v?: string) => v ? new Date(v).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
const initials = (v: string) => v.split(/[ @._-]/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("") || "XT";

async function mailApi(session: Session, payload: AnyRecord) {
  if (!apiUrl || !supabaseAnonKey) throw new Error("Mail service is not configured. Add the Netlify environment variables first.");
  const response = await fetch(apiUrl, {
    method:"POST",
    headers:{ "Content-Type":"application/json", apikey:supabaseAnonKey, Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify(payload),
  });
  const result = await response.json().catch(()=>({error:"Unexpected server response"}));
  if (!response.ok) { const detail = result.providerDetail ? ` — ${result.providerDetail}` : ""; const status = result.providerStatus ? ` (provider HTTP ${result.providerStatus})` : ""; throw new Error(`${result.error ?? "Mail request failed"}${status}${detail}`); }
  return result.data ?? result;
}

export default function App() {
  const [session,setSession] = useState<Session|null>(null);
  const [email,setEmail] = useState(OWNER);
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [mailbox,setMailbox] = useState(OWNER);
  const [threads,setThreads] = useState<Thread[]>([]);
  const [selected,setSelected] = useState<Thread|null>(null);
  const [messages,setMessages] = useState<MailMessage[]>([]);
  const [bodyMap,setBodyMap] = useState<Record<string,AnyRecord>>({});
  const [query,setQuery] = useState("");
  const [compose,setCompose] = useState(false);
  const [to,setTo] = useState("");
  const [subject,setSubject] = useState("");
  const [text,setText] = useState("");
  const [replyText,setReplyText] = useState("");
  const [mobileList,setMobileList] = useState(false);
  const [diagnostic,setDiagnostic] = useState<AnyRecord|null>(null);

  useEffect(()=>{
    if (!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>subscription.unsubscribe();
  },[]);

  const call = useCallback(async (payload:AnyRecord)=> {
    if (!session) throw new Error("Please sign in again.");
    return mailApi(session,payload);
  },[session]);

  const runDiagnostic = async () => {
    setBusy(true); setError(""); setDiagnostic(null);
    try { const report = await call({action:"diagnose_lockally"}); setDiagnostic(report ?? {error:"The diagnostic endpoint returned an empty response."}); }
    catch(e) { setError(e instanceof Error ? e.message : "Diagnostic failed"); }
    finally { setBusy(false); }
  };

  const loadInbox = useCallback(async (quiet=false)=>{
    if (!session) return;
    if (!quiet) setBusy(true);
    setError("");
    try {
      const inboxData = await call({action:"list_inboxes"});
      const found = (inboxData?.inboxes ?? inboxData?.data?.inboxes ?? []).find((x:any)=>address(x.email ?? x.mailbox ?? x.address)===OWNER);
      const actualMailbox = found ? address(found.email ?? found.mailbox ?? found.address) : OWNER;
      setMailbox(actualMailbox);
      const threadData = await call({action:"list_threads",mailbox:actualMailbox,query:{limit:50}});
      setThreads(threadData?.threads ?? threadData?.data?.threads ?? []);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to load inbox"); }
    finally { if (!quiet) setBusy(false); }
  },[session,call]);

  useEffect(()=>{ if(session) void loadInbox(); },[session,loadInbox]);

  const openThread = async (thread:Thread) => {
    setSelected(thread); setMobileList(false); setReplyText(""); setError("");
    const id=getId(thread);
    if(!id) return;
    setBusy(true);
    try {
      const data=await call({action:"get_thread",threadId:id});
      const list:MailMessage[]=data?.messages ?? data?.thread?.messages ?? [];
      setMessages(list);
      const bodies:Record<string,AnyRecord>={};
      for(const m of list) {
        const mid=getId(m);
        if(mid) {
          try {
            const detail=await call({action:"get_message",threadId:id,messageId:mid});
            bodies[mid]=detail?.body ?? detail?.message?.body ?? detail;
          } catch { /* Keep thread snippets if a stored body is unavailable. */ }
        }
      }
      setBodyMap(bodies);
      const latest=list[list.length-1];
      if(latest && getId(latest)) await call({action:"mark_read",threadId:id,messageId:getId(latest)});
      setThreads(prev=>prev.map(t=>getId(t)===id?{...t,unread_count:0}:t));
    } catch(e) { setError(e instanceof Error?e.message:"Unable to open this email"); }
    finally { setBusy(false); }
  };

  const sendReply = async (event:FormEvent) => {
    event.preventDefault(); if(!selected || !replyText.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await call({action:"reply",threadId:getId(selected),message:{text:replyText.trim()}});
      setReplyText(""); setNotice("Your reply has been accepted by the mail server.");
      await openThread(selected); await loadInbox(true);
    } catch(e) { setError(e instanceof Error?e.message:"Reply could not be sent"); }
    finally { setBusy(false); }
  };

  const sendNew = async (event:FormEvent) => {
    event.preventDefault(); if(!to.trim()||!subject.trim()||!text.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await call({action:"send_message",mailbox,message:{to:to.split(",").map(x=>x.trim()).filter(Boolean),subject:subject.trim(),text:text.trim()}});
      setNotice("Your email has been accepted by the mail server.");
      setCompose(false); setTo(""); setSubject(""); setText(""); await loadInbox(true);
    } catch(e) { setError(e instanceof Error?e.message:"Email could not be sent"); }
    finally { setBusy(false); }
  };

  const downloadAttachment = async (threadId:string,messageId:string,index:number,filename?:string) => {
    if(!session || !apiUrl || !supabaseAnonKey) return;
    setError("");
    try {
      const response=await fetch(apiUrl,{method:"POST",headers:{"Content-Type":"application/json",apikey:supabaseAnonKey,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:"get_attachment",threadId,messageId,attachmentIndex:index})});
      if(!response.ok) {
        const problem=await response.json().catch(()=>({}));
        throw new Error(problem.error??"Attachment download failed");
      }
      const blob=await response.blob();
      const disposition=response.headers.get("Content-Disposition")??"";
      const match=disposition.match(/filename="?([^";]+)"?/i);
      const name=filename??match?.[1]??`attachment-${index+1}`;
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a"); anchor.href=url; anchor.download=name; anchor.click();
      URL.revokeObjectURL(url);
    } catch(e) { setError(e instanceof Error?e.message:"Unable to download attachment"); }
  };

  const logout=async()=>{ await supabase?.auth.signOut(); setSelected(null); setThreads([]); setMessages([]); };
  const filtered=useMemo(()=>threads.filter(t=>[t.subject,t.snippet,address(t.from),...(t.participants??[]).map(address)].join(" ").toLowerCase().includes(query.toLowerCase())),[threads,query]);

  if(!supabase) return <div className="setup"><div className="brand-mark">X</div><h1>Configuration required</h1><p>Add the Supabase URL, public anon key and mail API URL to the Netlify environment variables for this site.</p></div>;

  if(!session) return <main className="login-page"><section className="login-art"><div className="brand-lockup"><div className="brand-mark">X</div><span>XTOP <b>BUSINESS MAIL</b></span></div><div className="art-copy"><span className="eyebrow">PRIVATE COMPANY EMAIL</span><h1>Your business.<br/>Your conversations.<br/><em>One secure place.</em></h1><p>Company communication for XTOP Retail Technologies.</p></div><div className="art-foot"><ShieldCheck size={17}/> Protected staff access</div></section><section className="login-panel"><div className="mobile-brand"><div className="brand-mark">X</div><b>XTOP BUSINESS MAIL</b></div><div className="login-card"><span className="eyebrow dark">STAFF PORTAL</span><h2>Welcome back</h2><p className="muted">Sign in with your company email account.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;}catch(err){setError(err instanceof Error?err.message:"Sign-in failed");}finally{setBusy(false);}}}><label>Company email</label><div className="field"><Mail size={18}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></div><label>Password</label><div className="field"><ShieldCheck size={18}/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" required/></div>{error&&<div className="error">{error}</div>}<button className="primary full" disabled={busy}>{busy?"Signing in…":"Sign in securely"} <ArrowUpRight size={17}/></button></form><div className="login-security"><ShieldCheck size={16}/> Only approved XTOP staff can access this mailbox.</div></div><div className="copyright">© {new Date().getFullYear()} XTOP Retail Technologies</div></section></main>;

  return <div className="app-shell"><header className="topbar"><div className="brand-lockup"><div className="brand-mark">X</div><span>XTOP <b>BUSINESS MAIL</b></span></div><div className="top-actions"><span className="secure-pill"><ShieldCheck size={14}/> Secure workspace</span><div className="user-menu"><span className="avatar">{initials(email)}</span><span className="user-email">{email}</span><button className="icon-btn" title="Sign out" onClick={logout}><LogOut size={18}/></button></div></div></header><div className="mail-layout">{mobileList&&<button className="sidebar-backdrop" aria-label="Close mailbox menu" onClick={()=>setMobileList(false)}/>}<aside className={mobileList?"sidebar mobile-show":"sidebar"}><div className="sidebar-head"><div><span className="eyebrow dark">MAILBOX</span><h2>Inbox</h2></div><div className="sidebar-head-actions"><button className="icon-btn" onClick={()=>void loadInbox()} title="Refresh"><RefreshCw size={17}/></button><button className="icon-btn sidebar-close" onClick={()=>setMobileList(false)} title="Close menu" aria-label="Close menu"><X size={19}/></button></div></div><div className="mailbox-chip"><div className="mailbox-icon"><Mail size={18}/></div><div><b>{mailbox}</b><small>Company mailbox</small></div><ChevronDown size={16}/></div><button className="compose-btn" onClick={()=>{setCompose(true);setSelected(null);setMobileList(false);}}><PenLine size={17}/> Compose email</button><div className="nav-label">MAIL</div><div className="nav-item active"><Inbox size={17}/> Inbox <span>{threads.length}</span></div><div className="sidebar-bottom"><ShieldCheck size={16}/><span>Private staff mailbox</span></div></aside><main className="content"><div className="content-toolbar"><div className="toolbar-title"><button className="icon-btn mobile-menu" onClick={()=>setMobileList(true)}><Menu size={19}/></button><div><span className="eyebrow dark">XTOP RETAIL TECHNOLOGIES</span><h1>{compose?"New message":selected?(selected.subject||"Email conversation"):"Inbox"}</h1></div></div><div className="toolbar-tools"><div className="search-field"><Search size={17}/><input placeholder="Search emails" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="icon-btn" title="Refresh inbox" onClick={()=>void loadInbox()}><RefreshCw size={17}/></button><button className="secondary" onClick={()=>void runDiagnostic()} disabled={busy}>Diagnose</button></div></div>{diagnostic&&<div className="notice" style={{display:"block",whiteSpace:"pre-wrap",fontFamily:"monospace",fontSize:12,overflowWrap:"anywhere"}}><b>Lockally diagnostic</b><br/>{JSON.stringify(diagnostic,null,2)}<button onClick={()=>setDiagnostic(null)}><X size={15}/></button></div>}{error&&<div className="notice error-banner">{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}{notice&&<div className="notice success-banner"><Check size={16}/>{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
{compose?<section className="compose-card"><div className="compose-head"><div><span className="eyebrow dark">NEW EMAIL</span><h2>Compose message</h2></div><button className="icon-btn" onClick={()=>setCompose(false)}><X size={19}/></button></div><form onSubmit={sendNew}><label>To</label><input className="plain-input" type="text" placeholder="recipient@example.com (separate multiple with commas)" value={to} onChange={e=>setTo(e.target.value)} required/><label>Subject</label><input className="plain-input" value={subject} onChange={e=>setSubject(e.target.value)} required/><label>Message</label><textarea className="compose-body" value={text} onChange={e=>setText(e.target.value)} placeholder="Write your message…" required/><div className="compose-actions"><span>From: {mailbox}</span><button className="primary" disabled={busy}><Send size={16}/>{busy?"Sending…":"Send email"}</button></div></form></section>:selected?<section className="thread-panel"><div className="thread-actions"><button className="back-link" onClick={()=>{setSelected(null);setMobileList(false);}}><ArrowLeft size={16}/> Back to inbox</button><span>{messages.length} message{messages.length===1?"":"s"}</span></div><div className="thread-subject">{selected.subject||"(No subject)"}</div>{messages.map((m,i)=>{const id=getId(m);const b=bodyMap[id]??{};const sender=address(m.from)||"Unknown sender";const content=b.text??b.body_text??b.html??m.snippet??"Message body is not available.";return <article className="message-card" key={id||i}><div className="message-head"><div className="avatar sender-avatar">{initials(sender)}</div><div className="sender-info"><b>{sender}</b><small>To: {Array.isArray(m.to)?m.to.map(address).join(", "):address(m.to)||mailbox}</small></div><time>{displayDate(m.received_at??m.sent_at??m.created_at)}</time></div><div className="message-content">{typeof content==="string"?content.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," "):"Message content unavailable."}</div>{(m.has_attachments||m.attachments?.length||m.annotations?.attachment_types?.length)&&<div className="attachment-note"><Archive size={15}/>{(m.attachments??m.annotations?.attachment_types??[null]).map((a:any,idx:number)=><button className="attachment-link" key={idx} onClick={()=>void downloadAttachment(getId(selected!),id,idx,a?.filename)}>{a?.filename??`Download attachment ${idx+1}`} <ArrowUpRight size={13}/></button>)}</div>}</article>})}<form className="reply-box" onSubmit={sendReply}><label>Reply to this conversation</label><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Write your reply…" required/><div className="reply-footer"><span>Reply will stay in this email thread.</span><button className="primary" disabled={busy||!replyText.trim()}><Send size={16}/>{busy?"Sending…":"Send reply"}</button></div></form></section>:<section className="inbox-card"><div className="list-heading"><div><h2>All messages</h2><p>Your latest company conversations</p></div><span>{filtered.length} conversations</span></div>{busy&&threads.length===0?<div className="empty-state"><RefreshCw className="spin" size={25}/><p>Loading your inbox…</p></div>:filtered.length===0?<div className="empty-state"><MailOpen size={34}/><h3>{query?"No matching emails":"Your inbox is clear"}</h3><p>{query?"Try a different search term.":"New emails sent to your company mailbox will appear here."}</p></div>:<div className="thread-list">{filtered.map((t,i)=>{const who=address(t.from)||(t.participants??[]).map(address).filter(Boolean).join(", ")||mailbox;const unread=Number(t.unread_count??0)>0;return <button className={`thread-row ${unread?"unread":""}`} key={getId(t)||i} onClick={()=>void openThread(t)}><div className="avatar">{initials(who)}</div><div className="thread-main"><div className="thread-top"><b>{who}</b><time>{displayDate(t.latest_message_at??t.last_message_at??t.updated_at)}</time></div><div className="thread-subject-line">{t.subject||"(No subject)"}</div><p>{t.snippet||"Open conversation to read the latest message."}</p></div>{unread&&<span className="unread-dot"/>}</button>})}</div>}</section>}{busy&&selected&&<div className="loading-line">Loading message…</div>}<footer className="app-footer">XTOP Business Mail <span>•</span> Private company communications</footer></main></div></div>;
}
