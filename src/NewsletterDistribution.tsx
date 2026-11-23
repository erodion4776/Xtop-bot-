import { useMemo, useState } from "react";
import { Copy, MessageCircle, Code2, CheckCircle2 } from "lucide-react";

const panel: React.CSSProperties = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:18, marginBottom:16 };
const button: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:8, border:0, borderRadius:10, padding:"10px 13px", background:"#145b3b", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 };
export default function NewsletterDistribution({tenantId}:{tenantId:string}) {
 const [copied,setCopied]=useState(false);
 const signupUrl=useMemo(()=>window.location.origin+"/?newsletter="+encodeURIComponent(tenantId),[tenantId]);
 const embed='<iframe src="'+signupUrl+'" title="Store newsletter signup" width="100%" height="470" style="border:0;max-width:520px" loading="lazy"></iframe>';
 async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}
 return <section style={panel}>
  <h2 style={{margin:"0 0 6px",fontSize:18}}>Get subscribers from your website and WhatsApp</h2>
  <p style={{margin:"0 0 13px",fontSize:13,color:"#64748b"}}>This signup page is unique to your merchant store. Share the link in your WhatsApp chats, status, social pages or website. Customers must enter their email and agree before being added.</p>
  <label style={{display:"block",fontSize:12,fontWeight:700,color:"#475569"}}>Your store signup link</label>
  <input readOnly value={signupUrl} style={{width:"100%",boxSizing:"border-box",padding:11,marginTop:6,border:"1px solid #d1d5db",borderRadius:9,fontSize:12}} onFocus={e=>e.currentTarget.select()}/>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
   <button type="button" style={button} onClick={()=>copy(signupUrl)}><Copy size={15}/>{copied?"Copied":"Copy link"}</button>
   <a href={"https://wa.me/?text="+encodeURIComponent("Subscribe to our store newsletter for product updates and offers: "+signupUrl)} target="_blank" rel="noreferrer" style={{...button,textDecoration:"none",background:"#128c54"}}><MessageCircle size={15}/>Share on WhatsApp</a>
  </div>
  <div style={{marginTop:16}}>
   <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,fontWeight:700,color:"#475569"}}><Code2 size={15}/>Embed on your website</label>
   <textarea readOnly value={embed} rows={3} onFocus={e=>e.currentTarget.select()} style={{width:"100%",boxSizing:"border-box",padding:10,marginTop:6,border:"1px solid #d1d5db",borderRadius:9,fontSize:11,fontFamily:"monospace"}}/>
   <button type="button" style={{...button,marginTop:8,background:"#334155"}} onClick={()=>copy(embed)}><Copy size={15}/>Copy website embed code</button>
  </div>
  {copied&&<p role="status" style={{fontSize:12,color:"#145b3b",marginBottom:0,display:"flex",alignItems:"center",gap:6}}><CheckCircle2 size={14}/>Copied to clipboard.</p>}
 </section>;
}
