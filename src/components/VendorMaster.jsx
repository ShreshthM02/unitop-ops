import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
import ExchangeOrderGenerator from './ExchangeOrderGenerator.jsx';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, RichTextArea, TimePeriodFilter, isWithinPeriod, rangeOverlapsPeriod, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, getVendorAssignmentHistory, loadExchangeOrdersForVendor, groupExchangeOrderVersions, updateExchangeOrderRowContent, logAudit, db, formatDateSlash } = Lib;

export default function VendorMaster({ vendors, setVendors, queries, payments, tourExecutions, docTemplates, currentUser, onSaveVendor, onClose, initialSelectedId, asTab = false }) {
  const can = useCan(currentUser);
  const [selected,setSelected]=useState(()=>vendors.find(v=>v.id===initialSelectedId)||null);
  // Same real bug/fix as AgentMaster's own selected state: the lazy
  // initializer above only ever runs once, at first mount -- never
  // re-syncs to later data or a later "activate this vendor" request
  // while already mounted.
  useEffect(() => {
    if (initialSelectedId) setSelected(vendors.find(v=>v.id===initialSelectedId)||null);
  }, [initialSelectedId, vendors]);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [filterType,setFilterType]=useState("All");
  const [search,setSearch]=useState("");
  const [showInactive,setShowInactive]=useState(false);
  const [tab,setTab]=useState("profile");
  const [rates,setRates]=useState(()=>{const v=vendors.find(v=>v.id===initialSelectedId);return v?.rates||[];});
  const [ratesSaveMsg,setRatesSaveMsg]=useState("");
  // Real, editable contracted rates (vendor_rates table) for every
  // vendor type -- originally Hotel-only (the imported rate sheet),
  // extended per direct request to be the real, database-backed rates
  // system for Restaurant/Transport/Local Handler/Activity & Others
  // too, replacing the old generic, manually-typed "rates" jsonb array
  // above entirely for all five types.
  const [contractedRates,setContractedRates]=useState([]);
  const [loadingContractedRates,setLoadingContractedRates]=useState(false);
  const [editingRateId,setEditingRateId]=useState(null);
  const [rateForm,setRateForm]=useState({});
  const reloadContractedRates=async()=>{
    if(!selected) { setContractedRates([]); return; }
    setLoadingContractedRates(true);
    try {
      const { data } = await db.from("vendor_rates").select("*").eq("vendor_id", selected.id).is("deleted_at", null);
      setContractedRates(data || []);
    } catch { setContractedRates([]); }
    setLoadingContractedRates(false);
  };
  useEffect(() => {
    // Wrapped defensively, matching loadSeries/loadSignatures' own
    // pattern elsewhere in this app -- a real fetch error here should
    // degrade gracefully to an empty list, never leave VendorMaster
    // itself uncaught-crashing.
    reloadContractedRates();
  }, [selected?.id]);
  const [periodFilter,setPeriodFilter]=useState({preset:"all"});

  // Exchange Orders tab: every EO issued against the selected vendor,
  // across every tour file, grouped by its stable order_no. Unsettled
  // ones surface first -- those are the ones that matter day to day.
  const [eoGroups,setEoGroups]=useState([]);
  const [eoLoading,setEoLoading]=useState(false);
  const [openEO,setOpenEO]=useState(null); // { query, orderNo } | null

  const refreshEO=useCallback(()=>{
    if(!selected) return;
    setEoLoading(true);
    loadExchangeOrdersForVendor(db,selected.id).then(rows=>{
      setEoGroups(groupExchangeOrderVersions(rows));
      setEoLoading(false);
    });
  },[selected]);

  useEffect(()=>{ if(tab==="eo"&&selected) refreshEO(); },[tab,selected,refreshEO]);

  const toggleEOSettled=async(group)=>{
    const row=group.latest;
    const next=!row.order.settled;
    await updateExchangeOrderRowContent(db,row.id,{...row.order,settled:next});
    logAudit(db,row.queryId,currentUser?.name,`Exchange Order ${group.orderNo} marked ${next?"Settled":"Unsettled"}`);
    refreshEO();
  };

  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const [deleting,setDeleting]=useState(false);
  const handleDelete = async (vendor) => {
    if (!window.confirm(`Delete ${vendor.name}? This removes them from every list and search, but their name still shows correctly on past records (exchange orders, payments) they were involved in. This can only be undone by a developer restoring the record directly.`)) return;
    setDeleting(true);
    const res = await db.auth.deleteVendor(vendor.id);
    setDeleting(false);
    if (!res.success) { alert(res.error || "Could not delete this vendor"); return; }
    setVendors(prev => prev.filter(v => v.id !== vendor.id));
    setSelected(null);
  };
  const TABS=[{id:"profile",label:"Profile"},{id:"history",label:"Service History"},{id:"rates",label:"Contracted Rates"},{id:"ledger",label:"Financial Ledger"},{id:"eo",label:"Exchange Orders"}];
  // Same meta search treatment as AgentMaster -- matches contact
  // persons and other relevant fields too, not just name/city.
  const filtered=vendors.filter(v=>{
    if(!(showInactive||v.active!==false)) return false;
    if(!(filterType==="All"||v.type===filterType)) return false;
    if(!search) return true;
    const q=search.toLowerCase();
    const directHit=[v.name,v.city,v.type,v.gstin,v.website,v.address].some(f=>f?.toLowerCase().includes(q));
    const contactHit=(v.contacts||[]).some(c=>[c.name,c.phone,c.email,c.designation].some(f=>f?.toLowerCase().includes(q)));
    return directHit||contactHit;
  });
  const [sortBy,setSortBy]=useState("activity"); // "activity" | "name"
  // Smart dashboard: reuses getVendorAssignmentHistory (already proven,
  // real vendor.id-matched assignment data -- not a new computation) to
  // build the same kind of at-a-glance summary as Agents. Deliberately
  // NOT a financial total the way Agents get one: a vendor's own
  // "value" isn't cleanly available without loading every Exchange
  // Order across every vendor (only the SELECTED vendor's EOs are
  // currently loaded here), so this sticks to what's genuinely and
  // accurately available -- assignment counts and recency.
  const vendorStats = useMemo(() => {
    const map = new Map();
    for (const v of vendors) {
      const rows = getVendorAssignmentHistory(v.id, tourExecutions, queries).filter(r=>!r.cancelled);
      const dates = rows.map(r=>r.travelDate).filter(Boolean).sort();
      map.set(v.id, { assignmentCount: rows.length, lastActive: dates.length ? dates[dates.length-1] : null });
    }
    return map;
  }, [vendors, tourExecutions, queries]);
  const vendorTotals = useMemo(() => {
    // item 4: Total Assignments removed from the summary strip per
    // direct request -- no longer aggregated here either, since
    // nothing reads it anymore. Per-vendor assignmentCount in
    // vendorStats above stays -- still a natural byproduct of that
    // computation and not dead.
    let activeVendors = 0;
    for (const v of vendors) {
      const s = vendorStats.get(v.id);
      if (!s) continue;
      if (s.assignmentCount > 0) activeVendors++;
    }
    return { activeVendors, totalVendors: vendors.length };
  }, [vendors, vendorStats]);
  const sortedFiltered = [...filtered].sort((a,b)=>{
    if (sortBy==="name") return (a.name||"").localeCompare(b.name||"");
    const sa=vendorStats.get(a.id), sb=vendorStats.get(b.id);
    return (sb?.lastActive||"").localeCompare(sa?.lastActive||"") || (sb?.assignmentCount||0)-(sa?.assignmentCount||0);
  });
  const getLedger=v=>{const entries=[];Object.entries(payments||{}).forEach(([qId,pt])=>{(pt.outgoing||[]).forEach(e=>{if((e.vendor||"").toLowerCase().includes((v.name||"").toLowerCase())){const q=queries.find(q=>q.id===qId);entries.push({...e,queryId:qId,tourFileId:q?.tourFileId,clientName:q?.groupName||q?.clientName,sector:q?.destination||q?.sector});}});});return entries.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));};
  const ROLE_STYLE={"Tour Facilitator":{bg:"#EAFAF1",color:"#0E6655"},"Local Handler":{bg:"#EBF5FB",color:"#1A5276"},"Transporter":{bg:"#F5EEF8",color:"#6C3483"}};
  const saveEdit=async()=>{
    if(form.id){
      setVendors(p=>p.map(v=>v.id===form.id?form:v));
      setSelected(form);
      onSaveVendor && await onSaveVendor(form);
    }else{
      // Real bug fixed here: don't invent an id client-side -- a
      // sequential "VND-"+count scheme meant two saves happening
      // close together could compute the same id, silently
      // overwriting one vendor with another on save. vendors.id now
      // has a real, server-generated default (matching agents.id),
      // so save first and use whatever id actually comes back.
      const nv={...form,active:true};
      const saved = onSaveVendor ? await onSaveVendor(nv) : nv;
      setVendors(p=>[...p,saved]);setSelected(saved);
    }
    setEditing(false);
  };
  const inp={padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const PT_STYLE={cash:{bg:"#DCFCE7",color:"#166534",label:"Cash"},voucher:{bg:"#FEF3C7",color:"#92400E",label:"Voucher"},settle:{bg:"#DBEAFE",color:"#1E40AF",label:"Settlement"}};
  return (
    <div className={asTab ? undefined : "overlay"} style={asTab ? {height:"100%"} : undefined} onClick={asTab ? undefined : (e=>e.target===e.currentTarget&&onClose())}>
      <div style={{background:G.white,width:asTab?"100%":"min(900px, 100vw)",height:asTab?"100%":"100vh",display:"flex",flexDirection:"column",boxShadow:asTab?"none":"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MASTER DATA</div><div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Vendor Repository</div></div>
          {can("vendors_edit") && <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>{setForm({name:"",type:"Hotel",city:"",address:"",contacts:[],gstin:"",website:"",notes:"",languages:"",areas:""});setEditing(true);setSelected(null);setRates([]);}}>+ New Vendor</button>}
          {!asTab && <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>}
        </div>
        <div style={{display:"flex",padding:"10px 20px",gap:24,background:"#F8FAFC",borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
          <div><div style={{fontSize:9,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Total Vendors</div><div style={{fontSize:16,fontWeight:700,color:G.navy}}>{vendorTotals.totalVendors}</div></div>
          <div><div style={{fontSize:9,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>With Active Assignments</div><div style={{fontSize:16,fontWeight:700,color:G.navy}}>{vendorTotals.activeVendors}</div></div>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:240,borderRight:`1px solid ${G.gray200}`,overflowY:"auto",flexShrink:0}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${G.gray200}`}}>
              <input style={{...inp,padding:"6px 9px",marginBottom:6}} placeholder="Search vendors..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>{["All",...VENDOR_TYPES].map(t=><button key={t} onClick={()=>setFilterType(t)} style={{padding:"2px 7px",borderRadius:10,border:`1px solid ${filterType===t?G.accent:G.gray200}`,background:filterType===t?"#FDEDEC":G.white,color:filterType===t?G.accent:G.gray600,fontSize:10,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>{t}</button>)}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:G.gray600,cursor:"pointer"}}>
                  <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} style={{accentColor:G.accent}}/>
                  Show inactive
                </label>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...inp,padding:"3px 4px",width:"auto",fontSize:10}} title="Sort vendors by">
                  <option value="activity">Most active</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>
            {sortedFiltered.map(v=>{const s=vendorStats.get(v.id);return(<div key={v.id} onClick={()=>{setSelected(v);setEditing(false);setTab("profile");setRates(v.rates||[]);}} style={{padding:"12px 14px",borderBottom:`1px solid ${G.gray100}`,cursor:"pointer",background:selected?.id===v.id?"#EBF5FB":G.white,opacity:v.active===false?0.5:1}}><div style={{fontSize:13,fontWeight:600}}>{v.name}{v.active===false?" (inactive)":""}</div><div style={{fontSize:11,color:G.accent,fontWeight:500}}>{v.type}</div><div style={{fontSize:11,color:G.gray400}}>{v.city}</div><div style={{fontSize:10,color:G.gray400,marginTop:2}}>{s?.assignmentCount||0} assignments{s?.lastActive?" · last "+formatDateSlash(s.lastActive):""}</div></div>);})}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {editing?(
              <div style={{flex:1,overflowY:"auto",padding:16}}>
                <div style={{fontSize:14,fontWeight:700,color:G.navy,marginBottom:14}}>{form.id?"Edit Vendor":"New Vendor"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Vendor Name</div><input style={inp} value={form.name||""} onChange={e=>setF("name",e.target.value)}/></div>
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Type</div><select style={inp} value={form.type||"Hotel"} onChange={e=>setF("type",e.target.value)}>{VENDOR_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>City</div><input style={inp} value={form.city||""} onChange={e=>setF("city",e.target.value)}/></div>
                  {[["Address","address"],["GSTIN","gstin"],["Website","website"]].map(([l,k])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)}/></div>)}
                  {form.type==="Tour Facilitator" && [["Languages","languages","e.g. English, Thai"],["Areas / Cities Covered","areas","e.g. Bodhgaya, Rajgir"]].map(([l,k,ph])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)} placeholder={ph}/></div>)}
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div><textarea style={{...inp,minHeight:52,resize:"vertical"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
                  {form.id && <div style={{gridColumn:"1/-1"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.gray600,cursor:"pointer"}}>
                      <input type="checkbox" checked={form.active!==false} onChange={e=>setF("active",e.target.checked)} style={{accentColor:G.accent}}/>
                      Active (available to select elsewhere in the app)
                    </label>
                  </div>}
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Contact Persons</div>
                  {(form.contacts||[]).map((c,i)=>(
                    <div key={c.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                      <input style={inp} placeholder="Name" value={c.name||""} onChange={e=>setF("contacts",(form.contacts||[]).map((x,xi)=>xi===i?{...x,name:e.target.value}:x))}/>
                      <input style={inp} placeholder="Designation" value={c.designation||""} onChange={e=>setF("contacts",(form.contacts||[]).map((x,xi)=>xi===i?{...x,designation:e.target.value}:x))}/>
                      <input style={inp} placeholder="Phone" value={c.phone||""} onChange={e=>setF("contacts",(form.contacts||[]).map((x,xi)=>xi===i?{...x,phone:e.target.value}:x))}/>
                      <input style={inp} placeholder="Email" value={c.email||""} onChange={e=>setF("contacts",(form.contacts||[]).map((x,xi)=>xi===i?{...x,email:e.target.value}:x))}/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setF("contacts",(form.contacts||[]).filter((_,xi)=>xi!==i))}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setF("contacts",[...(form.contacts||[]),{id:Date.now(),name:"",designation:"",phone:"",email:""}])}>+ Add Contact</button>
                </div>
                <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={()=>setEditing(false)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit}>Save Vendor</button></div>
              </div>
            ):selected?(
              <>
                <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
                  {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 16px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Inter',sans-serif",background:"none",color:tab===t.id?G.accent:G.gray600,fontWeight:tab===t.id?600:400,borderBottom:`2px solid ${tab===t.id?G.accent:"transparent"}`}}>{t.label}</button>)}
                  <div style={{flex:1}}/>{can("vendors_edit") && <button className="btn btn-ghost" style={{fontSize:11,margin:"6px 12px"}} onClick={()=>{setForm({...selected});setEditing(true);}}>✏ Edit</button>}
                  {currentUser?.role==="admin" && <button className="btn btn-ghost" style={{fontSize:11,margin:"6px 12px 6px 0",color:"#C0392B",borderColor:"#FECACA"}} onClick={()=>handleDelete(selected)} disabled={deleting}>🗑 Delete</button>}
                </div>
                <div style={{flex:1,overflowY:"auto",padding:16}}>
                  {tab==="profile"&&<div><div style={{background:G.gray50,borderRadius:10,padding:"14px 16px",marginBottom:14}}><div style={{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',serif",color:G.navy}}>{selected.name}</div><div style={{fontSize:12,color:G.accent,fontWeight:500,marginTop:2}}>{selected.type} · {selected.city}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{(selected.type==="Tour Facilitator"?[["Languages",selected.languages],["Areas Covered",selected.areas],["Status",selected.active===false?"Inactive":"Active"]]:[["Address",selected.address],["GSTIN",selected.gstin]]).map(([l,v])=><div key={l}><div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:500}}>{v||"—"}</div></div>)}
                    <div><div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Website</div><div style={{fontSize:12,fontWeight:500}}>{selected.website?<a href={selected.website.startsWith("http")?selected.website:`https://${selected.website}`} target="_blank" rel="noopener noreferrer" style={{color:G.accent}}>{selected.website}</a>:"—"}</div></div>
                  </div>
                  <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:14,marginBottom:6}}>Contact Persons</div>
                  {(selected.contacts||[]).length===0?<div style={{fontSize:12,color:G.gray400}}>No contacts on file.</div>:(selected.contacts||[]).map(c=>(
                    <div key={c.id} style={{background:G.gray50,borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                      <div style={{fontSize:13,fontWeight:600}}>{c.name||"—"}</div>
                      <div style={{fontSize:11,color:G.gray600}}>{c.phone||"—"}{c.email?" · "+c.email:""}</div>
                    </div>
                  ))}
                  {selected.notes&&<div style={{marginTop:12,background:G.gray50,borderRadius:6,padding:"8px 10px",fontSize:12,color:G.gray600,borderLeft:`3px solid ${G.accent}`}}>{selected.notes}</div>}</div>}
                  {tab==="history"&&(()=>{
                    const assignmentsAll = getVendorAssignmentHistory(selected.id, tourExecutions, queries);
                    const assignments = assignmentsAll.filter(a=>isWithinPeriod(a.travelDate,periodFilter));
                    const ledgerTourFiles = [...new Set(getLedger(selected).map(e=>e.tourFileId).filter(Boolean))];
                    return (
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Tours Assigned To</div>
                        <div style={{marginBottom:10}}><TimePeriodFilter value={periodFilter} onChange={setPeriodFilter}/></div>
                        {assignments.length===0?<div style={{textAlign:"center",padding:24,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8,marginBottom:20,fontSize:12}}>No tours assigned in this period.</div>:(
                          <div style={{marginBottom:20}}>
                            {assignments.map((a,i)=>{
                              const rs=ROLE_STYLE[a.role]||ROLE_STYLE["Tour Facilitator"];
                              return (
                                <div key={i} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8,opacity:a.cancelled?0.6:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:rs.bg,color:rs.color,fontWeight:600}}>{a.role}</span>
                                    {a.cancelled&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>Cancelled</span>}
                                    {(()=>{const aq=queries.find(qq=>qq.id===a.queryId);return<span onClick={()=>aq&&document.dispatchEvent(new CustomEvent("unitop-activate-query",{detail:{query:aq}}))} style={{fontSize:12,fontWeight:700,color:aq?"#1A5276":G.navy,cursor:aq?"pointer":"default",textDecoration:aq?"underline":"none"}}>📁 {a.tourFileId}</span>;})()}
                                  </div>
                                  <div style={{fontSize:11,color:G.gray600}}>{a.groupName} · {a.sector} · {formatDateSlash(a.travelDate)||"TBC"}</div>
                                  {a.notes&&<div style={{fontSize:11,color:G.gray400,marginTop:2}}>{a.notes}</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8,paddingTop:8,borderTop:`1px solid ${G.gray200}`}}>Related Payments</div>
                        <div style={{fontSize:10,color:G.gray400,marginBottom:8}}>Matched by name against outgoing payment records — payments can go to non-vendor payees too (airlines, railways), so this is a best-effort match, not a guaranteed link.</div>
                        {ledgerTourFiles.length===0?<div style={{textAlign:"center",padding:24,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8,fontSize:12}}>No matching payment records yet.</div>:ledgerTourFiles.map(tfId=>{
                          const q=queries.find(q=>q.tourFileId===tfId);
                          const entries=getLedger(selected).filter(e=>e.tourFileId===tfId);
                          const total=entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
                          return(
                            <div key={tfId} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:12,fontWeight:700,color:G.navy}}>📁 {q
                                    ? <span onClick={()=>document.dispatchEvent(new CustomEvent("unitop-activate-query",{detail:{query:q}}))}
                                        style={{cursor:"pointer",textDecoration:"underline"}}>{tfId}</span>
                                    : tfId}</div>
                                  {q&&<div style={{fontSize:11,color:G.gray600}}>{q.groupName||q.clientName} · {q.destination||q.sector} · {formatDateSlash(q.travelDate)}</div>}
                                </div>
                                <div style={{fontSize:13,fontWeight:700,color:G.navy}}>₹ {Math.round(total).toLocaleString()}</div>
                              </div>
                              {entries.map((e,i)=>{const ts=PT_STYLE[e.paymentType||"cash"]||PT_STYLE.cash;return<div key={i} style={{display:"flex",gap:8,padding:"3px 0",borderTop:`1px solid ${G.gray100}`,fontSize:11,color:G.gray600}}><span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:ts.bg,color:ts.color,fontWeight:600}}>{ts.label}</span><span>₹ {parseFloat(e.amount||0).toLocaleString()}</span><span style={{color:G.gray400}}>{formatDateSlash(e.date)||"—"} · {e.mode||"—"}</span></div>;})}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {tab==="rates"&&(()=>{
                    const vtype=selected.type||"Hotel";
                    // Real, direct request: Hotel/Restaurant/Transport/Local
                    // Handler/Activity & Other all now use the real,
                    // database-backed vendor_rates table -- editable from
                    // the app, not just the imported Hotel display this
                    // started as. Tour Facilitator wasn't part of this
                    // request, so it keeps its existing, separate
                    // (generic, manually-typed "rates" array) system
                    // entirely unchanged below.
                    const NEW_SYSTEM_TYPES=["Hotel","Restaurant","Transport","Local Handler","Activity","Other"];
                    if(NEW_SYSTEM_TYPES.includes(vtype)){
                      // Per-vendor-type field schema -- which columns show,
                      // under which label, and how. Column reuse is
                      // deliberate: e.g. market_segment doubles as
                      // "Vehicle Type" for Transport, room_category doubles
                      // as "Menu"/"Particulars" -- a given rate row only
                      // ever belongs to one vendor of one type, so there's
                      // no collision, and it avoids a sprawl of
                      // rarely-used, type-specific columns.
                      const SCHEMA={
                        Hotel:{topLabel:"Market Segment",topKey:"market_segment",itemLabel:"Room Category",itemKey:"room_category",
                          mealPlan:true,singleDouble:true,extraBed:true,dateRange:true,tax:true,notes:true},
                        Restaurant:{itemLabel:"Menu",itemKey:"room_category",ratePP:true,dateRange:true,tax:true,notes:true},
                        Transport:{topLabel:"Vehicle Type",topKey:"market_segment",itemLabel:"Particulars",itemKey:"room_category",
                          rateFreeText:true,dateRange:true,tax:true,notes:true},
                        "Local Handler":{topLabel:"Market Segment",topKey:"market_segment",itemLabel:"Particulars",itemKey:"room_category",
                          ratePerPerson:true,singleSupplement:true,dateRange:true,tax:true,notes:true},
                        Activity:{itemLabel:"Particulars",itemKey:"room_category",rate:true,dateRange:true,tax:true,notes:true},
                        Other:{itemLabel:"Particulars",itemKey:"room_category",rate:true,dateRange:true,tax:true,notes:true},
                      };
                      const sc=SCHEMA[vtype];
                      const setRF=(k,v)=>setRateForm(p=>({...p,[k]:v}));
                      const startAdd=()=>{setRateForm({tax_inclusive:true});setEditingRateId("new");};
                      const startEdit=(r)=>{setRateForm({...r});setEditingRateId(r.id);};
                      const cancelEdit=()=>{setEditingRateId(null);setRateForm({});};
                      const saveRate=async()=>{
                        const payload={
                          vendor_id:selected.id,
                          market_segment:rateForm.market_segment||null,
                          room_category:rateForm.room_category||null,
                          meal_plan:sc.mealPlan?(rateForm.meal_plan||null):null,
                          season_start:rateForm.season_start||null,
                          season_end:rateForm.season_end||null,
                          single_rate:sc.singleDouble?(rateForm.single_rate||null):null,
                          double_rate:(sc.singleDouble||sc.ratePP)?(rateForm.double_rate||null):null,
                          extra_bed_rate:sc.extraBed?(rateForm.extra_bed_rate||null):null,
                          rate:(sc.ratePerPerson||sc.rate)?(rateForm.rate||null):null,
                          rate_text:sc.rateFreeText?(rateForm.rate_text||null):null,
                          single_supplement:sc.singleSupplement?(rateForm.single_supplement||null):null,
                          tax_inclusive:rateForm.tax_inclusive!==false,
                          terms:rateForm.terms||null,
                          currency:"INR",
                        };
                        try{
                          if(editingRateId&&editingRateId!=="new"){
                            await db.from("vendor_rates").update(payload).eq("id",editingRateId);
                          }else{
                            await db.from("vendor_rates").insert(payload);
                          }
                        }catch(e){ console.warn("Save vendor rate failed:",e); }
                        await reloadContractedRates();
                        cancelEdit();
                      };
                      const deleteRate=async(id)=>{
                        if(!window.confirm("Delete this rate? This can only be undone by a developer restoring the record directly."))return;
                        try{ await db.from("vendor_rates").update({deleted_at:new Date().toISOString()}).eq("id",id); }
                        catch(e){ console.warn("Delete vendor rate failed:",e); }
                        await reloadContractedRates();
                      };
                      const visibleRates=contractedRates.filter(r=>rangeOverlapsPeriod(r.season_start,r.season_end,periodFilter));
                      const fld=(label,children)=>(<div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{label}</div>{children}</div>);
                      const smallInp={...inp,fontSize:11};
                      return(
                        <div>
                          <div style={{fontSize:12,color:G.gray600,marginBottom:10}}>Contracted rates for this vendor. Fields adapt to vendor type.</div>
                          <div style={{marginBottom:10}}><TimePeriodFilter value={periodFilter} onChange={setPeriodFilter}/></div>
                          {loadingContractedRates?<div style={{fontSize:12,color:G.gray600}}>Loading…</div>:<>
                          {contractedRates.length>0&&visibleRates.length===0&&<div style={{textAlign:"center",padding:20,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8,marginBottom:10,fontSize:12}}>No rates apply to this period.</div>}
                          {visibleRates.map(r=>(
                            <div key={r.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12,marginBottom:8}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                                <span style={{fontSize:13,fontWeight:700,color:G.navy}}>{r.room_category||"—"}</span>
                                {sc.mealPlan&&r.meal_plan&&<span style={{fontSize:11,background:"#EBF5FB",color:"#154360",padding:"2px 8px",borderRadius:10,fontWeight:600}}>{r.meal_plan}</span>}
                                {sc.topKey&&r[sc.topKey]&&<span style={{fontSize:11,background:"#F5EEF8",color:"#6C3483",padding:"2px 8px",borderRadius:10}}>{r[sc.topKey]}</span>}
                                {r.season_start&&<span style={{fontSize:11,color:G.gray400}}>{formatDateSlash(r.season_start)} – {formatDateSlash(r.season_end)}</span>}
                                <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                                  {can("vendors_edit")&&<span style={{cursor:"pointer",color:G.accent,fontSize:11}} onClick={()=>startEdit(r)}>✏ Edit</span>}
                                  {can("vendors_edit")&&<span style={{cursor:"pointer",color:G.gray400,fontSize:11}} onClick={()=>deleteRate(r.id)}>✕ Delete</span>}
                                </div>
                              </div>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))",gap:8,marginBottom:r.terms?8:0}}>
                                {sc.singleDouble&&r.single_rate!=null&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>Single</div><div style={{fontSize:13,fontWeight:700}}>₹{parseFloat(r.single_rate).toLocaleString("en-IN")}</div></div>}
                                {(sc.singleDouble||sc.ratePP)&&r.double_rate!=null&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>{sc.ratePP?"Price Per Head":"Double"}</div><div style={{fontSize:13,fontWeight:700}}>₹{parseFloat(r.double_rate).toLocaleString("en-IN")}</div></div>}
                                {sc.extraBed&&r.extra_bed_rate!=null&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>Extra Bed</div><div style={{fontSize:13,fontWeight:700}}>₹{parseFloat(r.extra_bed_rate).toLocaleString("en-IN")}</div></div>}
                                {sc.rateFreeText&&r.rate_text&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>Rate</div><div style={{fontSize:13,fontWeight:700}}>{r.rate_text}</div></div>}
                                {(sc.ratePerPerson||sc.rate)&&r.rate!=null&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>{sc.ratePerPerson?"Rate (per person)":"Rate"}</div><div style={{fontSize:13,fontWeight:700}}>₹{parseFloat(r.rate).toLocaleString("en-IN")}</div></div>}
                                {sc.singleSupplement&&r.single_supplement!=null&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>Single Supp</div><div style={{fontSize:13,fontWeight:700}}>₹{parseFloat(r.single_supplement).toLocaleString("en-IN")}</div></div>}
                                {sc.tax&&<div><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px"}}>Tax</div><div style={{fontSize:11,color:G.gray600}}>{r.tax_inclusive?"Inclusive":"Exclusive"}</div></div>}
                              </div>
                              {r.terms&&<div style={{fontSize:11,color:G.gray600,lineHeight:1.6,borderTop:`1px solid ${G.gray200}`,paddingTop:8}} dangerouslySetInnerHTML={{__html:r.terms}}/>}
                            </div>
                          ))}
                          </>}
                          {editingRateId&&(
                            <div style={{background:G.white,border:`2px solid ${G.accent}`,borderRadius:8,padding:12,marginBottom:10}}>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:8}}>
                                {sc.topLabel&&fld(sc.topLabel,<input style={smallInp} value={rateForm[sc.topKey]||""} onChange={e=>setRF(sc.topKey,e.target.value)}/>)}
                                {sc.dateRange&&fld("Rates From",<input type="date" style={smallInp} value={rateForm.season_start||""} onChange={e=>setRF("season_start",e.target.value)}/>)}
                                {sc.dateRange&&fld("Rates Till",<input type="date" style={smallInp} value={rateForm.season_end||""} onChange={e=>setRF("season_end",e.target.value)}/>)}
                                {fld(sc.itemLabel,<input style={smallInp} value={rateForm[sc.itemKey]||""} onChange={e=>setRF(sc.itemKey,e.target.value)}/>)}
                                {sc.mealPlan&&fld("Meal Plan",<select style={smallInp} value={rateForm.meal_plan||"CP"} onChange={e=>setRF("meal_plan",e.target.value)}>{["EP","CP","MAP","AP"].map(m=><option key={m}>{m}</option>)}</select>)}
                                {sc.singleDouble&&fld("Single Rate",<input type="number" style={smallInp} value={rateForm.single_rate||""} onChange={e=>setRF("single_rate",e.target.value)}/>)}
                                {(sc.singleDouble||sc.ratePP)&&fld(sc.ratePP?"Price Per Head":"Double Rate",<input type="number" style={smallInp} value={rateForm.double_rate||""} onChange={e=>setRF("double_rate",e.target.value)}/>)}
                                {sc.extraBed&&fld("Extra Bed",<input type="number" style={smallInp} value={rateForm.extra_bed_rate||""} onChange={e=>setRF("extra_bed_rate",e.target.value)}/>)}
                                {sc.rateFreeText&&fld("Rate",<input style={smallInp} value={rateForm.rate_text||""} onChange={e=>setRF("rate_text",e.target.value)}/>)}
                                {(sc.ratePerPerson||sc.rate)&&fld(sc.ratePerPerson?"Rate (per person)":"Rate",<input type="number" style={smallInp} value={rateForm.rate||""} onChange={e=>setRF("rate",e.target.value)}/>)}
                                {sc.singleSupplement&&fld("Single Supplement",<input type="number" style={smallInp} value={rateForm.single_supplement||""} onChange={e=>setRF("single_supplement",e.target.value)}/>)}
                                {sc.tax&&fld("Tax",<label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:G.gray600,cursor:"pointer",padding:"7px 0"}}><input type="checkbox" checked={rateForm.tax_inclusive!==false} onChange={e=>setRF("tax_inclusive",e.target.checked)} style={{accentColor:G.accent}}/>Inclusive of tax</label>)}
                              </div>
                              {sc.notes&&fld("Notes",<RichTextArea value={rateForm.terms||""} onChange={v=>setRF("terms",v)}/>)}
                              <div style={{display:"flex",gap:8,marginTop:10}}>
                                <button className="btn btn-ghost" style={{fontSize:11}} onClick={cancelEdit}>Cancel</button>
                                <button className="btn btn-primary" style={{fontSize:11}} onClick={saveRate}>💾 Save Rate</button>
                              </div>
                            </div>
                          )}
                          {!editingRateId&&can("vendors_edit")&&<button className="btn btn-ghost" style={{fontSize:11}} onClick={startAdd}>+ Add Rate</button>}
                        </div>
                      );
                    }
                    const upd=(i,k,v)=>setRates(p=>p.map((x,xi)=>xi===i?{...x,[k]:v}:x));

                    // item 6: "Season" replaced with real Rates Applicable
                    // From/Till date pickers, for every vendor type that
                    // previously had Season. Activity Provider and
                    // Monument/Museum never had Season, so no date range
                    // for those -- not adding one they never asked for.
                    const HAS_DATE_RANGE = ["Hotel","Restaurant","Transport","Tour Facilitator"];
                    // item 7: tax toggle applied universally, replacing the
                    // old plain "Tax %" number field wherever it existed
                    // (Hotel, Restaurant) and adding real tax handling to
                    // the vendor types that never had any (Transport, Tour
                    // Facilitator, Activity Provider, Monument/Museum) --
                    // "contracted rates" is a general concept, tax
                    // applicability isn't specific to hotels/restaurants.
                    const FIELDS={
                      Hotel:[["Room Type","roomType","text"],["Meal Plan","mealPlan","mealsel"],["Rate (₹)","ratePP","number"],["Single Supp (₹)","singleSupp","number"]],
                      Restaurant:[["Meal Type","mealType","mealtype"],["Price Per Head (₹)","ratePP","number"]],
                      Transport:[["Vehicle Type","vehicleType","vehsel"],["Rate/Day (₹)","ratePerDay","number"],["Rate/KM (₹)","ratePerKm","number"],["Capacity","capacity","number"]],
                      "Tour Facilitator":[["Language","language","text"],["Rate/Day (₹)","ratePP","number"],["Half Day (₹)","halfDay","number"]],
                      "Activity Provider":[["Activity","activity","text"],["Rate PP (₹)","ratePP","number"],["Group Rate (₹)","groupRate","number"],["Min Pax","minPax","number"]],
                      "Monument / Museum":[["Monument","activity","text"],["Foreign Rate (₹)","ratePP","number"],["Indian Rate (₹)","rateIndian","number"]],
                    };
                    const fields=FIELDS[vtype]||FIELDS.Hotel;
                    const saveRates=async()=>{
                      const updatedVendor={...selected,rates};
                      await onSaveVendor(updatedVendor);
                      setVendors(p=>p.map(v=>v.id===selected.id?updatedVendor:v));
                      setSelected(updatedVendor);
                      setRatesSaveMsg("Rates saved ✓");
                      setTimeout(()=>setRatesSaveMsg(""),2500);
                    };
                    // Filters by each rate's OWN date range (rangeOverlapsPeriod),
                    // not a single date -- but rates stays the real,
                    // editable array; indices must still point at the
                    // right row, so map-then-filter (keeping origIndex)
                    // rather than filtering rates itself, which would
                    // desync upd()/delete from what's actually shown.
                    const visibleRates=rates.map((r,i)=>({r,i})).filter(({r})=>rangeOverlapsPeriod(r.ratesFrom,r.ratesTill,periodFilter));
                    return (
                      <div>
                        <div style={{fontSize:12,color:G.gray600,marginBottom:10}}>Contracted rates for this vendor. Fields adapt to vendor type.</div>
                        <div style={{marginBottom:10}}><TimePeriodFilter value={periodFilter} onChange={setPeriodFilter}/></div>
                        {rates.length>0&&visibleRates.length===0&&<div style={{textAlign:"center",padding:20,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8,marginBottom:10,fontSize:12}}>No rates apply to this period.</div>}
                        {visibleRates.map(({r,i})=>(
                          <div key={r.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:6,marginBottom:6}}>
                              {HAS_DATE_RANGE.includes(vtype) && <>
                                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Rates From</div><input style={{...inp,fontSize:11}} type="date" value={r.ratesFrom||""} onChange={e=>upd(i,"ratesFrom",e.target.value)}/></div>
                                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Rates Till</div><input style={{...inp,fontSize:11}} type="date" value={r.ratesTill||""} onChange={e=>upd(i,"ratesTill",e.target.value)}/></div>
                              </>}
                              {fields.map(([l,k,t])=>(
                                <div key={k}>
                                  <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                                  {t==="mealsel"?<select style={{...inp,fontSize:11}} value={r[k]||"CP"} onChange={e=>upd(i,k,e.target.value)}>{["EP","CP","MAP","AP"].map(m=><option key={m}>{m}</option>)}</select>
                                  :t==="mealtype"?<select style={{...inp,fontSize:11}} value={r[k]||"Lunch"} onChange={e=>upd(i,k,e.target.value)}>{["Breakfast","Lunch","Dinner","All Meals"].map(m=><option key={m}>{m}</option>)}</select>
                                  :t==="vehsel"?<select style={{...inp,fontSize:11}} value={r[k]||"Innova/SUV"} onChange={e=>upd(i,k,e.target.value)}>{["Sedan","Innova/SUV","Tempo Traveller","Mini Coach","Coach","Luxury Van"].map(v=><option key={v}>{v}</option>)}</select>
                                  :<input style={{...inp,textAlign:t==="number"?"right":"left",fontSize:11}} type={t} value={r[k]||""} onChange={e=>upd(i,k,e.target.value)}/>}
                                </div>
                              ))}
                              <div>
                                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Tax</div>
                                <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:G.gray600,cursor:"pointer",padding:"7px 0"}}>
                                  <input type="checkbox" checked={!!r.taxExclusive} onChange={e=>upd(i,"taxExclusive",e.target.checked)} style={{accentColor:G.accent}}/>
                                  Exclusive of tax
                                </label>
                              </div>
                              {r.taxExclusive && <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Tax %</div><input style={{...inp,textAlign:"right",fontSize:11}} type="number" value={r.taxPct||""} onChange={e=>upd(i,"taxPct",e.target.value)} placeholder="e.g. 18"/></div>}
                              <span style={{cursor:"pointer",color:G.gray400,fontSize:14,alignSelf:"flex-end",paddingBottom:2}} onClick={()=>setRates(p=>p.filter((_,xi)=>xi!==i))}>✕</span>
                            </div>
                            <input style={{...inp,fontSize:11}} value={r.notes||""} onChange={e=>upd(i,"notes",e.target.value)} placeholder="Notes..."/>
                          </div>
                        ))}
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setRates(p=>[...p,{id:Date.now(),notes:""}])}>+ Add Rate</button>
                          {can("vendors_edit") && <button className="btn btn-primary" style={{fontSize:11}} onClick={saveRates}>💾 Save Rates</button>}
                          {ratesSaveMsg && <span style={{fontSize:11,color:"#059669",fontWeight:600}}>{ratesSaveMsg}</span>}
                        </div>
                      </div>
                    );
                  })()}
                  {tab==="ledger"&&(()=>{const ledgerAll=getLedger(selected);const ledger=ledgerAll.filter(e=>isWithinPeriod(e.date,periodFilter));const committed=ledger.filter(e=>["voucher","cash"].includes(e.paymentType||"cash")).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);const paid=ledger.filter(e=>e.paymentType==="cash"||e.paymentType==="settle").reduce((s,e)=>s+(parseFloat(e.amount)||0),0);const payable=ledger.filter(e=>e.paymentType==="voucher"&&!e.settled).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);return<div><div style={{marginBottom:10}}><TimePeriodFilter value={periodFilter} onChange={setPeriodFilter}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>{[["Total Committed","₹ "+Math.round(committed).toLocaleString(),G.navy],["Total Paid","₹ "+Math.round(paid).toLocaleString(),"#059669"],["Outstanding","₹ "+Math.round(payable).toLocaleString(),payable>0?G.accent:"#059669"]].map(([l,v,c])=><div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div></div>)}</div>{ledger.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No transactions in this period.</div>:ledger.map((e,i)=>{const ts=PT_STYLE[e.paymentType||"cash"]||PT_STYLE.cash;return<div key={i} style={{background:G.white,border:`1px solid ${e.paymentType==="voucher"&&!e.settled?"#FDE68A":G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ts.bg,color:ts.color,fontWeight:600}}>{ts.label}</span>{e.paymentType==="voucher"&&!e.settled&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>⚠ Payable</span>}{e.tourFileId&&(()=>{const vq=queries.find(qq=>qq.tourFileId===e.tourFileId);return<span onClick={()=>vq&&document.dispatchEvent(new CustomEvent("unitop-activate-query",{detail:{query:vq}}))} style={{fontSize:10,color:G.navy,fontWeight:600,background:"#EBF5FB",padding:"2px 7px",borderRadius:10,cursor:vq?"pointer":"default",textDecoration:vq?"underline":"none"}}>📁 {e.tourFileId}</span>;})()}<span style={{marginLeft:"auto",fontSize:13,fontWeight:700,color:G.navy}}>₹ {parseFloat(e.amount||0).toLocaleString()}</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[["Tour File",e.tourFileId||"—"],["Client",e.clientName||"—"],["Sector",e.sector||"—"],["Date",e.date||"—"],["Mode",e.mode||"—"],["Reference",e.ref||"—"]].map(([l,v])=><div key={l}><div style={{fontSize:9,color:G.gray400,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:1}}>{l}</div><div style={{fontSize:11,fontWeight:500}}>{v}</div></div>)}</div></div>;})}</div>;})()}
                  {tab==="eo"&&(()=>{
                    const periodGroups=eoGroups.filter(g=>isWithinPeriod(g.latest.order.issueDate,periodFilter));
                    const sorted=[...periodGroups].sort((a,b)=>(a.latest.order.settled===b.latest.order.settled)?0:(a.latest.order.settled?1:-1));
                    const unsettledCount=periodGroups.filter(g=>!g.latest.order.settled).length;
                    return(
                      <div>
                        <div style={{fontSize:11,color:G.gray600,marginBottom:10}}>Every service voucher (Exchange Order) issued against this vendor, across every tour file. {unsettledCount>0 && <span style={{color:G.accent,fontWeight:600}}>{unsettledCount} unsettled.</span>}</div>
                        <div style={{marginBottom:10}}><TimePeriodFilter value={periodFilter} onChange={setPeriodFilter}/></div>
                        {eoLoading?<div style={{fontSize:12,color:G.gray600}}>Loading…</div>:sorted.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400,border:`1px dashed ${G.gray200}`,borderRadius:8}}>No Exchange Orders in this period.</div>:sorted.map(group=>{
                          const order=group.latest.order;
                          const svc=SERVICE_TYPES.find(s=>s.id===order.serviceType);
                          const q=queries.find(qq=>qq.id===group.latest.queryId);
                          return (
                            <div key={group.orderNo} style={{background:G.white,border:`1px solid ${order.settled?G.gray200:"#FDE68A"}`,borderRadius:8,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                              <div style={{fontSize:18}}>{svc?.icon}</div>
                              <div style={{flex:1}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                                  <span style={{fontSize:12,fontWeight:700,color:G.navy}}>{group.orderNo}</span>
                                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:order.settled?"#EAFAF1":"#FEF9E7",color:order.settled?"#0E6655":"#784212",fontWeight:600}}>{order.settled?"✓ Settled":"Unsettled"}</span>
                                  <span style={{fontSize:11,padding:"1px 7px",borderRadius:10,background:"#EBF5FB",color:"#154360",fontWeight:500}}>{svc?.label}</span>
                                </div>
                                <div style={{fontSize:11,color:G.gray600}}>{q?<span onClick={()=>document.dispatchEvent(new CustomEvent("unitop-activate-query",{detail:{query:q}}))}
                                  style={{color:"#1A5276",fontWeight:600,cursor:"pointer",textDecoration:"underline"}}>📁 {q.tourFileId||q.id} · {q.groupName||q.clientName}</span>:"Tour file"} · {formatDateSlash(order.issueDate)}</div>
                              </div>
                              <button className="btn btn-ghost" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>toggleEOSettled(group)}>{order.settled?"✗ Unsettle":"✓ Settle"}</button>
                              <button className="btn btn-ghost" style={{fontSize:10,padding:"3px 8px"}} disabled={!q} onClick={()=>q&&setOpenEO({query:q,orderNo:group.orderNo})}>✏ Open</button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            ):<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:G.gray400}}><div style={{fontSize:24,marginBottom:8}}>🏢</div><div style={{fontSize:13}}>Select a vendor</div></div>}
          </div>
        </div>
      </div>
      {openEO && <ExchangeOrderGenerator query={openEO.query} template={docTemplates?.exchange} vendors={vendors} initialOpenOrderNo={openEO.orderNo} currentUser={currentUser} onClose={()=>{setOpenEO(null);refreshEO();}}/>}
    </div>
  );
}


