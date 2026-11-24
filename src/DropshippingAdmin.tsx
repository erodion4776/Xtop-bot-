import { useEffect, useMemo, useState } from "react";
import { PackagePlus, RefreshCw, Truck, Save, Store, Boxes } from "lucide-react";

type Supplier = { id:string; supplier_name:string; contact_name:string|null; contact_email:string|null; contact_phone:string|null; website_url:string|null; integration_type:"MANUAL"|"API"|"CSV"; api_status:"NOT_CONNECTED"|"TESTING"|"ACTIVE"|"PAUSED"; api_base_url:string|null; notes:string|null; is_active:boolean };
type Product = { id:string; supplier_id:string; supplier_sku:string|null; product_name:string; product_description:string|null; category:string|null; image_url:string|null; supplier_cost:number|string; selling_price:number|string; stock_quantity:number; stock_status:string; product_status:"DRAFT"|"ACTIVE"|"PAUSED"|"ARCHIVED"; publish_to_discover:boolean; supplier_product_url:string|null; supplier?:{supplier_name:string} };
const blankSupplier = { supplier_name:"",contact_name:"",contact_email:"",contact_phone:"",website_url:"",integration_type:"MANUAL" as const,api_status:"NOT_CONNECTED" as const,api_base_url:"",notes:"",is_active:true };
const blankProduct = { supplier_id:"",supplier_sku:"",product_name:"",product_description:"",category:"",image_url:"",supplier_cost:"",selling_price:"",stock_quantity:"0",product_status:"DRAFT" as const,publish_to_discover:false,supplier_product_url:"" };
const money = (v:number) => "₦"+v.toLocaleString("en-NG",{maximumFractionDigits:2});

export default function DropshippingAdmin({ callAdmin }: { callAdmin:(action:string,extra?:Record<string,unknown>)=>Promise<any> }) {
 const [suppliers,setSuppliers]=useState<Supplier[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [orders,setOrders]=useState<any[]>([]);
 const [supplier,setSupplier]=useState<any>(blankSupplier);
 const [product,setProduct]=useState<any>(blankProduct);
 const [editingSupplier,setEditingSupplier]=useState("");
 const [editingProduct,setEditingProduct]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [tab,setTab]=useState<"products"|"suppliers"|"orders">("products");
 const [search,setSearch]=useState("");
 async function load(){
  setBusy(true);setError("");
  try{const r=await callAdmin("dropship-data");setSuppliers(r.suppliers||[]);setProducts(r.products||[]);setOrders(r.orders||[]);}
  catch(e){setError(e instanceof Error?e.message:"Could not load dropshipping records.");}
  finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[]);
 const margin=Number(product.selling_price||0)-Number(product.supplier_cost||0);
 const filtered=useMemo(()=>products.filter(p=>[p.product_name,p.category||"",p.supplier?.supplier_name||"",p.supplier_sku||""].some(v=>v.toLowerCase().includes(search.toLowerCase()))),[products,search]);
 async function saveSupplier(){
  if(!supplier.supplier_name.trim()){setError("Enter the supplier name.");return;}
  setBusy(true);setError("");setNotice("");
  try{await callAdmin("dropship-supplier-save",{...supplier,id:editingSupplier||undefined});setSupplier(blankSupplier);setEditingSupplier("");setNotice("Supplier saved.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Could not save supplier.");}finally{setBusy(false);}
 }
 async function saveProduct(){
  if(!product.supplier_id||!product.product_name.trim()){setError("Choose a supplier and enter the product name.");return;}
  setBusy(true);setError("");setNotice("");
  try{await callAdmin("dropship-product-save",{...product,id:editingProduct||undefined,supplier_cost:Number(product.supplier_cost),selling_price:Number(product.selling_price),stock_quantity:Number(product.stock_quantity)});setProduct(blankProduct);setEditingProduct("");setNotice("Dropshipping product saved. It remains a draft unless you explicitly activate it.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Could not save product.");}finally{setBusy(false);}
 }
 function editProduct(p:Product){setProduct({...p,supplier_cost:String(p.supplier_cost),selling_price:String(p.selling_price),stock_quantity:String(p.stock_quantity)});setEditingProduct(p.id);setTab("products");window.scrollTo({top:0,behavior:"smooth"});}
 function editSupplier(s:Supplier){setSupplier({...s});setEditingSupplier(s.id);setTab("suppliers");window.scrollTo({top:0,behavior:"smooth"});}
 return <div style={{display:"grid",gap:18}}>
  <div className="sa-panel-head"><div><h2>Sabi Dropshipping</h2><p>Manage suppliers and products owned by Sabi. This catalogue is separate from merchant inventory.</p></div><button className="sa-action" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>
  <div className="sa-delivery-note">New products are saved as drafts and are not visible on Discover yet. Checkout, supplier stock verification and fulfilment must be connected before products can safely go live.</div>
  {error&&<div className="sa-alert sa-error">{error}</div>}{notice&&<div className="sa-alert sa-success">{notice}</div>}
  <div className="sa-stat-grid"><div className="sa-stat-card"><div className="sa-stat-top"><span>Suppliers</span><Store size={18}/></div><strong>{suppliers.length}</strong><small>Configured supplier records</small></div><div className="sa-stat-card"><div className="sa-stat-top"><span>Dropship products</span><PackagePlus size={18}/></div><strong>{products.length}</strong><small>Including drafts</small></div><div className="sa-stat-card"><div className="sa-stat-top"><span>Supplier orders</span><Truck size={18}/></div><strong>{orders.length}</strong><small>Fulfilment records</small></div></div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(["products","suppliers","orders"] as const).map(t=><button key={t} className={tab===t?"sa-action good":"sa-action"} onClick={()=>setTab(t)}>{t==="products"?"Products":t==="suppliers"?"Suppliers":"Supplier orders"}</button>)}</div>
  {tab==="suppliers"&&<div className="sa-panel"><div className="sa-panel-head"><div><h2>{editingSupplier?"Edit supplier":"Add supplier"}</h2><p>Start with manual suppliers. API credentials will be stored only as server-side secrets when an integration is approved.</p></div></div><div className="sa-delivery-form">
   <label>Supplier / company name</label><input value={supplier.supplier_name} onChange={e=>setSupplier((v:any)=>({...v,supplier_name:e.target.value}))} placeholder="Supplier business name"/>
   <label>Contact person</label><input value={supplier.contact_name||""} onChange={e=>setSupplier((v:any)=>({...v,contact_name:e.target.value}))} placeholder="Contact name"/>
   <div className="sa-delivery-two"><div><label>Email</label><input value={supplier.contact_email||""} onChange={e=>setSupplier((v:any)=>({...v,contact_email:e.target.value}))} placeholder="supplier@example.com"/></div><div><label>Phone</label><input value={supplier.contact_phone||""} onChange={e=>setSupplier((v:any)=>({...v,contact_phone:e.target.value}))} placeholder="080..."/></div></div>
   <label>Website</label><input value={supplier.website_url||""} onChange={e=>setSupplier((v:any)=>({...v,website_url:e.target.value}))} placeholder="https://supplier.example"/>
   <div className="sa-delivery-two"><div><label>Connection type</label><select value={supplier.integration_type} onChange={e=>setSupplier((v:any)=>({...v,integration_type:e.target.value}))}><option value="MANUAL">Manual supplier</option><option value="CSV">CSV / Excel import</option><option value="API">API integration</option></select></div><div><label>API status</label><select value={supplier.api_status} onChange={e=>setSupplier((v:any)=>({...v,api_status:e.target.value}))}><option value="NOT_CONNECTED">Not connected</option><option value="TESTING">Testing</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></div></div>
   <label>API base URL (if supplied by provider)</label><input value={supplier.api_base_url||""} onChange={e=>setSupplier((v:any)=>({...v,api_base_url:e.target.value}))} placeholder="https://api.supplier.com"/>
   <label>Internal notes</label><textarea rows={3} value={supplier.notes||""} onChange={e=>setSupplier((v:any)=>({...v,notes:e.target.value}))}/>
   <div style={{display:"flex",gap:9,flexWrap:"wrap"}}><button className="sa-action good" disabled={busy} onClick={()=>void saveSupplier()}><Save size={15}/>{editingSupplier?"Update supplier":"Save supplier"}</button>{editingSupplier&&<button className="sa-action" onClick={()=>{setSupplier(blankSupplier);setEditingSupplier("");}}>Cancel edit</button>}</div>
  </div><div className="sa-table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Connection</th><th>API status</th><th>Status</th><th></th></tr></thead><tbody>{suppliers.map(s=><tr key={s.id}><td><strong>{s.supplier_name}</strong><small>{s.website_url||"No website"}</small></td><td>{s.contact_name||"—"}<small>{s.contact_email||s.contact_phone||"—"}</small></td><td>{s.integration_type}</td><td>{s.api_status.replace(/_/g," ")}</td><td>{s.is_active?"Active":"Paused"}</td><td><button className="sa-action" onClick={()=>editSupplier(s)}>Edit</button></td></tr>)}{!suppliers.length&&<tr><td colSpan={6} className="sa-empty">No suppliers added yet.</td></tr>}</tbody></table></div></div>}
  {tab==="products"&&<><div className="sa-panel"><div className="sa-panel-head"><div><h2>{editingProduct?"Edit product":"Add a Sabi dropshipping product"}</h2><p>Enter supplier cost and your retail price. Sabi calculates the gross margin automatically.</p></div></div><div className="sa-delivery-form">
   <label>Supplier</label><select value={product.supplier_id} onChange={e=>setProduct((v:any)=>({...v,supplier_id:e.target.value}))}><option value="">Select supplier</option>{suppliers.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
   <label>Product name</label><input value={product.product_name} onChange={e=>setProduct((v:any)=>({...v,product_name:e.target.value}))} placeholder="Product name"/>
   <label>Description</label><textarea rows={3} value={product.product_description||""} onChange={e=>setProduct((v:any)=>({...v,product_description:e.target.value}))} placeholder="Product details"/>
   <div className="sa-delivery-two"><div><label>Category</label><input value={product.category||""} onChange={e=>setProduct((v:any)=>({...v,category:e.target.value}))} placeholder="e.g. Phones & Electronics"/></div><div><label>Supplier SKU</label><input value={product.supplier_sku||""} onChange={e=>setProduct((v:any)=>({...v,supplier_sku:e.target.value}))} placeholder="Supplier item code"/></div></div>
   <label>Product image URL</label><input value={product.image_url||""} onChange={e=>setProduct((v:any)=>({...v,image_url:e.target.value}))} placeholder="https://..."/>
   <div className="sa-delivery-two"><div><label>Supplier cost (₦)</label><input type="number" min="0" value={product.supplier_cost} onChange={e=>setProduct((v:any)=>({...v,supplier_cost:e.target.value}))}/></div><div><label>Sabi selling price (₦)</label><input type="number" min="0" value={product.selling_price} onChange={e=>setProduct((v:any)=>({...v,selling_price:e.target.value}))}/></div></div>
   <div className="sa-delivery-two"><div><label>Available stock</label><input type="number" min="0" step="1" value={product.stock_quantity} onChange={e=>setProduct((v:any)=>({...v,stock_quantity:e.target.value}))}/></div><div><label>Product status</label><select value={product.product_status} onChange={e=>setProduct((v:any)=>({...v,product_status:e.target.value}))}><option value="DRAFT">Draft</option><option value="ACTIVE">Active (internal only)</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option></select></div></div>
   <label>Supplier product page (optional)</label><input value={product.supplier_product_url||""} onChange={e=>setProduct((v:any)=>({...v,supplier_product_url:e.target.value}))} placeholder="https://..."/>
   <div className="sa-delivery-note">Estimated gross product margin: <strong>{money(margin)}</strong>. This is before payment fees, delivery, returns and operating expenses.</div>
   <div className="sa-delivery-checks"><label><input type="checkbox" checked={product.publish_to_discover} onChange={e=>setProduct((v:any)=>({...v,publish_to_discover:e.target.checked}))}/> Mark for Discover publication (publishing remains blocked until checkout integration is completed)</label></div>
   <div style={{display:"flex",gap:9,flexWrap:"wrap"}}><button className="sa-action good" disabled={busy||!suppliers.length} onClick={()=>void saveProduct()}><Save size={15}/>{editingProduct?"Update product":"Save product"}</button>{editingProduct&&<button className="sa-action" onClick={()=>{setProduct(blankProduct);setEditingProduct("");}}>Cancel edit</button>}</div>
  </div></div><div className="sa-panel"><div className="sa-panel-head"><div><h2>Product catalogue</h2><p>These records are separate from independent merchant listings.</p></div><span>{products.length} products</span></div><div className="sa-search"><Boxes size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Sabi products or supplier"/></div><div className="sa-table-wrap"><table><thead><tr><th>Product</th><th>Supplier</th><th>Supplier cost</th><th>Sabi price</th><th>Gross margin</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><strong>{p.product_name}</strong><small>{p.category||"Uncategorised"}</small></td><td>{p.supplier?.supplier_name||"Supplier"}</td><td>{money(Number(p.supplier_cost))}</td><td>{money(Number(p.selling_price))}</td><td>{money(Number(p.selling_price)-Number(p.supplier_cost))}</td><td>{p.stock_quantity}</td><td>{p.product_status}{p.publish_to_discover?" · Discover flagged":""}</td><td><button className="sa-action" onClick={()=>editProduct(p)}>Edit</button></td></tr>)}{!filtered.length&&<tr><td colSpan={8} className="sa-empty">No Sabi dropshipping products yet.</td></tr>}</tbody></table></div></div></>}
  {tab==="orders"&&<div className="sa-panel"><div className="sa-panel-head"><div><h2>Supplier fulfilment</h2><p>Supplier orders will appear here after customer checkout integration is enabled.</p></div><span>{orders.length} records</span></div><div className="sa-table-wrap"><table><thead><tr><th>Created</th><th>Supplier order</th><th>Status</th><th>Tracking</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{new Date(o.created_at).toLocaleString("en-NG")}</td><td>{o.supplier_order_reference||o.id.slice(0,8)}</td><td>{o.status}</td><td>{o.tracking_number||"—"}</td></tr>)}{!orders.length&&<tr><td colSpan={4} className="sa-empty">No supplier orders have been created yet.</td></tr>}</tbody></table></div></div>}
 </div>;
}
