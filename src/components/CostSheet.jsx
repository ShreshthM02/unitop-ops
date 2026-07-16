import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadCostSheetVersions, saveCostSheetVersion, markCostSheetVersionFinal, logAudit, db } = Lib;

export function CostSheet({ query, onClose, onProceedToQuotation, currentUser, readOnly }) {
  const n = v => parseFloat(v)||0;
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [lastSavedCostSheetId, setLastSavedCostSheetId] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null); // which saved version is currently loaded into the draft, if any
  const [versionNote, setVersionNote] = useState(""); // one-line reason for this save -- "client requested discount", etc.

  // 10.1 Settings
  const [gst,    setGst]    = useState(5);
  const [markup, setMarkup] = useState(20);
  const [roe,    setRoe]    = useState(90);
  const [currency, setCurrency] = useState("US $");
  // Tour Facilitator (10.1.1) — lumpsum or PP toggle
  const [tlMode,  setTlMode]  = useState("lumpsum"); // "lumpsum" | "pp"
  const [tlCost,  setTlCost]  = useState("");
  // Monument (10.1.3) — separate, lumpsum or PP
  const [monMode,  setMonMode]  = useState("pp");
  const [monuments, setMonuments] = useState([]); // start empty — user adds as needed
  const [monExtra,  setMonExtra]  = useState(""); // extra misc monument cost -- blank by default, shows "0" only as a placeholder hint; n() already treats blank as 0 in calculations
  // Misc — separate, lumpsum or PP
  const [miscMode, setMiscMode] = useState("pp");
  const [miscCost, setMiscCost] = useState("");

  // 10.2 Day rows
  const [days, setDays] = useState([
    { id:1, day:"Day 1", date:"", movement:"", mealPlan:"D",    mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:2, day:"Day 2", date:"", movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:3, day:"Day 3", date:"", movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:4, day:"Day 4", date:"", movement:"", mealPlan:"B/L",  mealCost:"", hotel:"Departure",    hotelPlan:"",   hotelNetPP:"", singleSupp:"", notes:"" },
  ]);

  // 10.3 Transport rows
  const [transports, setTransports] = useState([
    { id:1, sector:"", vehicleType:"Large Coach", cost:"", slabs:[], notes:"" },
  ]);
  const [extras, setExtras] = useState([]);
  const updateExtra = (i,f,v) => setExtras(p=>p.map((e,idx)=>idx===i?{...e,[f]:v}:e));

  // Local Handler(s) — third-party ground operator/DMC per sector. Optional:
  // starts empty, only appears in totals/output once at least one is added
  // (same "add only if needed" pattern as Extra Services). Multiple entries
  // supported since a multi-sector tour can have a different local handler
  // per sector, each with its own per-pax/lumpsum cost.
  const [localHandlers, setLocalHandlers] = useState([]);
  const updateLocalHandler = (i,f,v) => setLocalHandlers(p=>p.map((h,idx)=>idx===i?{...h,[f]:v}:h));
  const addLocalHandler = () => setLocalHandlers(p=>[...p,{id:Date.now(),sector:"",dateFrom:"",dateTo:"",mode:"pp",cost:"",singleSupp:"",remarks:""}]);
  const removeLocalHandler = i => setLocalHandlers(p=>p.filter((_,idx)=>idx!==i));

  // 10.4 Slabs
  const [slabs, setSlabs] = useState([
    { id:1, label:"15–19 pax + 1 FOC", foc:15, vehicle:"Large Coach" },
    { id:2, label:"10–14 pax + 1 FOC", foc:10, vehicle:"Mini Bus" },
  ]);

  // Load previously saved versions for this tour file on mount. Continues
  // editing from the latest saved version rather than starting blank every
  // time the Cost Sheet is reopened -- versions[] itself becomes real
  // history instead of resetting to empty on every open.
  const loadVersionIntoDraft = (v) => {
    setGst(v.gst); setMarkup(v.markup); setRoe(v.roe); setCurrency(v.currency);
    setTlMode(v.tlMode); setTlCost(v.tlCost);
    setMiscMode(v.miscMode); setMiscCost(v.miscCost);
    setMonMode(v.monMode); setMonExtra(v.monExtra); setMonuments(v.monuments);
    setDays(v.days); setTransports(v.transports); setSlabs(v.slabs);
    setLocalHandlers(v.localHandlers); setExtras(v.extras);
    setViewingVersion(v.version);
  };

  useEffect(() => {
    loadCostSheetVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) return;
      setVersions(loaded);
      setVersion(Math.max(...loaded.map(v => v.version)) + 1);
      const finalV = loaded.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
    });
  }, [query.id]);

  const updateDay = (i,f,v) => setDays(p=>p.map((d,idx)=>idx===i?{...d,[f]:v}:d));
  const addDay = () => setDays(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",mealPlan:"B/L/D",mealCost:"",hotel:"",hotelAlt:"",hotelPlan:"CP",hotelNetPP:"",singleSupp:"",notes:""}]);
  const removeDay = i => setDays(p=>p.filter((_,idx)=>idx!==i));

  const updateTransport = (i,f,v) => setTransports(p=>p.map((t,idx)=>idx===i?{...t,[f]:v}:t));
  const toggleTransportSlab = (ti, slabId) => setTransports(p=>p.map((t,idx)=>{
    if(idx!==ti) return t;
    const slabs = t.slabs.includes(slabId) ? t.slabs.filter(s=>s!==slabId) : [...t.slabs, slabId];
    return {...t, slabs};
  }));
  const addTransport = () => setTransports(p=>[...p,{id:Date.now(),sector:"",vehicleType:"Large Coach",cost:"",slabs:[],notes:""}]);
  const removeTransport = i => setTransports(p=>p.filter((_,idx)=>idx!==i));

  const updateSlab = (i,f,v) => setSlabs(p=>p.map((s,idx)=>idx===i?{...s,[f]:v}:s));
  const addSlab = () => setSlabs(p=>[...p,{id:Date.now(),label:"New Slab",foc:15,vehicle:"Large Coach"}]);

  const toggleMonument = i => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,include:!m.include}:m));
  const updateMonument = (i,f,v) => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,[f]:v}:m));

  // Totals
  const totMeal    = days.reduce((s,d)=>s+n(d.mealCost),0);
  const totHotel   = days.reduce((s,d)=>s+n(d.hotelNetPP),0);
  const totSS      = days.reduce((s,d)=>s+n(d.singleSupp),0) + localHandlers.reduce((s,h)=>s+n(h.singleSupp),0);
  const monTotal   = monuments.filter(m=>m.include).reduce((s,m)=>s+n(m.fee),0) + n(monExtra);

  const calcSlab = (slab) => {
    // Transport for this slab
    const tptTotal = transports.filter(t=>t.slabs.includes(slab.id)).reduce((s,t)=>s+n(t.cost),0);
    const tptPP = slab.foc > 0 ? tptTotal / slab.foc : 0;
    // TL/Facilitator
    const tlPP = tlMode==="pp" ? n(tlCost) : (slab.foc>0 ? n(tlCost)/slab.foc : 0);
    // Misc
    const miscPP = miscMode==="pp" ? n(miscCost) : (slab.foc>0 ? n(miscCost)/slab.foc : 0);
    // Monument
    const monPP = monMode==="pp" ? monTotal : (slab.foc>0 ? monTotal/slab.foc : 0);
    // Local handler(s) — each entry can independently be per-pax or lumpsum
    const localPP = localHandlers.reduce((s,h) => s + (h.mode==="pp" ? n(h.cost) : (slab.foc>0 ? n(h.cost)/slab.foc : 0)), 0);
    // Extra services — "PP" is already per-pax; Lumpsum/Per Vehicle/Per
    // Group are all a single total cost for the group, divided across
    // paying pax the same way local handler lumpsum costs are.
    const extrasPP = extras.reduce((s,e) => s + (e.mode==="PP" ? n(e.cost) : (slab.foc>0 ? n(e.cost)/slab.foc : 0)), 0);

    const sub = totHotel + totMeal + tptPP + tlPP + miscPP + monPP + localPP + extrasPP;
    const tax = Math.round(sub * gst/100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup/100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = Math.ceil(sellingINR / roe);
    // Single supplement
    const ssFX = Math.ceil(((totSS + totSS*gst/100) * (1 + markup/100)) / roe);
    return { tptTotal, tptPP:Math.round(tptPP), tlPP:Math.round(tlPP), miscPP:Math.round(miscPP), monPP:Math.round(monPP), localPP:Math.round(localPP), extrasPP:Math.round(extrasPP), sub:Math.round(sub), tax, afterTax:Math.round(afterTax), markupAmt, sellingINR:Math.round(sellingINR), finalFX, ssFX };
  };

  const saveVersion = () => {
    const snap = { version, date:new Date().toLocaleString("en-IN"), slabs:[...slabs], days:[...days], transports:[...transports], gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra, monuments:[...monuments], localHandlers:[...localHandlers], extras:[...extras], note: versionNote };
    setVersions(p=>[...p.filter(v=>v.version!==version), snap]);
    saveCostSheetVersion(db, query.id, snap, currentUser?.id).then(id => { if (id) setLastSavedCostSheetId(id); });
    logAudit(db, query.id, currentUser?.name, `Cost Sheet v${version} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(version);
    setVersionNote("");
    setVersion(v=>v+1);
  };

  const inp = {padding:"4px 6px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const secH = (t,icon) => <div style={{background:G.navy,color:"#fff",padding:"5px 10px",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:"0.5px",margin:"14px 0 8px",display:"flex",alignItems:"center",gap:6}}><span>{icon}</span>{t}</div>;
  const modeBtn = (cur,val,label,setter) => (
    <button onClick={()=>setter(val)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${cur===val?G.accent:G.gray200}`,background:cur===val?"#FDEDEC":G.white,color:cur===val?G.accent:G.gray600,fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:cur===val?600:400}}>{label}</button>
  );

  const hasFinalPrice = slabs.length > 0 && calcSlab(slabs[0]).finalFX > 0;

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:960,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>COST SHEET · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <div style={{fontSize:16,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName||query.agentCompany}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · {query.sector||query.destination||""}</div>
          </div>
          {/* Version trail */}
          {versions.length > 0 && (
            <div style={{display:"flex",gap:4}}>
              {versions.map(v=>(
                <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                  <div onClick={()=>loadVersionIntoDraft(v)} title={v.note||`View v${v.version}`}
                    style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                    v{v.version}
                  </div>
                  <div onClick={()=>{if(readOnly)return;setFinalVersion(v.version);markCostSheetVersionFinal(db,query.id,v.version);logAudit(db,query.id,currentUser?.name,`Cost Sheet v${v.version} marked final`);}} title="Mark as final"
                    style={{padding:"3px 6px",background:finalVersion===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                    {finalVersion===v.version?"★":"☆"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>

        {readOnly && (
          <div style={{background:"#FEF3C7",borderBottom:"1px solid #FCD34D",padding:"8px 18px",fontSize:12,color:"#92400E",flexShrink:0}}>
            🔒 This tour file is cancelled — viewing only, nothing here is editable.
          </div>
        )}

        <fieldset disabled={readOnly} style={{flex:1,overflowY:"auto",padding:"14px 18px",border:"none",margin:0,minWidth:0}}>

          {/* 10.1 Settings */}
          {secH("Settings","⚙")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:10}}>
            {[["GST %",gst,setGst],["Markup %",markup,setMarkup],["ROE (₹/unit)",roe,setRoe]].map(([l,v,s])=>(
              <div key={l}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                <input style={{...inp,textAlign:"right"}} type="number" value={v} onChange={e=>s(Number(e.target.value))}/></div>
            ))}
            <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Currency</div>
              <select style={inp} value={currency} onChange={e=>setCurrency(e.target.value)}>
                {["US $","EUR","GBP","AUD","SGD","NTD","THB","INR","Other"].map(c=><option key={c}>{c}</option>)}
              </select></div>
          </div>

          {/* TL / Tour Facilitator */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Tour Facilitator Cost</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(tlMode,"lumpsum","Lumpsum",setTlMode)}
                {modeBtn(tlMode,"pp","Per Person",setTlMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder={tlMode==="lumpsum"?"Total cost":"Per person"} value={tlCost} onChange={e=>setTlCost(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Miscellaneous Cost</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(miscMode,"lumpsum","Lumpsum",setMiscMode)}
                {modeBtn(miscMode,"pp","Per Person",setMiscMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder="Cost" value={miscCost} onChange={e=>setMiscCost(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Monument Fees Mode</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(monMode,"lumpsum","Lumpsum",setMonMode)}
                {modeBtn(monMode,"pp","Per Person",setMonMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder="Extra misc monument" value={monExtra} onChange={e=>setMonExtra(e.target.value)}/>
            </div>
          </div>

          {/* ── Monuments / Activities ── */}
          {secH("Monuments / Activities","🏛")}
          <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:10}}>
            {monuments.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <input style={{...inp,flex:2}} value={m.name} onChange={e=>updateMonument(i,"name",e.target.value)} placeholder="e.g. Taj Mahal entry"/>
                <input style={{...inp,width:80,textAlign:"right"}} type="number" value={m.fee} onChange={e=>updateMonument(i,"fee",e.target.value)} placeholder="0"/>
                <span style={{fontSize:10,color:G.gray400}}>₹</span>
                <span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>setMonuments(p=>p.filter((_,idx)=>idx!==i))}>✕</span>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11,marginTop:2}} onClick={()=>setMonuments(p=>[...p,{name:"",fee:0,include:true}])}>+ Add Monument / Activity</button>
            {monuments.length>0 && (
              <div style={{marginTop:8,fontSize:11,color:G.navy,fontWeight:600}}>
                Total: ₹ {monTotal.toLocaleString()} ({monMode==="pp"?"per person":"lumpsum"})
              </div>
            )}
          </div>

          {/* 10.2 Day rows */}
          {secH("Day-wise Itinerary & Accommodation","📅")}
          <div style={{overflowX:"auto",marginBottom:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:820}}>
              <thead>
                <tr style={{background:G.gray50}}>
                  {["Day","Date","Movement","Meal Plan","Meal Cost","Hotel Name","Alt Hotel","Plan","Net PP","Sngl Supp","Notes",""].map(h=>(
                    <th key={h} style={{padding:"5px 4px",fontSize:10,fontWeight:600,color:G.gray600,borderBottom:`1px solid ${G.gray200}`,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d,i)=>(
                  <tr key={d.id} style={{background:i%2===0?G.white:G.gray50}}>
                    <td style={{padding:"2px 3px",width:48}}><input style={{...inp,width:44,textAlign:"center"}} value={d.day} onChange={e=>updateDay(i,"day",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",width:100}}><input style={{...inp,fontSize:10}} type="date" value={d.date||""} onChange={e=>updateDay(i,"date",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",minWidth:130}}><input style={inp} value={d.movement} onChange={e=>updateDay(i,"movement",e.target.value)} placeholder="Movement / destination"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"center"}} value={d.mealPlan} onChange={e=>updateDay(i,"mealPlan",e.target.value)} placeholder="B/L/D"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.mealCost} onChange={e=>updateDay(i,"mealCost",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",minWidth:110}}><input style={inp} value={d.hotel} onChange={e=>updateDay(i,"hotel",e.target.value)} placeholder="Primary hotel"/></td>
                    <td style={{padding:"2px 3px",minWidth:90}}><input style={{...inp,fontSize:10}} value={d.hotelAlt} onChange={e=>updateDay(i,"hotelAlt",e.target.value)} placeholder="Alt hotel"/></td>
                    <td style={{padding:"2px 3px",width:52}}>
                      <select style={{...inp,padding:"3px 2px"}} value={d.hotelPlan} onChange={e=>updateDay(i,"hotelPlan",e.target.value)}>
                        {["","EP","CP","MAP","AP"].map(p=><option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.hotelNetPP} onChange={e=>updateDay(i,"hotelNetPP",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.singleSupp} onChange={e=>updateDay(i,"singleSupp",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",minWidth:70}}><input style={inp} value={d.notes} onChange={e=>updateDay(i,"notes",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",width:20,textAlign:"center"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>removeDay(i)}>✕</span></td>
                  </tr>
                ))}
                <tr style={{background:G.gray100,fontWeight:700}}>
                  <td colSpan={3} style={{padding:"5px 4px",fontSize:11,color:G.gray600}}>TOTALS</td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{totMeal>0?`₹ ${totMeal.toLocaleString()}`:"—"}</td>
                  <td colSpan={3}></td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{totHotel>0?`₹ ${totHotel.toLocaleString()}`:"—"}</td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{totSS>0?`₹ ${totSS.toLocaleString()}`:"—"}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={addDay}>+ Add Day</button>

          {/* 10.3 Transport */}
          {secH("Transport","🚌")}
          {transports.map((t,ti)=>(
            <div key={t.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Sector / Route</div>
                  <input style={inp} value={t.sector} onChange={e=>updateTransport(ti,"sector",e.target.value)} placeholder="e.g. Delhi–Agra–Jaipur circuit"/></div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vehicle Type</div>
                  <select style={inp} value={t.vehicleType} onChange={e=>updateTransport(ti,"vehicleType",e.target.value)}>
                    {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                  </select>
                  {t.vehicleType==="Others" && <input style={{...inp,marginTop:4}} value={t.vehicleOther||""} onChange={e=>updateTransport(ti,"vehicleOther",e.target.value)} placeholder="Specify vehicle type..."/>}
                  </div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                  <input style={{...inp,textAlign:"right"}} type="number" value={t.cost} onChange={e=>updateTransport(ti,"cost",e.target.value)} placeholder="0"/></div>
                <div style={{display:"flex",alignItems:"flex-end"}}>
                  <span style={{cursor:"pointer",color:G.gray400,fontSize:16,paddingBottom:4}} onClick={()=>removeTransport(ti)}>✕</span>
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Include in Slabs (cost divided by paying pax in selected slabs)</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {slabs.map(s=>(
                    <label key={s.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",padding:"3px 8px",borderRadius:10,
                      background:t.slabs.includes(s.id)?"#DBEAFE":"#F3F4F6",color:t.slabs.includes(s.id)?"#1E40AF":G.gray600}}>
                      <input type="checkbox" checked={t.slabs.includes(s.id)} onChange={()=>toggleTransportSlab(ti,s.id)} style={{accentColor:G.accent}}/>
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Notes</div>
                <input style={inp} value={t.notes} onChange={e=>updateTransport(ti,"notes",e.target.value)} placeholder="Any notes on this transport segment"/></div>
            </div>
          ))}
          <button className="btn btn-ghost" style={{fontSize:11,marginBottom:4}} onClick={addTransport}>+ Add Transport</button>

          {/* ── Local Handler(s) ── */}
          {secH("Local Handler","🤝")}
          <div style={{marginBottom:8}}>
            {localHandlers.map((h,hi)=>(
              <div key={h.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Sector</div>
                    <input style={inp} value={h.sector} onChange={e=>updateLocalHandler(hi,"sector",e.target.value)} placeholder="e.g. Bodhgaya / Rajgir"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>From</div>
                    <input style={inp} type="date" value={h.dateFrom} max={h.dateTo||undefined} onChange={e=>updateLocalHandler(hi,"dateFrom",e.target.value)}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>To</div>
                    <input style={inp} type="date" value={h.dateTo} min={h.dateFrom||undefined} onChange={e=>updateLocalHandler(hi,"dateTo",e.target.value)}/>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <span style={{cursor:"pointer",color:G.gray400,fontSize:16}} onClick={()=>removeLocalHandler(hi)}>✕</span>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                    <div style={{display:"flex",gap:4}}>
                      <input style={{...inp,textAlign:"right"}} type="number" value={h.cost} onChange={e=>updateLocalHandler(hi,"cost",e.target.value)} placeholder="0"/>
                      {modeBtn(h.mode,"pp","PP",v=>updateLocalHandler(hi,"mode",v))}
                      {modeBtn(h.mode,"lumpsum","Lump",v=>updateLocalHandler(hi,"mode",v))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Single Supp. (₹)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={h.singleSupp} onChange={e=>updateLocalHandler(hi,"singleSupp",e.target.value)} placeholder="0"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Remarks</div>
                    <input style={inp} value={h.remarks} onChange={e=>updateLocalHandler(hi,"remarks",e.target.value)} placeholder="Any notes on this handler/sector"/>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={addLocalHandler}>+ Add Local Handler</button>
          </div>

          {/* ── Extra Services ── */}
          {secH("Extra Services","✨")}
          <div style={{marginBottom:8}}>
            {extras.map((e,ei)=>(
              <div key={e.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Service Description</div>
                    <input style={inp} value={e.description} onChange={ev=>updateExtra(ei,"description",ev.target.value)} placeholder="e.g. Boat ride at Varanasi, Cultural show, Camel ride..."/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={e.cost} onChange={ev=>updateExtra(ei,"cost",ev.target.value)} placeholder="0"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Mode</div>
                    <select style={inp} value={e.mode} onChange={ev=>updateExtra(ei,"mode",ev.target.value)}>
                      {["PP","Lumpsum","Per Vehicle","Per Group"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <span style={{cursor:"pointer",color:G.gray400,fontSize:16}} onClick={()=>setExtras(p=>p.filter((_,idx)=>idx!==ei))}>✕</span>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setExtras(p=>[...p,{id:Date.now(),description:"",cost:"",mode:"PP"}])}>+ Add Extra Service</button>
          </div>

          {/* 10.4 Slabs */}
          {secH("Group Size Slabs","👥")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:8}}>
            {slabs.map((s,i)=>(
              <div key={s.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:600,color:G.gray600}}>Slab {i+1}</span>
                  {slabs.length>1&&<span style={{cursor:"pointer",color:G.gray400,fontSize:12}} onClick={()=>setSlabs(p=>p.filter((_,idx)=>idx!==i))}>✕</span>}
                </div>
                <div style={{marginBottom:6}}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Label (shown in final price)</div>
                  <input style={inp} value={s.label} onChange={e=>updateSlab(i,"label",e.target.value)}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>FOC (N paying)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={s.foc} onChange={e=>updateSlab(i,"foc",Number(e.target.value))}/></div>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vehicle (label only)</div>
                    <select style={inp} value={s.vehicle} onChange={e=>updateSlab(i,"vehicle",e.target.value)}>
                      {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                    </select>
                    {s.vehicle==="Others" && <input style={{...inp,marginTop:4}} value={s.vehicleOther||""} onChange={e=>updateSlab(i,"vehicleOther",e.target.value)} placeholder="Specify..."/>}
                    </div>
                </div>
              </div>
            ))}
            <div style={{border:`1px dashed ${G.gray200}`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:100,color:G.gray400,fontSize:12}} onClick={addSlab}>+ Add Slab</div>
          </div>

          {/* 10.5 Final price summary */}
          {secH("Final Price Summary","💰")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Accommodation (per pax)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totHotel).toLocaleString()}</div>
            </div>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Extra Meals (per pax)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totMeal).toLocaleString()}</div>
            </div>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Single Supplement (total)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totSS).toLocaleString()}</div>
            </div>
          </div>
          <div style={{fontSize:10,color:G.gray400,marginBottom:8}}>Accommodation and Extra Meals are the same across every slab below (from the day-wise section), shown once here rather than repeated in each row. Everything else below varies by slab, since it's split across each slab's own paying-pax count.</div>
          <div style={{overflowX:"auto",marginBottom:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:760}}>
              <thead>
                <tr style={{background:G.navy}}>
                  {["Slab","Transport PP","TL/Facil. PP","Misc PP","Mon. PP","Local Hdlr PP","Extras PP","Sub-total","GST","After Tax","Markup","Selling ₹","Final Price","SS"].map(h=>(
                    <th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:h==="Slab"?"left":"right",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slabs.map((s,i)=>{
                  const c = calcSlab(s);
                  return (
                    <tr key={s.id} style={{background:i%2===0?G.white:G.gray50}}>
                      <td style={{padding:"7px 6px",fontWeight:500,fontSize:11}}>{s.label}<br/><span style={{fontSize:9,color:G.gray400}}>{s.vehicle}</span></td>
                      {[c.tptPP,c.tlPP,c.miscPP,c.monPP,c.localPP,c.extrasPP,c.sub,c.tax,c.afterTax,c.markupAmt,c.sellingINR].map((v,j)=>(
                        <td key={j} style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{v>0?`₹ ${Math.round(v).toLocaleString()}`:"—"}</td>
                      ))}
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:13,fontWeight:700,color:G.navy}}>{c.finalFX>0?`${currency} ${c.finalFX}`:"—"}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:G.accent,fontWeight:600}}>{c.ssFX>0?`${currency} ${c.ssFX}`:"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10,color:G.gray400,fontStyle:"italic"}}>
            SS = cumulative single supplement from hotel day rows (editable). Final price rounded up to nearest whole unit.
          </div>
        </fieldset>

        <div style={{padding:"12px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50,alignItems:"center"}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <input value={versionNote} onChange={e=>setVersionNote(e.target.value)} placeholder="Why this version? e.g. client requested discount"
            disabled={readOnly}
            style={{flex:1,padding:"7px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost">💾 Save v{version}</button>}
          {!readOnly && hasFinalPrice && (
            <button className="btn btn-success" onClick={()=>onProceedToQuotation(lastSavedCostSheetId)}>
              📋 Proceed to Quotation →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── SERVICES LIST (proper component so useState is legal) ───────────────────
