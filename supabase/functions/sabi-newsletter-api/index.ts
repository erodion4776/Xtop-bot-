import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function reply(data: unknown, status=200) { return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
Deno.serve(async (req: Request) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
 if (req.method !== "POST") return reply({success:false,error:"METHOD_NOT_ALLOWED"},405);
 try {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return reply({success:false,error:"AUTH_REQUIRED"},401);
  const auth=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user) return reply({success:false,error:"AUTH_REQUIRED"},401);
  const body=await req.json();
  const tenantId=String(body.tenant_id||"");
  if(!tenantId) return reply({success:false,error:"TENANT_REQUIRED"},400);
  const {data:member}=await db.from("tenant_members").select("user_id").eq("tenant_id",tenantId).eq("user_id",user.id).eq("role","OWNER").eq("is_active",true).maybeSingle();
  if(!member) return reply({success:false,error:"OWNER_ACCESS_REQUIRED"},403);
  const monthStart=new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const [subs,campaigns,usage,counts] = await Promise.all([
   db.from("sabi_newsletter_subscribers").select("id,email,status,consent_at,created_at",{count:"exact"}).eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100),
   db.from("sabi_newsletter_campaigns").select("id,subject,status,recipient_count,sent_count,failed_count,created_at,completed_at",{count:"exact"}).eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(30),
   db.from("sabi_newsletter_usage").select("campaign_count,recipient_count").eq("tenant_id",tenantId).eq("month_start",monthStart.toISOString().slice(0,10)).maybeSingle(),
   db.from("sabi_newsletter_subscribers").select("id",{count:"exact",head:true}).eq("tenant_id",tenantId).eq("status","SUBSCRIBED")
  ]);
  const err=[subs.error,campaigns.error,usage.error,counts.error].find(Boolean);
  if(err) throw new Error("NEWSLETTER_DATA_UNAVAILABLE");
  return reply({success:true,subscribers:subs.data||[],subscriber_count:counts.count||0,campaigns:campaigns.data||[],usage:usage.data||{campaign_count:0,recipient_count:0},limits:{campaigns:2,recipients_per_campaign:500,recipients_month:1000}});
 } catch(e) { console.error("newsletter api",e); return reply({success:false,error:e instanceof Error?e.message:"REQUEST_FAILED"},500); }
});