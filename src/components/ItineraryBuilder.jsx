import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_ITINERARY_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML, loadItineraryVersions, saveItineraryVersion, markItineraryVersionFinal, loadFinalCostSheetVersion, extractItineraryBuilderDaysFromCostSheet, logAudit, db } = Lib;

export default function ItineraryBuilder({ query, briefTemplate, detailTemplate, onClose, currentUser, readOnly }) {
  const [tourTitle, setTourTitle] = useState(query.destination || "");
  const [tagline, setTagline] = useState("");
  const [route, setRoute] = useState("");
  const [duration, setDuration] = useState(`${query.nights || "?"} Days / ${query.nights ? Number(query.nights)-1 : "?"} Nights`);
  const [itinDays, setItinDays] = useState([
    { id:1, dayLabel:"DAY-1", title:"Arrival", route:"", distance:"", time:"", meals:["D"], description:"Meeting & greeting at the airport and transfer to hotel.\nOvernight stay at the hotel.", hotel:"" },
    { id:2, dayLabel:"DAY-2", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
    { id:3, dayLabel:"DAY-3", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
  ]);
  const [activeTab, setActiveTab] = useState("brief"); // itinerary style: brief | detailed
  const [viewMode, setViewMode] = useState("content");    // content | preview
  const [editingDay, setEditingDay] = useState(null);
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerAllPages, footerAllPages, printOnLetterhead } = toggles;

  // Real version history, same pattern as Cost Sheet/Quotation/Meal Plan
  // (Phase 0 of the Document Chain plan -- see docs/DATA_OWNERSHIP.md).
  // Brief and Detailed share one table (itineraries) but have genuinely
  // independent version sequences -- saving a Brief tweak must not bump
  // Detailed's version number, and vice versa. Every version-numbering,
  // pill-display, and final-marking operation below is scoped by
  // activeTab (the current style), not global to the query.
  const [versions, setVersions] = useState([]);
  const [finalVersionByStyle, setFinalVersionByStyle] = useState({});
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionNote, setVersionNote] = useState("");

  const versionsForStyle = versions.filter(v => v.activeTab === activeTab);
  const nextVersion = versionsForStyle.length ? Math.max(...versionsForStyle.map(v => v.version)) + 1 : 1;

  const loadVersionIntoDraft = (v) => {
    setTourTitle(v.tourTitle || query.destination || "");
    setTagline(v.tagline || "");
    setRoute(v.route || "");
    setDuration(v.duration || duration);
    setActiveTab(v.activeTab || "brief");
    setItinDays(v.days && v.days.length ? v.days : itinDays);
    setViewingVersion(v.version);
  };

  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  const [pulledFromCostSheetVersion, setPulledFromCostSheetVersion] = useState(null);
  const [pullMessage, setPullMessage] = useState("");
  const [pulling, setPulling] = useState(false);

  // Phase 4 of the Document Chain plan (docs/DATA_OWNERSHIP.md): pulls
  // from the star-marked Cost Sheet directly, same reasoning as Meal
  // Plan -- Itinerary Builder is opened independently from the toolbar,
  // not linked to a specific costSheetId. Both Brief and Detailed share
  // one itinDays state (just different print formatting), so this only
  // needs to pull once, not per-style. Uses the shared extraction
  // library (extractItineraryBuilderDaysFromCostSheet), not a
  // reimplementation.
  const pullFromCostSheet = async (targetVersion) => {
    setPulling(true);
    setPullMessage("");
    try {
      const source = targetVersion || finalCostSheetVersion;
      if (!source) { setPullMessage("No final Cost Sheet found for this tour yet."); setPulling(false); return; }
      const extracted = extractItineraryBuilderDaysFromCostSheet(source.days);
      if (extracted.length > 0) setItinDays(extracted);
      setPulledFromCostSheetVersion(source.version);
      setPullMessage(`Pulled from Cost Sheet v${source.version}.`);
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    }
    setPulling(false);
  };

  useEffect(() => {
    loadItineraryVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) {
        loadFinalCostSheetVersion(db, query.id).then(finalV => {
          if (finalV) { setFinalCostSheetVersion(finalV); pullFromCostSheet(finalV); }
        });
        return;
      }
      setVersions(loaded);
      const finalByStyle = {};
      ["brief", "detailed"].forEach(style => {
        const finalV = loaded.filter(v => v.activeTab === style).find(v => v.isFinal);
        if (finalV) finalByStyle[style] = finalV.version;
      });
      setFinalVersionByStyle(finalByStyle);
      // Load the most recently saved version overall into the draft, in
      // whichever style it was -- the tab switches to match it.
      loadVersionIntoDraft(loaded[loaded.length - 1]);
      setPulledFromCostSheetVersion(loaded[loaded.length - 1].pulledFromCostSheetVersion ?? null);
      loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
    });
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion && pulledFromCostSheetVersion !== finalCostSheetVersion.version;

  const saveVersion = () => {
    const snap = { version: nextVersion, tourTitle, tagline, route, duration, activeTab, days: [...itinDays], note: versionNote, pulledFromCostSheetVersion };
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    saveItineraryVersion(db, query.id, snap, currentUser?.id);
    logAudit(db, query.id, currentUser?.name, `${activeTab==="brief"?"Brief":"Detailed"} Itinerary v${nextVersion} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(nextVersion);
    setVersionNote("");
  };

  const updateDay = (i, field, val) => setItinDays(prev => prev.map((d,idx) => idx===i ? {...d,[field]:val} : d));
  const toggleMeal = (i, m) => setItinDays(prev => prev.map((d,idx) => {
    if (idx!==i) return d;
    const meals = d.meals.includes(m) ? d.meals.filter(x=>x!==m) : [...d.meals, m].sort();
    return {...d, meals};
  }));
  const addDay = () => setItinDays(prev => [...prev, { id:Date.now(), dayLabel:`DAY-${prev.length+1}`, title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"", transports:[], arrivalFrom:"", arrivalTime:"", departureTo:"", departureTime:"" }]);
  const addDayTransport = (i) => setItinDays(prev=>prev.map((d,idx)=>idx===i?{...d,transports:[...(d.transports||[]),{type:"Flight",number:"",from:"",to:"",time:""}]}:d));
  const removeDayTransport = (i,ti) => setItinDays(prev=>prev.map((d,idx)=>idx===i?{...d,transports:(d.transports||[]).filter((_,tidx)=>tidx!==ti)}:d));
  const updateDayTransport = (i,ti,f,v) => setItinDays(prev=>prev.map((d,idx)=>idx===i?{...d,transports:(d.transports||[]).map((t,tidx)=>tidx===ti?{...t,[f]:v}:t)}:d));
  const removeDay = (i) => setItinDays(prev => prev.filter((_,idx)=>idx!==i));

  const inp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };
  const ta = { ...inp, minHeight:80, resize:"vertical" };

  const buildPrintHTML = () => {
    const tmpl = { ...DEFAULT_ITINERARY_TEMPLATE, ...((activeTab === "detailed" ? detailTemplate : briefTemplate) || {}) };
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin:14pt auto 0" alt="Stamp"/>` : '';

    const titleBlock = `
      <div style="text-align:center;margin-bottom:16pt">
        <div class="inv-title" style="margin-bottom:2pt">${tourTitle||"Tour Itinerary"}</div>
        <div style="font-size:11pt;font-weight:600;color:#1A3A52">${duration}</div>
        ${route?`<div style="font-size:10pt;color:#666;margin-top:2pt">${route}</div>`:''}
        ${tagline?`<div style="font-size:9.5pt;font-style:italic;color:#666;margin-top:4pt">"${tagline}"</div>`:''}
      </div>
      <div style="height:2pt;background:linear-gradient(90deg,#cb0f0f,#061bb0);border-radius:2pt;margin-bottom:14pt"></div>
      <div style="text-align:center;font-size:12pt;font-weight:700;letter-spacing:2pt;color:#1A3A52;margin-bottom:14pt">ITINERARY</div>`;

    const dayBlocks = itinDays.map(d => {
      const mealStr = d.meals.map(m => `<span style="background:#FEF3C7;color:#92400E;padding:2pt 7pt;border-radius:10pt;font-size:8.5pt;margin-right:4pt;font-weight:600">${m==="B"?"Breakfast":m==="L"?"Lunch":"Dinner"}</span>`).join("");
      if (activeTab === "brief") {
        return `<div style="padding:9pt 0;border-bottom:0.5pt solid #eee">
          <div style="font-size:11pt;font-weight:bold;color:#1A3A52">${d.dayLabel}${d.title?" | "+d.title:""}</div>
          ${d.route||d.distance||d.time?`<div style="font-size:9pt;color:#888;margin:2pt 0">${[d.route,d.distance&&d.time?`(${d.distance} / ${d.time})`:d.distance||d.time].filter(Boolean).join(" — ")}</div>`:""}
          <div style="margin-top:5pt">${mealStr}</div>
          ${d.hotel?`<div style="font-size:9pt;color:#555;margin-top:3pt">🏨 ${d.hotel}</div>`:""}
        </div>`;
      }
      return `<div style="margin-bottom:16pt">
        <div style="font-size:12pt;font-weight:bold;color:#1A3A52;margin-bottom:2pt">${d.dayLabel}${d.title?" | "+d.title:""}</div>
        ${d.route||d.distance||d.time?`<div style="font-size:9.5pt;color:#8B1A1A;font-weight:600;margin-bottom:5pt">${[d.route,d.distance&&d.time?`(${d.distance} / ${d.time})`:d.distance||d.time].filter(Boolean).join(" — ")}</div>`:""}
        <p style="font-size:9.5pt;color:#333;line-height:1.6;margin:6pt 0">${(d.description||"").replace(/\n/g,"<br/>")}</p>
        <div style="margin-top:6pt">${mealStr}</div>
        ${d.hotel?`<div style="font-size:9pt;color:#555;margin-top:5pt">🏨 Overnight: ${d.hotel}</div>`:""}
      </div>`;
    }).join("");

    const closingBlock = `
      <div style="text-align:center;margin-top:18pt;font-size:9.5pt;color:#8B1A1A;font-weight:bold;letter-spacing:1pt">
        ${tmpl.closingTagline}
      </div>
      ${stampHTML}`;

    return buildLetterheadDocument({
      title: `${tourTitle} — Itinerary`,
      bodyBlocks: [titleBlock, dayBlocks, closingBlock],
      headerAllPages, footerAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = () => printHTML(buildPrintHTML());

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:780, height:"100vh", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>ITINERARY BUILDER · {activeTab==="brief"?"BRIEF":"DETAILED"} · {versionsForStyle.length>0?`v${nextVersion-1} saved`:"unsaved"}</div>
              <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
                {query.groupName||query.clientName||query.agentName}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.id} · {query.destination}</div>
            </div>
            {versionsForStyle.length > 0 && (
              <div style={{display:"flex",gap:4}}>
                {versionsForStyle.map(v=>(
                  <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                    <div onClick={()=>loadVersionIntoDraft(v)} title={v.note||`View v${v.version}`}
                      style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                      v{v.version}
                    </div>
                    <div onClick={()=>{if(readOnly)return;setFinalVersionByStyle(p=>({...p,[activeTab]:v.version}));markItineraryVersionFinal(db,query.id,v.version,activeTab);logAudit(db,query.id,currentUser?.name,`${activeTab==="brief"?"Brief":"Detailed"} Itinerary v${v.version} marked final`);}} title="Mark as final"
                      style={{padding:"3px 6px",background:finalVersionByStyle[activeTab]===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                      {finalVersionByStyle[activeTab]===v.version?"★":"☆"}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{nextVersion}</button>}
            <button onClick={handlePrint} className="btn btn-success" style={{ fontSize:11 }}>🖨 Print / PDF</button>
            <button onClick={onClose} className="btn btn-ghost" style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
          </div>
          {isStaleVsCostSheet && !readOnly && (
            <div style={{background:"#FEF9E7",border:"1px solid #F7DC6F",borderRadius:6,padding:"6px 10px",fontSize:10.5,color:"#7D6608",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{flex:1}}>
                Cost Sheet v{finalCostSheetVersion.version} (final) has route/hotel data
                {pulledFromCostSheetVersion ? ` newer than what this was last pulled from (v${pulledFromCostSheetVersion})` : " that hasn't been pulled in yet"}.
              </span>
              <button onClick={()=>pullFromCostSheet(finalCostSheetVersion)} disabled={pulling} className="btn btn-primary" style={{fontSize:10.5,padding:"3px 8px",flexShrink:0}}>
                {pulling ? "Pulling…" : "↻ Pull latest"}
              </button>
            </div>
          )}
          {pullMessage && (
            <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:6,padding:"6px 10px",fontSize:10.5,color:"#1E40AF",marginBottom:8}}>
              {pullMessage}
            </div>
          )}
          {/* Itinerary style switcher */}
          <div style={{ display:"flex", gap:4 }}>
            {[["brief","📋 Brief"],["detailed","📖 Detailed"]].map(([id,label])=>(
              <button key={id} onClick={()=>setActiveTab(id)}
                style={{ padding:"5px 14px", borderRadius:5, border:"none", cursor:"pointer",
                  background:activeTab===id?"rgba(255,255,255,0.15)":"transparent",
                  color:activeTab===id?"#fff":"rgba(255,255,255,0.5)",
                  fontSize:12, fontWeight:activeTab===id?600:400, fontFamily:"'Inter',sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>
        <LetterheadToggleBar toggles={toggles} G={G}/>

        {viewMode === "content" ? (
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

            {/* Tour meta */}
            <div style={{ background:G.gray50, borderRadius:8, border:`1px solid ${G.gray200}`, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:G.gray600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:10 }}>Tour Header</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Tour Title</div>
                  <input style={inp} value={tourTitle} onChange={e=>setTourTitle(e.target.value)} placeholder="e.g. LADAKH UNPLUGGED"/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Duration</div>
                  <input style={inp} value={duration} onChange={e=>setDuration(e.target.value)} placeholder="7 Days / 6 Nights"/>
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Route / Destinations</div>
                <input style={inp} value={route} onChange={e=>setRoute(e.target.value)} placeholder="Delhi – Leh – Alchi – Pangong – Nubra Valley"/>
              </div>
              <div>
                <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Tagline (optional)</div>
                <input style={inp} value={tagline} onChange={e=>setTagline(e.target.value)} placeholder={`"Embark on an unforgettable journey..."`}/>
              </div>
            </div>

            {/* Day cards */}
            {itinDays.map((d,i)=>(
              <div key={d.id} style={{ background:G.white, border:`1px solid ${G.gray200}`, borderRadius:10, marginBottom:10, overflow:"hidden" }}>
                {/* Day header */}
                <div style={{ background:G.gray50, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${G.gray200}` }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:G.navy, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1, display:"flex", gap:8 }}>
                    <input style={{...inp, width:70, textAlign:"center", fontWeight:600}} value={d.dayLabel} onChange={e=>updateDay(i,"dayLabel",e.target.value)}/>
                    <input style={{...inp, flex:1, fontWeight:600}} value={d.title} onChange={e=>updateDay(i,"title",e.target.value)} placeholder="Day title e.g. Arrival at Delhi"/>
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    {["B","L","D"].map(m=>(
                      <button key={m} onClick={()=>toggleMeal(i,m)}
                        style={{ width:26, height:26, borderRadius:4, border:`1px solid ${d.meals.includes(m)?G.accent:G.gray200}`,
                          background:d.meals.includes(m)?"#FDEDEC":G.white, color:d.meals.includes(m)?G.accent:G.gray400,
                          fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <span style={{ cursor:"pointer", color:G.gray400 }} onClick={()=>removeDay(i)}>✕</span>
                </div>

                {/* Day body */}
                <div style={{ padding:"12px 14px" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:8, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Route / Movement</div>
                      <input style={inp} value={d.route} onChange={e=>updateDay(i,"route",e.target.value)} placeholder="e.g. Leh – Alchi – Leh"/>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Distance (km)</div>
                      <input style={inp} value={d.distance} onChange={e=>updateDay(i,"distance",e.target.value)} placeholder="65 km"/>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Drive Time</div>
                      <input style={inp} value={d.time} onChange={e=>updateDay(i,"time",e.target.value)} placeholder="1.5 hrs"/>
                    </div>
                  </div>
                  {activeTab === "detailed" && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Detailed Description</div>
                      <textarea style={ta} value={d.description} onChange={e=>updateDay(i,"description",e.target.value)}
                        placeholder="After breakfast, drive to... Visit ... Overnight stay at hotel."/>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Hotel / Overnight</div>
                    <input style={inp} value={d.hotel} onChange={e=>updateDay(i,"hotel",e.target.value)} placeholder="e.g. Hotel Leh Palace / Similar"/>
                  </div>
                </div>
                {/* Flights / Trains */}
                <div style={{marginTop:8,padding:"0 14px"}}>
                  <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Flights / Trains (add as many as needed)</div>
                  {(d.transports||[]).map((t,ti)=>(
                    <div key={ti} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:5}}>
                      <select style={{...inp,fontSize:10}} value={t.type||"Flight"} onChange={e=>updateDayTransport(i,ti,"type",e.target.value)}>
                        {["Flight","Train"].map(x=><option key={x}>{x}</option>)}
                      </select>
                      <input style={{...inp,fontSize:10}} value={t.number||""} onChange={e=>updateDayTransport(i,ti,"number",e.target.value)} placeholder="Flight/Train No."/>
                      <input style={{...inp,fontSize:10}} value={t.from||""} onChange={e=>updateDayTransport(i,ti,"from",e.target.value)} placeholder="From (e.g. DEL)"/>
                      <input style={{...inp,fontSize:10}} value={t.to||""} onChange={e=>updateDayTransport(i,ti,"to",e.target.value)} placeholder="To (e.g. LEH)"/>
                      <input style={{...inp,fontSize:10}} value={t.time||""} onChange={e=>updateDayTransport(i,ti,"time",e.target.value)} placeholder="Time"/>
                      <span style={{cursor:"pointer",color:G.gray400,fontSize:13,alignSelf:"center"}} onClick={()=>removeDayTransport(i,ti)}>✕</span>
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>addDayTransport(i)}>+ Flight/Train</button>
                </div>
                {/* Arrival / Departure for this day */}
                <div style={{marginTop:8,padding:"0 14px 12px"}}>
                  <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Arrival / Departure Details</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <input style={{...inp,fontSize:10}} value={d.arrivalFrom||""} onChange={e=>updateDay(i,"arrivalFrom",e.target.value)} placeholder="Arrival from (city/country)"/>
                    <input style={{...inp,fontSize:10}} value={d.arrivalTime||""} onChange={e=>updateDay(i,"arrivalTime",e.target.value)} placeholder="Arrival time"/>
                    <input style={{...inp,fontSize:10}} value={d.departureTo||""} onChange={e=>updateDay(i,"departureTo",e.target.value)} placeholder="Departure to (city/country)"/>
                    <input style={{...inp,fontSize:10}} value={d.departureTime||""} onChange={e=>updateDay(i,"departureTime",e.target.value)} placeholder="Departure time"/>
                  </div>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ fontSize:11, marginBottom:24 }} onClick={addDay}>+ Add Day</button>
          </div>
        ) : (
          <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
            <DocPreviewFrame html={buildPrintHTML()}/>
          </div>
        )}

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex", gap:10, flexShrink:0, background:G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{ flex:1 }}/>
          <button onClick={handlePrint} className="btn btn-primary">🖨 Print</button>
          {!readOnly && <button onClick={saveVersion} className="btn btn-primary">💾 Save v{nextVersion}</button>}
        </div>
      </div>
    </div>
  );
}
