import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, formatDateDMY } = Lib;
import { DocRegistryInline } from './DocumentRegistry.jsx';
import { ServicesList } from './ServicesList.jsx';
import PricingTimeline from './PricingTimeline.jsx';

export default function QueryDrawerWithQuote({ query, onClose, onConvert, onAdvance, onGenerateQuote, onToggleWF, onCancel, currentUser, onUpdateRemarks, onUpdateQuery, tourExecution, onUpdateTourExecution, vendors, staff }) {
  const isCaseFile   = !!query.tourFileId;
  const assignedUser = (staff || USERS).find(u=>u.id===query.assignedTo);
  const doneByStatus = STATUS_WF_MAP[query.status]||[];
  const manualDone   = query.manualWF||[];
  const allDone      = [...new Set([...doneByStatus,...manualDone])];
  const canAdvance   = query.status!=="completed"&&!query.cancelled;
  const nextStatusMap= {new_query:"costing",costing:"operations",operations:"finance",finance:"completed"};
  const [tab, setTab]       = useState("info");
  const [remark, setRemark] = useState("");
  const [editingQuery, setEditingQuery] = useState(false);
  const [editForm, setEditForm] = useState({...query});
  const [showUploadsInline, setShowUploadsInline] = useState(false);
  const [infoSubTab, setInfoSubTab] = useState("details");
  const blankTE = { queryId: query.id, days: [], facilitators: [], localHandlers: [], flights: [], arrFlightDetails: "", depFlightDetails: "", transporterVendorId: "", transporterNotes: "" };
  const [te, setTe] = useState(tourExecution || blankTE);
  useEffect(() => { setTe(tourExecution || blankTE); }, [query.id]); // resync working copy if the drawer is opened for a different tour
  const teDirty = JSON.stringify(te) !== JSON.stringify(tourExecution || blankTE);
  const saveTE = () => onUpdateTourExecution && onUpdateTourExecution(query.id, te);
  const setTeField = (k, v) => setTe(p => ({ ...p, [k]: v }));
  const updDay = (i, f, v) => setTe(p => ({ ...p, days: p.days.map((d, xi) => xi === i ? { ...d, [f]: v } : d) }));
  const addDay = () => setTe(p => ({ ...p, days: [...p.days, { id: Date.now(), dayLabel: `Day ${p.days.length + 1}`, date: "", route: "", hotelName: "", rooms: "", notes: "" }] }));
  const rmDay = (i) => setTe(p => ({ ...p, days: p.days.filter((_, xi) => xi !== i) }));
  const updList = (listKey, i, f, v) => setTe(p => ({ ...p, [listKey]: p[listKey].map((x, xi) => xi === i ? { ...x, [f]: v } : x) }));
  const addToList = (listKey, blank) => setTe(p => ({ ...p, [listKey]: [...p[listKey], { id: Date.now(), ...blank }] }));
  const rmFromList = (listKey, i) => setTe(p => ({ ...p, [listKey]: p[listKey].filter((_, xi) => xi !== i) }));
  const teInp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };
  const activeFacilitatorVendors = (vendors||[]).filter(v=>v.type==="Tour Facilitator"&&v.active!==false);
  const activeLocalHandlerVendors = (vendors||[]).filter(v=>v.type==="Local Handler"&&v.active!==false);
  const activeTransportVendors = (vendors||[]).filter(v=>v.type==="Transport"&&v.active!==false);
  const setEF = (k,v) => setEditForm(p=>({...p,[k]:v}));

  // Tabs: query vs tour file, order per spec
  const TABS = isCaseFile
    ? [{id:"info",label:"ℹ Info"},{id:"progress",label:`✅ ${allDone.length}/17`},{id:"docs",label:"📋 Docs"},{id:"pricing",label:"💹 Pricing"},{id:"services",label:"🧳 Services"},{id:"finance",label:"💰 Finance"},{id:"audit",label:"📜 Audit"},{id:"remarks",label:"💬 Remarks"}]
    : [{id:"info",label:"ℹ Info"},{id:"progress",label:`✅ ${allDone.length}/17`},{id:"docs",label:"📋 Docs"},{id:"pricing",label:"💹 Pricing"},{id:"audit",label:"📜 Audit"},{id:"remarks",label:"💬 Remarks"}];

  const sec = t => (
    <div style={{fontSize:10,fontWeight:700,color:G.gray400,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10,paddingBottom:6,borderBottom:`1px solid ${G.gray100}`}}>{t}</div>
  );

  const openPanel = (panel) => document.dispatchEvent(new CustomEvent("unitop-open",{detail:{panel,query}}));

  const addRemark = () => {
    if(!remark.trim()) return;
    const now = new Date().toLocaleString("en-IN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    onUpdateRemarks && onUpdateRemarks(query.id, {by:currentUser.name, at:now, text:remark.trim()});
    setRemark("");
  };

  // Docs available: query = cost sheet + quotation only; tour file = all
  const queryDocs = [
    {icon:"📊",label:"Cost Sheet",    panel:"costsheet"},
    {icon:"📋",label:"Quotation",     panel:"quotation"},
  ];
  const caseFileDocs = [
    {icon:"📊",label:"Cost Sheet",        panel:"costsheet"},
    {icon:"🗺", label:"Itinerary",         panel:"itinerary"},
    {icon:"📋",label:"Quotation",         panel:"quotation"},
    {icon:"🧾",label:"Proforma Inv.",     panel:"proforma"},
    {icon:"₹", label:"Payments",          panel:"payments"},
    {icon:"🧾",label:"Tax Invoice",       panel:"taxinv"},
    {icon:"🎫",label:"Exchange Orders",   panel:"voucher"},
    {icon:"📋",label:"Tour Briefing Sheet",panel:"tourbriefing"},
    {icon:"🍽",label:"Meal Plan",         panel:"mealplan"},
    {icon:"📁",label:"Uploads",            panel:"docregistry"},
  ];
  const docs = isCaseFile ? caseFileDocs : queryDocs;

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="drawer" style={{width:520}}>

        {/* Header */}
        <div className="drawer-head">
          <div style={{flex:1}}>
            <div className="drawer-id">{isCaseFile?`📁 ${query.tourFileId} · `:""}{query.id}</div>
            <div className="drawer-name">{query.clientName||query.groupName||query.agentCompany}</div>
            <div className="drawer-dest">
              {query.destination||query.sector||""}
              {query.nights?` · ${query.nights}N`:""}
              {query.pax?` · ${query.paxDisplay||query.pax+" pax"}`:""}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",padding:"4px 10px"}}>✕</button>
            <StatusBadge status={query.status}/>
          </div>
        </div>

        {/* Tour file banner */}
        {isCaseFile&&(
          <div style={{background:"linear-gradient(135deg,#0D1B2A,#1A3A52)",padding:"8px 20px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>📁</span>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{query.tourFileId}</div>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginLeft:"auto"}}>Tour File</span>
          </div>
        )}

        {/* Tab bar */}
        <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,background:G.white,overflowX:"auto",flexShrink:0}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"9px 12px",fontSize:11,fontWeight:tab===t.id?600:400,cursor:"pointer",whiteSpace:"nowrap",
                color:tab===t.id?G.accent:G.gray600,background:"none",border:"none",
                borderBottom:`2px solid ${tab===t.id?G.accent:"transparent"}`,
                fontFamily:"'Inter',sans-serif",transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">

          {/* ── INFO ── */}
          {tab==="info"&&(
            <div>
              {isCaseFile && (
                <div style={{display:"flex",gap:2,marginBottom:14,background:G.gray50,borderRadius:8,padding:3}}>
                  {[["details","Query Details"],["itinerary","Day-wise Itinerary"],["hotels","Day-wise Hotels"],["others","Others"]].map(([id,label])=>(
                    <button key={id} onClick={()=>setInfoSubTab(id)}
                      style={{flex:1,padding:"6px 8px",borderRadius:6,border:"none",cursor:"pointer",
                        background:infoSubTab===id?G.white:"transparent",color:infoSubTab===id?G.navy:G.gray400,
                        fontSize:10.5,fontWeight:infoSubTab===id?600:400,fontFamily:"'Inter',sans-serif",
                        boxShadow:infoSubTab===id?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {(!isCaseFile || infoSubTab==="details") && (
              editingQuery ? (
                <div>
                  {sec("Edit Query Details")}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    {[
                      ["Foreign Agency","agentCompany","text"],
                      ["Correspondent","correspondent","text"],
                      ["Group Name","groupName","text"],
                      ["Nationality","nationality","text"],
                      ["Sector / Circuit","sector","text"],
                      ["Nights","nights","number"],
                    ].map(([label,key,type])=>(
                      <div key={key}>
                        <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{label}</div>
                        <input style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                          type={type} value={editForm[key]||""} onChange={e=>setEF(key,e.target.value)}/>
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Hotel Category</div>
                      <select style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                        value={editForm.hotelCat||""} onChange={e=>setEF("hotelCat",e.target.value)}>
                        {["Budget","2 Star","3 Star","4 Star","5 Star","Heritage","Luxury","Mixed","Temple","Hybrid (Hotel + Temple)"].map(h=><option key={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Assigned To</div>
                      <select style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                        value={editForm.assignedTo||""} onChange={e=>setEF("assignedTo",e.target.value)}>
                        <option value="">Unassigned</option>
                        {(staff||USERS).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Travel Date</div>
                      <input style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                        type="date" value={editForm.travelDate||""} onChange={e=>setEF("travelDate",e.target.value)}/>
                    </div>
                    <div style={{gridColumn:"1/-1"}}>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Date Display / Period</div>
                      <input style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                        value={editForm.dateDisplay||""} onChange={e=>setEF("dateDisplay",e.target.value)} placeholder="e.g. 15 Oct – 22 Oct 2025"/>
                    </div>
                    <div style={{gridColumn:"1/-1"}}>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Pax Display</div>
                      <input style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800}}
                        value={editForm.paxDisplay||""} onChange={e=>setEF("paxDisplay",e.target.value)} placeholder="e.g. 18 pax (confirmed)"/>
                    </div>
                    <div style={{gridColumn:"1/-1"}}>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Special Notes</div>
                      <textarea style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,minHeight:52,resize:"vertical"}}
                        value={editForm.notes||""} onChange={e=>setEF("notes",e.target.value)}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-ghost" onClick={()=>{setEditingQuery(false);setEditForm({...query});}}>Cancel</button>
                    <button className="btn btn-primary" onClick={()=>{
                      onUpdateQuery && onUpdateQuery(query.id, editForm);
                      setEditingQuery(false);
                    }}>Save Changes</button>
                  </div>
                </div>
              ) : (
                <div>
                  {sec("Query Details")}
                  <div className="info-grid">
                    <div className="info-item"><label>Status</label><StatusBadge status={query.status}/></div>
                    <div className="info-item"><label>Source</label><span style={{color:SOURCE_COLORS[query.source]||G.gray600}}>● {query.source}{query.sourceOther?" ("+query.sourceOther+")":""}</span></div>
                    <div className="info-item"><label>Foreign Agency</label><span>{query.agentCompany||"—"}</span></div>
                    <div className="info-item"><label>Correspondent</label><span>{query.correspondent||"—"}</span></div>
                    <div className="info-item"><label>Group / Client</label><span>{query.groupName||query.clientName||"—"}</span></div>
                    <div className="info-item"><label>Nationality</label><span>{query.nationality||"—"}</span></div>
                    <div className="info-item"><label>Pax</label><span>{query.paxDisplay||(query.pax?`${query.pax} pax`:"TBC")}</span></div>
                    <div className="info-item"><label>Nights</label><span>{query.nights?`${query.nights}N`:"—"}</span></div>
                    <div className="info-item" style={{gridColumn:"1/-1"}}><label>Travel Period</label><span>{query.dateDisplay||formatDateDMY(query.travelDate)||"TBC"}</span></div>
                    <div className="info-item"><label>Hotel Category</label><span>{query.hotelCat||"—"}</span></div>
                    <div className="info-item"><label>Assigned To</label>
                      <span style={{display:"flex",alignItems:"center",gap:6}}>
                        {assignedUser&&<Avatar user={assignedUser} size={18}/>}{assignedUser?.name||"—"}
                      </span>
                    </div>
                  </div>
                  {query.notes&&(
                    <div style={{marginTop:10,padding:"8px 10px",background:G.gray50,borderRadius:6,fontSize:12,color:G.gray600,borderLeft:`3px solid ${G.accent}`}}>{query.notes}</div>
                  )}
                  <div style={{marginTop:10}}>
                    <button className="btn btn-ghost" style={{fontSize:11,width:"100%"}}
                      onClick={()=>setEditingQuery(true)}>✏ Edit Query Details</button>
                  </div>
                  <div style={{marginTop:10}}>
                    {!isCaseFile&&query.status==="operations"&&(
                      <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:10,marginBottom:8}}>
                        <div style={{fontSize:12,color:"#1A5276",marginBottom:6}}>🎉 Confirmation received? Open a dedicated Tour File.</div>
                        <button className="convert-case-btn" onClick={()=>onConvert(query)}>📁 Convert to Tour File</button>
                      </div>
                    )}
                    {canAdvance&&(
                      <button className="convert-case-btn" style={{background:G.navyMid,marginBottom:8}}
                        onClick={()=>onAdvance(query,nextStatusMap[query.status])}>
                        → Move to {KANBAN_COLS.find(c=>c.id===nextStatusMap[query.status])?.label}
                      </button>
                    )}
                    {!query.cancelled&&(
                      <button onClick={onCancel}
                        style={{width:"100%",padding:"8px",background:"#FFF5F5",color:"#C0392B",
                          border:"1px solid #FECACA",borderRadius:6,fontSize:12,fontWeight:500,
                          cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                        ✕ Cancel this {isCaseFile?"Tour File":"Query"}
                      </button>
                    )}
                  </div>
                </div>
              )
              )}

              {isCaseFile && infoSubTab==="itinerary" && (
                <div>
                  {sec("Day-wise Itinerary")}
                  <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:6,padding:"8px 10px",fontSize:10.5,color:"#1A5276",marginBottom:10}}>
                    This is the confirmed operational record for this tour. Cost Sheet's own day fields are a separate pricing draft and may not automatically match this — check both if something looks off.
                  </div>
                  {te.days.map((d,i)=>(
                    <div key={d.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr auto",gap:6,marginBottom:6,background:G.gray50,padding:8,borderRadius:6,border:`1px solid ${G.gray200}`}}>
                      <input style={teInp} value={d.dayLabel} onChange={e=>updDay(i,"dayLabel",e.target.value)}/>
                      <input style={teInp} type="date" value={d.date||""} onChange={e=>updDay(i,"date",e.target.value)}/>
                      <input style={teInp} value={d.route||""} placeholder="e.g. Delhi – Agra" onChange={e=>updDay(i,"route",e.target.value)}/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"center"}} onClick={()=>rmDay(i)}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:11,marginBottom:10}} onClick={addDay}>+ Add Day</button>
                  {teDirty && <button className="btn btn-primary" style={{fontSize:12,width:"100%"}} onClick={saveTE}>💾 Save Itinerary</button>}
                </div>
              )}

              {isCaseFile && infoSubTab==="hotels" && (
                <div>
                  {sec("Day-wise Hotels")}
                  <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:6,padding:"8px 10px",fontSize:10.5,color:"#1A5276",marginBottom:10}}>
                    Same operational record as the Itinerary tab. Cost Sheet's own hotel fields are a separate pricing draft and may not automatically match this.
                  </div>
                  {te.days.length===0 ? (
                    <div style={{textAlign:"center",padding:"20px 0",color:G.gray400,fontSize:12}}>No days yet — add them from the Day-wise Itinerary tab first.</div>
                  ) : te.days.map((d,i)=>(
                    <div key={d.id} style={{display:"grid",gridTemplateColumns:"1fr 1.5fr 1fr",gap:6,marginBottom:6,background:G.gray50,padding:8,borderRadius:6,border:`1px solid ${G.gray200}`}}>
                      <div style={{fontSize:11,color:G.gray600,alignSelf:"center"}}>{d.dayLabel}{d.date?` (${d.date})`:""}</div>
                      <input style={teInp} value={d.hotelName||""} placeholder="Hotel name" onChange={e=>updDay(i,"hotelName",e.target.value)}/>
                      <input style={teInp} value={d.rooms||""} placeholder="e.g. 5 Twin, 1 Sgl" onChange={e=>updDay(i,"rooms",e.target.value)}/>
                    </div>
                  ))}
                  {teDirty && <button className="btn btn-primary" style={{fontSize:12,width:"100%",marginTop:4}} onClick={saveTE}>💾 Save Hotels</button>}
                </div>
              )}

              {isCaseFile && infoSubTab==="others" && (
                <div>
                  {sec("Transporter")}
                  <select style={{...teInp,marginBottom:6}} value={te.transporterVendorId||""} onChange={e=>setTeField("transporterVendorId",e.target.value)}>
                    <option value="">Select...</option>
                    {activeTransportVendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <textarea style={{...teInp,minHeight:44,resize:"vertical",marginBottom:14}} value={te.transporterNotes||""} placeholder="Transport notes (vehicle count, type, etc.)" onChange={e=>setTeField("transporterNotes",e.target.value)}/>

                  {sec("Tour Facilitators")}
                  {activeFacilitatorVendors.length===0 && <div style={{fontSize:11,color:G.gray400,marginBottom:8}}>No Tour Facilitator vendors yet — add one under Master Data → Vendors.</div>}
                  {te.facilitators.map((f,i)=>(
                    <div key={f.id} style={{display:"grid",gridTemplateColumns:"1.5fr 1fr auto",gap:6,marginBottom:6}}>
                      <select style={teInp} value={f.vendorId||""} onChange={e=>updList("facilitators",i,"vendorId",e.target.value)}>
                        <option value="">Select...</option>
                        {activeFacilitatorVendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <input style={teInp} value={f.sector||""} placeholder="Sector (optional)" onChange={e=>updList("facilitators",i,"sector",e.target.value)}/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"center"}} onClick={()=>rmFromList("facilitators",i)}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:11,marginBottom:14}} onClick={()=>addToList("facilitators",{vendorId:"",sector:""})}>+ Add Facilitator</button>

                  {sec("Local Handlers")}
                  {activeLocalHandlerVendors.length===0 && <div style={{fontSize:11,color:G.gray400,marginBottom:8}}>No Local Handler vendors yet — add one under Master Data → Vendors.</div>}
                  {te.localHandlers.map((h,i)=>(
                    <div key={h.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.5fr auto",gap:6,marginBottom:6}}>
                      <select style={teInp} value={h.vendorId||""} onChange={e=>updList("localHandlers",i,"vendorId",e.target.value)}>
                        <option value="">Select...</option>
                        {activeLocalHandlerVendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <input style={teInp} value={h.sector||""} placeholder="Sector" onChange={e=>updList("localHandlers",i,"sector",e.target.value)}/>
                      <input style={teInp} value={h.notes||""} placeholder="Notes" onChange={e=>updList("localHandlers",i,"notes",e.target.value)}/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"center"}} onClick={()=>rmFromList("localHandlers",i)}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:11,marginBottom:14}} onClick={()=>addToList("localHandlers",{vendorId:"",sector:"",notes:""})}>+ Add Local Handler</button>

                  {sec("Domestic Train / Flight Legs")}
                  {te.flights.map((f,i)=>(
                    <div key={f.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6}}>
                      <input style={teInp} type="date" value={f.date||""} onChange={e=>updList("flights",i,"date",e.target.value)}/>
                      <select style={teInp} value={f.type||"Flight"} onChange={e=>updList("flights",i,"type",e.target.value)}>
                        <option>Flight</option><option>Train</option>
                      </select>
                      <input style={teInp} value={f.number||""} placeholder="No." onChange={e=>updList("flights",i,"number",e.target.value)}/>
                      <input style={teInp} value={f.from||""} placeholder="From" onChange={e=>updList("flights",i,"from",e.target.value)}/>
                      <input style={teInp} value={f.to||""} placeholder="To" onChange={e=>updList("flights",i,"to",e.target.value)}/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"center"}} onClick={()=>rmFromList("flights",i)}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:11,marginBottom:14}} onClick={()=>addToList("flights",{date:"",type:"Flight",number:"",from:"",to:"",time:""})}>+ Add Leg</button>

                  {sec("Arrival / Departure Flight Details")}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                    <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Arrival</div><input style={teInp} value={te.arrFlightDetails||""} placeholder="e.g. AI-101, 10:00 AM" onChange={e=>setTeField("arrFlightDetails",e.target.value)}/></div>
                    <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Departure</div><input style={teInp} value={te.depFlightDetails||""} placeholder="e.g. AI-102, 6:00 PM" onChange={e=>setTeField("depFlightDetails",e.target.value)}/></div>
                  </div>

                  {teDirty && <button className="btn btn-primary" style={{fontSize:12,width:"100%"}} onClick={saveTE}>💾 Save Others</button>}
                </div>
              )}
            </div>
          )}
          {/* ── PROGRESS ── */}
          {tab==="progress"&&(
            <div>
              {sec(`${allDone.length} of 17 steps complete — click any pending step to mark manually`)}
              <WorkflowProgress status={query.status} manualChecked={manualDone} onToggle={onToggleWF}/>
            </div>
          )}

          {/* ── DOCS ── */}
          {tab==="docs"&&(
            <div>
              {sec(isCaseFile?"All Documents":"Query Documents")}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:isCaseFile?0:12}}>
                {docs.map(d=>(
                  <button key={d.label} onClick={()=>d.panel==="docregistry" ? setShowUploadsInline(p=>!p) : openPanel(d.panel)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:8,
                      border:`1px solid ${d.panel==="docregistry"&&showUploadsInline?G.accent:G.gray200}`,
                      background:d.panel==="docregistry"&&showUploadsInline?"#FDEDEC":G.white,cursor:"pointer",
                      fontFamily:"'Inter',sans-serif",textAlign:"left",transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=G.accent;e.currentTarget.style.background=G.gray50;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=(d.panel==="docregistry"&&showUploadsInline)?G.accent:G.gray200;e.currentTarget.style.background=(d.panel==="docregistry"&&showUploadsInline)?"#FDEDEC":G.white;}}>
                    <span style={{fontSize:20,width:26,textAlign:"center"}}>{d.icon}</span>
                    <span style={{fontSize:12,fontWeight:500,color:G.gray800}}>{d.label}</span>
                  </button>
                ))}
              </div>
              {!isCaseFile&&(
                <div style={{padding:"10px 12px",background:"#FEF9E7",border:"1px solid #F9E79F",borderRadius:8,fontSize:11,color:"#784212"}}>
                  ℹ Proforma, Tax Invoice, Exchange Orders and Payment Tracker become available after this query is converted to a Tour File.
                </div>
              )}
              {isCaseFile&&showUploadsInline&&(
                <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${G.gray200}`}}>
                  {sec("Document Registry")}
                  <div style={{fontSize:12,color:G.gray600,marginBottom:10}}>
                    Log all documents received for this tour file — booking confirmations, vouchers, visa copies, invoices, tickets.
                  </div>
                  <DocRegistryInline queryId={query.id} tourFileId={query.tourFileId}/>
                </div>
              )}
            </div>
          )}

          {/* ── PRICING TIMELINE ── */}
          {tab==="pricing"&&(
            <div>
              {sec("Pricing History")}
              <PricingTimeline query={query} staff={staff}/>
            </div>
          )}

          {/* ── SERVICES (tour file only) ── */}
          {tab==="services"&&isCaseFile&&(
            <ServicesList query={query} sec={sec}/>
          )}

          {/* ── FINANCE (tour file only) ── */}
          {tab==="finance"&&isCaseFile&&(
            <div>
              {sec("Payment Summary")}
              <div style={{background:G.gray50,borderRadius:8,padding:12,marginBottom:12}}>
                {[["Tour Value","$2,850",G.gray800],["Received","$2,100","#059669"],["Balance Due","$750",G.accent]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:G.gray600}}>{l}</span>
                    <span style={{fontSize:13,fontWeight:600,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <button className="convert-case-btn" style={{background:"#6C3483"}} onClick={()=>openPanel("payments")}>
                ₹ Open Full Payment Tracker & P&L
              </button>
            </div>
          )}

          {/* ── AUDIT ── */}
          {tab==="audit"&&(
            <div>
              {sec("Audit Trail")}
              {(query.audit||[]).slice().reverse().map((a,i)=>(
                <div key={i} className="audit-item">
                  <div className="audit-dot"/>
                  <div>
                    <div className="audit-text">{a.action}</div>
                    <div className="audit-meta">{a.by} · {a.at}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── REMARKS ── */}
          {tab==="remarks"&&(
            <div>
              {sec("Remarks & Special Requirements")}
              {/* Show original notes from query form */}
              {query.notes&&(
                <div style={{background:"#FEF9E7",border:"1px solid #F9E79F",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
                  <div style={{fontSize:10,color:"#784212",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Special Requirements (from query)</div>
                  <div style={{fontSize:12,color:G.gray800}}>{query.notes}</div>
                </div>
              )}
              {/* Logged remarks */}
              {(query.remarks||[]).map((r,i)=>(
                <div key={i} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                  <div style={{fontSize:12,color:G.gray800}}>{r.text}</div>
                  <div style={{fontSize:10,color:G.gray400,marginTop:4}}>{r.by} · {r.at}</div>
                </div>
              ))}
              {(query.remarks||[]).length===0&&!query.notes&&(
                <div style={{textAlign:"center",padding:"20px 0",color:G.gray400,fontSize:12}}>No remarks yet</div>
              )}
              {/* Add new remark */}
              <div style={{marginTop:12,borderTop:`1px solid ${G.gray100}`,paddingTop:12}}>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Add Remark</div>
                <textarea value={remark} onChange={e=>setRemark(e.target.value)}
                  style={{width:"100%",padding:"8px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,
                    fontSize:12,fontFamily:"'Inter',sans-serif",minHeight:64,resize:"vertical",outline:"none",
                    color:G.gray800,marginBottom:8}}
                  placeholder="Log a remark, update, or note..."/>
                <button className="btn btn-primary" style={{fontSize:12}} onClick={addRemark}
                  disabled={!remark.trim()}>
                  + Log Remark
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}


// ─── NEW QUERY MODAL (REBUILT per spec 9.x) ──────────────────────────────────
// ─── COST SHEET v2 (per spec 10.x) ───────────────────────────────────────────
// ─── QUERY DRAWER — document-first, robust ───────────────────────────────────
// ─── NEW QUERY MODAL (REBUILT per spec 9.x) ──────────────────────────────────
