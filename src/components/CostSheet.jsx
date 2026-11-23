import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
import { makeCalculators, withCells, appliedSlabIds, matrixSpans, hasFx, fxRate, lineCostFor, lineBasis, ssBuild, tlBreakdown, TL_PARTS } from '../lib/costSheetCalc.js';
import { buildCostSheetWorkbook as buildCostSheetWorkbookFile } from '../lib/costSheetXlsx.js';
import DateInput from '../lib/DateInput.jsx';
import { PricingMatrix } from './PricingMatrix.jsx';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, SearchableSelect, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadCostSheetVersions, saveCostSheetVersion, markCostSheetVersionFinal, VersionDropdown, ExportMenu, loadTourExecutionForQuery, logAudit, buildLetterheadDocument, printHTML, RichTextEditor, buildDownloadFilename, db, daysFromNights, nightsDaysLabel, mealPlanLabel, formatDateSlash, useDragReorder , useUnsavedGuard } = Lib;

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
  // date input, which requires that exact format and silently
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
    { id:1, sector:"", vehicleType:"Large Coach", cost:"", cells:{}, notes:"" },
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
  setLocalHandlers(p=>[...p,{id:Date.now(),sector:"",dateFrom:"",dateTo:"",mode:"pp",cost:"",singleSupp:"",remarks:"",cells:{}}]); };
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
  const monDr = useDragReorder(setMonuments), dayDr = useDragReorder(setDays);
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
      costs: { hotel:"", singleSupp:"", meals:"", transport:"", monument:"", localHandler:"", extras:"" },
      includes: { hotel:true, singleSupp:true, meals:true, transport:true, monument:true, localHandler:true, extras:true },
    }]);
  };
  const updateTlSlab = (i, patch) => setTlSlabs(p=>p.map((t,idx)=>idx===i?{...t,...patch}:t));
  const removeTlSlab = (i) => setTlSlabs(p=>p.filter((_,idx)=>idx!==i));
  const fetchTlSlabCosts = (i) => {
    const ref = slabs[0] ? calcSlab(slabs[0]) : null;
    updateTlSlab(i, { costs: {
      hotel: Math.round(totHotel)||"", singleSupp: Math.round(daySS)||"", meals: Math.round(totMeal)||"",
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
    setDays(v.days);
    { const ids = [...(v.slabs||[]).map(x=>x.id), ...(Array.isArray(v.tlSlabs)?v.tlSlabs:[]).map(x=>x.id)]; setTransports((v.transports||[]).map(t=>withCells(t, ids, "transport"))); }
    setSlabs(v.slabs);
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
  setTransports(p=>[...p,{id:Date.now(),sector:"",vehicleType:"Large Coach",cost:"",cells:{},notes:""}]); };
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
  const handlerSS  = localHandlers.reduce((s,h)=>s+n(h.singleSupp)*fxRate(h),0);
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
    const savePromise = saveCostSheetVersion(db, query.id, snap, currentUser?.id).then(({ id, error }) => {
      // saveCostSheetVersion now reports insert failures instead of
      // swallowing them -- previously a failed save returned null here and
      // was indistinguishable from a version that simply had no id yet.
      if (error) { setSaveError(error); return false; }
      setSaveError(null);
      if (id) setLastSavedCostSheetId(id);
      guard.markSaved();
      return true;
    });
    logAudit(db, query.id, currentUser?.name, `Cost Sheet v${version} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(version);
    setVersionNote("");
    setVersion(v=>v+1);
    return savePromise;
  };
  const guard = useUnsavedGuard({ enabled: !readOnly, what: "Cost Sheet", onClose, onSave: () => saveVersion(),
    snapshot: { slabs, days, transports, gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra, monuments, localHandlers, extras, tlSlabs, clientAgentName, assignedStaffName, docNotes } });

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
      <div style="display:flex;justify-content:center;gap:16pt;flex-wrap:wrap;margin-bottom:8pt;font-size:9pt">
        <span><b>GST:</b> ${gst}%</span><span><b>Markup:</b> ${markup}%</span><span><b>ROE:</b> ${roe}</span><span><b>Currency:</b> ${currency}</span>
        <span style="color:#555">Costs are in rupees unless a row says otherwise</span>
      </div>`;

    const dayRows = days.map((d,i) => rowHTML([
      // Item 4 fix: d.date is kept as a raw ISO "YYYY-MM-DD" string in
      // state (required by the native date input editor above --
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

    // Pricing matrix, as exported: every slab is a column, neighbouring slabs
    // that show the same cost join into one block, and each cost shows the
    // WHOLE figure that was taken as well as what it comes to per paying pax.
    const mxCols = [
      ...slabs.map(s=>({ id:s.id, label:s.label, pax:n(s.foc), vehicle:s.vehicle==="Others"?(s.vehicleOther||""):(s.vehicle||""), tl:false, calc:calcSlab(s) })),
      ...tlSlabs.map(tl=>({ id:tl.id, label:tl.label, pax:n(tl.pax), vehicle:tl.vehicle==="Others"?(tl.vehicleOther||""):(tl.vehicle||""), tl:true, obj:tl, calc:calcTlSlab(tl) })),
    ];
    const money = v => "₹"+Math.round(v).toLocaleString();
    const gridCell = (inner, align, extra, zebra) => `<div class="grid-cell${zebra?" zebra":""}" style="text-align:${align}${extra||""}">${inner}</div>`;
    // ── Page 1: the answer first, then how it is built, then what to check ──
    // Slabs are columns. One table reads top to bottom: what each cost is and
    // how it was quoted, its share per paying pax for every slab, then the
    // steps from sub-total to the final price. The single supplement is its
    // own right-hand column (it is per single room, never divided by pax).
    const ssB = ssBuild(totSS, gst, markup, roe);
    const colsMeta = mxCols.map(c=>({ id:c.id, label:c.label, pax:c.pax, tl:c.tl }));
    const TLTINT = "#fff8e1", SSTINT = "#f4f1fb";
    const dash = '<span style="color:#999">&ndash;</span>';
    const val = v => v==null ? dash : (v ? money(v) : "—");
    const numCells = (vals, o={}) => mxCols.map((c,i)=>gridCell(
      (vals[i]==null ? dash : (vals[i] || o.zero===false ? money(vals[i]) : "—")),
      "right", `${o.bold?";font-weight:700":""}${o.style||""}${!o.style && c.tl ? ";background:"+TLTINT : ""}${o.custom&&o.custom[i]?";background:#fef3c7;font-weight:700":""}`)).join("");
    const mxRow = (label, basis, vals, ssV, o={}) =>
      gridCell(label, "left", `${o.indent?";padding-left:10pt":""}${o.bold?";font-weight:700":""}${o.style||""}`)
      + gridCell(basis||"", "left", `;font-size:6.8pt;${o.style?"":"color:#555"}${o.style||""}`)
      + numCells(vals, o)
      + gridCell(ssV==null||ssV===""?"":money(ssV), "right", `${o.bold?";font-weight:700":""};background:${o.style?"transparent":SSTINT}${o.style||""}`);
    const bandR = (title, key, ssV) => mxRow(`<b>${title}</b>`, "", mxCols.map(c=>c.calc[key]), ssV, { style:";background:#e5e7eb;color:#374151", bold:true });
    const perPaxOf = (l, kind, c) => {
      const t = lineCostFor(l, c.id, kind); if (t===null) return null;
      const isPP = kind==="local" ? l.mode==="pp" : kind==="extra" ? l.mode==="PP" : false;
      return isPP ? t : (c.pax>0 ? t/c.pax : 0);
    };
    const customAt = (l, c) => { const v = l.cells && l.cells[c.id]; return v!==undefined && v!==null && String(v).trim()!=="" && v!=="x"; };
    const listRows = (list, kind, nameKey, blank) => list.map(l=>{
      const fxL = hasFx(l) ? `<br/><span style="font-size:6.3pt;color:#1D4ED8">quoted in ${l.fx.cur}</span>` : "";
      return mxRow((kind==="transport" && l.vehicleType && l.vehicleType!=="Others" ? `${l[nameKey]||blank} &middot; ${l.vehicleType}` : (l[nameKey]||blank))+fxL, lineBasis(l, kind, colsMeta), mxCols.map(c=>perPaxOf(l, kind, c)), kind==="local" && n(l.singleSupp) ? n(l.singleSupp)*fxRate(l) : "", { indent:true, custom:mxCols.map(c=>customAt(l,c)), zero:false });
    }).join("");
    const nightsWithHotel = days.filter(d=>n(d.hotelNetPP)>0).length;
    const flat = (label, basis, key, ssV) => mxRow(label, basis, mxCols.map(c=>c.calc[key]), ssV);
    const buildRows = [
      ["Sub-total", "per paying pax", "sub", true],
      [`GST`, `${gst}%`, "tax"],
      ["After tax", "", "afterTax"],
      [`Markup`, `${markup}% on after-tax`, "markupAmt"],
      ["Selling price (₹)", "", "sellingINR", true],
    ].map(([l,b,k,bold])=>mxRow(l, b, mxCols.map(c=>c.calc[k]), ssB[k], { bold, style: bold?";background:#eef0f3":"" })).join("");
    const finalRow = gridCell("Final price per pax", "left", ";background:#0d1b2a;color:#fff;font-weight:700")
      + gridCell(`&divide; ROE ${roe}, rounded up`, "left", ";background:#0d1b2a;color:#fff;font-size:7pt")
      + mxCols.map(c=>gridCell(c.calc.finalFX>0?`${currency} ${c.calc.finalFX.toLocaleString()}`:"—", "right", ";background:#0d1b2a;color:#fff;font-weight:700")).join("")
      + gridCell(ssB.finalFX>0?`${currency} ${ssB.finalFX.toLocaleString()}`:"—", "right", ";background:#0d1b2a;color:#fff;font-weight:700");
    const buildHeaders = ["Cost per paying pax (₹)", "What was quoted",
      ...mxCols.map(c=>`${c.label||"—"}<br/><span style="font-size:6.5pt;font-weight:400">${c.pax||"—"} paying${c.vehicle?" &middot; "+c.vehicle:""}${c.tl?" &middot; T/L":""}</span>`),
      `Single supp.<br/><span style="font-size:6.5pt;font-weight:400">per single room</span>`];
    // The surcharge, split by what the tour leader's own costs are made of.
    const tlPartRows = TL_PARTS.map(([key,label]) => {
      const per = mxCols.map(c => c.tl ? (tlBreakdown(c.obj).find(x=>x.key===key)||{}).perPax : null);
      if (!per.some(v=>v>0)) return "";
      const tot = mxCols.map(c => c.tl ? (tlBreakdown(c.obj).find(x=>x.key===key)||{}).total : null);
      const basis = tot.filter(v=>v>0).length ? "₹"+tot.filter(v=>v>0).map(v=>Math.round(v).toLocaleString()).join(" / ₹")+" &divide; paying pax" : "";
      return mxRow(label, basis, per.map(v=>v>0?v:(v===undefined?0:null)), "", { indent:true, style:";font-size:7.4pt" });
    }).join("");
    const buildBlock = `
      <div class="section-title" style="margin:0 0 3pt">How each price is built</div>
      <div style="font-size:7pt;color:#555;margin-bottom:3pt">Amber = figure specific to that slab &middot; dash = not applied &middot; blue = quoted in a foreign currency &middot; single supplement is per single room, not divided by pax.</div>
      ${tableBlock(buildHeaders, [],
        mxRow("Hotels", `${nightsWithHotel} night${nightsWithHotel===1?"":"s"}, net rates (page 2)`, mxCols.map(()=>totHotel), daySS)
        + mxRow("Extra meals", "per day plans (page 2)", mxCols.map(()=>totMeal), "")
        + (transports.length ? bandR("Transport","tptPP","") + listRows(transports,"transport","sector","Transport") : "")
        + (localHandlers.length ? bandR("Local handler","localPP", handlerSS||"") + listRows(localHandlers,"local","sector","Local handler") : "")
        + (extras.length ? bandR("Extra services","extrasPP","") + listRows(extras,"extra","description","Extra service") : "")
        + mxRow("Tour Facilitator", n(tlCost) ? `₹${n(tlCost).toLocaleString()} ${tlMode==="pp"?"per pax":"group"}` : "", mxCols.map(c=>c.calc.tlPP), "")
        + mxRow("Miscellaneous", n(miscCost) ? `₹${n(miscCost).toLocaleString()} ${miscMode==="pp"?"per pax":"group"}` : "", mxCols.map(c=>c.calc.miscPP), "")
        + mxRow("Monuments", monuments.some(m=>m.include)||n(monExtra) ? `₹${Math.round(monTotal).toLocaleString()} ${monMode==="pp"?"per pax":"group"}` : "none included", mxCols.map(c=>c.calc.monPP), "")
        + (tlSlabs.length ? mxRow("Tour leader surcharge", "T/L's own costs &divide; paying pax", mxCols.map(c=>c.tl?c.calc.surchargePP:null), "", { style:"" }) + tlPartRows : "")
        + buildRows + finalRow,
        "", [19,17,...mxCols.map(()=>8),8])}`;
    const tlTileNote = c => { if(!c.tl) return ""; const parts = tlBreakdown(c.obj); return `<div style="font-size:6.5pt;color:#7a5a00;margin-top:2pt">incl. T/L surcharge ${money(c.calc.surchargePP)} pp${parts.length?": "+parts.map(x=>`${x.label} ${money(x.perPax)}`).join(", "):""}</div>`; };
    const finalBlock = `
      <div class="section-title" style="margin:7pt 0 4pt">Final cost per pax</div>
      <div style="display:grid;grid-template-columns:repeat(${mxCols.length+1},1fr);gap:5pt;margin-bottom:4pt;page-break-inside:avoid;break-inside:avoid">
        ${mxCols.map(c=>`<div style="border:0.5pt solid #cfd4da;border-radius:3pt;padding:4pt 6pt;${c.tl?"background:"+TLTINT:""}"><div style="font-weight:700;font-size:8.5pt">${c.label||"—"}</div><div style="font-size:6.8pt;color:#666">${c.pax||"—"} paying${c.vehicle?" &middot; "+c.vehicle:""}${c.tl?" &middot; T/L":""}</div><div style="font-size:13pt;font-weight:700;color:#0d1b2a;margin-top:2pt">${c.calc.finalFX>0?currency+" "+c.calc.finalFX.toLocaleString():"—"}</div>${tlTileNote(c)}</div>`).join("")}
        <div style="border:0.5pt solid #cfd4da;border-radius:3pt;padding:4pt 6pt;background:${SSTINT}"><div style="font-weight:700;font-size:8.5pt">Single supplement</div><div style="font-size:6.8pt;color:#666">per single room</div><div style="font-size:13pt;font-weight:700;color:#0d1b2a;margin-top:2pt">${ssB.finalFX>0?currency+" "+ssB.finalFX.toLocaleString():"—"}</div></div>
      </div>`;
    const matrixBlock = buildBlock;
    const pageBreak = `<div style="page-break-before:always"></div>`;

    const notesBlock = docNotes ? `<div class="section-title" style="margin:14pt 0 6pt">Notes</div><div style="font-size:9pt">${docNotes}</div>` : "";

    const csFilename = buildDownloadFilename("Cost Sheet", "costsheet", docSettings, { id: query.id, tourfile: query.tourFileId, group: query.groupName || query.clientName, sector: query.destination || query.sector });
    return buildLetterheadDocument({
      title: csFilename,
      bodyBlocks: [headerBlock, settingsBlock, dayTableBlock, monBlock, pageBreak, `<div style="zoom:0.91">${matrixBlock}${finalBlock}</div>`, notesBlock].filter(Boolean),
      extraHeadCSS: `table.content-table thead tr th{font-size:7.5pt;padding:4pt 4pt}table.content-table tbody tr td{font-size:8pt;padding:3pt 4pt}.content-grid .grid-cell{padding:1.1pt 5pt;font-size:8pt}.content-grid .grid-header{font-size:7.8pt;padding:3pt 4pt}`,
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
      monuments, days, transports: transports.map(t=>({ ...t, slabs: appliedSlabIds(t, [...slabs.map(x=>x.id), ...tlSlabs.map(x=>x.id)], "transport") })), localHandlers, extras, slabs, tlSlabs,
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
            onSelectVersion={(v)=>{loadVersionIntoDraft(v);guard.rebase();}}
            onMarkFinal={(v) => {
              setFinalVersion(v.version);markCostSheetVersionFinal(db,query.id,v.version);
              logAudit(db,query.id,currentUser?.name,`Cost Sheet v${v.version} marked final`);
            }}
            readOnly={readOnly}
            G={G}
          />
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          {guard.dialog}<button onClick={guard.requestClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
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
          </div>

          {/* ── Monuments / Activities ── */}
          {secH("Monuments / Activities","🏛")}
          <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:10}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginRight:4}}>Monument Fees Mode</span>
              {modeBtn(monMode,"lumpsum","Lumpsum",setMonMode)}
              {modeBtn(monMode,"pp","Per Person",setMonMode)}
            </div>
            {monuments.map((m,i)=>(
              <div key={i} {...monDr.row(i,{display:"flex",gap:8,alignItems:"center",marginBottom:6})}>
                <span {...monDr.grip(i)}>⠿</span>
                <input style={{...inp,flex:2}} value={m.name} onChange={e=>updateMonument(i,"name",e.target.value)} placeholder="e.g. Taj Mahal entry"/>
                <input style={{...inp,width:80,textAlign:"right"}} type="number" value={m.fee} onChange={e=>updateMonument(i,"fee",e.target.value)} placeholder="0"/>
                <span style={{fontSize:10,color:G.gray400}}>₹</span>
                <span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>setMonuments(p=>p.filter((_,idx)=>idx!==i))}>✕</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:2}}>
              <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setMonuments(p=>[...p,{name:"",fee:0,include:true}])}>+ Add Monument / Activity</button>
              <span style={{fontSize:10,color:G.gray400}}>or a single amount:</span>
              <input style={{...inp,width:110,textAlign:"right"}} type="number" placeholder="Extra misc monument" value={monExtra} onChange={e=>setMonExtra(e.target.value)}/>
            </div>
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
                  {["","Day","Date","Movement","Meal Plan","Meal Cost","Hotel Name","Alt Hotel","Plan","Net PP","Sngl Supp","Notes",""].map(h=>(
                    <th key={h} style={{padding:"5px 4px",fontSize:10,fontWeight:600,color:G.gray600,borderBottom:`1px solid ${G.gray200}`,textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d,i)=>(
                  <tr key={d.id} {...dayDr.row(i,{background:i%2===0?G.white:G.gray50})}>
                    <td style={{padding:"2px 2px",width:16,textAlign:"center"}}><span {...dayDr.grip(i)}>⠿</span></td>
                    <td style={{padding:"2px 3px",width:48}}><input style={{...inp,width:44,textAlign:"center"}} value={d.day} onChange={e=>updateDay(i,"day",e.target.value)}/></td>
                    <td style={{padding:"2px 3px",width:100}}><DateInput style={{...inp,fontSize:10}}  value={d.date||""} onChange={e=>updateDay(i,"date",e.target.value)}/></td>
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
                  <td colSpan={4} style={{padding:"5px 4px",fontSize:11,color:G.gray600}}>TOTALS</td>
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

          {/* 10.3 - 10.4  Pricing matrix: transport, local handler, extra services, group slabs and tour leader slabs on one grid */}
          {secH("Pricing Matrix & Final Prices","🧮")}
          <PricingMatrix
            slabs={slabs} setSlabs={setSlabs} tlSlabs={tlSlabs} setTlSlabs={setTlSlabs}
            transports={transports} setTransports={setTransports} localHandlers={localHandlers} setLocalHandlers={setLocalHandlers}
            extras={extras} setExtras={setExtras} calcSlab={calcSlab} calcTlSlab={calcTlSlab} currency={currency} roe={roe}
            totHotel={totHotel} totMeal={totMeal} handlerSS={handlerSS} daySS={daySS} gst={gst} markup={markup}
            onAddSlab={addSlab} onAddTlSlab={addTlSlab} onAddTransport={addTransport} onAddLocalHandler={addLocalHandler}
            onAddExtra={()=>{ scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY }; setExtras(p=>[...p,{id:Date.now(),description:"",cost:"",mode:"PP",cells:{}}]); }}
            onFetchTl={fetchTlSlabCosts}
          />

          {secH("Notes","📝")}
          <RichTextEditor value={docNotes} onChange={setDocNotes} readOnly={readOnly}/>
        </fieldset>

        <div style={{padding:"12px 18px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50,alignItems:"center"}}>
          <button onClick={guard.requestClose} className="btn btn-ghost">Close</button>
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
