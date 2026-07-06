import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, getMovementChartRows, printHTML } = Lib;

export default function GanttView({ queries, tours, onOpenQuery }) {
  const [calTab, setCalTab]         = useState("gantt");
  const [selectedYear,  setYear]    = useState(()=>new Date().getFullYear());
  const [selectedMonth, setMonth]   = useState(()=>new Date().getMonth()); // 0-indexed, defaults to current month

  // ── GANTT ──────────────────────────────────────────────────────────────────
  // Build days for selected month
  const daysInMonth = new Date(selectedYear, selectedMonth+1, 0).getDate();
  const monthDays = Array.from({length:daysInMonth},(_,i)=>i+1);
  const todayD = new Date(); // June 22 2026

  const isToday = (day) => {
    return todayD.getFullYear()===selectedYear && todayD.getMonth()===selectedMonth && todayD.getDate()===day;
  };

  // Parse a YYYY-MM-DD string as local midnight (avoids UTC-shift off-by-one)
  const parseLocalDate = (str) => {
    if(!str||typeof str!=="string") return null;
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m) return null;
    return new Date(+m[1], +m[2]-1, +m[3]);
  };

  // Only show queries that are in operations or completed AND have a confirmed travel date
  const ganttTours = queries
    .filter(q=>["operations","completed"].includes(q.status) && !q.cancelled && q.travelDate)
    .map((q,idx)=>{
      const nights = parseInt(q.nights)||7;
      const tDate  = parseLocalDate(q.travelDate);
      return { query:q, tDate, nights, color:DEST_COLORS[idx%DEST_COLORS.length] };
    })
    .filter(t=>t.tDate);

  const barForDay = (tour, day) => {
    if(!tour.tDate) return null;
    const start = new Date(selectedYear, selectedMonth, day);
    const tourStart = tour.tDate;
    const tourEnd   = new Date(tourStart); tourEnd.setDate(tourStart.getDate()+tour.nights);
    if(start < tourStart || start > tourEnd) return null;
    const isFirst = start.toDateString()===tourStart.toDateString();
    const isLast  = start.toDateString()===tourEnd.toDateString();
    return { isFirst, isLast };
  };

  // ── OVERLAP ─────────────────────────────────────────────────────────────────
  const extractCities = (str="") => {
    const known = ["Delhi","Agra","Jaipur","Varanasi","Leh","Bodh Gaya","Mumbai","Kolkata","Goa","Jaisalmer","Udaipur","Jodhpur","Kochi","Amritsar","Rishikesh","Manali","Shimla"];
    return known.filter(c=>str.toLowerCase().includes(c.toLowerCase()));
  };

  const cityMap = {};
  queries.filter(q=>["operations","costing","finance"].includes(q.status)&&!q.cancelled).forEach(q=>{
    extractCities((q.destination||q.sector||"")).forEach(city=>{
      if(!cityMap[city]) cityMap[city]=[];
      if(!cityMap[city].find(x=>x.id===q.id)) cityMap[city].push(q);
    });
  });

  const overlapDays = Array.from({length:daysInMonth},(_,i)=>i+1);

  const isInCity = (q, day) => {
    if(!q.travelDate) return false;
    const d = new Date(selectedYear, selectedMonth, day);
    const s = parseLocalDate(q.travelDate);
    if(!s) return false;
    const e = new Date(s); e.setDate(s.getDate()+(parseInt(q.nights)||7));
    return d>=s && d<=e;
  };

  const availableYears = [2025,2026,2027];
  const availableMonths = MONTH_NAMES.map((m,i)=>({label:m,i}));

  return (
    <div>
      {/* Month / Year selector */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <select style={{padding:"5px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:600,color:G.navy,outline:"none"}}
          value={selectedYear} onChange={e=>setYear(Number(e.target.value))}>
          {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {availableMonths.map(({label,i})=>(
            <button key={i} onClick={()=>setMonth(i)}
              style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${selectedMonth===i?G.accent:G.gray200}`,
                background:selectedMonth===i?G.accent:G.white,
                color:selectedMonth===i?"#fff":G.gray600,
                fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:selectedMonth===i?600:400}}>
              {label}
            </button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",background:G.gray100,borderRadius:8,padding:3,gap:2}}>
          {[["gantt","📅 Gantt"],["overlap","⚡ Overlap"],["movement","📋 Movement Chart"]].map(([id,label])=>(
            <button key={id} onClick={()=>setCalTab(id)}
              style={{padding:"5px 14px",borderRadius:6,border:"none",cursor:"pointer",
                background:calTab===id?G.white:"transparent",
                color:calTab===id?G.navy:G.gray400,
                fontSize:12,fontWeight:calTab===id?600:400,
                fontFamily:"'Inter',sans-serif",
                boxShadow:calTab===id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── GANTT TAB ── */}
      {calTab==="gantt" && (
        <div>
          <div style={{fontSize:12,color:G.gray600,marginBottom:10}}>
            Tour movements for <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
            {" · "}<span style={{color:G.accent}}>Today marked in red</span>
          </div>
          <div style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",minWidth:600}}>
                <thead>
                  <tr>
                    <th style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:G.gray600,textAlign:"left",borderBottom:`1px solid ${G.gray200}`,background:G.gray50,minWidth:160,position:"sticky",left:0,zIndex:2}}>
                      Tour / Group
                    </th>
                    {monthDays.map(d=>(
                      <th key={d} style={{padding:"6px 2px",fontSize:10,fontWeight:isToday(d)?700:400,
                        color:isToday(d)?G.accent:G.gray400,textAlign:"center",
                        borderBottom:`1px solid ${G.gray200}`,background:isToday(d)?"#FEF2F2":G.gray50,
                        borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",minWidth:26}}>
                        {d}<br/>
                        <span style={{fontSize:8}}>{"SMTWTFS"[new Date(selectedYear,selectedMonth,d).getDay()]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ganttTours.length===0 && (
                    <tr><td colSpan={daysInMonth+1} style={{padding:32,textAlign:"center",color:G.gray400,fontSize:12}}>
                      No active tours in {MONTH_NAMES[selectedMonth]} {selectedYear}
                    </td></tr>
                  )}
                  {ganttTours.map((tour,ti)=>(
                    <tr key={tour.query.id} style={{background:ti%2===0?G.white:G.gray50}}>
                      <td style={{padding:"6px 12px",borderBottom:`1px solid ${G.gray100}`,verticalAlign:"middle",position:"sticky",left:0,background:ti%2===0?G.white:G.gray50,zIndex:1}}>
                        <div style={{fontSize:12,fontWeight:500}}>{tour.query.clientName||tour.query.groupName}</div>
                        <div style={{fontSize:10,color:G.gray400}}>{tour.query.id} · {tour.query.destination||tour.query.sector||""}</div>
                      </td>
                      {monthDays.map(d=>{
                        const bar = barForDay(tour, d);
                        return (
                          <td key={d} style={{padding:"3px 1px",borderBottom:`1px solid ${G.gray100}`,borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",height:36}}>
                            {bar && (
                              <div style={{height:18,background:tour.color,opacity:0.85,margin:"0 1px",
                                borderRadius:bar.isFirst&&bar.isLast?"4px":bar.isFirst?"4px 0 0 4px":bar.isLast?"0 4px 4px 0":"0",
                                display:"flex",alignItems:"center",overflow:"hidden"}}>
                                {bar.isFirst&&<span style={{fontSize:9,color:"#fff",paddingLeft:4,whiteSpace:"nowrap",overflow:"hidden",fontWeight:600}}>
                                  {(tour.query.clientName||tour.query.groupName||"").split(" ")[0]}
                                </span>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:"8px 12px",background:G.gray50,borderTop:`1px solid ${G.gray200}`,display:"flex",gap:14,fontSize:11,color:G.gray400,flexWrap:"wrap"}}>
              {ganttTours.slice(0,6).map(t=>(
                <span key={t.query.id} style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:10,height:10,borderRadius:2,background:t.color,display:"inline-block"}}/>
                  {t.query.clientName||t.query.groupName}
                </span>
              ))}
              {ganttTours.length>6&&<span>+{ganttTours.length-6} more</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── OVERLAP TAB ── */}
      {calTab==="overlap" && (
        <div>
          <div style={{fontSize:12,color:G.gray600,marginBottom:10}}>
            Destination overlaps for <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
            {" · "}<span style={{color:"#92400E",fontWeight:600}}>⚡ = multiple groups in same city</span>
          </div>
          {Object.keys(cityMap).length===0 ? (
            <div style={{textAlign:"center",padding:48,color:G.gray400,background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`}}>
              <div style={{fontSize:28,marginBottom:8}}>🗺</div>
              <div style={{fontSize:14,fontWeight:500}}>No active multi-destination tours</div>
              <div style={{fontSize:12,marginTop:4}}>Overlaps appear once tours move to Operations stage with travel dates set.</div>
            </div>
          ) : (
            <div style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:600}}>
                  <thead>
                    <tr>
                      <th style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:G.gray600,textAlign:"left",borderBottom:`1px solid ${G.gray200}`,background:G.gray50,minWidth:120,position:"sticky",left:0,zIndex:2}}>
                        City
                      </th>
                      {overlapDays.map(d=>(
                        <th key={d} style={{padding:"6px 2px",fontSize:10,fontWeight:isToday(d)?700:400,
                          color:isToday(d)?G.accent:G.gray400,textAlign:"center",
                          borderBottom:`1px solid ${G.gray200}`,background:isToday(d)?"#FEF2F2":G.gray50,
                          borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",minWidth:26}}>
                          {d}<br/><span style={{fontSize:8}}>{"SMTWTFS"[new Date(selectedYear,selectedMonth,d).getDay()]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cityMap).map(([city,cityQs],ci)=>(
                      <tr key={city}>
                        <td style={{padding:"8px 12px",fontSize:12,fontWeight:600,color:DEST_COLORS[ci%DEST_COLORS.length],
                          borderBottom:`1px solid ${G.gray100}`,position:"sticky",left:0,background:G.white,zIndex:1}}>
                          📍 {city}
                          <div style={{fontSize:10,color:G.gray400,fontWeight:400}}>{cityQs.length} group{cityQs.length>1?"s":""}</div>
                        </td>
                        {overlapDays.map(d=>{
                          const active = cityQs.filter(q=>isInCity(q,d));
                          return (
                            <td key={d} style={{padding:"3px 2px",textAlign:"center",borderBottom:`1px solid ${G.gray100}`,
                              borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",height:36}}>
                              {active.length>1 ? (
                                <div style={{width:22,height:18,borderRadius:3,background:"#FEF3C7",border:"1.5px solid #F59E0B",
                                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#92400E",margin:"0 auto",cursor:"pointer"}}
                                  title={active.map(q=>q.clientName||q.groupName).join(", ")}>
                                  {active.length}⚡
                                </div>
                              ) : active.length===1 ? (
                                <div style={{width:18,height:18,borderRadius:3,background:DEST_COLORS[ci%DEST_COLORS.length],opacity:0.75,margin:"0 auto"}}
                                  title={active[0].clientName||active[0].groupName}/>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"8px 12px",background:G.gray50,borderTop:`1px solid ${G.gray200}`,display:"flex",gap:14,fontSize:11,color:G.gray400}}>
                <span>■ Single group</span>
                <span style={{color:"#92400E",fontWeight:600}}>⚡ Multiple groups — logistical opportunity</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MOVEMENT CHART TAB ── */}
      {calTab==="movement" && (()=>{
        const rows = getMovementChartRows(queries, USERS, selectedYear, selectedMonth);
        const fmtD = (d) => d ? d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}) : "";

        const buildMovementChartHTML = () => {
          const tableRows = rows.map(r => `
            <tr>
              <td style="text-align:center">${r.sNo}</td>
              <td>${r.fileHandler||"—"}</td>
              <td>${r.tourFileId}</td>
              <td>${fmtD(r.arrDate)}</td>
              <td>${fmtD(r.depDate)}</td>
              <td>${r.fto||"—"}</td>
              <td>${r.sector||"—"}</td>
              <td style="text-align:center">${r.pax||"—"}</td>
              <td>${r.remarks||""}</td>
            </tr>`).join("");
          const tableBlock = `
            <div class="inv-title" style="margin-bottom:10pt">Movement Chart — ${MONTH_NAMES[selectedMonth]} ${selectedYear}</div>
            <table class="content-table">
              <thead><tr>
                <th style="width:4%">S.No</th><th style="width:9%">File Handler</th><th style="width:9%">Tour File</th>
                <th style="width:7%">Arr. Date</th><th style="width:7%">Dep. Date</th><th style="width:14%">FTO / Agent</th>
                <th style="width:16%">Sector</th><th style="width:5%">Pax</th><th style="width:29%">Remarks</th>
              </tr></thead>
              <tbody>${tableRows || `<tr><td colspan="9" style="text-align:center;color:#999;padding:14pt">No active tours in ${MONTH_NAMES[selectedMonth]} ${selectedYear}</td></tr>`}</tbody>
            </table>`;
          return buildLetterheadDocument({
            title: `Movement Chart — ${MONTH_NAMES[selectedMonth]} ${selectedYear}`,
            bodyBlocks: [tableBlock],
            orientation: "landscape",
            showPageNum: true,
          });
        };

        return (
          <div>
            <div style={{display:"flex",alignItems:"center",marginBottom:10,gap:10}}>
              <div style={{fontSize:12,color:G.gray600,flex:1}}>
                At-a-glance operational summary for <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong> — click any row to open that Tour File. Full detail (hotels, transport, itinerary) lives in each Tour File's own documents.
              </div>
              <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>printHTML(buildMovementChartHTML())}>🖨 Download PDF</button>
            </div>
            <div style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",minWidth:900,fontSize:12}}>
                  <thead>
                    <tr style={{background:G.gray50}}>
                      {["S.No","File Handler","Tour File","Arr. Date","Dep. Date","FTO / Agent","Sector","Pax","Remarks"].map(h=>(
                        <th key={h} style={{padding:"8px 10px",fontSize:11,fontWeight:600,color:G.gray600,textAlign:"left",borderBottom:`1px solid ${G.gray200}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length===0 && (
                      <tr><td colSpan={9} style={{padding:32,textAlign:"center",color:G.gray400,fontSize:12}}>
                        No active tours in {MONTH_NAMES[selectedMonth]} {selectedYear}
                      </td></tr>
                    )}
                    {rows.map((r,i)=>(
                      <tr key={r.tourFileId+i} style={{background:i%2===0?G.white:G.gray50,cursor:"pointer"}}>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`}}>{r.sNo}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`}}>{r.fileHandler||"—"}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`,fontWeight:600,color:G.navy,textDecoration:onOpenQuery?"underline":"none",cursor:onOpenQuery?"pointer":"default"}} onClick={()=>onOpenQuery&&onOpenQuery(r.query)}>{r.tourFileId}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`,whiteSpace:"nowrap"}}>{fmtD(r.arrDate)}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`,whiteSpace:"nowrap"}}>{fmtD(r.depDate)}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`}}>{r.fto||"—"}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`}}>{r.sector||"—"}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`,textAlign:"center"}}>{r.pax||"—"}</td>
                        <td style={{padding:"7px 10px",borderBottom:`1px solid ${G.gray100}`,color:G.gray600}}>{r.remarks||""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── TEAM VIEW ────────────────────────────────────────────────────────────────
