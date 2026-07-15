import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_TOURBRIEFING_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML } = Lib;

export default function TourBriefingSheet({ query, template, facilitators, onClose }) {
  const tmpl = { ...DEFAULT_TOURBRIEFING_TEMPLATE, ...(template||{}) };
  const activeFacilitators = (facilitators || []).filter(f => f.active !== false);
  const ALL_SECTIONS = [
    {id:"meta",label:"Header / Meta"},{id:"hotels",label:"Hotels"},{id:"flights",label:"Flights"},
    {id:"trains",label:"Trains"},{id:"transport",label:"Transport"},{id:"guides",label:"Tour Facilitators"},
    {id:"others",label:"Other Services"},{id:"programme",label:"Programme"},{id:"contacts",label:"Contact List"},
  ];
  const [printOrder,setPrintOrder]=useState(ALL_SECTIONS.map(s=>s.id));
  const [printEnabled,setPrintEnabled]=useState(Object.fromEntries(ALL_SECTIONS.map(s=>[s.id,true])));
  const [dragOver,setDragOver]=useState(null);
  const [dragItem,setDragItem]=useState(null);
  const [activeTab,setActiveTab]=useState("meta");
  const [viewMode, setViewMode] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerAllPages, footerAllPages, printOnLetterhead } = toggles;
  const toggleSection=k=>setPrintEnabled(p=>({...p,[k]:!p[k]}));
  const onDragStart=id=>setDragItem(id);
  const onDragEnterItem=id=>setDragOver(id);
  const onDragEnd=()=>{
    if(dragItem&&dragOver&&dragItem!==dragOver){
      setPrintOrder(prev=>{const arr=[...prev];const fi=arr.indexOf(dragItem);const ti=arr.indexOf(dragOver);arr.splice(fi,1);arr.splice(ti,0,dragItem);return arr;});
    }
    setDragItem(null);setDragOver(null);
  };
  const [docDate,setDocDate]=useState(new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"}));
  const [recipient,setRecipient]=useState(query.correspondent||"");
  const [agentCo,setAgentCo]=useState(query.agentCompany||"");
  const [agentCity,setAgentCity]=useState(query.agentCountry||"");
  const [subject,setSubject]=useState(`GROUP FROM ${query.travelDate||""} x ${query.paxDisplay||""} PAX (REF. ${query.tourFileId||query.id})`);
  const [intro,setIntro]=useState(tmpl.openingLine);
  const [footer,setFooter]=useState(tmpl.footerText);
  const [metaNotes,setMetaNotes]=useState("");
  const [hotels,setHotels]=useState([{id:1,checkIn:"",checkOut:"",city:"",hotelName:"",rooms:"",bookingStatus:"Requested"}]);
  const updH=(i,f,v)=>setHotels(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [hotelNotes,setHotelNotes]=useState("");
  const [flights,setFlights]=useState([{id:1,date:"",sector:"",flightNo:"",time:""}]);
  const updF=(i,f,v)=>setFlights(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [flightNotes,setFlightNotes]=useState("");
  const [trains,setTrains]=useState([{id:1,date:"",sector:"",trainNo:"",trainName:"",time:"",coach:""}]);
  const updT=(i,f,v)=>setTrains(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [trainNotes,setTrainNotes]=useState("");
  const [transport,setTransport]=useState("");
  const [transportNotes,setTransportNotes]=useState("");
  const [guides,setGuides]=useState([{id:1,role:"",facilitatorId:"",name:"",phone:"",area:""}]);
  const updG=(i,f,v)=>setGuides(p=>p.map((r,xi)=>{
    if(xi!==i) return r;
    if(f==="facilitatorId"){
      const fac = activeFacilitators.find(x=>x.id===v);
      return {...r, facilitatorId:v, name: fac?fac.name:"", phone: fac?fac.phone||"":r.phone, area: fac?fac.areas||"":r.area};
    }
    return {...r,[f]:v};
  }));
  const [guideNotes,setGuideNotes]=useState("");
  const [otherSvcs,setOtherSvcs]=useState([{id:1,date:"",serviceType:"Activity",description:"",status:"Confirmed"}]);
  const updO=(i,f,v)=>setOtherSvcs(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [otherNotes,setOtherNotes]=useState("");
  const [programme,setProgramme]=useState([{id:1,date:"",day:"",itinerary:"",programme:"",breakfast:"",lunch:"",dinner:""}]);
  const updP=(i,f,v)=>setProgramme(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [progNotes,setProgNotes]=useState("");
  const [contacts,setContacts]=useState([{id:1,date:"",city:"",vendorType:"Hotel",vendorTypeOther:"",contactNo:"",address:""}]);
  const updC=(i,f,v)=>setContacts(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [contactNotes,setContactNotes]=useState("");

  const inp={padding:"5px 7px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const NoteField=({val,set})=>(
    <div style={{marginTop:12,borderTop:`1px dashed ${G.gray200}`,paddingTop:10}}>
      <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Section Notes (prints only if filled)</div>
      <textarea style={{...inp,minHeight:40,resize:"vertical"}} value={val} onChange={e=>set(e.target.value)} placeholder="Optional — leave blank to exclude from print"/>
    </div>
  );

  const sectionHTML=(id)=>{
    if(!printEnabled[id]) return "";
    switch(id){
      case "meta": return `<div style="display:flex;justify-content:space-between;margin-bottom:10pt"><div><b>Kind Attn:</b> ${recipient}${agentCo?"<br/>"+agentCo:""}${agentCity?"<br/>"+agentCity:""}</div><div><b>Date:</b> ${docDate}</div></div><div style="font-weight:bold;text-decoration:underline;margin-bottom:8pt">${subject}</div>${intro?`<div style="text-decoration:underline;margin-bottom:10pt">${intro}</div>`:""}${metaNotes?`<div style="font-style:italic;color:#555">${metaNotes}</div>`:""}`;
      case "hotels": return hotels.some(h=>h.hotelName)?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Hotel Status:</div><table class="content-table"><thead><tr><th>Check In</th><th>Check Out</th><th>City</th><th>Hotel Name</th><th>Rooms</th><th>Status</th></tr></thead><tbody>${hotels.filter(h=>h.hotelName||h.city).map(h=>`<tr><td>${h.checkIn||""}</td><td>${h.checkOut||""}</td><td>${h.city||""}</td><td>${h.hotelName||""}</td><td>${h.rooms||""}</td><td>${h.bookingStatus||"Requested"}</td></tr>`).join("")}</tbody></table>${hotelNotes?`<div style="font-style:italic;color:#555;margin-top:4pt">${hotelNotes}</div>`:""}`:""
      case "flights": return flights.some(f=>f.sector)?`<div style="background:#FFE135;display:inline-block;padding:0 3px;font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Flight Sector Details:</div><table class="content-table"><thead><tr><th>Date</th><th>Sector</th><th>Flight No.</th><th>Time</th></tr></thead><tbody>${flights.filter(f=>f.sector).map(f=>`<tr><td>${f.date}</td><td>${f.sector}</td><td>${f.flightNo}</td><td>${f.time}</td></tr>`).join("")}</tbody></table>${flightNotes?`<div style="font-style:italic;color:#555">${flightNotes}</div>`:""}`:""
      case "trains": return trains.some(t=>t.sector)?`<div style="background:#FFE135;display:inline-block;padding:0 3px;font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Train Details:</div><table class="content-table"><thead><tr><th>Date</th><th>Sector</th><th>Train No.</th><th>Name</th><th>Time</th><th>Coach</th></tr></thead><tbody>${trains.filter(t=>t.sector).map(t=>`<tr><td>${t.date}</td><td>${t.sector}</td><td>${t.trainNo}</td><td>${t.trainName}</td><td>${t.time}</td><td>${t.coach}</td></tr>`).join("")}</tbody></table>${trainNotes?`<div style="font-style:italic;color:#555">${trainNotes}</div>`:""}`:""
      case "transport": return transport?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 4pt">Transport:</div><p style="margin-bottom:10pt">${transport}</p>${transportNotes?`<div style="font-style:italic;color:#555">${transportNotes}</div>`:""}`:""
      case "guides": return guides.some(g=>g.name)?`<div style="background:#FFE135;display:inline-block;padding:0 3px;font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Tour Facilitator Details:</div><div>${guides.filter(g=>g.name).map(g=>`<p style="margin-bottom:3pt">${g.name}${g.phone?" ("+g.phone+")":""}${g.area?" for "+g.area:""}</p>`).join("")}</div>${guideNotes?`<div style="font-style:italic;color:#555">${guideNotes}</div>`:""}`:""
      case "others": return otherSvcs.some(s=>s.description)?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Other Services:</div><table class="content-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>${otherSvcs.filter(s=>s.description).map(s=>`<tr><td>${s.date||""}</td><td>${s.serviceType}</td><td>${s.description}</td><td>${s.status}</td></tr>`).join("")}</tbody></table>${otherNotes?`<div style="font-style:italic;color:#555">${otherNotes}</div>`:""}`:""
      case "programme": return programme.some(p=>p.itinerary||p.programme)?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Programme:</div><table class="content-table"><thead><tr><th>DATE & DAY</th><th>PROGRAMME</th><th>BREAKFAST</th><th>LUNCH</th><th>DINNER</th></tr></thead><tbody>${programme.map(p=>`<tr><td><b>${p.date||""}</b>${p.day?"<br/>("+p.day+")":""}</td><td><b style="color:#1A3A52">${p.itinerary||""}</b>${p.programme?"<br/><div style='white-space:pre-line'>"+p.programme+"</div>":""}</td><td>${p.breakfast||"X"}</td><td>${p.lunch||"X"}</td><td>${p.dinner||"X"}</td></tr>`).join("")}</tbody></table>${progNotes?`<div style="font-style:italic;color:#555">${progNotes}</div>`:""}`:""
      case "contacts": return contacts.some(c=>c.contactNo||c.city)?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">Contact List:</div><table class="content-table"><thead><tr><th>Date</th><th>City</th><th>Type</th><th>Contact No.</th><th>Address</th></tr></thead><tbody>${contacts.filter(c=>c.contactNo||c.city).map(c=>`<tr><td>${c.date||""}</td><td>${c.city||""}</td><td>${c.vendorType==="Other"?c.vendorTypeOther||"Other":c.vendorType}</td><td>${c.contactNo||""}</td><td>${c.address||""}</td></tr>`).join("")}</tbody></table>${contactNotes?`<div style="font-style:italic;color:#555">${contactNotes}</div>`:""}`:""
      default: return "";
    }
  };

  const buildPrintHTML = () => {
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin-top:10pt" alt="Stamp"/>` : '';
    const sectionsBlock = printOrder.map(id=>sectionHTML(id)).join("");
    const footerNoteBlock = footer ? `<div style="margin-top:20pt;white-space:pre-line;font-size:10pt">${footer}</div>` : '';

    return buildLetterheadDocument({
      title: `Tour Briefing Sheet — ${query.groupName||query.clientName}`,
      extraHeadCSS: `body{font-family:'Times New Roman',serif;}`,
      bodyBlocks: [sectionsBlock, footerNoteBlock, stampHTML],
      headerAllPages, footerAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = () => printHTML(buildPrintHTML());

  const tabBtn=(id,label)=>(<button key={id} onClick={()=>setActiveTab(id)} style={{padding:"7px 12px",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:11,background:activeTab===id?G.navy:"transparent",color:activeTab===id?"#fff":G.gray600,borderBottom:`2px solid ${activeTab===id?G.accent:"transparent"}`,fontWeight:activeTab===id?600:400,whiteSpace:"nowrap"}}>{label}</button>);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:880,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>TOUR BRIEFING SHEET</div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id}{query.tourFileId?" · 📁 "+query.tourFileId:""}</div>
          </div>
          <button onClick={handlePrint} className="btn btn-primary" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>
        <LetterheadToggleBar toggles={toggles} G={G}/>
        {viewMode === "content" ? (
          <>
            <div style={{padding:"8px 16px",background:G.gray50,borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
              <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Print Sections — drag to reorder · click to toggle</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {printOrder.map(id=>{
                  const sec=ALL_SECTIONS.find(s=>s.id===id);
                  if(!sec) return null;
                  return <div key={id} draggable onDragStart={()=>onDragStart(id)} onDragEnter={()=>onDragEnterItem(id)} onDragEnd={onDragEnd} onDragOver={e=>e.preventDefault()} onClick={()=>toggleSection(id)}
                    style={{padding:"4px 10px",borderRadius:10,fontSize:11,cursor:"grab",userSelect:"none",background:printEnabled[id]?"#EBF5FB":"#F3F4F6",color:printEnabled[id]?"#1A5276":G.gray400,fontWeight:printEnabled[id]?600:400,border:`1px solid ${printEnabled[id]?"#A9CCE3":"#E5E7EB"}`,opacity:dragItem===id?0.5:1}}>
                    ☰ {sec.label}
                  </div>;
                })}
              </div>
            </div>
            <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,background:G.white,flexShrink:0,overflowX:"auto"}}>
              {ALL_SECTIONS.map(s=>tabBtn(s.id,s.label))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
              {activeTab==="meta"&&<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>{[["Date",docDate,setDocDate],["Recipient Name",recipient,setRecipient],["Agent Company",agentCo,setAgentCo],["Country / City",agentCity,setAgentCity]].map(([l,v,s])=><div key={l}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={v} onChange={e=>s(e.target.value)}/></div>)}<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Subject</div><input style={inp} value={subject} onChange={e=>setSubject(e.target.value)}/></div><div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Opening Line</div><input style={inp} value={intro} onChange={e=>setIntro(e.target.value)}/></div><div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Footer</div><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={footer} onChange={e=>setFooter(e.target.value)}/></div></div><NoteField val={metaNotes} set={setMetaNotes}/></div>}
              {activeTab==="hotels"&&<div>{hotels.map((h,i)=><div key={h.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr 1fr 1fr auto",gap:6}}>{[["Check In","checkIn","date"],["Check Out","checkOut","date"],["City","city","text"],["Hotel Name","hotelName","text"],["Rooms","rooms","text"],["Status","bookingStatus","statussel"]].map(([l,f,t])=><div key={f}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>{t==="statussel"?<select style={inp} value={h[f]||"Requested"} onChange={e=>updH(i,f,e.target.value)}>{["Requested","Confirmed","Waitlisted","Sold Out","Cancelled"].map(s=><option key={s}>{s}</option>)}</select>:<input style={inp} type={t} value={h[f]||""} onChange={e=>updH(i,f,e.target.value)}/>}</div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setHotels(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setHotels(p=>[...p,{id:Date.now(),checkIn:"",checkOut:"",city:"",hotelName:"",rooms:"",bookingStatus:"Requested"}])}>+ Add Hotel</button><NoteField val={hotelNotes} set={setHotelNotes}/></div>}
              {activeTab==="flights"&&<div>{flights.map((f,i)=><div key={f.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:8,marginBottom:8,background:G.gray50,padding:10,borderRadius:8,border:`1px solid ${G.gray200}`}}>{[["Date","date","text"],["Sector","sector","text"],["Flight No.","flightNo","text"],["Time","time","text"]].map(([l,k,t])=><div key={k}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={t} value={f[k]||""} onChange={e=>updF(i,k,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setFlights(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setFlights(p=>[...p,{id:Date.now(),date:"",sector:"",flightNo:"",time:""}])}>+ Add Flight</button><NoteField val={flightNotes} set={setFlightNotes}/></div>}
              {activeTab==="trains"&&<div>{trains.map((t,i)=><div key={t.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr auto",gap:6}}>{[["Date","date","text"],["Sector","sector","text"],["Train No.","trainNo","text"],["Train Name","trainName","text"],["Time","time","text"],["Coach / Class","coach","text"]].map(([l,f,tp])=><div key={f}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={tp} value={t[f]||""} onChange={e=>updT(i,f,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setTrains(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setTrains(p=>[...p,{id:Date.now(),date:"",sector:"",trainNo:"",trainName:"",time:"",coach:""}])}>+ Add Train</button><NoteField val={trainNotes} set={setTrainNotes}/></div>}
              {activeTab==="transport"&&<div><div style={{fontSize:11,color:G.gray600,marginBottom:6}}>Describe the transport arrangement for this tour</div><textarea style={{...inp,minHeight:80,resize:"vertical"}} value={transport} onChange={e=>setTransport(e.target.value)} placeholder="e.g. 05 Innova for Kashmir & Ladakh / 01 Aircon Coach for Delhi"/><NoteField val={transportNotes} set={setTransportNotes}/></div>}
              {activeTab==="guides"&&<div>
                {activeFacilitators.length===0 && <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#92400E",marginBottom:10}}>No facilitators in the master list yet — add them under Master Data → Tour Facilitators, then they'll appear here to select.</div>}
                {guides.map((g,i)=><div key={g.id} style={{display:"grid",gridTemplateColumns:"1fr 1.3fr 1fr 1fr auto",gap:8,marginBottom:8,background:G.gray50,padding:10,borderRadius:8,border:`1px solid ${G.gray200}`}}>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Role</div><input style={inp} value={g.role||""} onChange={e=>updG(i,"role",e.target.value)} placeholder="e.g. Chinese Speaking Guide"/></div>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Facilitator</div>
                    <select style={inp} value={g.facilitatorId||""} onChange={e=>updG(i,"facilitatorId",e.target.value)}>
                      <option value="">Select...</option>
                      {activeFacilitators.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Phone</div><input style={inp} value={g.phone||""} onChange={e=>updG(i,"phone",e.target.value)}/></div>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Area / Cities</div><input style={inp} value={g.area||""} onChange={e=>updG(i,"area",e.target.value)}/></div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setGuides(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div>
                </div>)}
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setGuides(p=>[...p,{id:Date.now(),role:"",facilitatorId:"",name:"",phone:"",area:""}])}>+ Add Tour Facilitator</button>
                <NoteField val={guideNotes} set={setGuideNotes}/>
              </div>}
              {activeTab==="others"&&<div>{otherSvcs.map((s,i)=><div key={s.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr 1fr auto",gap:6}}><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Date</div><input style={inp} value={s.date||""} onChange={e=>updO(i,"date",e.target.value)}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Service Type</div><select style={inp} value={s.serviceType} onChange={e=>updO(i,"serviceType",e.target.value)}>{VENDOR_TYPES_TBS.map(t=><option key={t}>{t}</option>)}</select></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Description</div><input style={inp} value={s.description||""} onChange={e=>updO(i,"description",e.target.value)}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Status</div><select style={inp} value={s.status} onChange={e=>updO(i,"status",e.target.value)}>{["Requested","Confirmed","Sold Out","On Waitlist","Cancelled"].map(st=><option key={st}>{st}</option>)}</select></div><div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setOtherSvcs(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setOtherSvcs(p=>[...p,{id:Date.now(),date:"",serviceType:"Activity",description:"",status:"Confirmed"}])}>+ Add Service</button><NoteField val={otherNotes} set={setOtherNotes}/></div>}
              {activeTab==="programme"&&<div>{programme.map((p,i)=><div key={p.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:8}}>{[["Date","date","text"],["Day","day","text"],["Breakfast","breakfast","text"],["Lunch","lunch","text"],["Dinner","dinner","text"]].map(([l,k,t])=><div key={k}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={t} value={p[k]||""} onChange={e=>updP(i,k,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setProgramme(prev=>prev.filter((_,xi)=>xi!==i))}>✕</span></div></div><div style={{marginBottom:6}}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Itinerary (movement for the day)</div><textarea style={{...inp,minHeight:48,resize:"vertical"}} value={p.itinerary||""} onChange={e=>updP(i,"itinerary",e.target.value)} placeholder="e.g. DELHI – SRINAGAR (BY 6E 5339 AT 09:45 / 11:20)"/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Programme Details</div><textarea style={{...inp,minHeight:80,resize:"vertical"}} value={p.programme||""} onChange={e=>updP(i,"programme",e.target.value)} placeholder="Morning After Breakfast...&#10;• Point 1&#10;• Point 2&#10;Overnight Stay at Hotel"/><div style={{fontSize:9,color:G.gray400,marginTop:3}}>Tip: start a line with • for bullet points</div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setProgramme(p=>[...p,{id:Date.now(),date:"",day:"",itinerary:"",programme:"",breakfast:"",lunch:"",dinner:""}])}>+ Add Day</button><NoteField val={progNotes} set={setProgNotes}/></div>}
              {activeTab==="contacts"&&<div>{contacts.map((c,i)=><div key={c.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 2fr auto",gap:6}}><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Date</div><input style={inp} value={c.date||""} onChange={e=>updC(i,"date",e.target.value)}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>City</div><input style={inp} value={c.city||""} onChange={e=>updC(i,"city",e.target.value)}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vendor Type</div><select style={inp} value={c.vendorType} onChange={e=>updC(i,"vendorType",e.target.value)}>{VENDOR_TYPES_TBS.map(t=><option key={t}>{t}</option>)}</select>{c.vendorType==="Other"&&<input style={{...inp,marginTop:4}} value={c.vendorTypeOther||""} onChange={e=>updC(i,"vendorTypeOther",e.target.value)} placeholder="Specify..."/>}</div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Contact No.</div><input style={inp} value={c.contactNo||""} onChange={e=>updC(i,"contactNo",e.target.value)}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Address</div><input style={inp} value={c.address||""} onChange={e=>updC(i,"address",e.target.value)}/></div><div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setContacts(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setContacts(p=>[...p,{id:Date.now(),date:"",city:"",vendorType:"Hotel",vendorTypeOther:"",contactNo:"",address:""}])}>+ Add Contact</button><NoteField val={contactNotes} set={setContactNotes}/></div>}
            </div>
          </>
        ) : (
          <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
            <DocPreviewFrame html={buildPrintHTML()}/>
          </div>
        )}
        <div style={{padding:"10px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1,fontSize:11,color:G.gray400,alignSelf:"center"}}>{viewMode==="content" ? "Drag section tiles to reorder in print output" : ""}</div>
          <button onClick={handlePrint} className="btn btn-primary">🖨 Print / Export PDF</button>
        </div>
      </div>
    </div>
  );
}
