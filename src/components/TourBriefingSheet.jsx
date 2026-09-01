import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_TOURBRIEFING_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, buildPaginatedLetterheadDocument, buildDocxBlobFromBodyBlocks, downloadDocx, ExportMenu, buildAddresseeBlock, useLetterheadToggles, LetterheadToggleBar, VersionDropdown, DocTabBar, DocPreviewFrame, printHTML, loadTourBriefingVersions, saveTourBriefingVersion, markTourBriefingVersionFinal, loadFinalCostSheetVersion, extractTourBriefingHotelsFromCostSheetDays, extractTourBriefingProgrammeFromCostSheetDays, extractTourBriefingTransportSummary, extractItineraryFromCostSheetDays, logAudit, RichTextEditor, formatDateDMY, db, formatDateSlash } = Lib;

export default function TourBriefingSheet({ query, template, facilitators, vendors, onClose, currentUser, readOnly }) {
  const tmpl = { ...DEFAULT_TOURBRIEFING_TEMPLATE, ...(template||{}) };
  const activeFacilitators = (facilitators || []).filter(f => f.active !== false);
  const ALL_SECTIONS = [
    {id:"meta",label:"Header / Meta"},{id:"programme",label:"Programme"},{id:"hotels",label:"Hotels"},
    {id:"flights",label:"Flight Details"},{id:"trains",label:"Trains"},{id:"transport",label:"Transport"},
    {id:"guides",label:"Tour Facilitators"},{id:"others",label:"Other Services"},
    {id:"mealplan",label:"Meal Plan"},{id:"contacts",label:"Contact List"},
  ];
  const [printOrder,setPrintOrder]=useState(ALL_SECTIONS.map(s=>s.id));
  const [printEnabled,setPrintEnabled]=useState(Object.fromEntries(ALL_SECTIONS.map(s=>[s.id,true])));
  // Every section (except Header/Meta, which has no standalone heading of
  // its own) gets an editable printed-heading label, defaulting to that
  // section's own tab title -- replaces the old hardcoded per-section
  // heading strings ("Hotel Status:", "Flight Sector Details:", etc.) and
  // Meal Plan's previous special centered treatment, so every section's
  // heading is genuinely the same style, editable the same way.
  const [sectionLabels,setSectionLabels]=useState(Object.fromEntries(ALL_SECTIONS.filter(s=>s.id!=="meta").map(s=>[s.id,s.label])));
  const setSectionLabel=(id,v)=>setSectionLabels(p=>({...p,[id]:v}));
  const [dragOver,setDragOver]=useState(null);
  const [dragItem,setDragItem]=useState(null);
  const [printSectionsOpen,setPrintSectionsOpen]=useState(false);
  const [activeTab,setActiveTab]=useState("meta");
  const [viewMode, setViewMode] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerFooterAllPages, printOnLetterhead } = toggles;
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
  const [subject,setSubject]=useState(`GROUP FROM ${formatDateSlash(query.travelDate)||""} x ${query.paxDisplay||""} PAX (REF. ${query.tourFileId||query.id})`);
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
  // Restructured 2026-08-27 from a single free-text paragraph into a real
  // multi-row table (Description/Quantity), matching every other
  // section's row-based editing pattern -- direct instruction.
  const [transport,setTransport]=useState([{id:1,description:"",quantity:""}]);
  const updTr=(i,f,v)=>setTransport(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [transportNotes,setTransportNotes]=useState("");
  const [guides,setGuides]=useState([{id:1,description:"",facilitatorId:"",name:"",contact:""}]);
  const updG=(i,f,v)=>setGuides(p=>p.map((r,xi)=>{
    if(xi!==i) return r;
    if(f==="facilitatorId"){
      const fac = activeFacilitators.find(x=>x.id===v);
      return {...r, facilitatorId:v, name: fac?fac.name:"", contact: fac?fac.contactPhone||"":r.contact};
    }
    return {...r,[f]:v};
  }));
  const [guideNotes,setGuideNotes]=useState("");
  // Other Services, restructured (2026-08-22) into named groups -- direct
  // instruction, "pretty much how adding days in a programme work": one
  // group's items are day/date/description rows (Type/Status columns
  // dropped), and multiple groups can exist side by side, each with its
  // own editable label (e.g. splitting "Monuments" out from "Activities"
  // rather than mixing every kind of extra service into one table).
  const [otherGroups,setOtherGroups]=useState([{id:1,label:"Other Services",items:[{id:1,day:"",date:"",description:""}]}]);
  const updOGroupLabel=(gi,v)=>setOtherGroups(p=>p.map((g,xi)=>xi===gi?{...g,label:v}:g));
  const updOItem=(gi,ii,f,v)=>setOtherGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:g.items.map((it,xii)=>xii===ii?{...it,[f]:v}:it)}:g));
  const addOItem=(gi)=>setOtherGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:[...g.items,{id:Date.now(),day:"",date:"",description:""}]}:g));
  const removeOItem=(gi,ii)=>setOtherGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:g.items.filter((_,xii)=>xii!==ii)}:g));
  const addOGroup=()=>setOtherGroups(p=>[...p,{id:Date.now(),label:`Section ${p.length+1}`,items:[{id:Date.now()+1,day:"",date:"",description:""}]}]);
  const removeOGroup=(gi)=>setOtherGroups(p=>p.filter((_,xi)=>xi!==gi));
  const [otherNotes,setOtherNotes]=useState("");
  const [programme,setProgramme]=useState([{id:1,date:"",day:"",itinerary:"",programme:"",breakfast:"",lunch:"",dinner:""}]);
  const updP=(i,f,v)=>setProgramme(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [progNotes,setProgNotes]=useState("");
  // Meal Plan, folded in as one more section (2026-08-22) -- previously
  // MealPlanDocument.jsx, a fully standalone document with its own
  // version history/table. Eliminated as a separate document per direct
  // instruction: its day-by-day rows now live in this same content blob
  // as every other TBS section, versioned together rather than
  // separately.
  const [mealDays,setMealDays]=useState([{id:1,day:"Day 1",date:"",itinerary:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:2,day:"Day 2",date:"",itinerary:"",breakfast:"",lunch:"",dinner:"",notes:""},{id:3,day:"Day 3",date:"",itinerary:"",breakfast:"",lunch:"",dinner:"",notes:""}]);
  const updM=(i,f,v)=>setMealDays(p=>p.map((r,xi)=>xi===i?{...r,[f]:v}:r));
  const [mealNotes,setMealNotes]=useState("");
  // Restructured 2026-08-27 into named multi-item groups, same pattern as
  // Other Services -- direct instruction. Each item's Name field has a
  // quiet vendor-search button that looks up Vendor Master and
  // auto-fills Contact/Address.
  const [contactGroups,setContactGroups]=useState([{id:1,label:"Contact List",items:[{id:1,city:"",name:"",contact:"",address:"",vendorSearchOpen:false}]}]);
  const updCGroupLabel=(gi,v)=>setContactGroups(p=>p.map((g,xi)=>xi===gi?{...g,label:v}:g));
  const updCItem=(gi,ii,f,v)=>setContactGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:g.items.map((it,xii)=>xii===ii?{...it,[f]:v}:it)}:g));
  const pickVendorForContact=(gi,ii,vendorId)=>setContactGroups(p=>p.map((g,xi)=>{
    if(xi!==gi) return g;
    return {...g, items:g.items.map((it,xii)=>{
      if(xii!==ii) return it;
      const v = (vendors||[]).find(x=>x.id===vendorId);
      if(!v) return {...it, vendorSearchOpen:false};
      return {...it, name:v.name||v.company||"", contact:v.contactPhone||"", address:v.address||"", city: it.city||v.city||"", vendorSearchOpen:false};
    })};
  }));
  const addCItem=(gi)=>setContactGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:[...g.items,{id:Date.now(),city:"",name:"",contact:"",address:"",vendorSearchOpen:false}]}:g));
  const removeCItem=(gi,ii)=>setContactGroups(p=>p.map((g,xi)=>xi===gi?{...g,items:g.items.filter((_,xii)=>xii!==ii)}:g));
  const addCGroup=()=>setContactGroups(p=>[...p,{id:Date.now(),label:`Section ${p.length+1}`,items:[{id:Date.now()+1,city:"",name:"",contact:"",address:"",vendorSearchOpen:false}]}]);
  const removeCGroup=(gi)=>setContactGroups(p=>p.filter((_,xi)=>xi!==gi));
  const [contactNotes,setContactNotes]=useState("");

  // Real version history, same pattern as the rest of the Document Chain
  // plan (Phase 0 -- see docs/DATA_OWNERSHIP.md). Every field in this
  // document (12+ scalars, 8 array sections, per-section notes, print
  // order/visibility) is bundled into one content object per version,
  // rather than tracked as 20+ separate pieces of state to save/restore.
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);

  const currentContent = () => ({
    docDate, recipient, agentCo, agentCity, subject, intro, footer, metaNotes,
    hotels, hotelNotes, flights, flightNotes, trains, trainNotes, transport, transportNotes,
    guides, guideNotes, otherGroups, programme, progNotes, mealDays, mealNotes, contactGroups, contactNotes,
    sectionLabels, printOrder, printEnabled, pulledFromCostSheetVersion,
  });

  const loadVersionIntoDraft = (v) => {
    const c = v.content || {};
    if (c.docDate!==undefined) setDocDate(c.docDate);
    if (c.recipient!==undefined) setRecipient(c.recipient);
    if (c.agentCo!==undefined) setAgentCo(c.agentCo);
    if (c.agentCity!==undefined) setAgentCity(c.agentCity);
    if (c.subject!==undefined) setSubject(c.subject);
    if (c.intro!==undefined) setIntro(c.intro);
    if (c.footer!==undefined) setFooter(c.footer);
    if (c.metaNotes!==undefined) setMetaNotes(c.metaNotes);
    if (c.hotels) setHotels(c.hotels);
    if (c.hotelNotes!==undefined) setHotelNotes(c.hotelNotes);
    if (c.flights) setFlights(c.flights);
    if (c.flightNotes!==undefined) setFlightNotes(c.flightNotes);
    if (c.trains) setTrains(c.trains);
    if (c.trainNotes!==undefined) setTrainNotes(c.trainNotes);
    if (c.transport!==undefined) setTransport(c.transport);
    if (c.transportNotes!==undefined) setTransportNotes(c.transportNotes);
    if (c.guides) setGuides(c.guides);
    if (c.guideNotes!==undefined) setGuideNotes(c.guideNotes);
    if (c.otherGroups) setOtherGroups(c.otherGroups);
    if (c.otherNotes!==undefined) setOtherNotes(c.otherNotes);
    if (c.sectionLabels) setSectionLabels(p=>({...p, ...c.sectionLabels}));
    if (c.programme) setProgramme(c.programme);
    if (c.progNotes!==undefined) setProgNotes(c.progNotes);
    if (c.mealDays) setMealDays(c.mealDays);
    if (c.mealNotes!==undefined) setMealNotes(c.mealNotes);
    if (c.contactGroups) setContactGroups(c.contactGroups);
    if (c.contactNotes!==undefined) setContactNotes(c.contactNotes);
    if (c.printOrder) setPrintOrder(c.printOrder);
    if (c.printEnabled) setPrintEnabled(c.printEnabled);
    if (c.pulledFromCostSheetVersion !== undefined) setPulledFromCostSheetVersion(c.pulledFromCostSheetVersion);
    setViewingVersion(v.version);
  };

  // Phase 5 of the Document Chain plan (docs/DATA_OWNERSHIP.md): pulls
  // from the star-marked Cost Sheet directly, same reasoning as Meal
  // Plan/Itinerary Builder -- Tour Briefing Sheet is opened
  // independently from the toolbar. Uses the shared extraction library
  // (extractTourBriefingHotelsFromCostSheetDays,
  // extractTourBriefingProgrammeFromCostSheetDays,
  // extractTourBriefingTransportSummary) -- guides/flights/trains/contacts
  // are deliberately left untouched, since Cost Sheet has no source data
  // for vendor names, contacts, or travel logistics at all.
  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  const [pulledFromCostSheetVersion, setPulledFromCostSheetVersion] = useState(null);
  const [pullMessage, setPullMessage] = useState("");
  const [pulling, setPulling] = useState(false);
  const pullFromCostSheet = async (targetVersion) => {
    setPulling(true);
    setPullMessage("");
    try {
      const source = targetVersion || finalCostSheetVersion;
      if (!source) { setPullMessage("No final Cost Sheet found for this tour yet."); setPulling(false); return; }
      const pulledHotels = extractTourBriefingHotelsFromCostSheetDays(source.days);
      const pulledProgramme = extractTourBriefingProgrammeFromCostSheetDays(source.days);
      const pulledTransport = extractTourBriefingTransportSummary(source.transports);
      // Meal Plan's own pull, same source data/extraction as the old
      // standalone MealPlanDocument used (extractItineraryFromCostSheetDays)
      // -- otherwise this section would silently lose the auto-pull
      // capability it had before being folded in here.
      const pulledMeals = extractItineraryFromCostSheetDays(source.days);
      if (pulledHotels.length > 0) setHotels(pulledHotels);
      if (pulledProgramme.length > 0) setProgramme(pulledProgramme);
      if (pulledTransport.length > 0) setTransport(pulledTransport.map((t, i) => ({ id: i + 1, ...t })));
      // extractItineraryFromCostSheetDays is shared with Quotation, which
      // still expects/prints "Included" verbatim -- so the "At Hotel"
      // wording change (direct instruction, scoped to Tour Briefing
      // Sheet only) is applied here, at this call site, translating the
      // shared function's flag rather than changing its shared output
      // text and leaking the change into Quotation's own print.
      if (pulledMeals.length > 0) setMealDays(pulledMeals.map((d, i) => ({ id: i + 1, day: d.day, date: "", itinerary: d.movement, breakfast: d.breakfast ? "At Hotel" : "", lunch: d.lunch ? "At Hotel" : "", dinner: d.dinner ? "At Hotel" : "", notes: "" })));
      setPulledFromCostSheetVersion(source.version);
      setPullMessage(`Pulled from Cost Sheet v${source.version}.`);
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    }
    setPulling(false);
  };

  useEffect(() => {
    loadTourBriefingVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) {
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
      loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
    });
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion && pulledFromCostSheetVersion !== finalCostSheetVersion.version;

  const saveVersion = () => {
    const snap = { version, content: currentContent() };
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    saveTourBriefingVersion(db, query.id, snap, currentUser?.id);
    logAudit(db, query.id, currentUser?.name, `Tour Briefing Sheet v${version} saved`);
    setViewingVersion(version);
    setVersion(v => v+1);
  };

  const inp={padding:"5px 7px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const NoteField=({val,set})=>(
    <div style={{marginTop:12,borderTop:`1px dashed ${G.gray200}`,paddingTop:10}}>
      <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Section Notes (prints only if filled)</div>
      <textarea style={{...inp,minHeight:40,resize:"vertical"}} value={val} onChange={e=>set(e.target.value)} placeholder="Optional — leave blank to exclude from print"/>
    </div>
  );

  // Every section's printed heading, editable here -- defaults to the
  // section's own tab title. Sits above that tab's fields, same spot on
  // every tab.
  const SectionLabelField=({id})=>(
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Section Label (printed heading)</div>
      <input style={inp} value={sectionLabels[id]||""} onChange={e=>setSectionLabel(id,e.target.value)}/>
    </div>
  );

  // Returns an array of blocks for this section (plain HTML strings and/or
  // splittable {type:'table'} blocks), not one opaque combined string --
  // this is what lets a long section (Programme especially, which can run
  // the full length of a tour) split across pages with its column header
  // repeating, instead of being one atomic block that either fits or
  // overflows. Sections with no table (meta, transport, guides) stay as a
  // single string block; empty sections (no data yet) return [].
  const sectionBlocks=(id)=>{
    if(!printEnabled[id]) return [];
    const heading=(text)=>text?`<div style="font-weight:bold;text-decoration:underline;margin:12pt 0 6pt">${text}:</div>`:"";
    switch(id){
      case "meta": return [`<div style="display:flex;justify-content:space-between;margin-bottom:10pt"><div>${buildAddresseeBlock({ name:recipient, company:agentCo, city:agentCity, fontSizePt:10 })}</div><div><b>Date:</b> ${docDate}</div></div><div style="font-weight:bold;text-decoration:underline;margin-bottom:8pt">${subject}</div>${intro?`<div style="text-decoration:underline;margin-bottom:10pt">${intro}</div>`:""}${metaNotes?`<div style="font-style:italic;color:#555">${metaNotes}</div>`:""}`];
      case "hotels": return hotels.some(h=>h.hotelName) ? [
        heading(sectionLabels.hotels),
        { type:"table", headerHTML:`<tr><th>Check In</th><th>Check Out</th><th>City</th><th>Hotel Name</th><th>Rooms</th><th>Status</th></tr>`,
          rowsHTML: hotels.filter(h=>h.hotelName||h.city).map(h=>`<tr><td>${formatDateSlash(h.checkIn)||""}</td><td>${formatDateSlash(h.checkOut)||""}</td><td>${h.city||""}</td><td>${h.hotelName||""}</td><td>${h.rooms||""}</td><td>${h.bookingStatus||"Requested"}</td></tr>`) },
        hotelNotes?`<div style="font-style:italic;color:#555;margin-top:4pt">${hotelNotes}</div>`:"",
      ] : [];
      case "flights": return flights.some(f=>f.sector) ? [
        heading(sectionLabels.flights),
        { type:"table", headerHTML:`<tr><th>Date</th><th>Sector</th><th>Flight No.</th><th>Time</th></tr>`,
          rowsHTML: flights.filter(f=>f.sector).map(f=>`<tr><td>${formatDateSlash(f.date)||""}</td><td>${f.sector}</td><td>${f.flightNo}</td><td>${f.time}</td></tr>`) },
        flightNotes?`<div style="font-style:italic;color:#555">${flightNotes}</div>`:"",
      ] : [];
      case "trains": return trains.some(t=>t.sector) ? [
        heading(sectionLabels.trains),
        { type:"table", headerHTML:`<tr><th>Date</th><th>Sector</th><th>Train No.</th><th>Name</th><th>Time</th></tr>`,
          rowsHTML: trains.filter(t=>t.sector).map(t=>`<tr><td>${formatDateSlash(t.date)||""}</td><td>${t.sector}</td><td>${t.trainNo}</td><td>${t.trainName}</td><td>${t.time}</td></tr>`) },
        trainNotes?`<div style="font-style:italic;color:#555">${trainNotes}</div>`:"",
      ] : [];
      case "transport": return transport.some(t=>t.description) ? [
        heading(sectionLabels.transport),
        { type:"table", headerHTML:`<tr><th>Description</th><th>Quantity</th></tr>`,
          rowsHTML: transport.filter(t=>t.description).map(t=>`<tr><td>${t.description}</td><td>${t.quantity||""}</td></tr>`) },
        transportNotes?`<div style="font-style:italic;color:#555">${transportNotes}</div>`:"",
      ] : [];
      case "guides": return guides.some(g=>g.name) ? [
        heading(sectionLabels.guides),
        { type:"table", headerHTML:`<tr><th>Description</th><th>Name</th><th>Contact</th></tr>`,
          rowsHTML: guides.filter(g=>g.name).map(g=>`<tr><td>${g.description||""}</td><td>${g.name}</td><td>${g.contact||""}</td></tr>`) },
        guideNotes?`<div style="font-style:italic;color:#555">${guideNotes}</div>`:"",
      ] : [];
      // Other Services, restructured into named groups -- each group
      // prints as its own labeled table (day/date/description only),
      // same Date-and-Day display convention as Programme (spec 1.5).
      case "others": {
        const activeGroups = otherGroups.filter(g=>g.items.some(it=>it.description));
        if (activeGroups.length === 0) return [];
        const blocks = [];
        activeGroups.forEach(g => {
          blocks.push(heading(g.label));
          blocks.push({ type:"table", headerHTML:`<tr><th>Day</th><th>Date</th><th>Description</th></tr>`,
            rowsHTML: g.items.filter(it=>it.description).map(it=>`<tr><td>${it.day||""}</td><td>${formatDateSlash(it.date)||""}</td><td>${it.description}</td></tr>`) });
        });
        if (otherNotes) blocks.push(`<div style="font-style:italic;color:#555">${otherNotes}</div>`);
        return blocks;
      }
      case "programme": return programme.some(p=>p.itinerary||p.programme) ? [
        heading(sectionLabels.programme),
        { type:"table", headerHTML:`<tr><th>DATE & DAY</th><th>PROGRAMME</th><th>BREAKFAST</th><th>LUNCH</th><th>DINNER</th></tr>`,
          rowsHTML: programme.map(p=>`<tr><td><b>${formatDateSlash(p.date)||""}</b>${p.day?"<br/>("+p.day+")":""}</td><td><b style="color:#1A3A52">${p.itinerary||""}</b>${p.programme?"<br/><div>"+p.programme+"</div>":""}</td><td>${p.breakfast||"X"}</td><td>${p.lunch||"X"}</td><td>${p.dinner||"X"}</td></tr>`) },
        progNotes?`<div style="font-style:italic;color:#555">${progNotes}</div>`:"",
      ] : [];
      // Meal Plan's heading now matches every other section's convention
      // exactly (left-aligned, bold, underlined, editable label) instead
      // of the earlier centered/standalone treatment -- direct
      // instruction to make it consistent with the rest of this
      // document rather than with other documents' headings. Notes
      // column still only appears at all if at least one day has one.
      case "mealplan": {
        const hasNotes = mealDays.some(d=>d.notes);
        return mealDays.some(d=>d.breakfast||d.lunch||d.dinner||d.itinerary) ? [
          heading(sectionLabels.mealplan),
          { type:"table",
            headerHTML:`<tr><th>DATE & DAY</th><th>Itinerary</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th>${hasNotes?"<th>Notes</th>":""}</tr>`,
            rowsHTML: mealDays.map(d=>`<tr><td><b>${formatDateSlash(d.date)||""}</b>${d.day?"<br/>("+d.day+")":""}</td><td>${d.itinerary||"—"}</td><td>${d.breakfast||"—"}</td><td>${d.lunch||"—"}</td><td>${d.dinner||"—"}</td>${hasNotes?`<td>${d.notes||""}</td>`:""}</tr>`) },
          mealNotes?`<div style="font-style:italic;color:#555;margin-top:4pt">${mealNotes}</div>`:"",
        ] : [];
      }
      case "contacts": {
        const activeCGroups = contactGroups.filter(g=>g.items.some(it=>it.name||it.city));
        if (activeCGroups.length === 0) return [];
        const blocks = [];
        activeCGroups.forEach(g => {
          blocks.push(heading(g.label));
          blocks.push({ type:"table", headerHTML:`<tr><th>City</th><th>Name</th><th>Contact</th><th>Address</th></tr>`,
            rowsHTML: g.items.filter(it=>it.name||it.city).map(it=>`<tr><td>${it.city||""}</td><td>${it.name||""}</td><td>${it.contact||""}</td><td>${it.address||""}</td></tr>`) });
        });
        if (contactNotes) blocks.push(`<div style="font-style:italic;color:#555">${contactNotes}</div>`);
        return blocks;
      }
      default: return [];
    }
  };

  const buildPrintHTML = (asBlocks) => {
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin-top:10pt" alt="Stamp"/>` : '';
    const sectionsBlocks = printOrder.flatMap(id=>sectionBlocks(id)).filter(b => b !== "");
    const footerNoteBlock = footer ? `<div style="margin-top:20pt;font-size:10pt">${footer}</div>` : '';

    // asBlocks lets the Word export reuse this document's existing
    // content definition instead of maintaining a second one that could
    // silently drift from what the PDF shows.
    const docArgs = {
      title: `Tour Briefing Sheet — ${query.groupName||query.clientName}`,
      extraHeadCSS: ``, // Inter is the shared letterhead's own default body font -- this override used to force Times New Roman here specifically.
      bodyBlocks: [...sectionsBlocks, footerNoteBlock, stampHTML],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    };
    if (asBlocks) return docArgs;
    return buildPaginatedLetterheadDocument(docArgs);
  };

  // Word (.docx) export -- reuses buildPrintHTML(true)'s blocks so this
  // document's Word output always matches its PDF content.
  const exportDocx = async () => {
    const args = await buildPrintHTML(true);
    const blob = await buildDocxBlobFromBodyBlocks({
      bodyBlocks: args.bodyBlocks,
      toggles: { headerFooterAllPages: args.headerFooterAllPages, printOnLetterhead: args.printOnLetterhead, showPageNum: args.showPageNum },
      orientation: args.orientation,
    });
    await downloadDocx(blob, `Tour Briefing Sheet - ${query.groupName||query.clientName}`);
  };

  const handlePrint = async () => printHTML(await buildPrintHTML());

  const [previewHTML, setPreviewHTML] = useState("");
  useEffect(() => {
    if (viewMode !== "preview") return;
    let cancelled = false;
    buildPrintHTML().then(html => { if (!cancelled) setPreviewHTML(html); });
    return () => { cancelled = true; };
  }, [viewMode, printOrder, footer, showStamp, headerFooterAllPages, printOnLetterhead, showPageNum]);

  const tabBtn=(id,label)=>(<button key={id} onClick={()=>setActiveTab(id)} style={{padding:"7px 12px",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:11,background:activeTab===id?G.navy:"transparent",color:activeTab===id?"#fff":G.gray600,borderBottom:`2px solid ${activeTab===id?G.accent:"transparent"}`,fontWeight:activeTab===id?600:400,whiteSpace:"nowrap"}}>{label}</button>);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:"min(880px, 100vw)",height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>TOUR BRIEFING SHEET · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id}{query.tourFileId?" · 📁 "+query.tourFileId:""}</div>
          </div>
          <VersionDropdown
            versions={versions}
            viewingVersion={viewingVersion}
            displayVersion={version}
            finalVersion={finalVersion}
            onSelectVersion={loadVersionIntoDraft}
            onMarkFinal={(v) => {
              setFinalVersion(v.version);markTourBriefingVersionFinal(db,query.id,v.version);
              logAudit(db,query.id,currentUser?.name,`Tour Briefing Sheet v${v.version} marked final`);
            }}
            readOnly={readOnly}
            G={G}
          />
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        {isStaleVsCostSheet && !readOnly && (
          <div style={{background:"#FEF9E7",borderBottom:"1px solid #F7DC6F",padding:"6px 18px",fontSize:11,color:"#7D6608",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
            <span style={{flex:1}}>
              Cost Sheet v{finalCostSheetVersion.version} (final) has hotel/programme data
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
        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>
        {viewMode === "content" ? (
          <>
            <div style={{padding:"8px 16px",background:G.gray50,borderBottom:`1px solid ${G.gray200}`,flexShrink:0,position:"relative"}}>
              <button type="button" onClick={()=>setPrintSectionsOpen(v=>!v)}
                style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",padding:0,cursor:"pointer",fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                Print Sections ({printOrder.filter(id=>printEnabled[id]).length}/{printOrder.length}) {printSectionsOpen?"▲":"▼"}
              </button>
              {printSectionsOpen && <div style={{position:"absolute",top:"100%",left:16,right:16,zIndex:20,background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,boxShadow:"0 4px 14px rgba(0,0,0,0.12)",marginTop:4,maxHeight:280,overflowY:"auto"}}>
                <div style={{fontSize:9,color:G.gray400,padding:"8px 12px 4px",textTransform:"uppercase",letterSpacing:"0.5px"}}>Drag ☰ to reorder · check to include in print</div>
                {printOrder.map(id=>{
                  const sec=ALL_SECTIONS.find(s=>s.id===id);
                  if(!sec) return null;
                  return <div key={id} draggable onDragStart={()=>onDragStart(id)} onDragEnter={()=>onDragEnterItem(id)} onDragEnd={onDragEnd} onDragOver={e=>e.preventDefault()}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",cursor:"grab",userSelect:"none",background:dragItem===id?G.gray50:G.white,opacity:dragItem===id?0.5:1,borderTop:`1px solid ${G.gray100||"#F3F4F6"}`}}>
                    <span style={{color:G.gray400,fontSize:12}}>☰</span>
                    <label style={{display:"flex",alignItems:"center",gap:8,flex:1,cursor:"pointer",fontSize:12,color:printEnabled[id]?G.gray800:G.gray400}}>
                      <input type="checkbox" checked={printEnabled[id]} onChange={()=>toggleSection(id)}/>
                      {sec.label}
                    </label>
                  </div>;
                })}
              </div>}
            </div>
            <div style={{display:"flex",borderBottom:`1px solid ${G.gray200}`,background:G.white,flexShrink:0,overflowX:"auto"}}>
              {ALL_SECTIONS.map(s=>tabBtn(s.id,s.label))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
              {activeTab==="meta"&&<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>{[["Date",docDate,setDocDate],["Recipient Name",recipient,setRecipient],["Agent Company",agentCo,setAgentCo],["Country / City",agentCity,setAgentCity]].map(([l,v,s])=><div key={l}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={v} onChange={e=>s(e.target.value)}/></div>)}<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Subject</div><input style={inp} value={subject} onChange={e=>setSubject(e.target.value)}/></div><div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Opening Line</div><RichTextEditor value={intro} onChange={setIntro} minHeight={36}/></div><div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Footer</div><RichTextEditor value={footer} onChange={setFooter} minHeight={60}/></div></div><NoteField val={metaNotes} set={setMetaNotes}/></div>}
              {activeTab==="hotels"&&<div><SectionLabelField id="hotels"/>{hotels.map((h,i)=><div key={h.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr 1fr 1fr auto",gap:6}}>{[["Check In","checkIn","date"],["Check Out","checkOut","date"],["City","city","text"],["Hotel Name","hotelName","text"],["Rooms","rooms","text"],["Status","bookingStatus","statussel"]].map(([l,f,t])=><div key={f}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>{t==="statussel"?<select style={inp} value={h[f]||"Requested"} onChange={e=>updH(i,f,e.target.value)}>{["Requested","Confirmed","Waitlisted","Sold Out","Cancelled"].map(s=><option key={s}>{s}</option>)}</select>:<input style={inp} type={t} value={h[f]||""} onChange={e=>updH(i,f,e.target.value)}/>}</div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setHotels(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setHotels(p=>[...p,{id:Date.now(),checkIn:"",checkOut:"",city:"",hotelName:"",rooms:"",bookingStatus:"Requested"}])}>+ Add Hotel</button><NoteField val={hotelNotes} set={setHotelNotes}/></div>}
              {activeTab==="flights"&&<div><SectionLabelField id="flights"/>{flights.map((f,i)=><div key={f.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:8,marginBottom:8,background:G.gray50,padding:10,borderRadius:8,border:`1px solid ${G.gray200}`}}>{[["Date","date","date"],["Sector","sector","text"],["Flight No.","flightNo","text"],["Time","time","text"]].map(([l,k,t])=><div key={k}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={t} value={f[k]||""} onChange={e=>updF(i,k,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setFlights(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setFlights(p=>[...p,{id:Date.now(),date:"",sector:"",flightNo:"",time:""}])}>+ Add Flight</button><NoteField val={flightNotes} set={setFlightNotes}/></div>}
              {activeTab==="trains"&&<div><SectionLabelField id="trains"/>{trains.map((t,i)=><div key={t.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6}}>{[["Date","date","date"],["Sector","sector","text"],["Train No.","trainNo","text"],["Train Name","trainName","text"],["Time","time","text"]].map(([l,f,tp])=><div key={f}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={tp} value={t[f]||""} onChange={e=>updT(i,f,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setTrains(p=>p.filter((_,xi)=>xi!==i))}>✕</span></div></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setTrains(p=>[...p,{id:Date.now(),date:"",sector:"",trainNo:"",trainName:"",time:"",coach:""}])}>+ Add Train</button><NoteField val={trainNotes} set={setTrainNotes}/></div>}
              {activeTab==="transport"&&<div>
                <SectionLabelField id="transport"/>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:8}}>
                  <thead><tr style={{background:G.navy}}>{["Description","Quantity",""].map(h=><th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{transport.map((t,i)=><tr key={t.id} style={{background:i%2===0?G.white:G.gray50}}>
                    <td style={{padding:"3px 4px",minWidth:220}}><RichTextEditor value={t.description||""} onChange={v=>updTr(i,"description",v)} minHeight={30}/></td>
                    <td style={{padding:"3px 4px",width:90}}><input style={inp} value={t.quantity||""} onChange={e=>updTr(i,"quantity",e.target.value)} placeholder="e.g. 05"/></td>
                    <td style={{padding:"3px 4px"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setTransport(p=>p.filter((_,xi)=>xi!==i))}>✕</span></td>
                  </tr>)}</tbody>
                </table>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setTransport(p=>[...p,{id:Date.now(),description:"",quantity:""}])}>+ Add Transport</button>
                <NoteField val={transportNotes} set={setTransportNotes}/>
              </div>}
              {activeTab==="guides"&&<div>
                <SectionLabelField id="guides"/>
                {activeFacilitators.length===0 && <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#92400E",marginBottom:10}}>No facilitators in the master list yet — add them under Master Data → Tour Facilitators, then they'll appear here to select.</div>}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:8}}>
                  <thead><tr style={{background:G.navy}}>{["Description","Name","Contact",""].map(h=><th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{guides.map((g,i)=><tr key={g.id} style={{background:i%2===0?G.white:G.gray50}}>
                    <td style={{padding:"3px 4px",minWidth:140}}><input style={inp} value={g.description||""} onChange={e=>updG(i,"description",e.target.value)} placeholder="e.g. Chinese Speaking Guide"/></td>
                    <td style={{padding:"3px 4px",minWidth:150}}>
                      <select style={inp} value={g.facilitatorId||""} onChange={e=>updG(i,"facilitatorId",e.target.value)}>
                        <option value="">Select...</option>
                        {activeFacilitators.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"3px 4px",minWidth:110}}><input style={inp} value={g.contact||""} onChange={e=>updG(i,"contact",e.target.value)}/></td>
                    <td style={{padding:"3px 4px"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setGuides(p=>p.filter((_,xi)=>xi!==i))}>✕</span></td>
                  </tr>)}</tbody>
                </table>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setGuides(p=>[...p,{id:Date.now(),description:"",facilitatorId:"",name:"",contact:""}])}>+ Add Tour Facilitator</button>
                <NoteField val={guideNotes} set={setGuideNotes}/>
              </div>}
              {activeTab==="others"&&<div>
                {otherGroups.map((g,gi)=><div key={g.id} style={{border:`1px solid ${G.gray200}`,borderRadius:8,padding:12,marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Section Label</div>
                      <input style={inp} value={g.label} onChange={e=>updOGroupLabel(gi,e.target.value)}/>
                    </div>
                    {otherGroups.length>1 && <span style={{cursor:"pointer",color:G.gray400,fontSize:13,paddingTop:14}} onClick={()=>removeOGroup(gi)}>✕ Remove section</span>}
                  </div>
                  {g.items.map((it,ii)=><div key={it.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:6}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr auto",gap:6}}>
                    <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Day</div><input style={inp} value={it.day||""} onChange={e=>updOItem(gi,ii,"day",e.target.value)}/></div>
                    <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Date</div><input style={inp} type="date" value={it.date||""} onChange={e=>updOItem(gi,ii,"date",e.target.value)}/></div>
                    <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Description</div><input style={inp} value={it.description||""} onChange={e=>updOItem(gi,ii,"description",e.target.value)}/></div>
                    <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>removeOItem(gi,ii)}>✕</span></div>
                  </div></div>)}
                  <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>addOItem(gi)}>+ Add Item</button>
                </div>)}
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={addOGroup}>+ Add Section</button>
                <NoteField val={otherNotes} set={setOtherNotes}/>
              </div>}
              {activeTab==="programme"&&<div><SectionLabelField id="programme"/>{programme.map((p,i)=><div key={p.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:8}}>{[["Date","date","date"],["Day","day","text"],["Breakfast","breakfast","text"],["Lunch","lunch","text"],["Dinner","dinner","text"]].map(([l,k,t])=><div key={k}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><input style={inp} type={t} value={p[k]||""} onChange={e=>updP(i,k,e.target.value)}/></div>)}<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setProgramme(prev=>prev.filter((_,xi)=>xi!==i))}>✕</span></div></div><div style={{marginBottom:6}}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Itinerary (movement for the day)</div><RichTextEditor value={p.itinerary||""} onChange={v=>updP(i,"itinerary",v)} minHeight={48}/></div><div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Programme Details</div><RichTextEditor value={p.programme||""} onChange={v=>updP(i,"programme",v)} minHeight={80}/></div></div>)}<button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setProgramme(p=>[...p,{id:Date.now(),date:"",day:"",itinerary:"",programme:"",breakfast:"",lunch:"",dinner:""}])}>+ Add Day</button><NoteField val={progNotes} set={setProgNotes}/></div>}
              {activeTab==="mealplan"&&<div>
                <SectionLabelField id="mealplan"/>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:8}}>
                  <thead><tr style={{background:G.navy}}>{["Day","Date","Itinerary","☕ Breakfast","🍽 Lunch","🍛 Dinner","Notes",""].map(h=><th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{mealDays.map((r,i)=><tr key={r.id} style={{background:i%2===0?G.white:G.gray50}}>
                    <td style={{padding:"3px 4px"}}><input style={{...inp,width:52}} value={r.day} onChange={e=>updM(i,"day",e.target.value)}/></td>
                    <td style={{padding:"3px 4px"}}><input style={{...inp,width:86}} type="date" value={r.date} onChange={e=>updM(i,"date",e.target.value)}/></td>
                    <td style={{padding:"3px 4px",minWidth:120}}><input style={inp} value={r.itinerary||""} onChange={e=>updM(i,"itinerary",e.target.value)} placeholder="e.g. Delhi → Agra"/></td>
                    <td style={{padding:"3px 4px"}}><input style={inp} value={r.breakfast} onChange={e=>updM(i,"breakfast",e.target.value)} placeholder="Venue"/></td>
                    <td style={{padding:"3px 4px"}}><input style={inp} value={r.lunch} onChange={e=>updM(i,"lunch",e.target.value)} placeholder="Venue"/></td>
                    <td style={{padding:"3px 4px"}}><input style={inp} value={r.dinner} onChange={e=>updM(i,"dinner",e.target.value)} placeholder="Venue"/></td>
                    <td style={{padding:"3px 4px"}}><input style={inp} value={r.notes} onChange={e=>updM(i,"notes",e.target.value)}/></td>
                    <td style={{padding:"3px 4px"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>setMealDays(p=>p.filter((_,xi)=>xi!==i))}>✕</span></td>
                  </tr>)}</tbody>
                </table>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setMealDays(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",itinerary:"",breakfast:"",lunch:"",dinner:"",notes:""}])}>+ Add Day</button>
                <NoteField val={mealNotes} set={setMealNotes}/>
              </div>}
              {activeTab==="contacts"&&<div>
                {contactGroups.map((g,gi)=><div key={g.id} style={{border:`1px solid ${G.gray200}`,borderRadius:8,padding:12,marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Section Label</div>
                      <input style={inp} value={g.label} onChange={e=>updCGroupLabel(gi,e.target.value)}/>
                    </div>
                    {contactGroups.length>1 && <span style={{cursor:"pointer",color:G.gray400,fontSize:13,paddingTop:14}} onClick={()=>removeCGroup(gi)}>✕ Remove section</span>}
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:8}}>
                    <thead><tr style={{background:G.navy}}>{["City","Name","Contact","Address",""].map(h=><th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>{g.items.map((it,ii)=><tr key={it.id} style={{background:ii%2===0?G.white:G.gray50}}>
                      <td style={{padding:"3px 4px",width:100}}><input style={inp} value={it.city||""} onChange={e=>updCItem(gi,ii,"city",e.target.value)}/></td>
                      <td style={{padding:"3px 4px",minWidth:150,position:"relative"}}>
                        <div style={{display:"flex",gap:3}}>
                          <input style={inp} value={it.name||""} onChange={e=>updCItem(gi,ii,"name",e.target.value)}/>
                          <button type="button" title="Search Vendor Master" onClick={()=>updCItem(gi,ii,"vendorSearchOpen",!it.vendorSearchOpen)}
                            style={{border:`1px solid ${G.gray200}`,background:G.white,color:G.gray400,borderRadius:4,fontSize:10,padding:"0 6px",cursor:"pointer"}}>🔍</button>
                        </div>
                        {it.vendorSearchOpen && <select autoFocus style={{...inp,position:"absolute",zIndex:5,marginTop:2}} size={6}
                          onChange={e=>pickVendorForContact(gi,ii,e.target.value)} onBlur={()=>updCItem(gi,ii,"vendorSearchOpen",false)}>
                          <option value="">Select a vendor...</option>
                          {(vendors||[]).filter(v=>v.active!==false).map(v=><option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                        </select>}
                      </td>
                      <td style={{padding:"3px 4px",minWidth:110}}><input style={inp} value={it.contact||""} onChange={e=>updCItem(gi,ii,"contact",e.target.value)}/></td>
                      <td style={{padding:"3px 4px",minWidth:150}}><input style={inp} value={it.address||""} onChange={e=>updCItem(gi,ii,"address",e.target.value)}/></td>
                      <td style={{padding:"3px 4px"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>removeCItem(gi,ii)}>✕</span></td>
                    </tr>)}</tbody>
                  </table>
                  <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>addCItem(gi)}>+ Add Contact</button>
                </div>)}
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={addCGroup}>+ Add Section</button>
                <NoteField val={contactNotes} set={setContactNotes}/>
              </div>}
            </div>
          </>
        ) : (
          <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
            <LetterheadToggleBar toggles={toggles} G={G}/>
            <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
              <DocPreviewFrame html={previewHTML}/>
            </div>
          </div>
        )}
        <div style={{padding:"10px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1,fontSize:11,color:G.gray400,alignSelf:"center"}}>{viewMode==="content" ? "Drag section tiles to reorder in print output" : ""}</div>
          {!readOnly && <button onClick={saveVersion} className="btn btn-primary">💾 Save v{version}</button>}
          <ExportMenu G={G} actions={[
            { id:"pdf",   label:"PDF",   icon:"📕", onSelect: handlePrint, hint:"Opens your browser's print dialog" },
            { id:"word",  label:"Word",  icon:"📄", onSelect: exportDocx,  hint:"Downloads a .docx file" },
            { id:"print", label:"Print", icon:"🖨", onSelect: handlePrint, separatorBefore:true },
          ]}/>
        </div>
      </div>
    </div>
  );
}
