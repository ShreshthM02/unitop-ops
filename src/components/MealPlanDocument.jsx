import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function MealPlanDocument({ query, onClose }) {
  const [rows,setRows]=useState([{id:1,day:"Day 1",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:2,day:"Day 2",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:3,day:"Day 3",date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const [heading,setHeading]=useState("Meal Plan");
  const updateRow=(i,f,v)=>setRows(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const addRow=()=>setRows(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const inp={padding:"5px 7px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const handlePrint=()=>{
    const win=window.open("","_blank");
    const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});
    win.document.write(`<!DOCTYPE html><html><head><title>Meal Plan</title>
    <style>body{font-family:Arial,sans-serif;margin:20px 30px;font-size:10pt}
    .lh{text-align:center;padding-bottom:10pt;margin-bottom:12pt}
    .lh img{height:62pt;display:block;margin:0 auto 6pt}
    .lh-addr{font-size:8.5pt;color:#2a2a2a;line-height:1.5;margin-bottom:2pt}
    .rule{height:2pt;border:none;background:linear-gradient(to right, #cb0f0f, #061bb0);margin-bottom:12pt}
    h2{color:#1A3A52;font-family:Georgia,serif;margin-bottom:4pt}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th{background:#1A3A52;color:#fff;padding:6pt 7pt;text-align:left}
    td{padding:5pt 7pt;border-bottom:1pt solid #e5e7eb;vertical-align:top}
    tr:nth-child(even) td{background:#f9fafb}
    .footer{margin-top:16pt;padding-top:8pt;border-top:1pt solid #ccc;display:flex;justify-content:space-between;align-items:center}
    .footer img{height:32pt;width:auto}</style></head><body>
    <div class="lh">
      <img src="${LOGO_B64}" alt="Unitop" style="height:92pt;width:auto;display:block;margin:0 auto 3pt"/>
      <div class="lh-addr" style="font-size:9pt;letter-spacing:0.3pt;text-align:center;color:#2a2a2a;line-height:1.65">Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058</div>
      <div class="lh-addr" style="font-size:9pt;letter-spacing:0.3pt;text-align:center;color:#2a2a2a;line-height:1.65">Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018</div>
      <div class="lh-addr" style="font-size:9pt;letter-spacing:0.3pt;text-align:center;color:#2a2a2a;line-height:1.65;margin-bottom:0">Website: www.unitoptours.com &nbsp;|&nbsp; E-Mail: unitoptours@gmail.com &nbsp;|&nbsp; Telephone:&nbsp;+91&#8209;124&#8209;4476571</div>
      <div style="height:2pt;border:none;background:linear-gradient(to right,#cb0f0f,#061bb0);margin:7pt 0 10pt;border-radius:1pt"></div>
    </div>
    <div class="rule"></div>
    <h2>${heading}</h2>
    <p style="margin-bottom:10pt;font-size:10pt"><b>Group:</b> ${query.groupName||query.clientName} &nbsp;|&nbsp; <b>Tour File:</b> ${query.tourFileId||query.id} &nbsp;|&nbsp; <b>Date:</b> ${today}</p>
    <table><thead><tr><th>Day</th><th>Date</th><th>Itinerary / Movement</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th><th>Notes</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${r.day}</td><td>${r.date||"—"}</td><td>${r.movement||"—"}</td><td>${r.breakfast||"—"}</td><td>${r.lunch||"—"}</td><td>${r.dinner||"—"}</td><td>${r.notes||""}</td></tr>`).join("")}</tbody></table>
    <div style="margin-top:auto;padding-top:10pt">
      <div style="height:0.75pt;background:linear-gradient(to right,#cb0f0f,#061bb0);margin-bottom:7pt"></div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <img src="${BADGE_MOT_B64}" alt="MOT" style="height:44pt;width:auto;margin-left:72pt"/>
        <img src="${BADGE_INDIA_B64}" style="height:44pt;width:auto" alt="Incredible India"/>
        <img src="${BADGE_IATO_B64}" style="height:44pt;width:auto" alt="IATO"/>
        <div style="text-align:right;margin-right:72pt">
          <img src="${BADGE_AWARD_B64}" style="height:36pt;width:auto;display:block;margin-left:auto" alt="Award"/>
          <div style="font-size:6pt;font-weight:700;color:#1A3A52;text-transform:uppercase;letter-spacing:0.4pt;margin-top:3pt">NATIONAL TOURISM AWARD WINNER</div>
          <div style="font-size:6pt;color:#666;border-top:0.5pt solid #ccc;padding-top:1.5pt;margin-top:1.5pt">2013-14 | 2016-17 | 2018-19</div>
        </div>
      </div>
    </div>
    </body></html>`);
    win.document.close(); setTimeout(()=>win.print(),500);
  };
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
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/><button onClick={handlePrint} className="btn btn-primary">🖨 Print / Export PDF</button>
        </div>
      </div>
    </div>
  );
}


// ─── ALL_REPORTS ─────────────────────────────────────────────────────────────
// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────

// ─── TOUR BRIEFING SHEET ──────────────────────────────────────────────────────


// ─── MEAL PLAN DOCUMENT ───────────────────────────────────────────────────────

// ─── IN-APP CHAT ──────────────────────────────────────────────────────────────
