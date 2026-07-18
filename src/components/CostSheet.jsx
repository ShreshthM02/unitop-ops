import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadCostSheetVersions, saveCostSheetVersion, markCostSheetVersionFinal, logAudit, buildLetterheadDocument, printHTML, db } = Lib;

export function CostSheet({ query, onClose, onProceedToQuotation, currentUser, readOnly, staff }) {
  const n = v => parseFloat(v)||0;
  const fieldsetRef = useRef(null);
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [lastSavedCostSheetId, setLastSavedCostSheetId] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null); // which saved version is currently loaded into the draft, if any
  const [versionNote, setVersionNote] = useState(""); // one-line reason for this save -- "client requested discount", etc.

  // 10.1 Settings
  const [gst,    setGst]    = useState(5);
  const [markup, setMarkup] = useState(15);
  const [roe,    setRoe]    = useState(90);
  const [currency, setCurrency] = useState("US $");
  // Tour Facilitator (10.1.1) — lumpsum or PP toggle
  const [tlMode,  setTlMode]  = useState("lumpsum"); // "lumpsum" | "pp"
  const [tlCost,  setTlCost]  = useState("");
  // Monument (10.1.3) — separate, lumpsum or PP
  const [monMode,  setMonMode]  = useState("pp");
  const [monuments, setMonuments] = useState([]); // start empty — user adds as needed
  const [monExtra,  setMonExtra]  = useState(""); // extra misc monument cost -- blank by default, shows "0" only as a placeholder hint; n() already treats blank as 0 in calculations
  // Misc — separate, lumpsum or PP
  const [miscMode, setMiscMode] = useState("lumpsum");
  const [miscCost, setMiscCost] = useState("");

  // 10.2 Day rows
  const [days, setDays] = useState([
    { id:1, day:"Day 1", date:"", movement:"", mealPlan:"D",    mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:2, day:"Day 2", date:"", movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:3, day:"Day 3", date:"", movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
    { id:4, day:"Day 4", date:"", movement:"", mealPlan:"B/L",  mealCost:"", hotel:"Departure",    hotelPlan:"",   hotelNetPP:"", singleSupp:"", notes:"" },
  ]);

  // 10.3 Transport rows
  const [transports, setTransports] = useState([
    { id:1, sector:"", vehicleType:"Large Coach", cost:"", slabs:[], notes:"" },
  ]);
  const [extras, setExtras] = useState([]);
  const updateExtra = (i,f,v) => setExtras(p=>p.map((e,idx)=>idx===i?{...e,[f]:v}:e));

  // Local Handler(s) — third-party ground operator/DMC per sector. Optional:
  // starts empty, only appears in totals/output once at least one is added
  // (same "add only if needed" pattern as Extra Services). Multiple entries
  // supported since a multi-sector tour can have a different local handler
  // per sector, each with its own per-pax/lumpsum cost.
  const [localHandlers, setLocalHandlers] = useState([]);
  const updateLocalHandler = (i,f,v) => setLocalHandlers(p=>p.map((h,idx)=>idx===i?{...h,[f]:v}:h));
  const addLocalHandler = () => setLocalHandlers(p=>[...p,{id:Date.now(),sector:"",dateFrom:"",dateTo:"",mode:"pp",cost:"",singleSupp:"",remarks:""}]);
  const removeLocalHandler = i => setLocalHandlers(p=>p.filter((_,idx)=>idx!==i));

  // 10.4 Slabs
  const [slabs, setSlabs] = useState([
    { id:1, label:"15-19 pax + 1 FOC", foc:15, vehicle:"Mini Bus" },
    { id:2, label:"20-24 pax + 1 FOC", foc:20, vehicle:"Large Coach" },
    { id:3, label:"25-29 pax + 1 FOC", foc:25, vehicle:"Large Coach" },
    { id:4, label:"30-34 pax + 2 FOC", foc:30, vehicle:"Large Coach" },
    { id:5, label:"35-39 pax + 2 FOC", foc:35, vehicle:"Large Coach" },
  ]);

  // Tour Leader Slab — optional, MULTIPLE allowed (e.g. a 10-pax T/L slab
  // and a 12-pax T/L slab side by side). Each one appears as a real row
  // in the Final Price Summary below, alongside the group slabs, with its
  // own label -- not a separate reference number.
  const [tlSlabs, setTlSlabs] = useState([]);
  const scrollRestoreRef = useRef(null);
  useLayoutEffect(() => {
    if (scrollRestoreRef.current) {
      const { fieldset, window: winY } = scrollRestoreRef.current;
      if (fieldsetRef.current && fieldset != null) fieldsetRef.current.scrollTop = fieldset;
      if (winY != null) window.scrollTo(0, winY);
      scrollRestoreRef.current = null;
    }
  }, [tlSlabs.length]);
  // Direct, guaranteed scroll preservation -- after two CSS-based
  // theories (scroll-anchoring, then flexbox min-height) were confirmed
  // deployed but did NOT stop the reported "jumps to top" behavior, this
  // captures scroll position from every plausible scrolling element
  // before the DOM changes and restores it synchronously afterward, via
  // useLayoutEffect (runs after DOM mutation, before paint -- so there's
  // no visible flash). This works regardless of which element actually
  // turns out to be responsible, without needing to identify it first.
  const addTlSlab = () => {
    scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
    setTlSlabs(p=>[...p, {
      id: Date.now(), label: "10 pax + 1 T/L", vehicle: "", pax: "",
      costs: { hotel:"", meals:"", transport:"", monument:"", localHandler:"", extras:"" },
      includes: { hotel:true, meals:true, transport:true, monument:true, localHandler:true, extras:true },
    }]);
  };
  const updateTlSlab = (i, patch) => setTlSlabs(p=>p.map((t,idx)=>idx===i?{...t,...patch}:t));
  const removeTlSlab = (i) => setTlSlabs(p=>p.filter((_,idx)=>idx!==i));
  const fetchTlSlabCosts = (i) => {
    const ref = slabs[0] ? calcSlab(slabs[0]) : null;
    updateTlSlab(i, { costs: {
      hotel: Math.round(totHotel)||"", meals: Math.round(totMeal)||"",
      transport: ref?ref.tptPP||"":"", monument: ref?ref.monPP||"":"",
      localHandler: ref?ref.localPP||"":"", extras: ref?ref.extrasPP||"":"",
    }});
  };

  // Client / Foreign Agent and Assigned Staff -- pre-filled from the tour
  // file's own query record, but independently editable here (this
  // document's own snapshot copy, same SNAPSHOT pattern as everything
  // else the Cost Sheet pre-fills -- editing here does not write back to
  // the query itself).
  const [clientAgentName, setClientAgentName] = useState(query.agentCompany || query.groupName || query.clientName || "");
  const [assignedStaffName, setAssignedStaffName] = useState((staff||[]).find(s=>s.id===query.assignedTo)?.name || "");

  // Load previously saved versions for this tour file on mount. Continues
  // editing from the latest saved version rather than starting blank every
  // time the Cost Sheet is reopened -- versions[] itself becomes real
  // history instead of resetting to empty on every open.
  const loadVersionIntoDraft = (v) => {
    setGst(v.gst); setMarkup(v.markup); setRoe(v.roe); setCurrency(v.currency);
    setTlMode(v.tlMode); setTlCost(v.tlCost);
    setMiscMode(v.miscMode); setMiscCost(v.miscCost);
    setMonMode(v.monMode); setMonExtra(v.monExtra); setMonuments(v.monuments);
    setDays(v.days); setTransports(v.transports); setSlabs(v.slabs);
    setLocalHandlers(v.localHandlers); setExtras(v.extras);
    // Defensive fallbacks: versions saved before Tour Leader Slab existed
    // won't have these fields at all; versions saved with the OLD
    // single-object T/L Slab shape (before "allow multiple") get migrated
    // into a one-item array rather than lost.
    if (Array.isArray(v.tlSlabs)) {
      setTlSlabs(v.tlSlabs);
    } else if (v.tlSlabEnabled) {
      setTlSlabs([{ id:Date.now(), label:v.tlSlabLabel||"10 pax + 1 T/L", vehicle:v.tlSlabVehicle||"", pax:v.tlSlabPax||"", costs:v.tlSlabCosts||{hotel:"",meals:"",transport:"",monument:"",localHandler:"",extras:""}, includes:v.tlSlabIncludes||{hotel:true,meals:true,transport:true,monument:true,localHandler:true,extras:true} }]);
    } else {
      setTlSlabs([]);
    }
    setClientAgentName(v.clientAgentName ?? (query.agentCompany||query.groupName||query.clientName||""));
    setAssignedStaffName(v.assignedStaffName ?? ((staff||[]).find(s=>s.id===query.assignedTo)?.name||""));
    setViewingVersion(v.version);
  };

  useEffect(() => {
    loadCostSheetVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) return;
      setVersions(loaded);
      setVersion(Math.max(...loaded.map(v => v.version)) + 1);
      const finalV = loaded.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
    });
  }, [query.id]);

  const updateDay = (i,f,v) => setDays(p=>p.map((d,idx)=>idx===i?{...d,[f]:v}:d));
  const addDay = () => setDays(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",mealPlan:"B/L/D",mealCost:"",hotel:"",hotelAlt:"",hotelPlan:"CP",hotelNetPP:"",singleSupp:"",notes:""}]);
  const removeDay = i => setDays(p=>p.filter((_,idx)=>idx!==i));

  const updateTransport = (i,f,v) => setTransports(p=>p.map((t,idx)=>idx===i?{...t,[f]:v}:t));
  const toggleTransportSlab = (ti, slabId) => setTransports(p=>p.map((t,idx)=>{
    if(idx!==ti) return t;
    const slabs = t.slabs.includes(slabId) ? t.slabs.filter(s=>s!==slabId) : [...t.slabs, slabId];
    return {...t, slabs};
  }));
  const addTransport = () => setTransports(p=>[...p,{id:Date.now(),sector:"",vehicleType:"Large Coach",cost:"",slabs:[],notes:""}]);
  const removeTransport = i => setTransports(p=>p.filter((_,idx)=>idx!==i));

  const updateSlab = (i,f,v) => setSlabs(p=>p.map((s,idx)=>idx===i?{...s,[f]:v}:s));
  const addSlab = () => setSlabs(p=>[...p,{id:Date.now(),label:"New Slab",foc:15,vehicle:"Large Coach"}]);

  const toggleMonument = i => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,include:!m.include}:m));
  const updateMonument = (i,f,v) => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,[f]:v}:m));

  // Totals
  const totMeal    = days.reduce((s,d)=>s+n(d.mealCost),0);
  const totHotel   = days.reduce((s,d)=>s+n(d.hotelNetPP),0);
  const daySS      = days.reduce((s,d)=>s+n(d.singleSupp),0);
  const handlerSS  = localHandlers.reduce((s,h)=>s+n(h.singleSupp),0);
  const totSS      = daySS + handlerSS;
  const monTotal   = monuments.filter(m=>m.include).reduce((s,m)=>s+n(m.fee),0) + n(monExtra);

  const calcSlab = (slab) => {
    // Transport for this slab
    const tptTotal = transports.filter(t=>t.slabs.includes(slab.id)).reduce((s,t)=>s+n(t.cost),0);
    const tptPP = slab.foc > 0 ? tptTotal / slab.foc : 0;
    // TL/Facilitator
    const tlPP = tlMode==="pp" ? n(tlCost) : (slab.foc>0 ? n(tlCost)/slab.foc : 0);
    // Misc
    const miscPP = miscMode==="pp" ? n(miscCost) : (slab.foc>0 ? n(miscCost)/slab.foc : 0);
    // Monument
    const monPP = monMode==="pp" ? monTotal : (slab.foc>0 ? monTotal/slab.foc : 0);
    // Local handler(s) — each entry can independently be per-pax or lumpsum
    const localPP = localHandlers.reduce((s,h) => s + (h.mode==="pp" ? n(h.cost) : (slab.foc>0 ? n(h.cost)/slab.foc : 0)), 0);
    // Extra services — "PP" is already per-pax; Lumpsum/Per Vehicle/Per
    // Group are all a single total cost for the group, divided across
    // paying pax the same way local handler lumpsum costs are.
    const extrasPP = extras.reduce((s,e) => s + (e.mode==="PP" ? n(e.cost) : (slab.foc>0 ? n(e.cost)/slab.foc : 0)), 0);

    const sub = totHotel + totMeal + tptPP + tlPP + miscPP + monPP + localPP + extrasPP;
    const tax = Math.round(sub * gst/100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup/100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = Math.ceil(sellingINR / roe);
    // Single supplement
    const ssFX = Math.ceil(((totSS + totSS*gst/100) * (1 + markup/100)) / roe);
    return { tptTotal, tptPP:Math.round(tptPP), tlPP:Math.round(tlPP), miscPP:Math.round(miscPP), monPP:Math.round(monPP), localPP:Math.round(localPP), extrasPP:Math.round(extrasPP), sub:Math.round(sub), tax, afterTax:Math.round(afterTax), markupAmt, sellingINR:Math.round(sellingINR), finalFX, ssFX };
  };

  // A Tour Leader Slab is computed EXACTLY like a normal group slab --
  // same Transport (via the matrix), same Tour Facilitator cost (the
  // escort WE provide, from the global tlMode/tlCost setting -- this is
  // NOT the T/L), same Misc/Monument/Local Handler/Extras, same
  // Accommodation/Meals, same Single Supplement -- just using this T/L
  // slab's own "Paying Pax" as the FOC-equivalent divisor. The ONE thing
  // genuinely different is the T/L surcharge itself: the foreign agent's
  // own escort has no FOC coverage in a small group, so their own costs
  // (checked below) get spread across paying guests and added on top,
  // in its own separate column -- never confused with Tour Facilitator.
  const calcTlSlab = (tl) => {
    const base = calcSlab({ id: tl.id, foc: n(tl.pax) });
    const surchargeTotal = Object.entries(tl.costs).reduce((s,[k,v])=>s+(tl.includes[k]?n(v):0),0);
    const surchargePP = n(tl.pax)>0 ? surchargeTotal/n(tl.pax) : 0;
    const sub = base.sub + surchargePP;
    const tax = Math.round(sub*gst/100);
    const afterTax = sub+tax;
    const markupAmt = Math.round(afterTax*markup/100);
    const sellingINR = afterTax+markupAmt;
    const finalFX = Math.ceil(sellingINR/roe);
    return { ...base, surchargeTotal:Math.round(surchargeTotal), surchargePP:Math.round(surchargePP), sub:Math.round(sub), tax, afterTax:Math.round(afterTax), markupAmt, sellingINR:Math.round(sellingINR), finalFX };
  };

  const saveVersion = () => {
    const snap = { version, date:new Date().toLocaleString("en-IN"), slabs:[...slabs], days:[...days], transports:[...transports], gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra, monuments:[...monuments], localHandlers:[...localHandlers], extras:[...extras], note: versionNote, tlSlabs:tlSlabs.map(t=>({...t,costs:{...t.costs},includes:{...t.includes}})), clientAgentName, assignedStaffName };
    setVersions(p=>[...p.filter(v=>v.version!==version), snap]);
    saveCostSheetVersion(db, query.id, snap, currentUser?.id).then(id => { if (id) setLastSavedCostSheetId(id); });
    logAudit(db, query.id, currentUser?.name, `Cost Sheet v${version} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(version);
    setVersionNote("");
    setVersion(v=>v+1);
  };

  const inp = {padding:"4px 6px",border:`1px solid ${G.gray200}`,borderRadius:4,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  // ── EXPORTS: PDF (landscape A4) and XLSX ──
  const currentVersionLabel = viewingVersion || version;
  const savedTimestamp = versions.find(v=>v.version===currentVersionLabel)?.date || "Not yet saved";

  const buildCostSheetPDFHTML = () => {
    // Right-align is set on BOTH header and data cells together here,
    // rather than separately, since a header defaulting to left-align
    // while its numeric column right-aligns underneath was the actual
    // cause of the earlier "columns don't line up" complaint.
    //
    // Widths are explicit per table, not auto-derived from column count --
    // an earlier version assumed "first column is always the longest
    // content" and gave it a fixed share of the width, which looked fine
    // for slab tables but broke down for the day-wise table (where "Day"
    // is short and "Movement"/"Hotel" need real room) and for narrow
    // tables like Monuments (where splitting the remaining space evenly
    // gave "Fee"/"Included" far more room than short values need). Each
    // call site now passes its own widths, sized to what that table's
    // columns actually hold.
    // tableWidthPct lets a table genuinely be narrower than the page,
    // rather than always spanning 100% and distributing percentages
    // within that full width. Confirmed via live DevTools measurement
    // that column percentages were rendering exactly as specified (e.g.
    // 40% of a 1550px page = 620px) -- the actual problem was forcing a
    // 3-column table with short content (a monument name, a price,
    // Yes/No) to fill the entire page width regardless, which stretches
    // everything out no matter how the percentages are split internally.
    const tableBlock = (headers, alignRight, rows, emptyLabel, widths, tableWidthPct=100) => {
      const w = widths || headers.map(() => (100 / headers.length).toFixed(2));
      const colgroup = `<colgroup>${w.map(pct=>`<col style="width:${pct}%"/>`).join("")}</colgroup>`;
      return `
      <table class="content-table" style="table-layout:fixed;width:${tableWidthPct}%">
        ${colgroup}
        <thead><tr>${headers.map((h,i)=>`<th style="text-align:${alignRight.includes(i)?"right":"left"};width:${w[i]}%">${h}</th>`).join("")}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${headers.length}" style="text-align:center;color:#999">${emptyLabel}</td></tr>`}</tbody>
      </table>`;
    };
    // widths is now required alongside alignRight -- applied directly on
    // every <td>, not just inherited from the table's own colgroup. Some
    // browsers' print-rendering path does not reliably honor colgroup/
    // table-layout:fixed the same way normal screen rendering does, so
    // this repeats the width explicitly on each cell as a more robust
    // belt-and-suspenders measure, rather than depending on inheritance.
    const rowHTML = (cells, alignRight, widths) => `<tr>${cells.map((c,i)=>`<td style="text-align:${alignRight.includes(i)?"right":"left"}${widths?`;width:${widths[i]}%`:""}">${c}</td>`).join("")}</tr>`;

    const headerBlock = `
      <div style="text-align:center;margin-bottom:4pt">
        <div class="inv-title">COST SHEET</div>
      </div>
      <div style="text-align:center;font-size:9pt;color:#555;margin-bottom:4pt">Version ${currentVersionLabel} &middot; Saved ${savedTimestamp}</div>
      <div style="text-align:center;font-size:10pt;margin-bottom:10pt">
        <b>${query.groupName||query.clientName||""}</b> &middot; ${query.destination||query.sector||""} &middot; Tour File: ${query.tourFileId||query.id}<br/>
        <span style="font-size:9pt;color:#555">Client / Foreign Agent: ${clientAgentName||"—"} &middot; Assigned Staff: ${assignedStaffName||"—"}</span>
      </div>`;

    const settingsBlock = `
      <table style="width:100%;table-layout:fixed;margin-bottom:10pt;font-size:9pt">
        <colgroup><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/><col style="width:25%"/></colgroup>
        <tr>
        <td><b>GST:</b> ${gst}%</td><td><b>Markup:</b> ${markup}%</td><td><b>ROE:</b> ${roe}</td><td><b>Currency:</b> ${currency}</td>
      </tr><tr>
        <td><b>Tour Facilitator:</b> ${tlMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${n(tlCost).toLocaleString()}</td>
        <td><b>Misc Cost:</b> ${miscMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${n(miscCost).toLocaleString()}</td>
        <td colspan="2"><b>Monument:</b> ${monMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${Math.round(monTotal).toLocaleString()} total</td>
      </tr></table>`;

    const dayRows = days.map(d => rowHTML([
      d.day, d.date||"", d.movement||"", d.mealPlan||"",
      n(d.mealCost)?"₹"+n(d.mealCost).toLocaleString():"—",
      d.hotel||"", d.hotelAlt||"—", d.hotelPlan||"",
      n(d.hotelNetPP)?"₹"+n(d.hotelNetPP).toLocaleString():"—",
      n(d.singleSupp)?"₹"+n(d.singleSupp).toLocaleString():"—",
    ], [4,8,9], [5,8,16,8,9,14,12,7,10,11])).join("");
    const totalsRow = `<tr style="font-weight:700;background:#f3f4f6"><td colspan="4">TOTALS</td><td style="text-align:right">₹${Math.round(totMeal).toLocaleString()}</td><td colspan="3"></td><td style="text-align:right">₹${Math.round(totHotel).toLocaleString()}</td><td style="text-align:right">₹${Math.round(daySS).toLocaleString()}</td></tr>`;
    const dayTableBlock = `
      <div class="inv-title" style="margin-bottom:8pt">Day-wise Itinerary &amp; Accommodation</div>
      ${tableBlock(["Day","Date","Movement","Meal Plan","Meal Cost","Hotel","Alt Hotel","Plan","Net PP","Sngl Supp"], [4,8,9],
        days.length ? dayRows + totalsRow : "", "No days added",
        [5,8,16,8,9,14,12,7,10,11])}`;

    const monBlock = monuments.length ? `
      <div class="inv-title" style="margin-bottom:8pt">Monuments</div>
      ${tableBlock(["Monument","Fee","Included"], [1],
        monuments.map(m=>rowHTML([m.name||"—", n(m.fee)?"₹"+n(m.fee).toLocaleString():"—", m.include?"Yes":"No"], [1], [40,35,25])).join(""), "",
        [40,35,25], 45)}
      ${n(monExtra)?`<div style="font-size:9pt;margin-bottom:10pt">Extra Monument Cost: ₹${n(monExtra).toLocaleString()}</div>`:""}` : "";

    const tptBlock = transports.length ? `
      <div class="inv-title" style="margin-bottom:8pt">Transport</div>
      ${tableBlock(["Sector","Vehicle","Cost","Applies To"], [2],
        transports.map(t=>rowHTML([t.sector||"—", t.vehicleType||"—", n(t.cost)?"₹"+n(t.cost).toLocaleString():"—", (t.slabs||[]).map(sid=>slabs.find(s=>s.id===sid)?.label||tlSlabs.find(tl=>tl.id===sid)?.label).filter(Boolean).join(", ")||"—"], [2], [20,20,15,45])).join(""), "",
        [20,20,15,45])}` : "";

    const lhBlock = localHandlers.length ? `
      <div class="inv-title" style="margin-bottom:8pt">Local Handler</div>
      ${tableBlock(["Sector","Cost","Mode","Single Supp"], [1,3],
        localHandlers.map(h=>rowHTML([h.sector||"—", n(h.cost)?"₹"+n(h.cost).toLocaleString():"—", h.mode==="pp"?"Per Pax":"Lumpsum", n(h.singleSupp)?"₹"+n(h.singleSupp).toLocaleString():"—"], [1,3], [25,25,20,30])).join(""), "",
        [25,25,20,30], 65)}` : "";

    const exBlock = extras.length ? `
      <div class="inv-title" style="margin-bottom:8pt">Extra Services</div>
      ${tableBlock(["Description","Cost","Mode"], [1],
        extras.map(e=>rowHTML([e.description||"—", n(e.cost)?"₹"+n(e.cost).toLocaleString():"—", e.mode||"PP"], [1], [60,20,20])).join(""), "",
        [60,20,20], 55)}` : "";

    const slabRows = slabs.map(s => {
      const c = calcSlab(s);
      return rowHTML([
        `${s.label}<br/><span style="font-size:7pt;color:#888">${s.vehicle==="Others"?s.vehicleOther:s.vehicle||""}</span>`,
        c.tptPP?"₹"+c.tptPP.toLocaleString():"—", c.tlPP?"₹"+c.tlPP.toLocaleString():"—", c.miscPP?"₹"+c.miscPP.toLocaleString():"—",
        c.monPP?"₹"+c.monPP.toLocaleString():"—", c.localPP?"₹"+c.localPP.toLocaleString():"—", c.extrasPP?"₹"+c.extrasPP.toLocaleString():"—",
        "₹"+c.sub.toLocaleString(), "₹"+c.tax.toLocaleString(), "₹"+c.afterTax.toLocaleString(), "₹"+c.markupAmt.toLocaleString(),
        `<b>${c.finalFX?currency+" "+c.finalFX.toLocaleString():"—"}</b>`, c.ssFX?currency+" "+c.ssFX.toLocaleString():"—",
      ], [1,2,3,4,5,6,7,8,9,10,11,12], [15,7,7,6,6,7,6,8,6,8,7,9,8]);
    }).join("");
    const tlSlabRows = tlSlabs.map(tl => {
      const c = calcTlSlab(tl);
      return rowHTML([
        tl.label, tl.vehicle==="Others"?(tl.vehicleOther||"—"):(tl.vehicle||"—"), n(tl.pax)||"—",
        c.tptPP?"₹"+c.tptPP.toLocaleString():"—", c.tlPP?"₹"+c.tlPP.toLocaleString():"—",
        `<b>${c.surchargePP?"₹"+c.surchargePP.toLocaleString():"—"}</b>`, c.miscPP?"₹"+c.miscPP.toLocaleString():"—",
        c.monPP?"₹"+c.monPP.toLocaleString():"—", c.localPP?"₹"+c.localPP.toLocaleString():"—", c.extrasPP?"₹"+c.extrasPP.toLocaleString():"—",
        "₹"+c.sub.toLocaleString(), "₹"+c.tax.toLocaleString(), "₹"+c.afterTax.toLocaleString(), "₹"+c.markupAmt.toLocaleString(),
        `<b>${c.finalFX?currency+" "+c.finalFX.toLocaleString():"—"}</b>`, c.ssFX?currency+" "+c.ssFX.toLocaleString():"—",
      ], [2,3,4,5,6,7,8,9,10,11,12,13,14,15], [12,7,6,6,6,7,5,5,6,5,6,5,6,5,7,6]);
    }).join("");

    const summaryBlock = `
      <div class="inv-title" style="margin:14pt 0 8pt">Final Price Summary</div>
      <table style="width:100%;table-layout:fixed;margin-bottom:8pt;font-size:9pt">
        <colgroup><col style="width:33.33%"/><col style="width:33.33%"/><col style="width:33.34%"/></colgroup>
        <tr>
        <td><b>Accommodation (PP):</b> ₹${Math.round(totHotel).toLocaleString()}</td>
        <td><b>Extra Meals (PP):</b> ₹${Math.round(totMeal).toLocaleString()}</td>
        <td><b>Single Supplement (total):</b> ₹${Math.round(totSS).toLocaleString()}</td>
      </tr></table>
      ${tableBlock(["Slab","Transport","Tour Facil.","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup","Final Price","SS"],
        [1,2,3,4,5,6,7,8,9,10,11,12], slabRows, "No group slabs added",
        [15,7,7,6,6,7,6,8,6,8,7,9,8])}`;

    // Tour Leader Slabs are deliberately their own table -- never a column
    // (not even blank) inside the group slabs table, since T/L Surcharge
    // simply does not apply to a group slab at all.
    const tlSummaryBlock = tlSlabs.length ? `
      <div class="inv-title" style="margin:14pt 0 8pt">Tour Leader Slabs</div>
      ${tableBlock(["T/L Slab","Vehicle","Paying Pax","Transport","Tour Facil.","T/L Surcharge","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup","Final Price","SS"],
        [2,3,4,5,6,7,8,9,10,11,12,13,14,15], tlSlabRows, "",
        [12,7,6,6,6,7,5,5,6,5,6,5,6,5,7,6])}` : "";

    return buildLetterheadDocument({
      title: `Cost Sheet — ${query.tourFileId||query.id} — v${currentVersionLabel}`,
      bodyBlocks: [headerBlock, settingsBlock, dayTableBlock, monBlock, tptBlock, lhBlock, exBlock, summaryBlock, tlSummaryBlock].filter(Boolean),
      extraHeadCSS: `table.content-table thead tr th{font-size:7.5pt;padding:4pt 4pt}table.content-table tbody tr td{font-size:8pt;padding:3pt 4pt}`,
      orientation: "landscape",
      showPageNum: true,
    });
  };

  const exportPDF = () => {
    printHTML(buildCostSheetPDFHTML());
    logAudit(db, query.id, currentUser?.name, `Cost Sheet v${currentVersionLabel} exported to PDF`);
  };

  const buildCostSheetWorkbook = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Unitop Ops"; wb.created = new Date();
    const sheet = wb.addWorksheet("Cost Sheet");

    const NAVY="FF0D1B2A", ACCENT="FFC0392B", LIGHT="FFF3F4F6", WHITE="FFFFFFFF", GREY="FF6B7280", ZEBRA="FFFAFAFA", BORDER="FFD1D5DB", INPUT_BG="FFFFFDE7";
    const colLetter = (c) => { let s=""; while(c>0){ const m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26); } return s; };
    const addr = (r,c) => `${colLetter(c)}${r}`;
    const navyBand = (r, text, span=14) => {
      sheet.mergeCells(r,1,r,span);
      const c = sheet.getCell(r,1);
      c.value = text; c.font = {bold:true,size:11,color:{argb:WHITE}}; c.fill = {type:"pattern",pattern:"solid",fgColor:{argb:NAVY}};
      c.alignment = {vertical:"middle"};
      sheet.getRow(r).height = 20;
    };
    const label = (r,c,text) => { const cell=sheet.getCell(r,c); cell.value=text; cell.font={bold:true,size:9,color:{argb:GREY}}; };
    const bigVal = (r,c,val,fmt) => { const cell=sheet.getCell(r,c); cell.value=val; cell.font={bold:true,size:13}; if(fmt) cell.numFmt=fmt; };
    // Editable input cells get a pale-yellow fill so it's visually obvious
    // which cells are meant to be typed into offline, vs. formula-driven
    // cells that recalculate automatically -- the whole point of this
    // being a *working* spreadsheet, not just a printout.
    const inputCell = (r,c,val,fmt) => { const cell=sheet.getCell(r,c); cell.value=val; cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:INPUT_BG}}; if(fmt) cell.numFmt=fmt; return cell; };
    const formulaCell = (r,c,formula,result,fmt,extraFont={}) => { const cell=sheet.getCell(r,c); cell.value={formula,result:result??0}; if(fmt) cell.numFmt=fmt; cell.font={size:9,...extraFont}; return cell; };
    const sectionHeaders = (r, headers, startCol=1) => { headers.forEach((h,i)=>{ const c=sheet.getCell(r,startCol+i); c.value=h; c.font={bold:true,size:9,color:{argb:"FF374151"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:LIGHT}}; c.border={bottom:{style:"thin",color:{argb:BORDER}}}; }); };

    let row = 1;
    // ── Title band ──
    sheet.mergeCells(row,1,row,9);
    sheet.getCell(row,1).value = "COST SHEET"; sheet.getCell(row,1).font = {bold:true,size:18,color:{argb:WHITE}};
    sheet.getCell(row,1).fill = {type:"pattern",pattern:"solid",fgColor:{argb:NAVY}}; sheet.getCell(row,1).alignment = {vertical:"middle"};
    sheet.mergeCells(row,10,row,14);
    sheet.getCell(row,10).value = `Version ${currentVersionLabel}  •  Saved ${savedTimestamp}`;
    sheet.getCell(row,10).font = {italic:true,size:10,color:{argb:WHITE}}; sheet.getCell(row,10).fill = {type:"pattern",pattern:"solid",fgColor:{argb:NAVY}};
    sheet.getCell(row,10).alignment = {vertical:"middle",horizontal:"right"};
    for(let c=1;c<=14;c++) sheet.getCell(row,c).fill = {type:"pattern",pattern:"solid",fgColor:{argb:NAVY}};
    sheet.getRow(row).height = 30; row++;

    sheet.mergeCells(row,1,row,14);
    sheet.getCell(row,1).value = `${query.groupName||query.clientName||""}   •   ${query.destination||query.sector||""}   •   Tour File: ${query.tourFileId||query.id}`;
    sheet.getCell(row,1).font = {bold:true,size:12}; row += 2;

    label(row,1,"Client / Foreign Agent"); label(row,5,"Assigned Staff");
    row++;
    inputCell(row,1,clientAgentName||""); sheet.mergeCells(row,1,row,4);
    inputCell(row,5,assignedStaffName||""); sheet.mergeCells(row,5,row,8);
    row += 2;

    // ── Settings (real input cells, everything downstream references these) ──
    navyBand(row, "⚙️  SETTINGS — edit these, every price below recalculates", 14); row++;
    label(row,1,"GST %"); label(row,3,"Markup %"); label(row,5,"ROE"); label(row,7,"Currency");
    row++;
    const gstCell = inputCell(row,1,Number(gst)||0,"0.0"); gstCell.font={bold:true,size:13};
    const markupCell = inputCell(row,3,Number(markup)||0,"0.0"); markupCell.font={bold:true,size:13};
    const roeCell = inputCell(row,5,Number(roe)||0,"0.0"); roeCell.font={bold:true,size:13};
    const currencyCell = inputCell(row,7,currency||"US $"); currencyCell.font={bold:true,size:13};
    const gstAddr = addr(row,1), markupAddr = addr(row,3), roeAddr = addr(row,5), currencyAddr = addr(row,7);
    const gstFrac = `(${gstAddr}/100)`, markupFrac = `(${markupAddr}/100)`;
    row += 2;

    // ── Day-wise Itinerary & Accommodation ──
    navyBand(row, "📅  DAY-WISE ITINERARY & ACCOMMODATION", 11); row++;
    sectionHeaders(row, ["Day","Date","Movement","Meal Plan","Meal Cost","Hotel","Alt Hotel","Plan","Net PP","Sngl Supp","Notes"]);
    row++;
    const dayFirstRow = row;
    days.forEach((d,i)=>{
      inputCell(row,1,d.day); inputCell(row,2,d.date||""); inputCell(row,3,d.movement||""); inputCell(row,4,d.mealPlan||"");
      inputCell(row,5,n(d.mealCost)||0,"#,##0"); inputCell(row,6,d.hotel||""); inputCell(row,7,d.hotelAlt||""); inputCell(row,8,d.hotelPlan||"");
      inputCell(row,9,n(d.hotelNetPP)||0,"#,##0"); inputCell(row,10,n(d.singleSupp)||0,"#,##0"); inputCell(row,11,d.notes||"");
      if(i%2===1) for(let c=1;c<=11;c++) sheet.getCell(row,c).fill = sheet.getCell(row,c).fill.fgColor?.argb===INPUT_BG ? sheet.getCell(row,c).fill : {type:"pattern",pattern:"solid",fgColor:{argb:ZEBRA}};
      row++;
    });
    const dayLastRow = row-1;
    sheet.mergeCells(row,1,row,3); sheet.getCell(row,1).value="TOTALS"; sheet.getCell(row,1).font={bold:true};
    const mealTotalCell = formulaCell(row,5,`SUM(E${dayFirstRow}:E${dayLastRow})`,Math.round(totMeal),"#,##0",{bold:true});
    const hotelTotalCell = formulaCell(row,9,`SUM(I${dayFirstRow}:I${dayLastRow})`,Math.round(totHotel),"#,##0",{bold:true});
    const daySSTotalCell = formulaCell(row,10,`SUM(J${dayFirstRow}:J${dayLastRow})`,Math.round(daySS),"#,##0",{bold:true});
    const mealTotalAddr = addr(row,5), hotelTotalAddr = addr(row,9), daySSTotalAddr = addr(row,10);
    row += 3;

    // ── Cost Line Items ──
    navyBand(row, "💵  COST LINE ITEMS", 14); row++;

    // Tour Leader / Facilitator Cost
    label(row,1,"Tour Leader / Facilitator Cost — Mode (pp / lumpsum)"); label(row,4,"Amount");
    row++;
    const tlModeCell = inputCell(row,1,tlMode||"lumpsum"); const tlCostCell = inputCell(row,4,n(tlCost)||0,"#,##0");
    const tlModeAddr = addr(row,1), tlCostAddr = addr(row,4);
    row += 2;

    // Misc Cost
    label(row,1,"Misc Cost — Mode (pp / lumpsum)"); label(row,4,"Amount");
    row++;
    const miscModeCell = inputCell(row,1,miscMode||"pp"); const miscCostCell = inputCell(row,4,n(miscCost)||0,"#,##0");
    const miscModeAddr = addr(row,1), miscCostAddr = addr(row,4);
    row += 2;

    // Monuments
    label(row,1,"Monuments"); row++;
    sectionHeaders(row, ["Monument","Fee","Include (Y/N)"]);
    row++;
    const monFirstRow = row;
    const monRowCount = Math.max(monuments.length + 3, 4);
    for (let i=0;i<monRowCount;i++) {
      const m = monuments[i];
      inputCell(row,1,m?.name||""); inputCell(row,2,m?m.fee?n(m.fee):0:0,"#,##0"); inputCell(row,3,m?(m.include?"Y":"N"):"N");
      row++;
    }
    const monLastRow = row-1;
    label(row,1,"Extra Monument Cost (not tied to a specific monument)");
    const monExtraCell = inputCell(row,4,n(monExtra)||0,"#,##0");
    const monExtraAddr = addr(row,4);
    row++;
    label(row,1,"Monument Total");
    const monTotalCell = formulaCell(row,4,`SUMIF(C${monFirstRow}:C${monLastRow},"Y",B${monFirstRow}:B${monLastRow})+${monExtraAddr}`,Math.round(monTotal),"#,##0",{bold:true});
    const monTotalAddr = addr(row,4);
    row += 2;

    // Local Handler(s)
    label(row,1,"Local Handler(s)"); row++;
    sectionHeaders(row, ["Sector","Cost","Mode (pp / lumpsum)","Single Supp"]);
    row++;
    const lhFirstRow = row;
    const lhRowCount = Math.max(localHandlers.length + 3, 4);
    for (let i=0;i<lhRowCount;i++) {
      const h = localHandlers[i];
      inputCell(row,1,h?.sector||""); inputCell(row,2,h?n(h.cost)||0:0,"#,##0"); inputCell(row,3,h?.mode||"pp"); inputCell(row,4,h?n(h.singleSupp)||0:0,"#,##0");
      row++;
    }
    const lhLastRow = row-1;
    label(row,1,"Local Handler Single Supp Total");
    const handlerSSCell = formulaCell(row,4,`SUM(D${lhFirstRow}:D${lhLastRow})`,Math.round(handlerSS),"#,##0",{bold:true});
    const handlerSSAddr = addr(row,4);
    row += 2;

    // Extra Services
    label(row,1,"Extra Services"); row++;
    sectionHeaders(row, ["Description","Cost","Mode (PP / Lumpsum / Per Vehicle / Per Group)"]);
    row++;
    const exFirstRow = row;
    const exRowCount = Math.max(extras.length + 3, 4);
    for (let i=0;i<exRowCount;i++) {
      const e = extras[i];
      inputCell(row,1,e?.description||""); inputCell(row,2,e?n(e.cost)||0:0,"#,##0"); inputCell(row,3,e?.mode||"PP");
      row++;
    }
    const exLastRow = row-1;
    row++;

    // Transportation — matrix: one column per slab, marked "Y" if that
    // transport line applies to that slab. Requested specifically: a
    // clearer way to show which transport costs feed which slabs than a
    // hidden checkbox list.
    label(row,1,"Transportation — mark Y under each slab this line applies to"); row++;
    const tptHeaders = ["Sector / Description","Cost", ...slabs.map(s=>s.label)];
    sectionHeaders(row, tptHeaders);
    row++;
    const tptFirstRow = row;
    const tptRowCount = Math.max(transports.length + 3, 4);
    for (let i=0;i<tptRowCount;i++) {
      const t = transports[i];
      inputCell(row,1,t?.sector||t?.vehicleType||""); inputCell(row,2,t?n(t.cost)||0:0,"#,##0");
      slabs.forEach((s,si)=>{ inputCell(row,3+si,t&&t.slabs?.includes(s.id)?"Y":""); });
      row++;
    }
    const tptLastRow = row-1;
    row += 2;

    // ── Final Price Summary ──
    navyBand(row, "💰  FINAL PRICE SUMMARY", 14); row++;
    label(row,1,"Accommodation (PP)"); formulaCell(row+1,1,`${hotelTotalAddr}`,Math.round(totHotel),"#,##0",{bold:true,size:13});
    label(row,4,"Extra Meals (PP)"); formulaCell(row+1,4,`${mealTotalAddr}`,Math.round(totMeal),"#,##0",{bold:true,size:13});
    label(row,7,"Single Supplement (total)"); formulaCell(row+1,7,`${daySSTotalAddr}+${handlerSSAddr}`,Math.round(totSS),"#,##0",{bold:true,size:13,color:{argb:ACCENT}});
    const ssTotalAddr = addr(row+1,7);
    row += 3;

    const slabHeaders = ["Slab","Vehicle","FOC (paying pax)","Transport","Tour Facil","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup",`Final Price (${currency||"—"})`,`SS (${currency||"—"})`];
    slabHeaders.forEach((h,i)=>{ const c=sheet.getCell(row,i+1); c.value=h; c.font={bold:true,size:10,color:{argb:WHITE}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:NAVY}}; });
    row++;
    slabs.forEach((s,si)=>{
      const c0 = calcSlab(s);
      const slabCol = 3 + si; // this slab's column in the transport matrix
      const slabColLetter = colLetter(slabCol);
      inputCell(row,1,s.label); inputCell(row,2,s.vehicle==="Others"?s.vehicleOther:s.vehicle||"");
      const focCell = inputCell(row,3,Number(s.foc)||0); focCell.font={bold:true};
      const focAddr = addr(row,3);

      const tptFormula = `SUMPRODUCT((${slabColLetter}${tptFirstRow}:${slabColLetter}${tptLastRow}="Y")*B${tptFirstRow}:B${tptLastRow})/${focAddr}`;
      formulaCell(row,4,tptFormula,c0.tptPP,"#,##0");

      const tlFormula = `IF(${tlModeAddr}="pp",${tlCostAddr},${tlCostAddr}/${focAddr})`;
      formulaCell(row,5,tlFormula,c0.tlPP,"#,##0");

      const miscFormula = `IF(${miscModeAddr}="pp",${miscCostAddr},${miscCostAddr}/${focAddr})`;
      formulaCell(row,6,miscFormula,c0.miscPP,"#,##0");

      // Monument mode isn't per-slab in the app either -- it's one global
      // mode (monMode state), so reference the tl/misc pattern but against
      // the app's own monMode value baked in at export time (it isn't a
      // separate labeled input cell above, since there's no dedicated
      // "Monument Mode" input row -- match the app's actual current model).
      const monFormula = monMode==="pp" ? `${monTotalAddr}` : `${monTotalAddr}/${focAddr}`;
      formulaCell(row,7,monFormula,c0.monPP,"#,##0");

      const lhFormula = `SUMPRODUCT((C${lhFirstRow}:C${lhLastRow}="pp")*B${lhFirstRow}:B${lhLastRow})+SUMPRODUCT((C${lhFirstRow}:C${lhLastRow}<>"pp")*B${lhFirstRow}:B${lhLastRow})/${focAddr}`;
      formulaCell(row,8,lhFormula,c0.localPP,"#,##0");

      const exFormula = `SUMPRODUCT((C${exFirstRow}:C${exLastRow}="PP")*B${exFirstRow}:B${exLastRow})+SUMPRODUCT((C${exFirstRow}:C${exLastRow}<>"PP")*B${exFirstRow}:B${exLastRow})/${focAddr}`;
      formulaCell(row,9,exFormula,c0.extrasPP,"#,##0");

      const d4=addr(row,4),d5=addr(row,5),d6=addr(row,6),d7=addr(row,7),d8=addr(row,8),d9=addr(row,9);
      const subFormula = `${hotelTotalAddr}+${mealTotalAddr}+${d4}+${d5}+${d6}+${d7}+${d8}+${d9}`;
      formulaCell(row,10,subFormula,c0.sub,"#,##0");
      const subAddr = addr(row,10);

      const taxFormula = `ROUND(${subAddr}*${gstFrac},0)`;
      formulaCell(row,11,taxFormula,c0.tax,"#,##0");
      const taxAddr = addr(row,11);

      const afterTaxFormula = `${subAddr}+${taxAddr}`;
      formulaCell(row,12,afterTaxFormula,c0.afterTax,"#,##0");
      const afterTaxAddr = addr(row,12);

      const markupFormula = `ROUND(${afterTaxAddr}*${markupFrac},0)`;
      formulaCell(row,13,markupFormula,c0.markupAmt,"#,##0");
      const markupCellAddr = addr(row,13);

      const finalFormula = `CEILING((${afterTaxAddr}+${markupCellAddr})/${roeAddr},1)`;
      const finalC = formulaCell(row,14,finalFormula,c0.finalFX,"#,##0",{bold:true,color:{argb:ACCENT},size:11});

      const ssFormula = `CEILING((${ssTotalAddr}+${ssTotalAddr}*${gstFrac})*(1+${markupFrac})/${roeAddr},1)`;
      formulaCell(row,15,ssFormula,c0.ssFX,"#,##0");

      if (si%2===1) for(let c=1;c<=15;c++) { const cell=sheet.getCell(row,c); if(!cell.fill||cell.fill.fgColor?.argb!==INPUT_BG) cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:ZEBRA}}; }
      row++;
    });

    // Tour Leader Slabs get their own separate section entirely -- never
    // a column (not even blank) inside the group slabs table above, since
    // T/L Surcharge simply doesn't apply to a group slab. Shown as
    // reference values matching the app's own calcTlSlab computation
    // exactly, not live formulas. A full formula-driven version would
    // need its own dedicated input section (label/vehicle/pax/6 cost
    // fields/6 include checkboxes) the way group slabs and the other cost
    // sections have -- reasonable next step if wanted.
    if (tlSlabs.length) {
      row += 1;
      navyBand(row, "TOUR LEADER SLABS", 16); row++;
      const tlHeaders = ["T/L Slab","Vehicle","Paying Pax","Transport","Tour Facil","T/L Surcharge","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup",`Final Price (${currency||"—"})`,`SS (${currency||"—"})`];
      tlHeaders.forEach((h,i)=>{ const c=sheet.getCell(row,i+1); c.value=h; c.font={bold:true,size:10,color:{argb:WHITE}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF7D6608"}}; });
      row++;
      tlSlabs.forEach((tl,ti)=>{
        const c = calcTlSlab(tl);
        inputCell(row,1,tl.label).font={bold:true,color:{argb:"FF7D6608"}};
        inputCell(row,2,tl.vehicle==="Others"?tl.vehicleOther:tl.vehicle||""); inputCell(row,3,Number(tl.pax)||0);
        [c.tptPP,c.tlPP,c.surchargePP,c.miscPP,c.monPP,c.localPP,c.extrasPP,c.sub,c.tax,c.afterTax,c.markupAmt].forEach((v,i)=>{
          const cell=sheet.getCell(row,4+i); cell.value=v; cell.numFmt="#,##0"; cell.font=i===2?{bold:true,color:{argb:"FF7D6608"},size:9}:{size:9};
        });
        const finalCell = sheet.getCell(row,15); finalCell.value=c.finalFX; finalCell.numFmt="#,##0"; finalCell.font={bold:true,color:{argb:"FF7D6608"},size:11};
        const ssCell = sheet.getCell(row,16); ssCell.value=c.ssFX; ssCell.numFmt="#,##0"; ssCell.font={size:9};
        for(let cc=1;cc<=16;cc++) sheet.getCell(row,cc).fill={type:"pattern",pattern:"solid",fgColor:{argb:ti%2===0?"FFFFFBEB":"FFFEF3C7"}};
        row++;
      });
    }

    sheet.columns.forEach((col,i)=>{ col.width = i===0?24:i===1?14:12; });
    sheet.views = [{ state:"frozen", ySplit:0 }];
    return wb;
  };

  const exportXLSX = async () => {
    const wb = await buildCostSheetWorkbook();
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `CostSheet_${query.tourFileId||query.id}_v${currentVersionLabel}.xlsx`; a.click();
    URL.revokeObjectURL(url);
    logAudit(db, query.id, currentUser?.name, `Cost Sheet v${currentVersionLabel} exported to XLSX`);
  };

  const secH = (t,icon) => <div style={{background:G.navy,color:"#fff",padding:"5px 10px",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:"0.5px",margin:"14px 0 8px",display:"flex",alignItems:"center",gap:6}}><span>{icon}</span>{t}</div>;
  const modeBtn = (cur,val,label,setter) => (
    <button onClick={()=>setter(val)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${cur===val?G.accent:G.gray200}`,background:cur===val?"#FDEDEC":G.white,color:cur===val?G.accent:G.gray600,fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:cur===val?600:400}}>{label}</button>
  );

  const hasAnyPricedSlab = (slabs.length > 0 && calcSlab(slabs[0]).finalFX > 0) || (tlSlabs.length > 0 && calcTlSlab(tlSlabs[0]).finalFX > 0);
  const hasFinalPrice = hasAnyPricedSlab && !!lastSavedCostSheetId;

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:960,height:"100vh",overflowY:"hidden",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>COST SHEET · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <div style={{fontSize:16,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName||query.agentCompany}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · {query.sector||query.destination||""}</div>
          </div>
          {/* Version trail */}
          {versions.length > 0 && (
            <div style={{display:"flex",gap:4}}>
              {versions.map(v=>(
                <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                  <div onClick={()=>loadVersionIntoDraft(v)} title={v.note||`View v${v.version}`}
                    style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                    v{v.version}
                  </div>
                  <div onClick={()=>{if(readOnly)return;setFinalVersion(v.version);markCostSheetVersionFinal(db,query.id,v.version);logAudit(db,query.id,currentUser?.name,`Cost Sheet v${v.version} marked final`);}} title="Mark as final"
                    style={{padding:"3px 6px",background:finalVersion===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                    {finalVersion===v.version?"★":"☆"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>

        {readOnly && (
          <div style={{background:"#FEF3C7",borderBottom:"1px solid #FCD34D",padding:"8px 18px",fontSize:12,color:"#92400E",flexShrink:0}}>
            🔒 This tour file is cancelled — viewing only, nothing here is editable.
          </div>
        )}

        <fieldset ref={fieldsetRef} disabled={readOnly} style={{flex:1,overflowY:"auto",padding:"14px 18px",border:"none",margin:0,minWidth:0,minHeight:0,overflowAnchor:"none"}}>

          {/* 10.1 Settings */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Client / Foreign Agent</div>
              <input style={inp} value={clientAgentName} onChange={e=>setClientAgentName(e.target.value)} placeholder="Client or Foreign Agent name"/></div>
            <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Assigned Staff</div>
              <input style={inp} value={assignedStaffName} onChange={e=>setAssignedStaffName(e.target.value)} placeholder="Staff member handling this file"/></div>
          </div>

          {secH("Settings","⚙")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:10}}>
            {[["GST %",gst,setGst],["Markup %",markup,setMarkup],["ROE (₹/unit)",roe,setRoe]].map(([l,v,s])=>(
              <div key={l}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                <input style={{...inp,textAlign:"right"}} type="number" value={v} onChange={e=>s(Number(e.target.value))}/></div>
            ))}
            <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Currency</div>
              <select style={inp} value={currency} onChange={e=>setCurrency(e.target.value)}>
                {["US $","EUR","GBP","AUD","SGD","NTD","THB","INR","Other"].map(c=><option key={c}>{c}</option>)}
              </select></div>
          </div>

          {/* TL / Tour Facilitator */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:8}}>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Tour Facilitator Cost</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(tlMode,"lumpsum","Lumpsum",setTlMode)}
                {modeBtn(tlMode,"pp","Per Person",setTlMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder={tlMode==="lumpsum"?"Total cost":"Per person"} value={tlCost} onChange={e=>setTlCost(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Miscellaneous Cost</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(miscMode,"lumpsum","Lumpsum",setMiscMode)}
                {modeBtn(miscMode,"pp","Per Person",setMiscMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder="Cost" value={miscCost} onChange={e=>setMiscCost(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Monument Fees Mode</div>
              <div style={{display:"flex",gap:4,marginBottom:4}}>
                {modeBtn(monMode,"lumpsum","Lumpsum",setMonMode)}
                {modeBtn(monMode,"pp","Per Person",setMonMode)}
              </div>
              <input style={{...inp,textAlign:"right"}} type="number" placeholder="Extra misc monument" value={monExtra} onChange={e=>setMonExtra(e.target.value)}/>
            </div>
          </div>

          {/* ── Monuments / Activities ── */}
          {secH("Monuments / Activities","🏛")}
          <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:10}}>
            {monuments.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <input style={{...inp,flex:2}} value={m.name} onChange={e=>updateMonument(i,"name",e.target.value)} placeholder="e.g. Taj Mahal entry"/>
                <input style={{...inp,width:80,textAlign:"right"}} type="number" value={m.fee} onChange={e=>updateMonument(i,"fee",e.target.value)} placeholder="0"/>
                <span style={{fontSize:10,color:G.gray400}}>₹</span>
                <span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>setMonuments(p=>p.filter((_,idx)=>idx!==i))}>✕</span>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11,marginTop:2}} onClick={()=>setMonuments(p=>[...p,{name:"",fee:0,include:true}])}>+ Add Monument / Activity</button>
            {monuments.length>0 && (
              <div style={{marginTop:8,fontSize:11,color:G.navy,fontWeight:600}}>
                Total: ₹ {monTotal.toLocaleString()} ({monMode==="pp"?"per person":"lumpsum"})
              </div>
            )}
          </div>

          {/* 10.2 Day rows */}
          {secH("Day-wise Itinerary & Accommodation","📅")}
          <div style={{overflowX:"auto",marginBottom:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:820}}>
              <thead>
                <tr style={{background:G.gray50}}>
                  {["Day","Date","Movement","Meal Plan","Meal Cost","Hotel Name","Alt Hotel","Plan","Net PP","Sngl Supp","Notes",""].map(h=>(
                    <th key={h} style={{padding:"5px 4px",fontSize:10,fontWeight:600,color:G.gray600,borderBottom:`1px solid ${G.gray200}`,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d,i)=>(
                  <tr key={d.id} style={{background:i%2===0?G.white:G.gray50}}>
                    <td style={{padding:"2px 3px",width:48}}><input style={{...inp,width:44,textAlign:"center"}} value={d.day} onChange={e=>updateDay(i,"day",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",width:100}}><input style={{...inp,fontSize:10}} type="date" value={d.date||""} onChange={e=>updateDay(i,"date",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",minWidth:130}}><input style={inp} value={d.movement} onChange={e=>updateDay(i,"movement",e.target.value)} placeholder="Movement / destination"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"center"}} value={d.mealPlan} onChange={e=>updateDay(i,"mealPlan",e.target.value)} placeholder="B/L/D"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.mealCost} onChange={e=>updateDay(i,"mealCost",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",minWidth:110}}><input style={inp} value={d.hotel} onChange={e=>updateDay(i,"hotel",e.target.value)} placeholder="Primary hotel"/></td>
                    <td style={{padding:"2px 3px",minWidth:90}}><input style={{...inp,fontSize:10}} value={d.hotelAlt} onChange={e=>updateDay(i,"hotelAlt",e.target.value)} placeholder="Alt hotel"/></td>
                    <td style={{padding:"2px 3px",width:52}}>
                      <select style={{...inp,padding:"3px 2px"}} value={d.hotelPlan} onChange={e=>updateDay(i,"hotelPlan",e.target.value)}>
                        {["","EP","CP","MAP","AP"].map(p=><option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.hotelNetPP} onChange={e=>updateDay(i,"hotelNetPP",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",width:68}}><input style={{...inp,textAlign:"right"}} type="number" value={d.singleSupp} onChange={e=>updateDay(i,"singleSupp",e.target.value)} placeholder="0"/></td>
                    <td style={{padding:"2px 3px",minWidth:70}}><input style={inp} value={d.notes} onChange={e=>updateDay(i,"notes",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",width:20,textAlign:"center"}}><span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>removeDay(i)}>✕</span></td>
                  </tr>
                ))}
                <tr style={{background:G.gray100,fontWeight:700}}>
                  <td colSpan={3} style={{padding:"5px 4px",fontSize:11,color:G.gray600}}>TOTALS</td>
                  <td></td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{totMeal>0?`₹ ${totMeal.toLocaleString()}`:"—"}</td>
                  <td colSpan={3}></td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{totHotel>0?`₹ ${totHotel.toLocaleString()}`:"—"}</td>
                  <td style={{padding:"5px 4px",textAlign:"right",fontSize:11}}>{daySS>0?`₹ ${daySS.toLocaleString()}`:"—"}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={addDay}>+ Add Day</button>

          {/* 10.3 Transport */}
          {secH("Transport","🚌")}
          {transports.map((t,ti)=>(
            <div key={t.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Sector / Route</div>
                  <input style={inp} value={t.sector} onChange={e=>updateTransport(ti,"sector",e.target.value)} placeholder="e.g. Delhi–Agra–Jaipur circuit"/></div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vehicle Type</div>
                  <select style={inp} value={t.vehicleType} onChange={e=>updateTransport(ti,"vehicleType",e.target.value)}>
                    {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                  </select>
                  {t.vehicleType==="Others" && <input style={{...inp,marginTop:4}} value={t.vehicleOther||""} onChange={e=>updateTransport(ti,"vehicleOther",e.target.value)} placeholder="Specify vehicle type..."/>}
                  </div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                  <input style={{...inp,textAlign:"right"}} type="number" value={t.cost} onChange={e=>updateTransport(ti,"cost",e.target.value)} placeholder="0"/></div>
                <div style={{display:"flex",alignItems:"flex-end"}}>
                  <span style={{cursor:"pointer",color:G.gray400,fontSize:16,paddingBottom:4}} onClick={()=>removeTransport(ti)}>✕</span>
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Include in Slabs (cost divided by paying pax in selected slabs)</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {slabs.map(s=>(
                    <label key={s.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",padding:"3px 8px",borderRadius:10,
                      background:t.slabs.includes(s.id)?"#DBEAFE":"#F3F4F6",color:t.slabs.includes(s.id)?"#1E40AF":G.gray600}}>
                      <input type="checkbox" checked={t.slabs.includes(s.id)} onChange={()=>toggleTransportSlab(ti,s.id)} style={{accentColor:G.accent}}/>
                      {s.label}
                    </label>
                  ))}
                  {tlSlabs.map(tl=>(
                    <label key={tl.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",padding:"3px 8px",borderRadius:10,
                      background:t.slabs.includes(tl.id)?"#FEF3C7":"#F3F4F6",color:t.slabs.includes(tl.id)?"#7D6608":G.gray600}}>
                      <input type="checkbox" checked={t.slabs.includes(tl.id)} onChange={()=>toggleTransportSlab(ti,tl.id)} style={{accentColor:"#7D6608"}}/>
                      🧑‍✈️ {tl.label}
                    </label>
                  ))}
                </div>
              </div>
              <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Notes</div>
                <input style={inp} value={t.notes} onChange={e=>updateTransport(ti,"notes",e.target.value)} placeholder="Any notes on this transport segment"/></div>
            </div>
          ))}
          <button className="btn btn-ghost" style={{fontSize:11,marginBottom:4}} onClick={addTransport}>+ Add Transport</button>

          {/* ── Local Handler(s) ── */}
          {secH("Local Handler","🤝")}
          <div style={{marginBottom:8}}>
            {localHandlers.map((h,hi)=>(
              <div key={h.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Sector</div>
                    <input style={inp} value={h.sector} onChange={e=>updateLocalHandler(hi,"sector",e.target.value)} placeholder="e.g. Bodhgaya / Rajgir"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>From</div>
                    <input style={inp} type="date" value={h.dateFrom} max={h.dateTo||undefined} onChange={e=>updateLocalHandler(hi,"dateFrom",e.target.value)}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>To</div>
                    <input style={inp} type="date" value={h.dateTo} min={h.dateFrom||undefined} onChange={e=>updateLocalHandler(hi,"dateTo",e.target.value)}/>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <span style={{cursor:"pointer",color:G.gray400,fontSize:16}} onClick={()=>removeLocalHandler(hi)}>✕</span>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                    <div style={{display:"flex",gap:4}}>
                      <input style={{...inp,textAlign:"right"}} type="number" value={h.cost} onChange={e=>updateLocalHandler(hi,"cost",e.target.value)} placeholder="0"/>
                      {modeBtn(h.mode,"pp","PP",v=>updateLocalHandler(hi,"mode",v))}
                      {modeBtn(h.mode,"lumpsum","Lump",v=>updateLocalHandler(hi,"mode",v))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Single Supp. (₹)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={h.singleSupp} onChange={e=>updateLocalHandler(hi,"singleSupp",e.target.value)} placeholder="0"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Remarks</div>
                    <input style={inp} value={h.remarks} onChange={e=>updateLocalHandler(hi,"remarks",e.target.value)} placeholder="Any notes on this handler/sector"/>
                  </div>
                </div>
              </div>
            ))}
            {handlerSS>0 && (
              <div style={{background:"#FEF9E7",border:"1px solid #F9E79F",borderRadius:6,padding:"6px 10px",fontSize:11,color:"#784212",marginBottom:8}}>
                Local Handler Single Supplement adds up to ₹{handlerSS.toLocaleString()} — this is combined with the Day-wise Single Supplement total (₹{daySS.toLocaleString()}) in the Final Price Summary below, not shown separately there.
              </div>
            )}
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={addLocalHandler}>+ Add Local Handler</button>
          </div>

          {/* ── Extra Services ── */}
          {secH("Extra Services","✨")}
          <div style={{marginBottom:8}}>
            {extras.map((e,ei)=>(
              <div key={e.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Service Description</div>
                    <input style={inp} value={e.description} onChange={ev=>updateExtra(ei,"description",ev.target.value)} placeholder="e.g. Boat ride at Varanasi, Cultural show, Camel ride..."/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Cost (₹)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={e.cost} onChange={ev=>updateExtra(ei,"cost",ev.target.value)} placeholder="0"/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Mode</div>
                    <select style={inp} value={e.mode} onChange={ev=>updateExtra(ei,"mode",ev.target.value)}>
                      {["PP","Lumpsum","Per Vehicle","Per Group"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                    <span style={{cursor:"pointer",color:G.gray400,fontSize:16}} onClick={()=>setExtras(p=>p.filter((_,idx)=>idx!==ei))}>✕</span>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setExtras(p=>[...p,{id:Date.now(),description:"",cost:"",mode:"PP"}])}>+ Add Extra Service</button>
          </div>

          {/* 10.4 Slabs */}
          {secH("Group Size Slabs","👥")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:8}}>
            {slabs.map((s,i)=>(
              <div key={s.id} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:600,color:G.gray600}}>Slab {i+1}</span>
                  {(slabs.length>1||tlSlabs.length>0)&&<span style={{cursor:"pointer",color:G.gray400,fontSize:12}} onClick={()=>setSlabs(p=>p.filter((_,idx)=>idx!==i))}>✕</span>}
                </div>
                <div style={{marginBottom:6}}><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Label (shown in final price)</div>
                  <input style={inp} value={s.label} onChange={e=>updateSlab(i,"label",e.target.value)}/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>FOC (N paying)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={s.foc} onChange={e=>updateSlab(i,"foc",Number(e.target.value))}/></div>
                  <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vehicle (label only)</div>
                    <select style={inp} value={s.vehicle} onChange={e=>updateSlab(i,"vehicle",e.target.value)}>
                      {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                    </select>
                    {s.vehicle==="Others" && <input style={{...inp,marginTop:4}} value={s.vehicleOther||""} onChange={e=>updateSlab(i,"vehicleOther",e.target.value)} placeholder="Specify..."/>}
                    </div>
                </div>
              </div>
            ))}
            <div style={{border:`1px dashed ${G.gray200}`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:100,color:G.gray400,fontSize:12}} onClick={addSlab}>+ Add Slab</div>
          </div>

          {/* ── Tour Leader Slab(s) (optional, multiple allowed) ── */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"14px 0 8px"}}>
            <span style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px"}}>🧑‍✈️ Tour Leader Slabs (optional)</span>
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={addTlSlab}>+ Add T/L Slab</button>
          </div>
          {tlSlabs.length===0 && (
            <div style={{fontSize:11,color:G.gray400,marginBottom:8}}>For when no FOC policy applies (small groups) — works out how much extra the paying guests need to cover for the Tour Leader's own costs. None added, doesn't affect the group slabs above. Each one you add appears as its own row in the Final Price Summary below, just like a group slab.</div>
          )}
          {tlSlabs.map((tl,ti)=>(
            <div key={tl.id} style={{background:"#FFF9E6",border:"1px solid #F5D97A",borderRadius:8,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:10,color:"#7D6608"}}>The Tour Leader doesn't pay — their costs get spread only across this slab's own paying guests.</div>
                <span style={{cursor:"pointer",color:"#7D6608",fontSize:13}} onClick={()=>removeTlSlab(ti)}>✕</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:10}}>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Label (shown in quotation)</div>
                  <input style={inp} value={tl.label} onChange={e=>updateTlSlab(ti,{label:e.target.value})}/></div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vehicle (label only)</div>
                  <select style={inp} value={tl.vehicle} onChange={e=>updateTlSlab(ti,{vehicle:e.target.value})}>
                    <option value="">—</option>
                    {VEHICLE_TYPES.map(v=><option key={v}>{v}</option>)}
                  </select>
                  {tl.vehicle==="Others" && <input style={{...inp,marginTop:4}} value={tl.vehicleOther||""} onChange={e=>updateTlSlab(ti,{vehicleOther:e.target.value})} placeholder="Specify vehicle type..."/>}
                  </div>
                <div><div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Paying Pax (for this calc)</div>
                  <input style={{...inp,textAlign:"right"}} type="number" value={tl.pax} onChange={e=>updateTlSlab(ti,{pax:e.target.value})} placeholder="e.g. 12"/></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Costs to cover — check which apply</div>
                <button className="btn btn-ghost" style={{fontSize:10}} onClick={()=>fetchTlSlabCosts(ti)}>↻ Fetch Latest Costs from Cost Sheet</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                {[["hotel","Hotel (PP)"],["meals","Extra Meals (PP)"],["transport","Transport (PP)"],["monument","Monument (PP)"],["localHandler","Local Handler (PP)"],["extras","Extras (PP)"]].map(([key,label])=>(
                  <div key={key} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:6,padding:8}}>
                    <label style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,cursor:"pointer"}}>
                      <input type="checkbox" checked={tl.includes[key]} onChange={e=>updateTlSlab(ti,{includes:{...tl.includes,[key]:e.target.checked}})}/>
                      <span style={{fontSize:9,color:G.gray600,fontWeight:600}}>{label}</span>
                    </label>
                    <input style={{...inp,textAlign:"right"}} type="number" value={tl.costs[key]} onChange={e=>updateTlSlab(ti,{costs:{...tl.costs,[key]:e.target.value}})} placeholder="0"/>
                  </div>
                ))}
              </div>
              {(()=>{ const c=calcTlSlab(tl); return (
                <div style={{display:"flex",gap:16,paddingTop:8,borderTop:"1px solid #F5D97A",flexWrap:"wrap"}}>
                  <div><div style={{fontSize:9,color:"#7D6608",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Total T/L Cost</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#7D6608"}}>₹ {c.surchargeTotal.toLocaleString()}</div></div>
                  <div><div style={{fontSize:9,color:"#7D6608",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Surcharge Per Paying Pax</div>
                    <div style={{fontSize:14,fontWeight:700,color:"#7D6608"}}>{c.surchargePP>0?`₹ ${c.surchargePP.toLocaleString()}`:"—"}{n(tl.pax)<=0&&<span style={{fontSize:9,fontWeight:400,marginLeft:6}}>Set paying pax above</span>}</div></div>
                </div>
              );})()}
            </div>
          ))}

          {/* 10.5 Final price summary */}
          {secH("Final Price Summary","💰")}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Accommodation (per pax)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totHotel).toLocaleString()}</div>
            </div>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Extra Meals (per pax)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totMeal).toLocaleString()}</div>
            </div>
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Single Supplement (total)</div>
              <div style={{fontSize:14,fontWeight:700,color:G.navy}}>₹ {Math.round(totSS).toLocaleString()}</div>
              {handlerSS>0 && <div style={{fontSize:9,color:G.gray400,marginTop:2}}>Day-wise ₹{daySS.toLocaleString()} + Local Handler ₹{handlerSS.toLocaleString()}</div>}
            </div>
          </div>
          <div style={{fontSize:10,color:G.gray400,marginBottom:8}}>Accommodation and Extra Meals are the same across every slab below (from the day-wise section), shown once here rather than repeated in each row. Everything else below varies by slab, since it's split across each slab's own paying-pax count.</div>
          <div style={{overflowX:"auto",marginBottom:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:760}}>
              <thead>
                <tr style={{background:G.navy}}>
                  {["Slab","Transport PP","Tour Facil. PP","Misc PP","Mon. PP","Local Hdlr PP","Extras PP","Sub-total","GST","After Tax","Markup","Selling ₹","Final Price","SS"].map(h=>(
                    <th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:h==="Slab"?"left":"right",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slabs.map((s,i)=>{
                  const c = calcSlab(s);
                  return (
                    <tr key={s.id} style={{background:i%2===0?G.white:G.gray50}}>
                      <td style={{padding:"7px 6px",fontWeight:500,fontSize:11}}>{s.label}<br/><span style={{fontSize:9,color:G.gray400}}>{s.vehicle==="Others"?s.vehicleOther:s.vehicle}</span></td>
                      {[c.tptPP,c.tlPP,c.miscPP,c.monPP,c.localPP,c.extrasPP,c.sub,c.tax,c.afterTax,c.markupAmt,c.sellingINR].map((v,j)=>(
                        <td key={j} style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{v>0?`₹ ${Math.round(v).toLocaleString()}`:"—"}</td>
                      ))}
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:13,fontWeight:700,color:G.navy}}>{c.finalFX>0?`${currency} ${c.finalFX}`:"—"}</td>
                      <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:G.accent,fontWeight:600}}>{c.ssFX>0?`${currency} ${c.ssFX}`:"—"}</td>
                    </tr>
                  );
                })}
                {slabs.length===0 && (
                  <tr><td colSpan={14} style={{padding:24,textAlign:"center",color:G.gray400,fontSize:12}}>No group slabs added</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10,color:G.gray400,fontStyle:"italic",marginBottom:tlSlabs.length?16:0}}>
            SS = cumulative single supplement from hotel day rows (editable). Final price rounded up to nearest whole unit.
          </div>

          {tlSlabs.length>0 && (
            <>
              <div style={{fontSize:11,fontWeight:700,color:"#7D6608",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>🧑‍✈️ Tour Leader Slabs</div>
              <div style={{fontSize:10,color:G.gray400,marginBottom:8}}>Same math as a group slab above, plus the T/L Surcharge — the foreign agent's own escort's costs, spread across this slab's paying pax, since the T/L doesn't pay. Kept as its own table so it's never mistaken for a group slab.</div>
              <div style={{overflowX:"auto",marginBottom:8}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:920}}>
                  <thead>
                    <tr style={{background:"#7D6608"}}>
                      {["T/L Slab","Vehicle","Paying Pax","Transport PP","Tour Facil. PP","T/L Surcharge","Misc PP","Mon. PP","Local Hdlr PP","Extras PP","Sub-total","GST","After Tax","Markup","Selling ₹","Final Price","SS"].map(h=>(
                        <th key={h} style={{padding:"7px 6px",color:"#fff",fontSize:10,textAlign:h==="T/L Slab"?"left":"right",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tlSlabs.map((tl,i)=>{
                      const c = calcTlSlab(tl);
                      return (
                        <tr key={tl.id} style={{background:i%2===0?"#FFFBEB":"#FEF3C7"}}>
                          <td style={{padding:"7px 6px",fontWeight:500,fontSize:11}}>{tl.label}</td>
                          <td style={{padding:"7px 6px",fontSize:11,color:G.gray600}}>{tl.vehicle==="Others"?tl.vehicleOther:tl.vehicle||"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{n(tl.pax)||"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{c.tptPP>0?`₹ ${Math.round(c.tptPP).toLocaleString()}`:"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{c.tlPP>0?`₹ ${Math.round(c.tlPP).toLocaleString()}`:"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:11,fontWeight:600,color:"#7D6608"}}>{c.surchargePP>0?`₹ ${Math.round(c.surchargePP).toLocaleString()}`:"—"}</td>
                          {[c.miscPP,c.monPP,c.localPP,c.extrasPP,c.sub,c.tax,c.afterTax,c.markupAmt,c.sellingINR].map((v,j)=>(
                            <td key={j} style={{padding:"7px 6px",textAlign:"right",fontSize:11}}>{v>0?`₹ ${Math.round(v).toLocaleString()}`:"—"}</td>
                          ))}
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:13,fontWeight:700,color:"#7D6608"}}>{c.finalFX>0?`${currency} ${c.finalFX}`:"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right",fontSize:12,color:G.accent,fontWeight:600}}>{c.ssFX>0?`${currency} ${c.ssFX}`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </fieldset>

        <div style={{padding:"12px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50,alignItems:"center"}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <input value={versionNote} onChange={e=>setVersionNote(e.target.value)} placeholder="Why this version? e.g. client requested discount"
            disabled={readOnly}
            style={{flex:1,padding:"7px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost">💾 Save v{version}</button>}
          <button onClick={exportPDF} className="btn btn-ghost" title="Export as landscape A4 PDF">🖨 Export PDF</button>
          <button onClick={exportXLSX} className="btn btn-ghost" title="Export as Excel workbook (Summary, Day-wise, Final Price sheets)">📊 Export XLSX</button>
          {!readOnly && hasAnyPricedSlab && !lastSavedCostSheetId && (
            <span style={{fontSize:10,color:"#92400E",whiteSpace:"nowrap"}} title="Proceed to Quotation needs at least one saved version">⚠ Save a version to proceed</span>
          )}
          {!readOnly && hasFinalPrice && (
            <button className="btn btn-success" onClick={()=>onProceedToQuotation(lastSavedCostSheetId)}>
              📋 Proceed to Quotation →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── SERVICES LIST (proper component so useState is legal) ───────────────────
