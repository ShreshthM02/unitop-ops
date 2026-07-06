import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function AgentMaster({ agents, setAgents, queries, payments, onSaveAgent, onClose }) {
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [tab,setTab]=useState("profile");
  const [search,setSearch]=useState("");
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const TABS=[{id:"profile",label:"Profile"},{id:"history",label:"Query History"},{id:"ledger",label:"Financial Ledger"}];
  const agentQueries=a=>queries.filter(q=>q.agentCompany===a.company||q.agentId===a.id);
  const agentLedger=a=>agentQueries(a).map(q=>{const pt=payments[q.id];const tv=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);const rc=(pt?.entries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);return{queryId:q.id,tourFileId:q.tourFileId,group:q.groupName||q.clientName,sector:q.destination||q.sector||"—",travelDate:q.travelDate||"—",status:q.status,tourVal:tv,received:rc,balance:tv-rc,entries:pt?.entries||[]};});
  const filtered=agents.filter(a=>!search||a.company?.toLowerCase().includes(search.toLowerCase())||a.country?.toLowerCase().includes(search.toLowerCase()));
  const saveEdit=async()=>{
    if(form.id){
      setAgents(p=>p.map(a=>a.id===form.id?form:a));
      onSaveAgent && await onSaveAgent(form);
    }else{
      // Don't invent an id client-side -- agents.id is a real DB-generated
      // uuid. Save first, then use whatever id actually comes back.
      const saved = onSaveAgent ? await onSaveAgent(form) : {...form, id:"AGT-"+String(agents.length+1).padStart(3,"0")};
      setAgents(p=>[...p, saved]);
      setSelected(saved);
    }
    setEditing(false);
  };
  const inp={padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:900,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MASTER DATA</div><div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Agent & Client Repository</div></div>
          <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>{setForm({company:"",country:"",city:"",market:"",contactName:"",contactPhone:"",contactEmail:"",notes:""});setEditing(true);setSelected(null);}}>+ New Agent</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:240,borderRight:`1px solid ${G.gray200}`,overflowY:"auto",flexShrink:0,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${G.gray200}`}}><input style={{...inp,padding:"6px 9px"}} placeholder="Search agents..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <div style={{flex:1,overflowY:"auto"}}>{filtered.map(a=><div key={a.id} onClick={()=>{setSelected(a);setEditing(false);setTab("profile");}} style={{padding:"12px 14px",borderBottom:`1px solid ${G.gray100}`,cursor:"pointer",background:selected?.id===a.id?"#EBF5FB":G.white}}><div style={{fontSize:13,fontWeight:600}}>{a.company}</div><div style={{fontSize:11,color:G.gray400}}>{a.country}{a.market?" · "+a.market:""}</div><div style={{fontSize:10,color:G.gray400,marginTop:2}}>{agentQueries(a).length} queries</div></div>)}</div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {editing?(
              <div style={{flex:1,overflowY:"auto",padding:16}}>
                <div style={{fontSize:14,fontWeight:700,color:G.navy,marginBottom:14}}>{form.id?"Edit Agent":"New Agent"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Agency / Company Name</div><input style={inp} value={form.company||""} onChange={e=>setF("company",e.target.value)}/></div>
                  {[["Country","country"],["City","city"],["Market / Nationality","market"],["Contact Name","contactName"],["Contact Phone","contactPhone"],["Contact Email","contactEmail"]].map(([l,k])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)}/></div>)}
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div><textarea style={{...inp,minHeight:52,resize:"vertical"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
                </div>
                <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={()=>setEditing(false)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit}>Save Agent</button></div>
              </div>
            ):selected?(
              <>
                <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
                  {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 16px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Inter',sans-serif",background:"none",color:tab===t.id?G.accent:G.gray600,fontWeight:tab===t.id?600:400,borderBottom:`2px solid ${tab===t.id?G.accent:"transparent"}`}}>{t.label}</button>)}
                  <div style={{flex:1}}/><button className="btn btn-ghost" style={{fontSize:11,margin:"6px 12px"}} onClick={()=>{setForm({...selected});setEditing(true);}}>✏ Edit</button>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:16}}>
                  {tab==="profile"&&<div><div style={{background:G.gray50,borderRadius:10,padding:"14px 16px",marginBottom:14}}><div style={{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',serif",color:G.navy,marginBottom:4}}>{selected.company}</div><div style={{fontSize:12,color:G.gray600}}>{selected.country}{selected.city?" · "+selected.city:""}{selected.market?" · "+selected.market:""}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{[["Contact",selected.contactName],["Phone",selected.contactPhone],["Email",selected.contactEmail],["Total Queries",agentQueries(selected).length+" queries"]].map(([l,v])=><div key={l}><div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:500}}>{v||"—"}</div></div>)}</div>{selected.notes&&<div style={{marginTop:12,background:G.gray50,borderRadius:6,padding:"8px 10px",fontSize:12,color:G.gray600,borderLeft:`3px solid ${G.accent}`}}>{selected.notes}</div>}</div>}
                  {tab==="history"&&<div>{agentQueries(selected).length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No queries yet.</div>:agentQueries(selected).map(q=>{const pt=payments[q.id];const tv=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);const rc=(pt?.entries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);return<div key={q.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:tv>0?6:0}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{q.groupName||q.clientName}</div><div style={{fontSize:11,color:G.gray400}}>{q.id}{q.tourFileId?" · 📁"+q.tourFileId:""} · {q.destination||q.sector||"—"} · {q.travelDate||"—"}</div></div><StatusBadge status={q.status}/></div>{tv>0&&<div style={{display:"flex",gap:16,fontSize:11}}><span style={{color:G.navy}}>₹ {Math.round(tv).toLocaleString()}</span><span style={{color:"#059669"}}>Rcvd: ₹ {Math.round(rc).toLocaleString()}</span><span style={{color:G.accent,fontWeight:600}}>Bal: ₹ {Math.round(tv-rc).toLocaleString()}</span></div>}</div>;})}</div>}
                  {tab==="ledger"&&(()=>{const ledger=agentLedger(selected);const tv=ledger.reduce((s,r)=>s+r.tourVal,0);const rc=ledger.reduce((s,r)=>s+r.received,0);const bal=ledger.reduce((s,r)=>s+r.balance,0);return<div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[["Total Tour Value","₹ "+Math.round(tv).toLocaleString(),G.navy],["Total Received","₹ "+Math.round(rc).toLocaleString(),"#059669"],["Balance Due","₹ "+Math.round(bal).toLocaleString(),bal>0?G.accent:"#059669"]].map(([l,v,c])=><div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div></div>)}</div>{ledger.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No financial data yet.</div>:ledger.map((r,i)=><div key={r.queryId} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:G.navy}}>{r.tourFileId?"📁 "+r.tourFileId:r.queryId}</div><div style={{fontSize:11,color:G.gray600}}>{r.group} · {r.sector} · {r.travelDate}</div></div><StatusBadge status={r.status}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:r.entries.length?8:0}}>{[["Tour Value","₹ "+Math.round(r.tourVal).toLocaleString(),G.navy],["Received","₹ "+Math.round(r.received).toLocaleString(),"#059669"],["Balance","₹ "+Math.round(r.balance).toLocaleString(),r.balance>0?G.accent:"#059669"]].map(([l,v,c])=><div key={l} style={{textAlign:"center",background:G.gray50,borderRadius:6,padding:"6px"}}><div style={{fontSize:9,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div></div>)}</div>{r.entries.length>0&&<div style={{borderTop:`1px solid ${G.gray100}`,paddingTop:8}}>{r.entries.map((e,ei)=><div key={ei} style={{display:"flex",gap:10,fontSize:11,color:G.gray600,padding:"3px 0",borderBottom:`1px solid ${G.gray100}`}}><span style={{fontWeight:600,color:G.navy,flexShrink:0}}>{e.receipt||"—"}</span><span style={{fontWeight:600,color:"#059669"}}>₹ {parseFloat(e.amount||0).toLocaleString()}</span><span style={{color:G.gray400}}>{e.date||"—"} · {e.mode||"—"}</span></div>)}</div>}</div>)}</div>;})()}
                </div>
              </>
            ):<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:G.gray400}}><div style={{fontSize:24,marginBottom:8}}>🌐</div><div style={{fontSize:13}}>Select an agent to view details</div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VENDOR MASTER ────────────────────────────────────────────────────────────
