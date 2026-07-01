import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function ItineraryBuilder({ query, onClose, currentUser }) {
  const [tourTitle, setTourTitle] = useState(query.destination || "");
  const [tagline, setTagline] = useState("");
  const [route, setRoute] = useState("");
  const [duration, setDuration] = useState(`${query.nights || "?"} Days / ${query.nights ? Number(query.nights)-1 : "?"} Nights`);
  const [itinDays, setItinDays] = useState([
    { id:1, dayLabel:"DAY-1", title:"Arrival", route:"", distance:"", time:"", meals:["D"], description:"Meeting & greeting at the airport and transfer to hotel.\nOvernight stay at the hotel.", hotel:"" },
    { id:2, dayLabel:"DAY-2", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
    { id:3, dayLabel:"DAY-3", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
  ]);
  const [activeTab, setActiveTab] = useState("outlined");
  const [editingDay, setEditingDay] = useState(null);

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

  const printItinerary = (mode) => {
    const win = window.open("","_blank");
    const dayCards = itinDays.map((d,i) => {
      const mealStr = d.meals.map(m => `<span style="background:#FEF3C7;color:#92400E;padding:1px 7px;border-radius:10px;font-size:11px;margin-right:4px;font-weight:600">${m==="B"?"Breakfast":m==="L"?"Lunch":"Dinner"}</span>`).join("");
      if (mode === "outlined") {
        return `<div style="padding:14px 0;border-bottom:1px solid #eee">
          <div style="font-size:15px;font-weight:bold;color:#0D1B2A">${d.dayLabel}${d.title?" | "+d.title:""}</div>
          ${d.route||d.distance||d.time?`<div style="font-size:12px;color:#888;margin:2px 0">${[d.route,d.distance&&d.time?`(${d.distance} / ${d.time})`:d.distance||d.time].filter(Boolean).join(" — ")}</div>`:""}
          <div style="margin-top:6px">${mealStr}</div>
          ${d.hotel?`<div style="font-size:12px;color:#555;margin-top:4px">🏨 ${d.hotel}</div>`:""}
        </div>`;
      } else {
        return `<div style="margin-bottom:28px">
          <div style="font-size:18px;font-weight:bold;color:#0D1B2A;margin-bottom:2px">${d.dayLabel}${d.title?" | "+d.title:""}</div>
          ${d.route||d.distance||d.time?`<div style="font-size:13px;color:#C0392B;font-weight:600;margin-bottom:6px">${[d.route,d.distance&&d.time?`(${d.distance} / ${d.time})`:d.distance||d.time].filter(Boolean).join(" — ")}</div>`:""}
          <p style="font-size:13px;color:#333;line-height:1.7;margin:8px 0">${(d.description||"").replace(/\n/g,"<br/>")}</p>
          <div style="margin-top:8px">${mealStr}</div>
          ${d.hotel?`<div style="font-size:12px;color:#555;margin-top:6px">🏨 Overnight: ${d.hotel}</div>`:""}
        </div>`;
      }
    }).join("");

    win.document.write(`<!DOCTYPE html><html><head><title>${tourTitle} — Itinerary</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 32px;color:#1a1a1a;}
    h1{font-size:28px;font-weight:900;color:#C0392B;margin:0;letter-spacing:-0.5px;}
    h2{font-size:15px;font-weight:bold;color:#0D1B2A;margin:4px 0 2px;}
    .sub{font-size:14px;color:#888;}
    .divider{height:3px;background:linear-gradient(90deg,#C0392B,#E67E22);border-radius:2px;margin:16px 0;}
    @media print{body{margin:0;}}</style></head><body>
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-bottom:8px">UNITOP TOURS & TRAVEL PVT. LTD.</div>
      <h1>${tourTitle}</h1>
      <h2>${duration}</h2>
      ${route?`<div class="sub">${route}</div>`:""}
      ${tagline?`<div style="font-style:italic;color:#555;margin-top:8px;font-size:13px">"${tagline}"</div>`:""}
    </div>
    <div class="divider"></div>
    <h2 style="text-align:center;font-size:18px;letter-spacing:2px;margin-bottom:20px">ITINERARY</h2>
    ${dayCards}
    <div style="text-align:center;margin-top:32px;font-size:12px;color:#C0392B;font-weight:bold;letter-spacing:1px">
      TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES
    </div>
    </body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:780, height:"100vh", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>ITINERARY BUILDER</div>
              <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
                {query.groupName||query.clientName||query.agentName}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.id} · {query.destination}</div>
            </div>
            <button onClick={()=>printItinerary(activeTab)} className="btn btn-success" style={{ fontSize:11 }}>🖨 Print / PDF</button>
            <button onClick={onClose} className="btn btn-ghost" style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
          </div>
          {/* Tab switcher */}
          <div style={{ display:"flex", gap:4 }}>
            {[["outlined","📋 Outlined"],["detailed","📖 Detailed"]].map(([id,label])=>(
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
              <div style={{marginTop:8}}>
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
              <div style={{marginTop:8}}>
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

          {/* Live preview */}
          <div style={{ border:`1px solid ${G.gray200}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ background:G.navy, padding:"8px 14px", fontSize:11, fontWeight:600, color:"#fff" }}>
              Preview — {activeTab === "outlined" ? "Outlined Itinerary" : "Detailed Itinerary"}
            </div>
            <div style={{ padding:"16px 20px", background:"#FFFDF7" }}>
              <div style={{ textAlign:"center", marginBottom:16 }}>
                <div style={{ fontSize:10, letterSpacing:"3px", color:G.gray400, textTransform:"uppercase", marginBottom:4 }}>UNITOP TOURS & TRAVEL PVT. LTD.</div>
                <div style={{ fontSize:22, fontWeight:900, color:G.accent, letterSpacing:"-0.5px", fontFamily:"'Playfair Display',serif" }}>{tourTitle||"Tour Title"}</div>
                <div style={{ fontSize:13, fontWeight:600, color:G.navy, marginTop:2 }}>{duration}</div>
                {route && <div style={{ fontSize:12, color:G.gray600, marginTop:2 }}>{route}</div>}
                {tagline && <div style={{ fontSize:11, fontStyle:"italic", color:G.gray600, marginTop:4 }}>"{tagline}"</div>}
              </div>
              <div style={{ height:3, background:`linear-gradient(90deg,${G.accent},#E67E22)`, borderRadius:2, marginBottom:16 }}/>
              <div style={{ fontSize:14, fontWeight:700, textAlign:"center", letterSpacing:"2px", color:G.navy, marginBottom:12 }}>ITINERARY</div>
              {itinDays.map((d,i)=>(
                <div key={d.id} style={{ borderBottom:`1px solid ${G.gray100}`, paddingBottom:12, marginBottom:12 }}>
                  <div style={{ fontSize:activeTab==="detailed"?16:13, fontWeight:700, color:G.navy }}>
                    {d.dayLabel}{d.title ? ` | ${d.title}` : ""}
                  </div>
                  {(d.route||d.distance||d.time) && (
                    <div style={{ fontSize:11, color:G.accent, fontWeight:600, margin:"2px 0" }}>
                      {[d.route, (d.distance||d.time)?`(${[d.distance,d.time].filter(Boolean).join(" / ")})`:null].filter(Boolean).join(" — ")}
                    </div>
                  )}
                  {activeTab==="detailed" && d.description && (
                    <p style={{ fontSize:12, color:"#444", lineHeight:1.7, margin:"6px 0" }}>
                      {d.description}
                    </p>
                  )}
                  <div style={{ display:"flex", gap:4, marginTop:6, flexWrap:"wrap" }}>
                    {d.meals.map(m=>(
                      <span key={m} style={{ fontSize:10, padding:"1px 8px", borderRadius:10, background:"#FEF3C7", color:"#92400E", fontWeight:600 }}>
                        {MEAL_ICONS[m]} {m==="B"?"Breakfast":m==="L"?"Lunch":"Dinner"}
                      </span>
                    ))}
                    {d.hotel && <span style={{ fontSize:10, padding:"1px 8px", borderRadius:10, background:"#DBEAFE", color:"#1E40AF", fontWeight:500 }}>🏨 {d.hotel}</span>}
                  </div>
                </div>
              ))}
              <div style={{ textAlign:"center", fontSize:11, color:G.accent, fontWeight:700, letterSpacing:"1px", marginTop:8 }}>
                TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES
              </div>
            </div>
          </div>

        </div>

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex", gap:10, flexShrink:0, background:G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{ flex:1 }}/>
          <button onClick={()=>printItinerary("outlined")} className="btn btn-ghost" style={{ fontSize:11 }}>🖨 Print Outlined</button>
          <button onClick={()=>printItinerary("detailed")} className="btn btn-ghost" style={{ fontSize:11 }}>🖨 Print Detailed</button>
          <button className="btn btn-primary">💾 Save Itinerary</button>
        </div>
      </div>
    </div>
  );
}




// ─── VENDOR MASTER ────────────────────────────────────────────────────────────
