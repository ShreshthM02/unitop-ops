import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML } = Lib;

export default function MealPlanDocument({ query, onClose }) {
  const [rows,setRows]=useState([{id:1,day:"Day 1",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:2,day:"Day 2",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:3,day:"Day 3",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const [heading,setHeading]=useState("Meal Plan");
  const [activeTab, setActiveTab] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerAllPages, footerAllPages, printOnLetterhead } = toggles;
  const updateRow=(i,f,v)=>setRows(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const addRow=()=>setRows(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const inp={padding:"5px 7px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

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
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MEAL PLAN</div>
            <input value={heading} onChange={e=>setHeading(e.target.value)} style={{background:"transparent",border:"none",color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Playfair Display',serif",outline:"none",width:"100%"}}/>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.groupName||query.clientName} · {query.id}</div>
          </div>
          <button onClick={handlePrint} className="btn btn-primary" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
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
