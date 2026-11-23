import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, Send, Users, Megaphone, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

type Subscriber = { id:string; email:string; status:string; consent_at:string; created_at:string };
type Campaign = { id:string; subject:string; status:string; recipient_count:number; sent_count:number; failed_count:number; created_at:string; completed_at:string|null };
type Props = { tenantId:string };
const panel: React.CSSProperties = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:18, marginBottom:16 };
const button: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:8, border:0, borderRadius:10, padding:"11px 15px", background:"#145b3b", color:"#fff", fontWeight:700, cursor:"pointer" };
const field: React.CSSProperties = { width:"100%", boxSizing:"border-box", border:"1px solid #d1d5db", borderRadius:10, padding:12, fontSize:14, marginTop:7 };
const money = (n:number) => new Intl.NumberFormat("en-NG").format(n || 0);

export default function Newsletter({tenantId}:Props) {
 const [subscribers,setSubscribers]=useState<Subscriber[]>([]);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [subscriberCount,setSubscriberCount]=useState(0);
 const [usage,setUsage]=useState({campaign_count:0,recipient_count:0});
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const [subject,setSubject]=useState("");
 const [content,setContent]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [progress,setProgress]=useState("");
 const [showSubscribers,setShowSubscribers]=useState(false);

 const load=useCallback(async()=>{
  if(!tenantId)return;
  setLoading(true);setError("");
  const {data,error:callError}=await supabase.functions.invoke("sabi-newsletter-api",{body:{tenant_id:tenantId}});
  if(callError||!data?.success){setError(data?.error||callError?.message||"Could not load newsletter data.");setLoading(false);return;}
  setSubscribers(data.subscribers||[]);setCampaigns(data.campaigns||[]);setSubscriberCount(data.subscriber_count||0);setUsage(data.usage||{campaign_count:0,recipient_count:0});setLoading(false);
 },[tenantId]);
 useEffect(()=>{load();},[load]);

 async function createAndSend(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");setNotice("");
  if(!subject.trim()||!content.trim()){setError("Enter a subject and newsletter message.");return;}
  if(subscriberCount===0){setError("There are no opted-in subscribers to receive this newsletter.");return;}
  if(usage.campaign_count>=2){setError("You have used your 2 newsletter campaigns for this month.");return;}
  if(usage.recipient_count+subscriberCount>1000){setError("This campaign would exceed your monthly limit of 1,000 recipients.");return;}
  if(!window.confirm("Send this newsletter to "+subscriberCount+" opted-in subscriber(s)? Emails will be sent in batches of 20."))return;
  setSending(true);setProgress("Creating your campaign…");
  try{
   const {data:created,error:createError}=await supabase.rpc("sabi_newsletter_create_campaign",{p_tenant_id:tenantId,p_subject:subject.trim(),p_content:content.trim()});
   if(createError)throw new Error(createError.message);
   const result=Array.isArray(created)?created[0]:created;
   const campaignId=result?.campaign_id||result?.id;
   if(!campaignId)throw new Error(result?.message||result?.error||"Campaign could not be created.");
   let complete=false;let batches=0;
   while(!complete&&batches<25){
    batches++;
    setProgress("Sending batch "+batches+" of up to 25…");
    const {data,error:workerError}=await supabase.functions.invoke("sabi-newsletter-worker",{body:{tenant_id:tenantId,campaign_id:campaignId}});
    if(workerError||!data?.success)throw new Error(data?.error||workerError?.message||"Newsletter batch failed.");
    complete=data.complete===true;
    if(!complete&&Number(data.processed||0)===0)throw new Error("The queue has not completed. Refresh the campaign list before retrying.");
   }
   setNotice(complete?"Newsletter sending finished. Check the campaign results below.":"The campaign is still queued. Refresh shortly to continue checking its status.");
   setSubject("");setContent("");await load();
  }catch(e){setError(e instanceof Error?e.message:"Newsletter could not be sent.");await load();}
  finally{setSending(false);setProgress("");}
 }
 const remainingCampaigns=Math.max(0,2-usage.campaign_count);
 const remainingRecipients=Math.max(0,1000-usage.recipient_count);
 return <div style={{maxWidth:900}}>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
   <div style={panel}><Users size={20} color="#145b3b"/><div style={{fontSize:12,color:"#64748b",marginTop:8}}>Subscribed customers</div><strong style={{fontSize:26}}>{loading?"…":money(subscriberCount)}</strong></div>
   <div style={panel}><Megaphone size={20} color="#145b3b"/><div style={{fontSize:12,color:"#64748b",marginTop:8}}>Campaigns left this month</div><strong style={{fontSize:26}}>{loading?"…":remainingCampaigns}/2</strong></div>
   <div style={panel}><Mail size={20} color="#145b3b"/><div style={{fontSize:12,color:"#64748b",marginTop:8}}>Recipient allowance left</div><strong style={{fontSize:26}}>{loading?"…":money(remainingRecipients)}</strong></div>
  </div>
  <div style={panel}>
   <h2 style={{margin:"0 0 6px",fontSize:18}}>Create a newsletter</h2>
   <p style={{margin:"0 0 14px",color:"#64748b",fontSize:13}}>Send updates only to customers who have explicitly subscribed. Sabi sends in batches of 20 and includes an unsubscribe link.</p>
   <form onSubmit={createAndSend}>
    <label style={{fontSize:13,fontWeight:700}}>Email subject<input style={field} value={subject} onChange={e=>setSubject(e.target.value)} maxLength={120} placeholder="e.g. New arrivals this week" required/></label>
    <label style={{display:"block",fontSize:13,fontWeight:700,marginTop:14}}>Newsletter message<textarea style={{...field,minHeight:150,resize:"vertical"}} value={content} onChange={e=>setContent(e.target.value)} maxLength={12000} placeholder="Write your update for subscribed customers…" required/></label>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginTop:14}}>
     <small style={{color:"#64748b"}}>{content.length.toLocaleString()} / 12,000 characters · {subscriberCount} recipients</small>
     <button type="submit" disabled={sending||loading||subscriberCount===0||remainingCampaigns===0} style={{...button,opacity:(sending||loading||subscriberCount===0||remainingCampaigns===0)?0.55:1}}>{sending?<RefreshCw size={16}/>:<Send size={16}/>} {sending?"Sending…":"Send newsletter"}</button>
    </div>
   </form>
   {sending&&<p style={{fontSize:13,color:"#145b3b",marginBottom:0}}>{progress}</p>}
   {error&&<p role="alert" style={{color:"#b42318",fontSize:13,display:"flex",gap:7,alignItems:"center"}}><AlertCircle size={16}/>{error}</p>}
   {notice&&<p role="status" style={{color:"#145b3b",fontSize:13,display:"flex",gap:7,alignItems:"center"}}><CheckCircle2 size={16}/>{notice}</p>}
  </div>
  <div style={panel}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
    <div><h2 style={{margin:0,fontSize:18}}>Campaign history</h2><p style={{margin:"5px 0 0",fontSize:13,color:"#64748b"}}>Your latest newsletter activity</p></div>
    <button onClick={load} disabled={loading||sending} style={{...button,background:"#f1f5f9",color:"#243447"}}><RefreshCw size={15}/>Refresh</button>
   </div>
   {loading?<p>Loading campaigns…</p>:campaigns.length===0?<p style={{color:"#64748b",fontSize:13}}>No newsletters have been sent yet.</p>:<div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:520}}><thead><tr>{["Subject","Status","Recipients","Sent","Failed","Date"].map(x=><th key={x} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid #e5e7eb",color:"#64748b"}}>{x}</th>)}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id}>{[c.subject,c.status,c.recipient_count,c.sent_count,c.failed_count,new Date(c.created_at).toLocaleDateString("en-NG")].map((v,i)=><td key={i} style={{padding:"11px 8px",borderBottom:"1px solid #f1f5f9"}}>{v}</td>)}</tr>)}</tbody></table></div>}
  </div>
  <div style={panel}>
   <button onClick={()=>setShowSubscribers(v=>!v)} style={{...button,background:"#f1f5f9",color:"#243447"}}><Users size={16}/>{showSubscribers?"Hide":"View"} subscribers ({subscriberCount})</button>
   {showSubscribers&&<div style={{overflowX:"auto",marginTop:12}}>{subscribers.length===0?<p>No subscribers yet.</p>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:360}}><thead><tr><th style={{textAlign:"left",padding:8}}>Email</th><th style={{textAlign:"left",padding:8}}>Status</th><th style={{textAlign:"left",padding:8}}>Subscribed</th></tr></thead><tbody>{subscribers.map(s=><tr key={s.id}><td style={{padding:8,borderTop:"1px solid #eee"}}>{s.email}</td><td style={{padding:8,borderTop:"1px solid #eee"}}>{s.status}</td><td style={{padding:8,borderTop:"1px solid #eee"}}>{s.consent_at?new Date(s.consent_at).toLocaleDateString("en-NG"):"—"}</td></tr>)}</tbody></table>}</div>}
   <p style={{fontSize:12,color:"#64748b",marginBottom:0}}>Monthly limit: 2 campaigns, 500 recipients per campaign, 1,000 recipients total. Unsubscribed customers are excluded automatically.</p>
  </div>
 </div>;
}