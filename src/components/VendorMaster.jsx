import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function VendorMaster({ vendors, setVendors, queries, payments, onSaveVendor, onClose }) {
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [filterType,setFilterType]=useState("All");
  const [search,setSearch]=useState("");
  const [showInactive,setShowInactive]=useState(false);
  const [tab,setTab]=useState("profile");
  const [rates,setRates]=useState([]);
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const TABS=[{id:"profile",label:"Profile"},{id:"history",label:"Service History"},{id:"rates",label:"Contracted Rates"},{id:"ledger",label:"Financial Ledger"}];
  const filtered=vendors.filter(v=>(showInactive||v.active!==false)&&(filterType==="All"||v.type===filterType)&&(!search||v.name?.toLowerCase().includes(search.toLowerCase())||v.city?.toLowerCase().includes(search.toLowerCase())));
  const getLedger=v=>{const entries=[];Object.entries(payments||{}).forEach(([qId,pt])=>{(pt.outgoing||[]).forEach(e=>{if((e.vendor||"").toLowerCase().includes((v.name||"").toLowerCase())){const q=queries.find(q=>q.id===qId);entries.push({...e,queryId:qId,tourFileId:q?.tourFileId,clientName:q?.clientName||q?.groupName,sector:q?.destination||q?.sector});}});});return entries.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));};
  const saveEdit=()=>{
    if(form.id){
      setVendors(p=>p.map(v=>v.id===form.id?form:v));
      setSelected(form);
      onSaveVendor?.(form);
    }else{
      const nv={...form,id:"VND-"+String(vendors.length+1).padStart(3,"0"),active:true};
      setVendors(p=>[...p,nv]);setSelected(nv);
      onSaveVendor?.(nv);
    }
    setEditing(false);
  };
  const inp={padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const PT_STYLE={cash:{bg:"#DCFCE7",color:"#166534",label:"Cash"},voucher:{bg:"#FEF3C7",color:"#92400E",label:"Voucher"},settle:{bg:"#DBEAFE",color:"#1E40AF",label:"Settlement"}};
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:900,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MASTER DATA</div><div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Vendor Repository</div></div>
          <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>{setForm({name:"",type:"Hotel",city:"",contactName:"",contactPhone:"",contactEmail:"",gstin:"",notes:"",languages:"",areas:""});setEditing(true);setSelected(null);}}>+ New Vendor</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:240,borderRight:`1px solid ${G.gray200}`,overflowY:"auto",flexShrink:0}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${G.gray200}`}}>
              <input style={{...inp,padding:"6px 9px",marginBottom:6}} placeholder="Search vendors..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>{["All",...VENDOR_TYPES].map(t=><button key={t} onClick={()=>setFilterType(t)} style={{padding:"2px 7px",borderRadius:10,border:`1px solid ${filterType===t?G.accent:G.gray200}`,background:filterType===t?"#FDEDEC":G.white,color:filterType===t?G.accent:G.gray600,fontSize:10,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>{t}</button>)}</div>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:G.gray600,cursor:"pointer"}}>
                <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} style={{accentColor:G.accent}}/>
                Show inactive
              </label>
            </div>
            {filtered.map(v=><div key={v.id} onClick={()=>{setSelected(v);setEditing(false);setTab("profile");setRates([]);}} style={{padding:"12px 14px",borderBottom:`1px solid ${G.gray100}`,cursor:"pointer",background:selected?.id===v.id?"#EBF5FB":G.white,opacity:v.active===false?0.5:1}}><div style={{fontSize:13,fontWeight:600}}>{v.name}{v.active===false?" (inactive)":""}</div><div style={{fontSize:11,color:G.accent,fontWeight:500}}>{v.type}</div><div style={{fontSize:11,color:G.gray400}}>{v.city}</div></div>)}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {editing?(
              <div style={{flex:1,overflowY:"auto",padding:16}}>
                <div style={{fontSize:14,fontWeight:700,color:G.navy,marginBottom:14}}>{form.id?"Edit Vendor":"New Vendor"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Vendor Name</div><input style={inp} value={form.name||""} onChange={e=>setF("name",e.target.value)}/></div>
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Type</div><select style={inp} value={form.type||"Hotel"} onChange={e=>setF("type",e.target.value)}>{VENDOR_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>City</div><input style={inp} value={form.city||""} onChange={e=>setF("city",e.target.value)}/></div>
                  {[["Contact Name","contactName"],["Phone","contactPhone"],["Email","contactEmail"],["GSTIN","gstin"]].map(([l,k])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)}/></div>)}
                  {form.type==="Tour Facilitator" && [["Languages","languages","e.g. English, Thai"],["Areas / Cities Covered","areas","e.g. Bodhgaya, Rajgir"]].map(([l,k,ph])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)} placeholder={ph}/></div>)}
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div><textarea style={{...inp,minHeight:52,resize:"vertical"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
                  {form.id && <div style={{gridColumn:"1/-1"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.gray600,cursor:"pointer"}}>
                      <input type="checkbox" checked={form.active!==false} onChange={e=>setF("active",e.target.checked)} style={{accentColor:G.accent}}/>
                      Active (available to select elsewhere in the app)
                    </label>
                  </div>}
                </div>
                <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={()=>setEditing(false)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit}>Save Vendor</button></div>
              </div>
            ):selected?(
              <>
                <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
                  {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 16px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Inter',sans-serif",background:"none",color:tab===t.id?G.accent:G.gray600,fontWeight:tab===t.id?600:400,borderBottom:`2px solid ${tab===t.id?G.accent:"transparent"}`}}>{t.label}</button>)}
                  <div style={{flex:1}}/><button className="btn btn-ghost" style={{fontSize:11,margin:"6px 12px"}} onClick={()=>{setForm({...selected});setEditing(true);}}>✏ Edit</button>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:16}}>
                  {tab==="profile"&&<div><div style={{background:G.gray50,borderRadius:10,padding:"14px 16px",marginBottom:14}}><div style={{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',serif",color:G.navy}}>{selected.name}</div><div style={{fontSize:12,color:G.accent,fontWeight:500,marginTop:2}}>{selected.type} · {selected.city}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{(selected.type==="Tour Facilitator"?[["Phone",selected.contactPhone],["Languages",selected.languages],["Areas Covered",selected.areas],["Status",selected.active===false?"Inactive":"Active"]]:[["Contact",selected.contactName],["Phone",selected.contactPhone],["Email",selected.contactEmail],["GSTIN",selected.gstin]]).map(([l,v])=><div key={l}><div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:500}}>{v||"—"}</div></div>)}</div>{selected.notes&&<div style={{marginTop:12,background:G.gray50,borderRadius:6,padding:"8px 10px",fontSize:12,color:G.gray600,borderLeft:`3px solid ${G.accent}`}}>{selected.notes}</div>}</div>}
                  {tab==="history"&&<div>{getLedger(selected).length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No service history yet.</div>:[...new Set(getLedger(selected).map(e=>e.tourFileId).filter(Boolean))].map(tfId=>{const q=queries.find(q=>q.tourFileId===tfId);const entries=getLedger(selected).filter(e=>e.tourFileId===tfId);const total=entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);return<div key={tfId} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:G.navy}}>📁 {tfId}</div>{q&&<div style={{fontSize:11,color:G.gray600}}>{q.clientName||q.groupName} · {q.destination||q.sector} · {q.travelDate||""}</div>}</div><div style={{fontSize:13,fontWeight:700,color:G.navy}}>₹ {Math.round(total).toLocaleString()}</div></div>{entries.map((e,i)=>{const ts=PT_STYLE[e.paymentType||"cash"]||PT_STYLE.cash;return<div key={i} style={{display:"flex",gap:8,padding:"3px 0",borderTop:`1px solid ${G.gray100}`,fontSize:11,color:G.gray600}}><span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:ts.bg,color:ts.color,fontWeight:600}}>{ts.label}</span><span>₹ {parseFloat(e.amount||0).toLocaleString()}</span><span style={{color:G.gray400}}>{e.date||"—"} · {e.mode||"—"}</span></div>;})}</div>;})}  </div>}
                  {tab==="rates"&&<div><div style={{fontSize:12,color:G.gray600,marginBottom:10}}>Contracted rates for this vendor. Fields adapt to vendor type.</div>{rates.map((r,i)=>{const vtype=selected.type||"Hotel";const upd=(k,v)=>setRates(p=>p.map((x,xi)=>xi===i?{...x,[k]:v}:x));const FIELDS={Hotel:[["Season","season","text"],["Room Type","roomType","text"],["Meal Plan","mealPlan","mealsel"],["Rate (₹)","ratePP","number"],["Single Supp (₹)","singleSupp","number"],["Tax %","taxPct","number"]],Restaurant:[["Season","season","text"],["Meal Type","mealType","mealtype"],["Price Per Head (₹)","ratePP","number"],["Tax %","taxPct","number"]],Transport:[["Season","season","text"],["Vehicle Type","vehicleType","vehsel"],["Rate/Day (₹)","ratePerDay","number"],["Rate/KM (₹)","ratePerKm","number"],["Capacity","capacity","number"]],"Tour Facilitator":[["Season","season","text"],["Language","language","text"],["Rate/Day (₹)","ratePP","number"],["Half Day (₹)","halfDay","number"]],"Activity Provider":[["Activity","activity","text"],["Rate PP (₹)","ratePP","number"],["Group Rate (₹)","groupRate","number"],["Min Pax","minPax","number"]],"Monument / Museum":[["Monument","activity","text"],["Foreign Rate (₹)","ratePP","number"],["Indian Rate (₹)","rateIndian","number"]]};const fields=FIELDS[vtype]||FIELDS.Hotel;return<div key={r.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:6,marginBottom:6}}>{fields.map(([l,k,t])=><div key={k}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>{t==="mealsel"?<select style={{...inp,fontSize:11}} value={r[k]||"CP"} onChange={e=>upd(k,e.target.value)}>{["EP","CP","MAP","AP"].map(m=><option key={m}>{m}</option>)}</select>:t==="mealtype"?<select style={{...inp,fontSize:11}} value={r[k]||"Lunch"} onChange={e=>upd(k,e.target.value)}>{["Breakfast","Lunch","Dinner","All Meals"].map(m=><option key={m}>{m}</option>)}</select>:t==="vehsel"?<select style={{...inp,fontSize:11}} value={r[k]||"Innova/SUV"} onChange={e=>upd(k,e.target.value)}>{["Sedan","Innova/SUV","Tempo Traveller","Mini Coach","Coach","Luxury Van"].map(v=><option key={v}>{v}</option>)}</select>:<input style={{...inp,textAlign:t==="number"?"right":"left",fontSize:11}} type={t} value={r[k]||""} onChange={e=>upd(k,e.target.value)}/>}</div>)}<span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"flex-end",paddingBottom:2}} onClick={()=>setRates(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div><input style={{...inp,fontSize:11}} value={r.notes||""} onChange={e=>upd("notes",e.target.value)} placeholder="Notes..."/></div>;})} <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setRates(p=>[...p,{id:Date.now(),season:"Oct–Mar",notes:""}])}>+ Add Rate</button></div>}
                  {tab==="ledger"&&(()=>{const ledger=getLedger(selected);const committed=ledger.filter(e=>["voucher","cash"].includes(e.paymentType||"cash")).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);const paid=ledger.filter(e=>e.paymentType==="cash"||e.paymentType==="settle").reduce((s,e)=>s+(parseFloat(e.amount)||0),0);const payable=ledger.filter(e=>e.paymentType==="voucher"&&!e.settled).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);return<div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[["Total Committed","₹ "+Math.round(committed).toLocaleString(),G.navy],["Total Paid","₹ "+Math.round(paid).toLocaleString(),"#059669"],["Outstanding","₹ "+Math.round(payable).toLocaleString(),payable>0?G.accent:"#059669"]].map(([l,v,c])=><div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div></div>)}</div>{ledger.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No transactions yet.</div>:ledger.map((e,i)=>{const ts=PT_STYLE[e.paymentType||"cash"]||PT_STYLE.cash;return<div key={i} style={{background:G.white,border:`1px solid ${e.paymentType==="voucher"&&!e.settled?"#FDE68A":G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ts.bg,color:ts.color,fontWeight:600}}>{ts.label}</span>{e.paymentType==="voucher"&&!e.settled&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>⚠ Payable</span>}{e.tourFileId&&<span style={{fontSize:10,color:G.navy,fontWeight:600,background:"#EBF5FB",padding:"2px 7px",borderRadius:10}}>📁 {e.tourFileId}</span>}<span style={{marginLeft:"auto",fontSize:13,fontWeight:700,color:G.navy}}>₹ {parseFloat(e.amount||0).toLocaleString()}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[["Tour File",e.tourFileId||"—"],["Client",e.clientName||"—"],["Sector",e.sector||"—"],["Date",e.date||"—"],["Mode",e.mode||"—"],["Reference",e.ref||"—"]].map(([l,v])=><div key={l}><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:1}}>{l}</div><div style={{fontSize:11,fontWeight:500}}>{v}</div></div>)}</div></div>;})}</div>;})()}
                </div>
              </>
            ):<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:G.gray400}}><div style={{fontSize:24,marginBottom:8}}>🏢</div><div style={{fontSize:13}}>Select a vendor</div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}


