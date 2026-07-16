import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function DestinationOverlapView({ queries, tours }) {
  const [dateRange, setDateRange] = useState(0); // week index offset
  // Build a 21-day window centred on today
  const today = new Date(2026,5,22);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 3 + dateRange * 7);
  const days = Array.from({length:21},(_,i)=>{
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate()+i);
    return d;
  });
  const fmt = d => `${d.getDate()}/${d.getMonth()+1}`;
  const isToday = d => d.toDateString()===today.toDateString();

  // Extract destination cities from sector/destination string
  const extractCities = (str="") => {
    const known = ["Delhi","Agra","Jaipur","Varanasi","Leh","Bodh Gaya","Mumbai","Kolkata","Goa","Jaisalmer","Udaipur","Jodhpur","Pune","Bangalore","Kochi"];
    return known.filter(c => str.toLowerCase().includes(c.toLowerCase()));
  };

  // Build per-destination per-day groups
  const cityMap = {};
  queries.filter(q=>q.status!=="completed"&&q.status!=="new_query").forEach(q=>{
    const cities = extractCities(q.destination||q.sector||"");
    cities.forEach(city=>{
      if(!cityMap[city]) cityMap[city]=[];
      cityMap[city].push(q);
    });
  });

  const cityColors = ["#1A5276","#0E6655","#784212","#6C3483","#C0392B","#117A65","#1F618D"];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600}}>Destination Overlap — <span style={{color:G.accent}}>Active Tours by City</span></div>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setDateRange(r=>r-1)}>← Prev</button>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setDateRange(0)}>Today</button>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setDateRange(r=>r+1)}>Next →</button>
        </div>
      </div>

      {Object.keys(cityMap).length===0 ? (
        <div style={{textAlign:"center",padding:48,color:G.gray400}}>
          <div style={{fontSize:28,marginBottom:8}}>🗺</div>
          <div style={{fontSize:14,fontWeight:500}}>No active multi-destination tours yet</div>
          <div style={{fontSize:12,marginTop:4}}>Destination overlaps will appear here once tours are in Operations stage.</div>
        </div>
      ) : (
        <div style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead>
                <tr>
                  <th style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:G.gray600,textAlign:"left",borderBottom:`1px solid ${G.gray200}`,background:G.gray50,minWidth:100}}>
                    Destination
                  </th>
                  {days.map((d,i)=>(
                    <th key={i} style={{padding:"6px 3px",fontSize:9,fontWeight:isToday(d)?700:500,
                      color:isToday(d)?G.accent:G.gray600,textAlign:"center",
                      borderBottom:`1px solid ${G.gray200}`,background:isToday(d)?"#FEF2F2":G.gray50,
                      borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",minWidth:32}}>
                      {fmt(d)}<br/>{["S","M","T","W","T","F","S"][d.getDay()]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(cityMap).map(([city, cityQueries], ci)=>(
                  <tr key={city}>
                    <td style={{padding:"8px 12px",fontSize:12,fontWeight:600,color:cityColors[ci%cityColors.length],
                      borderBottom:`1px solid ${G.gray100}`,background:G.white,verticalAlign:"middle"}}>
                      📍 {city}
                      <div style={{fontSize:10,color:G.gray400,fontWeight:400}}>{cityQueries.length} group{cityQueries.length>1?"s":""}</div>
                    </td>
                    {days.map((d,di)=>{
                      const activeGroups = cityQueries.filter(q=>{
                        // Check if this query's travel date window includes this day
                        const tDate = q.travelDate ? new Date(q.travelDate) : null;
                        if(!tDate) return false;
                        const nights = parseInt(q.nights)||7;
                        const end = new Date(tDate); end.setDate(tDate.getDate()+nights);
                        return d >= tDate && d <= end;
                      });
                      const hasOverlap = activeGroups.length > 1;
                      const hasAny = activeGroups.length > 0;
                      return (
                        <td key={di} style={{padding:"4px 2px",textAlign:"center",
                          borderBottom:`1px solid ${G.gray100}`,
                          borderLeft:isToday(d)?`2px solid ${G.accent}`:"none",
                          background:isToday(d)?"#FFF9F8":G.white}}>
                          {hasOverlap ? (
                            <div style={{position:"relative",display:"inline-block"}}>
                              <div style={{width:22,height:22,borderRadius:4,background:"#FEF3C7",border:"1.5px solid #F59E0B",
                                display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#92400E",
                                cursor:"pointer"}} title={activeGroups.map(q=>q.groupName||q.clientName).join(", ")}>
                                {activeGroups.length}⚡
                              </div>
                            </div>
                          ) : hasAny ? (
                            <div style={{width:20,height:20,borderRadius:3,
                              background:cityColors[ci%cityColors.length],opacity:0.7,margin:"0 auto"}}
                              title={activeGroups[0]?.groupName||activeGroups[0]?.clientName}/>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:"8px 12px",background:G.gray50,borderTop:`1px solid ${G.gray200}`,display:"flex",gap:16,fontSize:11,color:G.gray400}}>
            <span>■ Single group on ground</span>
            <span style={{color:"#92400E",fontWeight:600}}>⚡ Multiple groups overlapping — logistical opportunity</span>
            <span style={{color:G.accent}}>| Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. CANCEL QUERY / TOUR FILE ──────────────────────────────────────────────
