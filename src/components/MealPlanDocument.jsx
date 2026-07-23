import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_MEALPLAN_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML, loadMealPlanVersions, saveMealPlanVersion, markMealPlanVersionFinal, loadFinalCostSheetVersion, extractItineraryFromCostSheetDays, logAudit, db } = Lib;

export default function MealPlanDocument({ query, template, onClose, currentUser, readOnly }) {
  const tmpl = { ...DEFAULT_MEALPLAN_TEMPLATE, ...(template||{}) };
  const [rows,setRows]=useState([{id:1,day:"Day 1",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:2,day:"Day 2",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:3,day:"Day 3",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const [heading,setHeading]=useState(tmpl.defaultHeading);
  const [activeTab, setActiveTab] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerAllPages, footerAllPages, printOnLetterhead } = toggles;
  const updateRow=(i,f,v)=>setRows(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const addRow=()=>setRows(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const inp={padding:"5px 7px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  // Real version history, same pattern as Cost Sheet/Quotation (Phase 0
  // of the Document Chain plan -- see docs/DATA_OWNERSHIP.md). Previously
  // this document had no persistence at all; closing the panel lost
  // everything typed.
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionNote, setVersionNote] = useState("");

  const loadVersionIntoDraft = (v) => {
    setHeading(v.heading || tmpl.defaultHeading);
    setRows(v.rows && v.rows.length ? v.rows : rows);
    setViewingVersion(v.version);
  };

  const [pulledFromCostSheetVersion, setPulledFromCostSheetVersion] = useState(null);
  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  const [pullMessage, setPullMessage] = useState("");
  const [pulling, setPulling] = useState(false);

  // Phase 4 of the Document Chain plan (docs/DATA_OWNERSHIP.md): pulls
  // from the star-marked Cost Sheet directly, not a specific linked
  // costSheetId the way Quotation has -- Meal Plan is opened
  // independently from the toolbar, not launched from a specific Cost
  // Sheet save, so there's no "the one it was created from" to track.
  // Uses the same shared extraction library (extractItineraryFromCostSheetDays)
  // Quotation uses, not a separate reimplementation.
  const pullFromCostSheet = async (targetVersion) => {
    setPulling(true);
    setPullMessage("");
    try {
      const source = targetVersion || finalCostSheetVersion;
      if (!source) { setPullMessage("No final Cost Sheet found for this tour yet."); setPulling(false); return; }
      const extracted = extractItineraryFromCostSheetDays(source.days);
      if (extracted.length > 0) {
        setRows(extracted.map((d,i) => ({ id: i+1, day: d.day, date: "", movement: d.movement, breakfast: d.breakfast, lunch: d.lunch, dinner: d.dinner, notes: "" })));
      }
      setPulledFromCostSheetVersion(source.version);
      setPullMessage(`Pulled from Cost Sheet v${source.version}.`);
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    }
    setPulling(false);
  };

  useEffect(() => {
    loadMealPlanVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) {
        // Safe by construction: only auto-fires when there are zero
        // saved versions, so there's nothing yet to overwrite.
        loadFinalCostSheetVersion(db, query.id).then(finalV => {
          if (finalV) { setFinalCostSheetVersion(finalV); pullFromCostSheet(finalV); }
        });
        return;
      }
      setVersions(loaded);
      setVersion(Math.max(...loaded.map(v => v.version)) + 1);
      const finalV = loaded.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
      setPulledFromCostSheetVersion(loaded[loaded.length - 1].pulledFromCostSheetVersion ?? null);
      loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
    });
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion && pulledFromCostSheetVersion !== finalCostSheetVersion.version;

  const saveVersion = () => {
    const snap = { version, heading, rows: [...rows], note: versionNote, pulledFromCostSheetVersion };
    setVersions(p => [...p.filter(v => v.version !== version), { ...snap, date: new Date().toLocaleString("en-IN") }]);
    saveMealPlanVersion(db, query.id, snap, currentUser?.id);
    logAudit(db, query.id, currentUser?.name, `Meal Plan v${version} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(version);
    setVersionNote("");
    setVersion(v => v+1);
  };

  const buildPrintHTML = () => {
    const today = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin-top:10pt" alt="Stamp"/>` : '';

    const bodyBlock = `
      <h2>${heading}</h2>
      <p style="margin-bottom:10pt;font-size:10pt"><b>Group:</b> ${query.groupName||query.clientName} &nbsp;|&nbsp; <b>Tour File:</b> ${query.tourFileId||query.id} &nbsp;|&nbsp; <b>Date:</b> ${today}</p>
      <table class="content-table"><thead><tr><th>Day</th><th>Date</th><th>Itinerary / Movement</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Notes</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r.day}</td><td>${r.date||"—"}</td><td>${r.movement||"—"}</td><td>${r.breakfast||"—"}</td><td>${r.lunch||"—"}</td><td>${r.dinner||"—"}</td><td>${r.notes||""}</td></tr>`).join("")}</tbody></table>
      ${stampHTML}`;

    return buildLetterheadDocument({
      title: `Meal Plan — ${query.groupName||query.clientName}`,
      extraHeadCSS: `h2{color:#1A3A52;font-family:Georgia,serif;margin-bottom:4pt;font-size:14pt}`,
      bodyBlocks: [bodyBlock],
      headerAllPages, footerAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = () => printHTML(buildPrintHTML());

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:800,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MEAL PLAN · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <input value={heading} onChange={e=>setHeading(e.target.value)} style={{background:"transparent",border:"none",color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Playfair Display',serif",outline:"none",width:"100%"}}/>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.groupName||query.clientName} · {query.id}</div>
          </div>
          {versions.length > 0 && (
            <div style={{display:"flex",gap:4}}>
              {versions.map(v=>(
                <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                  <div onClick={()=>loadVersionIntoDraft(v)} title={v.note||`View v${v.version}`}
                    style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                    v{v.version}
                  </div>
                  <div onClick={()=>{if(readOnly)return;setFinalVersion(v.version);markMealPlanVersionFinal(db,query.id,v.version);logAudit(db,query.id,currentUser?.name,`Meal Plan v${v.version} marked final`);}} title="Mark as final"
                    style={{padding:"3px 6px",background:finalVersion===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                    {finalVersion===v.version?"★":"☆"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          <button onClick={handlePrint} className="btn btn-primary" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        {isStaleVsCostSheet && !readOnly && (
          <div style={{background:"#FEF9E7",borderBottom:"1px solid #F7DC6F",padding:"6px 18px",fontSize:11,color:"#7D6608",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
            <span style={{flex:1}}>
              Cost Sheet v{finalCostSheetVersion.version} (final) has meal-plan data
              {pulledFromCostSheetVersion ? ` newer than what this was last pulled from (v${pulledFromCostSheetVersion})` : " that hasn't been pulled in yet"}.
            </span>
            <button onClick={()=>pullFromCostSheet(finalCostSheetVersion)} disabled={pulling} className="btn btn-primary" style={{fontSize:10.5,padding:"3px 8px",flexShrink:0}}>
              {pulling ? "Pulling…" : "↻ Pull latest"}
            </button>
          </div>
        )}
        {pullMessage && (
          <div style={{background:"#EFF6FF",borderBottom:"1px solid #BFDBFE",padding:"6px 18px",fontSize:11,color:"#1E40AF",flexShrink:0}}>
            {pullMessage}
          </div>
        )}
        <DocTabBar activeTab={activeTab} setActiveTab={setActiveTab} G={G}/>
        <LetterheadToggleBar toggles={toggles} G={G}/>
        {activeTab === "content" ? (
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:G.navy}}>{["Day","Date","Itinerary / Movement","☕ Breakfast","🍽 Lunch","🍛 Dinner","Notes",""].map(h=><th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r,i)=><tr key={r.id} style={{background:i%2===0?G.white:G.gray50}}>
                <td style={{padding:"3px 4px"}}><input style={{...inp,width:52}} value={r.day} onChange={e=>updateRow(i,"day",e.target.value)}/></td>
                <td style={{padding:"3px 4px"}}><input style={{...inp,width:86}} type="date" value={r.date} onChange={e=>updateRow(i,"date",e.target.value)}/></td>
                <td style={{padding:"3px 4px",minWidth:120}}><input style={inp} value={r.movement||""} onChange={e=>updateRow(i,"movement",e.target.value)} placeholder="e.g. Delhi → Agra"/></td>
                <td style={{padding:"3px 4px"}}><input style={inp} value={r.breakfast} onChange={e=>updateRow(i,"breakfast",e.target.value)} placeholder="Venue"/></td>
                <td style={{padding:"3px 4px"}}><input style={inp} value={r.lunch} onChange={e=>updateRow(i,"lunch",e.target.value)} placeholder="Venue"/></td>
                <td style={{padding:"3px 4px"}}><input style={inp} value={r.dinner} onChange={e=>updateRow(i,"dinner",e.target.value)} placeholder="Venue"/></td>
                <td style={{padding:"3px 4px"}}><input style={inp} value={r.notes} onChange={e=>updateRow(i,"notes",e.target.value)}/></td>
                <td style={{padding:"3px 4px"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setRows(p=>p.filter((_,xi)=>xi!==i))}>✕</span></td>
              </tr>)}</tbody>
            </table>
            <button className="btn btn-ghost" style={{fontSize:11,marginTop:8}} onClick={addRow}>+ Add Day</button>
          </div>
        ) : (
          <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
            <DocPreviewFrame html={buildPrintHTML()}/>
          </div>
        )}
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/><button onClick={handlePrint} className="btn btn-primary">🖨 Print / Export PDF</button>
        </div>
      </div>
    </div>
  );
}
