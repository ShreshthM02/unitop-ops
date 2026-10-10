import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
import { makeCalculators } from '../lib/costSheetCalc.js';
import { buildCostSheetWorkbook as buildCostSheetWorkbookFile } from '../lib/costSheetXlsx.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, SearchableSelect, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadCostSheetVersions, saveCostSheetVersion, markCostSheetVersionFinal, VersionDropdown, ExportMenu, loadTourExecutionForQuery, logAudit, buildLetterheadDocument, printHTML, RichTextEditor, buildDownloadFilename, db, daysFromNights, nightsDaysLabel, mealPlanLabel, formatDateSlash } = Lib;

export function CostSheet({ query, onClose, onProceedToQuotation, currentUser, readOnly, staff, docSettings, vendors }) {
  const n = v => parseFloat(v)||0;
  const fieldsetRef = useRef(null);
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [lastSavedCostSheetId, setLastSavedCostSheetId] = useState(null);
  const [saveError, setSaveError] = useState(null);
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
  // Phase 2 of the Document Chain plan (docs/DATA_OWNERSHIP.md): a
  // brand-new Cost Sheet's day count matches the query's own nights
  // figure, rather than a fixed 4-row placeholder unrelated to the tour.
  // Matches this app's own observed convention directly (nights count =
  // day-row count, confirmed against a real 10-night tour that had
  // exactly 10 day rows, not 11) -- not the generic travel-industry
  // "nights+1 days" rule, which doesn't match how this app already
  // labels things elsewhere. Falls back to the old 4-row default when
  // nights isn't set yet. tour_execution's own pre-fill (Phase 1, in the
  // useEffect below) still takes priority once it loads, for whichever
  // fields it actually has data for.
  //
  // Dates: query.travelDate is an ISO date string ("2026-07-24") only
  // when the person confirmed a specific date (dateKnown); otherwise
  // it's free text ("TBC", a month, a season) with nothing to compute
  // from -- same "confirmed vs TBC" distinction already used for pax.
  // When confirmed, each day's date is travelDate + its offset, kept as
  // a raw ISO string ("YYYY-MM-DD") since the actual field is a native
  // <input type="date">, which requires that exact format and silently
  // shows blank for anything else -- formatDateDMY's DD-MM-YYYY display
  // format (used elsewhere in the app for read-only text) would have
  // been rejected here.
  const isConfirmedISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
  const dayDateFromTravelDate = (offset) => {
    if (!isConfirmedISODate(query.travelDate)) return "";
    // Parse the y/m/d components manually and use the local-time Date
    // constructor -- new Date("2026-07-24") parses as UTC midnight, but
    // .setDate()/.getDate() operate in local time, so in any timezone
    // behind UTC that string silently rolls back to the previous day.
    const [y, m, d] = query.travelDate.slice(0,10).split("-").map(Number);
    const date = new Date(y, m-1, d);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  };
  const buildDefaultDays = () => {
    const n = daysFromNights(query.nights);
    if (n <= 0) {
      return [
        { id:1, day:"Day 1", date:dayDateFromTravelDate(0), movement:"", mealPlan:"D",    mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
        { id:2, day:"Day 2", date:dayDateFromTravelDate(1), movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
        { id:3, day:"Day 3", date:dayDateFromTravelDate(2), movement:"", mealPlan:"B/L/D",mealCost:"", hotel:"", hotelAlt:"", hotelPlan:"CP", hotelNetPP:"", singleSupp:"", notes:"" },
        { id:4, day:"Day 4", date:dayDateFromTravelDate(3), movement:"", mealPlan:"B/L",  mealCost:"", hotel:"Departure",    hotelPlan:"",   hotelNetPP:"", singleSupp:"", notes:"" },
      ];
    }
    return Array.from({ length: n }, (_, i) => ({
      id: i+1, day: `Day ${i+1}`, date: dayDateFromTravelDate(i), movement: "",
      mealPlan: i===0 ? "D" : (i===n-1 ? "B/L" : "B/L/D"), mealCost: "",
      hotel: i===n-1 ? "Departure" : "", hotelAlt: "", hotelPlan: i===n-1 ? "" : "CP",
      hotelNetPP: "", singleSupp: "", notes: "",
    }));
  };
  const [days, setDays] = useState(buildDefaultDays());

  // Real, direct request: a real vendor dropdown for primary hotel (not
  // free text), and rates fetched only from that vendor's own real,
  // active, date-matching contracted rates -- not from Alt hotel, which
  // stays name-only, purely for the itinerary's own optionality.
  const hotelVendors = useMemo(() => (vendors || []).filter(v => v.type === "Hotel" && v.active !== false), [vendors]);
  // Cached per vendor id, since several day rows commonly share the same
  // hotel -- avoids refetching the same vendor's rates for every row.
  const [hotelRatesCache, setHotelRatesCache] = useState({});
  const fetchHotelRates = async (vendorId) => {
    if (!vendorId || hotelRatesCache[vendorId]) return;
    try {
      const { data } = await db.from("vendor_rates").select("*").eq("vendor_id", vendorId).is("deleted_at", null);
      setHotelRatesCache(p => ({ ...p, [vendorId]: data || [] }));
    } catch { setHotelRatesCache(p => ({ ...p, [vendorId]: [] })); }
  };
  // Real, direct request: a rate applies to this cost sheet only if the
  // query's own travel date falls within that rate's own date range, or
  // the rate has no date range at all (evergreen -- never silently
  // hidden just because a date wasn't given). If the query itself has no
  // travel date set, every one of the vendor's rates is shown instead of
  // narrowing to none, with a clear note that nothing's been filtered yet
  // -- work never stops for a missing date either way.
  // Real bug fixed here, found while testing: a rate's own "active
  // right now" status is a TODAY-based computation (VendorMaster's own
  // concern -- which of a hotel's contracted rates are currently in
  // effect). That's the wrong question for a Cost Sheet: a rate for a
  // future winter season should absolutely be selectable today for a
  // trip being planned for that winter, even though today isn't yet
  // within its own date range. The only thing that should exclude a
  // rate here is an explicit manual "inactive" override (respecting
  // the user's own deliberate choice) -- never today's date, and never
  // the query's own travel date when that's the whole point of the
  // date-range match below.
  const matchingRatesFor = (vendorId) => {
    const rates = hotelRatesCache[vendorId] || [];
    const notManuallyDisabled = rates.filter(r => r.manual_active !== false);
    if (!query.travelDate) return notManuallyDisabled; // no query date -- show everything, unfiltered
    return notManuallyDisabled.filter(r => !r.season_start || (query.travelDate >= r.season_start && query.travelDate <= r.season_end));
  };

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
  const addLocalHandler = () => { scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
  setLocalHandlers(p=>[...p,{id:Date.now(),sector:"",dateFrom:"",dateTo:"",mode:"pp",cost:"",singleSupp:"",remarks:""}]); };
  const removeLocalHandler = i => setLocalHandlers(p=>p.filter((_,idx)=>idx!==i));

  // 10.4 Slabs
  // Phase 2 of the Document Chain plan (docs/DATA_OWNERSHIP.md): if the
  // query has a confirmed, single pax number (not a TBC range like
  // "15–20"), start with one slab centered on that real number instead
  // of five generic pax-range guesses unrelated to this tour. If pax is
  // still a range or unset, the old multi-range defaults stay -- a
  // single guessed number would likely be wrong while the group size is
  // still unconfirmed, and having several options to pick from is more
  // useful than one possibly-wrong one.
  const buildDefaultSlabs = () => {
    const paxStr = String(query.pax ?? "");
    const paxNum = Number(query.pax);
    const isConfirmedNumber = !isNaN(paxNum) && paxNum > 0 && !/[–\-]/.test(paxStr);
    if (isConfirmedNumber) {
      return [{ id:1, label: `${paxNum} pax + 1 FOC`, foc: paxNum, vehicle: paxNum < 20 ? "Mini Bus" : "Large Coach" }];
    }
    return [
      { id:1, label:"15-19 pax + 1 FOC", foc:15, vehicle:"Mini Bus" },
      { id:2, label:"20-24 pax + 1 FOC", foc:20, vehicle:"Large Coach" },
      { id:3, label:"25-29 pax + 1 FOC", foc:25, vehicle:"Large Coach" },
      { id:4, label:"30-34 pax + 2 FOC", foc:30, vehicle:"Large Coach" },
      { id:5, label:"35-39 pax + 2 FOC", foc:35, vehicle:"Large Coach" },
    ];
  };
  const [slabs, setSlabs] = useState(buildDefaultSlabs());

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
  }, [tlSlabs.length, transports.length, days.length, localHandlers.length, slabs.length]);
  // Direct, guaranteed scroll preservation -- after two CSS-based
  // theories (scroll-anchoring, then flexbox min-height) were confirmed
  // deployed but did NOT stop the reported "jumps to top" behavior, this
  // captures scroll position from every plausible scrolling element
  // before the DOM changes and restores it synchronously afterward, via
  // useLayoutEffect (runs after DOM mutation, before paint -- so there's
  // no visible flash). This works regardless of which element actually
  // turns out to be responsible, without needing to identify it first.
  // Originally wired to T/L Slabs only -- reported again for Transport,
  // and on inspection all five "+Add" buttons in this file shared the
  // exact same root cause and were equally affected (only one had
  // actually been fixed). All five now share this one mechanism.
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
  // Cost Sheet had no document-level Notes field at all (only per-row
  // day/transport/handler notes) -- added 2026-08-27 as part of the
  // shared rich-text rollout, matching the Notes/Remarks field every
  // other document already has.
  const [docNotes, setDocNotes] = useState("");
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
    setDocNotes(v.docNotes ?? "");
    setAssignedStaffName(v.assignedStaffName ?? ((staff||[]).find(s=>s.id===query.assignedTo)?.name||""));
    setViewingVersion(v.version);
  };

  useEffect(() => {
    loadCostSheetVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) {
        // Phase 1 of the Document Chain plan (docs/DATA_OWNERSHIP.md):
        // pre-fill movement/hotel from tour_execution's Day-wise
        // Itinerary/Hotels tabs -- the actual confirmed operational
        // record -- rather than starting from generic hardcoded
        // placeholder rows with no relationship to this tour. One-way
        // pre-fill only, at creation time only: once any version of this
        // Cost Sheet is saved, this never runs again and never touches
        // the draft. Pricing-only fields (mealCost, hotelNetPP,
        // singleSupp) have no equivalent in tour_execution and stay
        // blank -- there's nothing to pre-fill them from.
        loadTourExecutionForQuery(db, query.id).then(te => {
          if (te && te.days && te.days.length > 0) {
            setDays(te.days.map(d => ({
              id: d.id || Date.now() + Math.random(),
              day: d.dayLabel || "", date: d.date || "", movement: d.route || "",
              mealPlan: "B/L/D", mealCost: "",
              hotel: Lib.getOvernightHotel(te, d) || "", hotelAlt: "", hotelPlan: "CP",
              hotelNetPP: "", singleSupp: "", notes: d.notes || "",
            })));
            return;
          }
          // Series pre-fill: tour_execution is almost always empty for a
          // genuinely new query (it doesn't exist yet at this pipeline
          // stage), which is exactly when a referenced tour file is most
          // useful. Pulls the reference's own latest Cost Sheet
          // structure -- route and hotel names, not dates or pricing,
          // which are always specific to this instance and could
          // otherwise look authoritative while actually being stale.
          if (!query.referenceQueryId) return;
          loadCostSheetVersions(db, query.referenceQueryId).then(refVersions => {
            if (!refVersions.length) return;
            const refV = refVersions.find(v => v.isFinal) || refVersions[refVersions.length - 1];
            if (!refV.days || !refV.days.length) return;
            setDays(refV.days.map(d => ({
              id: Date.now() + Math.random(),
              day: d.day || "", date: "", movement: d.movement || "",
              mealPlan: d.mealPlan || "B/L/D", mealCost: "",
              hotel: d.hotel || "", hotelAlt: d.hotelAlt || "", hotelPlan: d.hotelPlan || "CP",
              hotelNetPP: "", singleSupp: "", notes: d.notes || "",
            })));
          });
        });
        return;
      }
      setVersions(loaded);
      setVersion(Math.max(...loaded.map(v => v.version)) + 1);
      const finalV = loaded.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
    });
  }, [query.id]);

  const updateDay = (i,f,v) => setDays(p=>p.map((d,idx)=>idx===i?{...d,[f]:v}:d));
  const addDay = () => { scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
  setDays(p=>[...p,{id:Date.now(),day:`Day ${p.length+1}`,date:"",movement:"",mealPlan:"B/L/D",mealCost:"",hotel:"",hotelAlt:"",hotelPlan:"CP",hotelNetPP:"",singleSupp:"",notes:""}]); };
  const removeDay = i => setDays(p=>p.filter((_,idx)=>idx!==i));

  const updateTransport = (i,f,v) => setTransports(p=>p.map((t,idx)=>idx===i?{...t,[f]:v}:t));
  const toggleTransportSlab = (ti, slabId) => setTransports(p=>p.map((t,idx)=>{
    if(idx!==ti) return t;
    const slabs = t.slabs.includes(slabId) ? t.slabs.filter(s=>s!==slabId) : [...t.slabs, slabId];
    return {...t, slabs};
  }));
  const addTransport = () => { scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
  setTransports(p=>[...p,{id:Date.now(),sector:"",vehicleType:"Large Coach",cost:"",slabs:[],notes:""}]); };
  const removeTransport = i => setTransports(p=>p.filter((_,idx)=>idx!==i));

  const updateSlab = (i,f,v) => setSlabs(p=>p.map((s,idx)=>idx===i?{...s,[f]:v}:s));
  const addSlab = () => { scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
  setSlabs(p=>[...p,{id:Date.now(),label:"New Slab",foc:15,vehicle:"Large Coach"}]); };

  const toggleMonument = i => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,include:!m.include}:m));
  const updateMonument = (i,f,v) => setMonuments(p=>p.map((m,idx)=>idx===i?{...m,[f]:v}:m));

  // Totals
  const totMeal    = days.reduce((s,d)=>s+n(d.mealCost),0);
  const totHotel   = days.reduce((s,d)=>s+n(d.hotelNetPP),0);
  const daySS      = days.reduce((s,d)=>s+n(d.singleSupp),0);
  const handlerSS  = localHandlers.reduce((s,h)=>s+n(h.singleSupp),0);
  const totSS      = daySS + handlerSS;
  const monTotal   = monuments.filter(m=>m.include).reduce((s,m)=>s+n(m.fee),0) + n(monExtra);

  // Pricing maths lives in lib/costSheetCalc.js so the screen, the PDF and the
  // Excel export all price from the same code.
  const { calcSlab, calcTlSlab } = makeCalculators({
    transports, tlMode, tlCost, miscMode, miscCost, monMode, localHandlers, extras, gst, markup, roe,
    totals: { totMeal, totHotel, totSS, monTotal },
  });

  const saveVersion = () => {
    const snap = { version, date:new Date().toLocaleString("en-IN"), slabs:[...slabs], days:[...days], transports:[...transports], gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra, monuments:[...monuments], localHandlers:[...localHandlers], extras:[...extras], note: versionNote, tlSlabs:tlSlabs.map(t=>({...t,costs:{...t.costs},includes:{...t.includes}})), clientAgentName, assignedStaffName, docNotes };
    setVersions(p=>[...p.filter(v=>v.version!==version), snap]);
    saveCostSheetVersion(db, query.id, snap, currentUser?.id).then(({ id, error }) => {
      // saveCostSheetVersion now reports insert failures instead of
      // swallowing them -- previously a failed save returned null here and
      // was indistinguishable from a version that simply had no id yet.
      if (error) { setSaveError(error); return; }
      setSaveError(null);
      if (id) setLastSavedCostSheetId(id);
    });
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
    // CSS Grid instead of <table>. Table-based widths were verified
    // correct in the generated HTML itself (colgroup/th/td percentages
    // captured directly from real output matched exactly what was
    // specified), yet the actual printed PDF still showed the old,
    // unbalanced proportions -- meaning the browser's print/PDF
    // rendering path was handling table-layout:fixed differently from
    // normal screen rendering. Grid has its own, separate sizing
    // algorithm with no table-layout-specific quirks to diverge on
    // between screen and print. grid-template-columns on the parent
    // alone determines every child's width, so no per-cell width
    // repetition is needed the way table required.
    const tableBlock = (headers, alignRight, rows, emptyLabel, widths, alignCenter) => {
      const w = widths || headers.map(() => (100 / headers.length).toFixed(2));
      // fr units instead of %: percentages don't account for column-gap
      // at all, so on a wide table (16 columns) the gaps added real
      // width on top of the 100% the columns already claimed, pushing
      // the last columns off the printable page. fr units divide the
      // space remaining *after* gaps are subtracted, so this can never
      // overflow regardless of column count or gap size.
      // Headers always center now, regardless of how their data cells
      // align (numbers still right-align, text still left-aligns) --
      // requested directly, applies to every table uniformly.
      const headerCells = headers.map((h)=>`<div class="grid-header" style="text-align:center">${h}</div>`).join("");
      const bodyContent = rows || `<div class="grid-cell" style="grid-column:1/-1;text-align:center;color:#999">${emptyLabel}</div>`;
      return `
      <div class="content-grid" style="grid-template-columns:${w.map(p=>`${p}fr`).join(" ")}">
        ${headerCells}
        ${bodyContent}
      </div>`;
    };
    // rowIndex (0-based) drives zebra striping directly, since grid items
    // have no <tr> wrapper to hang :nth-child(even) off of. noWrap marks
    // columns that are always short, fixed-format values (Day N, dates,
    // currency amounts, short plan codes) -- these should never wrap
    // regardless of exact width, since wrapping a short value looks
    // broken and inflates row height, which is what pushed the Day
    // column's wrapping into a 3rd page in an earlier round. Movement
    // and Hotel/Alt Hotel are deliberately left wrappable, since they can
    // genuinely be long. alignCenter marks short categorical columns
    // (Included, Mode) that sit directly next to a right-aligned
    // neighbor -- left-aligning them put their text right up against the
    // preceding column's right-aligned text with nothing but cell
    // padding between, which read as the two headers visually colliding.
    // Centering gives them breathing room on both sides.
    const rowHTML = (cells, alignRight, rowIndex, noWrap, alignCenter) => cells.map((c,i)=>`<div class="grid-cell${rowIndex!=null && rowIndex%2===1?" zebra":""}" style="text-align:${alignCenter&&alignCenter.includes(i)?"center":alignRight.includes(i)?"right":"left"}${noWrap&&noWrap.includes(i)?";white-space:nowrap":""}">${c}</div>`).join("");

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
      <div style="display:grid;grid-template-columns:25% 25% 25% 25%;width:100%;margin-bottom:10pt;font-size:9pt">
        <div><b>GST:</b> ${gst}%</div><div><b>Markup:</b> ${markup}%</div><div><b>ROE:</b> ${roe}</div><div><b>Currency:</b> ${currency}</div>
        <div><b>Tour Facilitator:</b> ${tlMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${n(tlCost).toLocaleString()}</div>
        <div><b>Misc Cost:</b> ${miscMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${n(miscCost).toLocaleString()}</div>
        <div style="grid-column:span 2"><b>Monument:</b> ${monMode==="pp"?"Per Pax":"Lumpsum"} &mdash; ₹${Math.round(monTotal).toLocaleString()} total</div>
      </div>`;

    const dayRows = days.map((d,i) => rowHTML([
      // Item 4 fix: d.date is kept as a raw ISO "YYYY-MM-DD" string in
      // state (required by the native <input type="date"> editor above --
      // see the comment near dayDateFromTravelDate), but the printed
      // document is read-only text, so it should show the app-wide
      // dd/mm/yyyy convention like every other date in this app, not the
      // raw ISO string.
      d.day, formatDateSlash(d.date)||"", d.movement||"", d.mealPlan||"",
      n(d.mealCost)?"₹"+n(d.mealCost).toLocaleString():"—",
      d.hotel||"", d.hotelAlt||"—", d.hotelPlan||"",
      n(d.hotelNetPP)?"₹"+n(d.hotelNetPP).toLocaleString():"—",
      n(d.singleSupp)?"₹"+n(d.singleSupp).toLocaleString():"—",
    ], [4,8,9], i, [0,1,3,4,7,8,9])).join("");
    const totalsRow = `<div class="grid-cell" style="grid-column:1/5;font-weight:700;background:#f3f4f6">TOTALS</div><div class="grid-cell" style="text-align:right;font-weight:700;background:#f3f4f6;white-space:nowrap">₹${Math.round(totMeal).toLocaleString()}</div><div class="grid-cell" style="grid-column:6/9;font-weight:700;background:#f3f4f6"></div><div class="grid-cell" style="text-align:right;font-weight:700;background:#f3f4f6;white-space:nowrap">₹${Math.round(totHotel).toLocaleString()}</div><div class="grid-cell" style="text-align:right;font-weight:700;background:#f3f4f6;white-space:nowrap">₹${Math.round(daySS).toLocaleString()}</div>`;
    const dayTableBlock = `
      <div class="section-title" style="margin-bottom:8pt">Day-wise Itinerary &amp; Accommodation</div>
      ${tableBlock(["Day","Date","Movement","Meal Plan","Meal Cost","Hotel","Alt Hotel","Plan","Net PP","Sngl Supp"], [4,8,9],
        days.length ? dayRows + totalsRow : "", "No days added",
        [6,8,19,9,8,13,11,6,9,11])}`;

    const monBlock = monuments.length ? `
      <div class="section-title" style="margin-bottom:8pt">Monuments</div>
      ${tableBlock(["Monument","Fee","Included"], [1],
        monuments.map((m,i)=>rowHTML([m.name||"—", n(m.fee)?"₹"+n(m.fee).toLocaleString():"—", m.include?"Yes":"No"], [1], i, [1,2], [2])).join(""), "",
        [34,33,33], [2])}
      ${n(monExtra)?`<div style="font-size:9pt;margin-bottom:10pt">Extra Monument Cost: ₹${n(monExtra).toLocaleString()}</div>`:""}` : "";

    const tptBlock = transports.length ? `
      <div class="section-title" style="margin-bottom:8pt">Transport</div>
      ${tableBlock(["Sector","Vehicle","Cost","Applies To"], [2],
        transports.map((t,i)=>rowHTML([t.sector||"—", t.vehicleType||"—", n(t.cost)?"₹"+n(t.cost).toLocaleString():"—", (t.slabs||[]).map(sid=>slabs.find(s=>s.id===sid)?.label||tlSlabs.find(tl=>tl.id===sid)?.label).filter(Boolean).join(", ")||"—"], [2], i, [1,2])).join(""), "",
        [22,22,16,40])}` : "";

    const lhBlock = localHandlers.length ? `
      <div class="section-title" style="margin-bottom:8pt">Local Handler</div>
      ${tableBlock(["Sector","Cost","Mode","Single Supp"], [1,3],
        localHandlers.map((h,i)=>rowHTML([h.sector||"—", n(h.cost)?"₹"+n(h.cost).toLocaleString():"—", h.mode==="pp"?"Per Pax":"Lumpsum", n(h.singleSupp)?"₹"+n(h.singleSupp).toLocaleString():"—"], [1,3], i, [1,2,3], [2])).join(""), "",
        [25,25,25,25], [2])}` : "";

    const exBlock = extras.length ? `
      <div class="section-title" style="margin-bottom:8pt">Extra Services</div>
      ${tableBlock(["Description","Cost","Mode"], [1],
        extras.map((e,i)=>rowHTML([e.description||"—", n(e.cost)?"₹"+n(e.cost).toLocaleString():"—", e.mode||"PP"], [1], i, [1,2], [2])).join(""), "",
        [40,30,30], [2])}` : "";

    const slabRows = slabs.map((s,si) => {
      const c = calcSlab(s);
      return rowHTML([
        `${s.label}<br/><span style="font-size:7pt;color:#888">${s.vehicle==="Others"?s.vehicleOther:s.vehicle||""}</span>`,
        c.tptPP?"₹"+c.tptPP.toLocaleString():"—", c.tlPP?"₹"+c.tlPP.toLocaleString():"—", c.miscPP?"₹"+c.miscPP.toLocaleString():"—",
        c.monPP?"₹"+c.monPP.toLocaleString():"—", c.localPP?"₹"+c.localPP.toLocaleString():"—", c.extrasPP?"₹"+c.extrasPP.toLocaleString():"—",
        "₹"+c.sub.toLocaleString(), "₹"+c.tax.toLocaleString(), "₹"+c.afterTax.toLocaleString(), "₹"+c.markupAmt.toLocaleString(),
        `<b>${c.finalFX?currency+" "+c.finalFX.toLocaleString():"—"}</b>`, c.ssFX?currency+" "+c.ssFX.toLocaleString():"—",
      ], [1,2,3,4,5,6,7,8,9,10,11,12], si, [1,2,3,4,5,6,7,8,9,10,11,12]);
    }).join("");
    const tlSlabRows = tlSlabs.map((tl,ti) => {
      const c = calcTlSlab(tl);
      return rowHTML([
        tl.label, tl.vehicle==="Others"?(tl.vehicleOther||"—"):(tl.vehicle||"—"), n(tl.pax)||"—",
        c.tptPP?"₹"+c.tptPP.toLocaleString():"—", c.tlPP?"₹"+c.tlPP.toLocaleString():"—",
        `<b>${c.surchargePP?"₹"+c.surchargePP.toLocaleString():"—"}</b>`, c.miscPP?"₹"+c.miscPP.toLocaleString():"—",
        c.monPP?"₹"+c.monPP.toLocaleString():"—", c.localPP?"₹"+c.localPP.toLocaleString():"—", c.extrasPP?"₹"+c.extrasPP.toLocaleString():"—",
        "₹"+c.sub.toLocaleString(), "₹"+c.tax.toLocaleString(), "₹"+c.afterTax.toLocaleString(), "₹"+c.markupAmt.toLocaleString(),
        `<b>${c.finalFX?currency+" "+c.finalFX.toLocaleString():"—"}</b>`, c.ssFX?currency+" "+c.ssFX.toLocaleString():"—",
      ], [2,3,4,5,6,7,8,9,10,11,12,13,14,15], ti, [2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
    }).join("");

    const summaryBlock = `
      <div class="section-title" style="margin:14pt 0 8pt">Final Price Summary</div>
      <div style="display:grid;grid-template-columns:33.33% 33.33% 33.34%;width:100%;margin-bottom:8pt;font-size:9pt">
        <div><b>Accommodation (PP):</b> ₹${Math.round(totHotel).toLocaleString()}</div>
        <div><b>Extra Meals (PP):</b> ₹${Math.round(totMeal).toLocaleString()}</div>
        <div><b>Single Supplement (total):</b> ₹${Math.round(totSS).toLocaleString()}</div>
      </div>
      ${tableBlock(["Slab","Transport","Tour Facil.","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup","Final Price","SS"],
        [1,2,3,4,5,6,7,8,9,10,11,12], slabRows, "No group slabs added",
        [15,7,7,6,6,7,6,8,6,8,7,9,8])}`;

    // Tour Leader Slabs are deliberately their own table -- never a column
    // (not even blank) inside the group slabs table, since T/L Surcharge
    // simply does not apply to a group slab at all.
    const tlSummaryBlock = tlSlabs.length ? `
      <div class="section-title" style="margin:14pt 0 8pt">Tour Leader Slabs</div>
      ${tableBlock(["T/L Slab","Vehicle","Paying Pax","Transport","Tour Facil.","T/L Surcharge","Misc","Mon.","Local Hdlr","Extras","Sub-total","GST","After Tax","Markup","Final Price","SS"],
        [2,3,4,5,6,7,8,9,10,11,12,13,14,15], tlSlabRows, "",
        [12,7,6,6,6,7,5,5,6,5,6,5,6,5,7,6])}` : "";

    const notesBlock = docNotes ? `<div class="section-title" style="margin:14pt 0 6pt">Notes</div><div style="font-size:9pt">${docNotes}</div>` : "";

    const csFilename = buildDownloadFilename("Cost Sheet", "costsheet", docSettings, { id: query.id, tourfile: query.tourFileId, group: query.groupName || query.clientName, sector: query.destination || query.sector });
    return buildLetterheadDocument({
      title: csFilename,
      bodyBlocks: [headerBlock, settingsBlock, dayTableBlock, monBlock, tptBlock, lhBlock, exBlock, summaryBlock, tlSummaryBlock, notesBlock].filter(Boolean),
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
    return buildCostSheetWorkbookFile(ExcelJS, {
      query, currentVersionLabel, savedTimestamp, clientAgentName, assignedStaffName,
      gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra,
      monuments, days, transports, localHandlers, extras, slabs, tlSlabs,
      totals: { totMeal, totHotel, daySS, handlerSS, totSS, monTotal },
      calcSlab, calcTlSlab, formatDateSlash,
    });
  };

  const [xlsxBusy, setXlsxBusy] = useState(false);
  const exportXLSX = async () => {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      const wb = await buildCostSheetWorkbook();
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${buildDownloadFilename("Cost Sheet", "costsheet", docSettings, { id: query.id, tourfile: query.tourFileId, group: query.groupName || query.clientName, sector: query.destination || query.sector })}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick, not immediately: some browsers start the
      // download asynchronously and would find the URL already gone.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      logAudit(db, query.id, currentUser?.name, `Cost Sheet v${currentVersionLabel} exported to XLSX`);
    } catch (err) {
      console.error("Cost Sheet Excel export failed", err);
      alert("The Excel file could not be created. Please try again; if it keeps happening, tell the admin (details are in the browser console).");
    } finally {
      setXlsxBusy(false);
    }
  };

  const secH = (t,icon) => <div style={{background:G.navy,color:"#fff",padding:"5px 10px",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:"0.5px",margin:"14px 0 8px",display:"flex",alignItems:"center",gap:6}}><span>{icon}</span>{t}</div>;
  const modeBtn = (cur,val,label,setter) => (
    <button onClick={()=>setter(val)} style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${cur===val?G.accent:G.gray200}`,background:cur===val?"#FDEDEC":G.white,color:cur===val?G.accent:G.gray600,fontSize:11,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:cur===val?600:400}}>{label}</button>
  );

  const hasAnyPricedSlab = (slabs.length > 0 && calcSlab(slabs[0]).finalFX > 0) || (tlSlabs.length > 0 && calcTlSlab(tlSlabs[0]).finalFX > 0);
  const hasFinalPrice = hasAnyPricedSlab && !!lastSavedCostSheetId;

  return (
    <div className="overlay">
      <div style={{background:G.white,width:"min(1400px, 100vw)",height:"100vh",overflowY:"hidden",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>COST SHEET · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <div style={{fontSize:16,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName||query.agentCompany}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.tourFileId||query.id} · {query.sector||query.destination||""}{query.nights?" · "+nightsDaysLabel(query.nights):""}</div>
          </div>
          {/* Version trail */}
          <VersionDropdown
            versions={versions}
            viewingVersion={viewingVersion}
            displayVersion={version}
            finalVersion={finalVersion}
            onSelectVersion={loadVersionIntoDraft}
            onMarkFinal={(v) => {
              setFinalVersion(v.version);markCostSheetVersionFinal(db,query.id,v.version);
              logAudit(db,query.id,currentUser?.name,`Cost Sheet v${v.version} marked final`);
            }}
            readOnly={readOnly}
            G={G}
          />
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
          {!query.travelDate && days.some(d=>d.hotelVendorId) && (
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:8,padding:"8px 14px",fontSize:11,color:"#92400E",marginBottom:8}}>
              ⚠ No travel date set on this query -- showing all rates, unfiltered by date, for {days.filter(d=>d.hotelVendorId).map(d=>d.day).join(", ")}.
            </div>
          )}
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
                    <td style={{padding:"2px 3px",minWidth:150}}>
                      <SearchableSelect
                        value={d.hotelVendorId||""}
                        onChange={vid=>{
                          const v=hotelVendors.find(hv=>hv.id===vid);
                          updateDay(i,"hotelVendorId",vid);
                          updateDay(i,"hotel",v?v.name:"");
                          updateDay(i,"hotelRateId","");
                          if(vid) fetchHotelRates(vid);
                        }}
                        onFreeText={text=>{
                          updateDay(i,"hotelVendorId","");
                          updateDay(i,"hotel",text);
                          updateDay(i,"hotelRateId","");
                        }}
                        options={hotelVendors}
                        getValue={v=>v.id}
                        getLabel={v=>`${v.name} (${v.city||"—"})`}
                        placeholder="Primary hotel…"
                        fallbackDisplay={d.hotel}
                      />
                      {d.hotelVendorId&&(()=>{
                        const rates=matchingRatesFor(d.hotelVendorId);
                        if(!rates.length) return <div style={{fontSize:9,color:G.gray400,marginTop:2}}>No contracted rates on file.</div>;
                        return (
                          <select style={{...inp,fontSize:9,marginTop:2,padding:"2px 3px"}} value={d.hotelRateId||""}
                            onChange={e=>{
                              const r=rates.find(rr=>rr.id===e.target.value);
                              updateDay(i,"hotelRateId",e.target.value);
                              if(!r) return;
                              const withTax=(v)=>v==null?null:(r.tax_inclusive?parseFloat(v):parseFloat(v)*(1+(parseFloat(r.tax_pct)||0)/100));
                              updateDay(i,"hotelPlan",r.meal_plan||d.hotelPlan);
                              if(r.double_rate!=null){
                                const netPP = Math.round(withTax(r.double_rate)/2);
                                updateDay(i,"hotelNetPP",netPP);
                                // Single Supplement is now always the exact same
                                // value as Hotel Net Per Person -- direct
                                // instruction, replacing the hotel's own
                                // separately-quoted single_rate entirely.
                                updateDay(i,"singleSupp",netPP);
                              }
                            }}>
                            <option value="">Pick rate…</option>
                            {/* Direct request: a tax-inclusive rate's meal plan shows
                                with an "AI" suffix (e.g. "CPAI"), same as Vendor
                                Master's contracted-rate cards. */}
                            {rates.map(r=><option key={r.id} value={r.id}>{r.room_category} ({mealPlanLabel(r.meal_plan,r.tax_inclusive)})</option>)}
                          </select>
                        );
                      })()}
                      {/* Warning consolidated into one banner above the table (see "No travel date set" block) -- was previously repeated under every affected hotel row, which was reported as very annoying. */}
                    </td>
                    <td style={{padding:"2px 3px",minWidth:90}}>
                      <SearchableSelect
                        value={d.hotelAltVendorId||""}
                        onChange={vid=>{
                          const v=hotelVendors.find(hv=>hv.id===vid);
                          updateDay(i,"hotelAltVendorId",vid);
                          updateDay(i,"hotelAlt",v?v.name:"");
                        }}
                        onFreeText={text=>{
                          updateDay(i,"hotelAltVendorId","");
                          updateDay(i,"hotelAlt",text);
                        }}
                        options={hotelVendors}
                        getValue={v=>v.id}
                        getLabel={v=>`${v.name} (${v.city||"—"})`}
                        placeholder="Alt hotel…"
                        fallbackDisplay={d.hotelAlt}
                      />
                    </td>
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

          {secH("Notes","📝")}
          <RichTextEditor value={docNotes} onChange={setDocNotes} readOnly={readOnly}/>
        </fieldset>

        <div style={{padding:"12px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50,alignItems:"center"}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <input value={versionNote} onChange={e=>setVersionNote(e.target.value)} placeholder="Why this version? e.g. client requested discount"
            disabled={readOnly}
            style={{flex:1,padding:"7px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost">💾 Save v{version}</button>}
          {saveError && (
            <span style={{fontSize:11,color:"#B91C1C",maxWidth:420}} title={saveError}>
              ⚠ Not saved — {saveError}
            </span>
          )}
          <ExportMenu G={G} actions={[
            { id:"pdf",   label:"PDF",   icon:"📕", onSelect: exportPDF,  hint:"Landscape A4" },
            { id:"excel", label:"Excel", icon:"📊", onSelect: exportXLSX, hint:"Live formulas — edit offline" },
            { id:"print", label:"Print", icon:"🖨", onSelect: exportPDF, separatorBefore:true },
          ]}/>
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
