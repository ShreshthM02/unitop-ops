import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, buildPaginatedLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocPreviewFrame, VersionDropdown, loadQuotationVersions, saveQuotationVersion, markQuotationVersionFinal, computeFinalPriceTotals, isFinalPriceComplete, loadFinalPriceAgreementAudits, logFinalPriceAgreementChange, logAudit, updateFinalPriceAgreement, loadCostSheetVersions, mapDbCostSheetRow, calcCostSheetSlabFinalPrice, calcCostSheetTlSlabFinalPrice, loadFinalCostSheetVersion, extractItineraryFromCostSheetDays, extractHotelsFromCostSheetDays, buildQuotationDocxBlob, buildAddresseeBlock, ExportMenu, db } = Lib;

export default function QuotationGenerator({ query, template, costSheetId, onClose, onSaved, currentUser, readOnly }) {
  const today = new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });

  // Editable quotation fields (pre-filled from query)
  const [q, setQ] = useState({
    attnName:    query.agentName || "",
    attnCompany: query.agentCompany || "",
    attnCity:    query.agentCountry || "",
    date:        today,
    refLine:     `${query.groupName || query.clientName || ""} — ${query.destination || ""} for ${query.nights || "??"}  Days / ${query.nights ? query.nights - 1 : "??"} Nights`,
    period:      query.dateDisplay || query.travelDate || "",
    paxLine:     query.paxDisplay || `${query.pax || "??"} Pax`,
    currency:    "US $",
    slabs: [
      { label: "15–19 Pax Paying + 01 T/L Free (Using A/C Large Coach)", price: "" },
      { label: "10–14 Pax Paying + 01 T/L Free (Using A/C Mini Coach)",  price: "" },
      { label: "Single Supplement",                                        price: "" },
    ],
    itinerary: [
      { day:"Day 01", date:"", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 02", date:"", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 03", date:"", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 04", date:"", movement:"", bf:"", lunch:"", dinner:"" },
    ],
    showItinDate: false,
    hotels: [
      { place:"", nights:"", hotel:"" },
    ],
    includes:  [...template.includes],
    excludes:  [...template.excludes],
    monuments: [...template.monuments],
    showMonuments: template.showMonuments,
    monumentNote: template.monumentNote,
    // Domestic flights/trains: plain free-text, multiple entries, optional
    // display -- quotation-only for now (only actually serviced if the
    // client accepts our rates), same optional-toggle pattern as monuments.
    flights: [], showFlights: false, flightsHeading: template.flightsHeading,
    trains: [], showTrains: false, trainsHeading: template.trainsHeading,
    // Remarks: single free-text field, optional display, same pattern.
    remarks: "", showRemarks: false, remarksHeading: template.remarksHeading,
    greeting:  template.greeting,
    openingLine: template.openingLine,
    closingLine: template.closingLine,
    // #2 of the general backlog: signoff defaults to the actual person
    // handling this client (query.internalCorrespondent, set once at
    // query creation) rather than a generic department-level signature,
    // when that's been set -- falls back to the template's own default
    // otherwise. Still a free-text field, fully editable per-document
    // afterward, same as every other pre-filled-then-independent field
    // in this app.
    signoff: query.internalCorrespondent
      ? `Thanks & Regards\n\n${query.internalCorrespondent}\nTour Deptt.\nUnitop Tours & Travel Pvt. Ltd.`
      : template.signoff,
    costSheetId: costSheetId || null,
    confirmedPax: "", tourValue: "",
    finalPriceEntries: [],
  });

  // Real version history, mirroring Cost Sheet exactly -- real negotiations
  // (client pushback, revised pricing) produce real quotation versions that
  // deserve the same permanent record Cost Sheet versions get.
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionNote, setVersionNote] = useState("");

  const loadVersionIntoDraft = (v) => {
    setQ(p => ({ ...p, ...v }));
    setViewingVersion(v.version);
  };

  // "Pull from Cost Sheet" -- explicit, not automatic, so it never
  // silently overwrites something mid-edit. Maps the linked Cost Sheet
  // version's addressee, itinerary, accommodation, and slab pricing into
  // the Quotation's own editable fields, which the user can then adjust
  // freely -- this is a starting point, not a locked sync. Accepts an
  // optional explicit target (a specific Cost Sheet version row) so the
  // same function serves both the original pull (from the linked
  // costSheetId) and a later re-pull from a newer star-marked version
  // once one exists (Phase 3 of the Document Chain plan).
  const [pulling, setPulling] = useState(false);
  const [pullMessage, setPullMessage] = useState("");
  const pullFromCostSheet = async (targetMatch) => {
    if (!targetMatch && !costSheetId) { setPullMessage("No Cost Sheet linked to this Quotation yet."); return; }
    setPulling(true);
    setPullMessage("");
    try {
      let match = targetMatch;
      if (!match) {
        const versions = await loadCostSheetVersions(db, query.id);
        match = versions.find(v => v.id === costSheetId);
      }
      if (!match) { setPullMessage("Could not find the linked Cost Sheet version."); return; }

      // Addressee: Cost Sheet's own Client / Foreign Agent field, if set
      const attnCompany = match.clientAgentName || q.attnCompany;

      // Itinerary and accommodation: both now come from the shared
      // extraction library (utils.js), not duplicated inline logic --
      // Meal Plan and Itinerary Builder use the same functions (Phase 4
      // of the Document Chain plan).
      const extracted = extractItineraryFromCostSheetDays(match.days);
      const itinerary = extracted.map(d => ({ day: d.day, date: "", movement: d.movement, bf: d.breakfast, lunch: d.lunch, dinner: d.dinner }));
      const hotels = extractHotelsFromCostSheetDays(match.days);

      // Cost: each group slab's computed final price, using the same
      // calculation Cost Sheet itself uses. T/L slabs are appended to
      // the same list -- from the client's perspective they're just
      // another pricing tier, even though Cost Sheet tracks them
      // separately internally. T/L Surcharge is a genuinely different
      // formula from group slabs (calcCostSheetTlSlabFinalPrice), not
      // just a different label -- reusing the group formula for T/L
      // slabs would have silently produced the wrong number.
      const groupSlabs = (match.slabs||[]).map(s => {
        const c = calcCostSheetSlabFinalPrice(match, s);
        return { label: s.label, price: c.finalFX ? String(c.finalFX) : "" };
      });
      const tlSlabs = (match.tlSlabs||[]).map(tl => {
        const c = calcCostSheetTlSlabFinalPrice(match, tl);
        return { label: tl.label, price: c.finalFX ? String(c.finalFX) : "" };
      });
      const slabs = [...groupSlabs, ...tlSlabs];

      // Monuments: only the ones actually included in the price (an
      // excluded monument was priced as an optional extra, not something
      // that belongs on the client-facing inclusions list).
      const monuments = (match.monuments||[]).filter(m => m.include).map(m => {
        const fee = parseFloat(m.fee) || 0;
        return { name: m.name || "", fee: fee ? String(fee) : "" };
      });

      setQ(p => ({
        ...p,
        attnCompany,
        itinerary: itinerary.length ? itinerary : p.itinerary,
        hotels: hotels.length ? hotels : p.hotels,
        slabs: slabs.length ? slabs : p.slabs,
        monuments: monuments.length ? monuments : p.monuments,
        currency: match.currency || p.currency,
        pulledFromCostSheetVersion: match.version,
      }));
      setPullMessage(`Pulled from Cost Sheet v${match.version}.`);
      return match;
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    } finally {
      // Bug fix: this used to sit as a plain statement after the
      // try/catch, which the success path's early `return match;`
      // skipped entirely -- so a successful pull (confirmed by the
      // banner showing the right version) still left the button stuck
      // on "Pulling…" forever, since only the error path ever actually
      // reached it. A finally block runs on every exit path: success,
      // the early "no match found" return, and the catch block alike.
      setPulling(false);
    }
  };

  // Load previously saved versions for this tour file, if any -- continues
  // editing from the latest saved version instead of starting fresh from
  // template defaults every time the Quotation is reopened.
  useEffect(() => {
    loadQuotationVersions(db, query.id).then(loaded => {
      if (loaded.length === 0) {
        // Phase 3 of the Document Chain plan (docs/DATA_OWNERSHIP.md):
        // auto-fire the pull once, only for a genuinely new Quotation
        // (zero saved versions) that's linked to a Cost Sheet -- safe by
        // construction, since there's nothing yet to overwrite. Once any
        // version exists, this never fires again; only the explicit
        // button (or the staleness banner's re-pull) does.
        if (costSheetId) pullFromCostSheet();
        return;
      }
      setVersions(loaded);
      setVersion(Math.max(...loaded.map(v => v.version)) + 1);
      const finalV = loaded.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
    });
  }, [query.id]);

  // Mutual staleness check against the star-marked Cost Sheet (Phase 3 of
  // the Document Chain plan, docs/DATA_OWNERSHIP.md) -- same principle as
  // Tour Info's check against Cost Sheet: never automatic, never silent,
  // just a visible banner + an explicit one-click re-pull. Only checks
  // against a Cost Sheet version that's been deliberately marked final --
  // an in-progress pricing draft is never a reason to flag this
  // Quotation as "out of sync," since the salesperson may be
  // deliberately working from an earlier, already-agreed number.
  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  useEffect(() => {
    loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion &&
    q.pulledFromCostSheetVersion !== finalCostSheetVersion.version;
  const pullLatestFinal = () => { if (finalCostSheetVersion) pullFromCostSheet(finalCostSheetVersion); };

  // Last caller still ignoring the save result. Same treatment as the
  // itineraries and Cost Sheet: confirm the insert BEFORE showing the version
  // as saved, and surface the real reason if it fails. The optimistic
  // setVersions that used to run first is now after the await -- that
  // ordering was the whole bug on the itinerary side.
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveVersion = async () => {
    const snap = { ...q, version, note: versionNote };
    setSaving(true);
    setSaveError(null);
    const { error } = await saveQuotationVersion(db, query.id, snap, currentUser?.id);
    setSaving(false);
    if (error) { setSaveError(error); return; }
    setVersions(p => [...p.filter(v => v.version !== version), snap]);
    logAudit(db, query.id, currentUser?.name, `Quotation v${version} saved${versionNote?" — "+versionNote:""}`);
    if (q.finalPriceEntries.length > 0) {
      logFinalPriceAgreementChange(db, query.id, currentUser?.name || "Unknown", q.finalPriceEntries, q.currency)
        .then(() => loadFinalPriceAgreementAudits(db, query.id).then(setFinalPriceAudits));
    }
    setViewingVersion(version);
    setVersionNote("");
    setVersion(v => v + 1);
    onSaved && onSaved(q);
  };

  const [activeTab,    setActiveTab]    = useState('content');
  const toggles = useLetterheadToggles();
  const { headerFooterAllPages, showPageNum, showStamp, printOnLetterhead, togglePrintOnLetterhead } = toggles;
  const setF = (k, v) => setQ(prev => ({ ...prev, [k]: v }));
  const updateSlab = (i, field, val) => setQ(prev => ({
    ...prev, slabs: prev.slabs.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
  }));
  // Direct, guaranteed scroll preservation -- same fix as Cost Sheet's
  // addTlSlab (see that file's comment for the full history: CSS-based
  // approaches were confirmed deployed but did not stop the "jumps to
  // top" behavior). Captures scroll position from every plausible
  // scrolling element before the DOM changes and restores it
  // synchronously afterward, via useLayoutEffect (runs after DOM
  // mutation, before paint -- no visible flash).
  const fieldsetRef = useRef(null);
  const scrollRestoreRef = useRef(null);
  useLayoutEffect(() => {
    if (scrollRestoreRef.current) {
      const { fieldset, window: winY } = scrollRestoreRef.current;
      if (fieldsetRef.current && fieldset != null) fieldsetRef.current.scrollTop = fieldset;
      if (winY != null) window.scrollTo(0, winY);
      scrollRestoreRef.current = null;
    }
  // The restore has to be keyed on every list/toggle whose change alters
  // layout height. It previously only watched slabs and monuments, so the
  // flights/trains/remarks sections added in batch 1 -- and the
  // includes/excludes lists, which had the same latent problem -- saved a
  // scroll position that was never applied, dropping the user back at the
  // top of the quotation on every add/remove/toggle.
  }, [q.slabs.length, q.monuments.length, q.flights.length, q.trains.length,
      q.includes.length, q.excludes.length,
      q.showFlights, q.showTrains, q.showRemarks, q.showMonuments, q.showItinDate]);
  const saveScrollForRestore = () => {
    scrollRestoreRef.current = { fieldset: fieldsetRef.current?.scrollTop ?? null, window: window.scrollY };
  };
  const addSlab = () => { saveScrollForRestore(); setQ(prev => ({ ...prev, slabs: [...prev.slabs, { label:"", price:"" }] })); };
  const removeSlab = (i) => setQ(prev => ({ ...prev, slabs: prev.slabs.filter((_,idx)=>idx!==i) }));

  // ── Final Price Agreement: multi-entry composition (e.g. 18 pax on one
  // slab + 2 pax on single supplement) instead of one flat rate. ──
  const addFinalPriceEntry = () => setQ(prev => ({ ...prev, finalPriceEntries: [...prev.finalPriceEntries, { id: Date.now(), paxPaying:"", foc:"", source:"slab", slabLabel:"", rate:"" }] }));
  const removeFinalPriceEntry = (i) => setQ(prev => ({ ...prev, finalPriceEntries: prev.finalPriceEntries.filter((_,idx)=>idx!==i) }));
  const updateFinalPriceEntry = (i, field, val) => setQ(prev => ({
    ...prev, finalPriceEntries: prev.finalPriceEntries.map((e,idx) => {
      if (idx !== i) return e;
      if (field === "slabLabel") {
        const slab = prev.slabs.find(s => s.label === val);
        return { ...e, slabLabel: val, rate: slab ? slab.price : e.rate };
      }
      if (field === "source" && val === "custom") return { ...e, source: "custom", slabLabel: "" };
      if (field === "source" && val === "slab") return { ...e, source: "slab", rate: "" };
      return { ...e, [field]: val };
    }),
  }));
  // Totals are always derived from the entries, never entered separately --
  // keeps them from silently drifting apart from what's actually listed.
  useEffect(() => {
    const { confirmedPax, tourValue } = computeFinalPriceTotals(q.finalPriceEntries);
    setQ(prev => (prev.confirmedPax === confirmedPax && prev.tourValue === tourValue) ? prev : { ...prev, confirmedPax, tourValue });
  }, [q.finalPriceEntries]);

  const [finalPriceAudits, setFinalPriceAudits] = useState([]);
  useEffect(() => { loadFinalPriceAgreementAudits(db, query.id).then(setFinalPriceAudits); }, [query.id]);

  const updateItinerary = (i, field, val) => setQ(prev => ({
    ...prev, itinerary: prev.itinerary.map((r,idx) => idx===i ? {...r,[field]:val} : r)
  }));
  const addItinRow = () => setQ(prev => ({
    ...prev, itinerary: [...prev.itinerary, { day:`Day ${String(prev.itinerary.length+1).padStart(2,"0")}`, date:"", movement:"", bf:"", lunch:"", dinner:"" }]
  }));
  const updateHotel = (i, field, val) => setQ(prev => ({
    ...prev, hotels: prev.hotels.map((r,idx) => idx===i ? {...r,[field]:val} : r)
  }));
  const addHotelRow = () => setQ(prev => ({ ...prev, hotels: [...prev.hotels, {place:"",nights:"",hotel:""}] }));
  const updateList = (key, i, val) => setQ(prev => ({ ...prev, [key]: prev[key].map((x,idx)=>idx===i?val:x) }));
  // saveScrollForRestore here (rather than at each call site) so every
  // list-backed section -- flights, trains, includes, excludes -- keeps the
  // user's scroll position on add/remove.
  const addListItem = (key) => { saveScrollForRestore(); setQ(prev => ({ ...prev, [key]: [...prev[key], key==="flights"||key==="trains" ? { day:"", detail:"" } : ""] })); };
  const removeListItem = (key, i) => { saveScrollForRestore(); setQ(prev => ({ ...prev, [key]: prev[key].filter((_,idx)=>idx!==i) })); };
  // Section show/hide toggles change layout height too, so they need the
  // same treatment as add/remove.
  const setToggle = (key, val) => { saveScrollForRestore(); setF(key, val); };
  const updateMonument = (i, field, val) => setQ(prev => ({
    ...prev, monuments: prev.monuments.map((m,idx)=>idx===i?{...m,[field]:val}:m)
  }));

  const buildPrintHTML = () => {
    const stampHTMLQ = showStamp ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Stamp"/>` : '';

    // 1.1: real vertical gaps between date / addressee / subject / greeting /
    // opening line, instead of the previous near-zero spacing (the shared
    // print CSS resets all margins to 0 -- each line here needs its own
    // explicit margin-top rather than relying on any default).
    const addresseeBlock = `
    <div style="margin-bottom:14pt;font-size:9pt;">
      <div><strong>Date:</strong> ${q.date}</div>
      ${q.attnName || q.attnCompany || q.attnCity ? '<div style="margin-top:8pt;">'+buildAddresseeBlock({ name:q.attnName, company:q.attnCompany, city:q.attnCity, fontSizePt:9 })+'</div>' : ''}
      ${q.refLine ? '<div style="margin-top:8pt;"><strong>RE:</strong> '+q.refLine+'</div>' : ''}
    </div>
    <div style="font-style:italic;font-weight:bold;margin:14pt 0;font-size:10pt;">${q.greeting}</div>
    <p style="font-size:9.5pt;margin-top:10pt;margin-bottom:12pt;">${q.openingLine}</p>`;

    // 1.2: date column optional (dates are often fluid at quotation stage),
    // B/F renamed to the full word for a client-facing document.
    const itineraryBlock = {
      type: "table",
      headerHTML: q.showItinDate
        ? `<tr><th>Day</th><th>Date</th><th>Itinerary</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>`
        : `<tr><th>Day</th><th>Itinerary</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>`,
      rowsHTML: q.itinerary.map(r=>
        '<tr><td><strong>'+r.day+'</strong></td>'+
        (q.showItinDate ? '<td>'+(r.date||'—')+'</td>' : '')+
        '<td>'+r.movement+'</td><td>'+(r.bf||'—')+'</td><td>'+(r.lunch||'—')+'</td><td>'+(r.dinner||'—')+'</td></tr>'),
    };
    const itineraryHeading = `<h2>Day-wise Itinerary</h2>`;

    // 1.3 / 2.3: Domestic Flights / Domestic Trains -- each entry now carries
    // its own day/date alongside the free-text detail. The `|| "Domestic
    // Flights"` fallbacks matter: a doc_templates row saved before these
    // heading fields existed used to yield undefined here and print the
    // literal word "undefined" as the section heading.
    const flightsHeadingBlock = q.showFlights ? `<h2>${q.flightsHeading || "Domestic Flights"}</h2>` : "";
    const flightsBlock = (q.showFlights && q.flights.length) ? {
      type: "table",
      headerHTML: `<tr><th>Day</th><th>Flight Details</th></tr>`,
      rowsHTML: q.flights.map(f=>'<tr><td>'+((f&&f.day)||'—')+'</td><td>'+((f&&f.detail)||'')+'</td></tr>'),
    } : null;
    const trainsHeadingBlock = q.showTrains ? `<h2>${q.trainsHeading || "Domestic Trains"}</h2>` : "";
    const trainsBlock = (q.showTrains && q.trains.length) ? {
      type: "table",
      headerHTML: `<tr><th>Day</th><th>Train Details</th></tr>`,
      rowsHTML: q.trains.map(t=>'<tr><td>'+((t&&t.day)||'—')+'</td><td>'+((t&&t.detail)||'')+'</td></tr>'),
    } : null;

    const accommodationBlock = {
      type: "table",
      headerHTML: `<tr><th>Place</th><th>Nights</th><th>Hotel</th></tr>`,
      rowsHTML: q.hotels.map(h=>'<tr><td>'+h.place+'</td><td>'+h.nights+'</td><td>'+h.hotel+'</td></tr>'),
    };
    const accommodationHeading = `<h2>Accommodation</h2>`;

    const priceHeadingBlock = `<h2>Cost Per Person (${q.currency})</h2>`;
    const priceBlock = {
      type: "table",
      className: "price-table",
      headerHTML: `<tr><th>Group Size</th><th>Rate</th></tr>`,
      rowsHTML: q.slabs.map(s=>'<tr><td>'+s.label+'</td><td><strong>'+q.currency+' '+s.price+'</strong> Per Pax</td></tr>'),
    };
    // Monuments is a genuinely separate, independently-splittable table --
    // was previously baked into priceBlock as a single opaque string,
    // which meant a long monuments list for a big tour couldn't split
    // across pages on its own.
    const monumentsHeadingBlock = q.showMonuments ? `<h2>${q.monumentNote || "Monument Fees"}</h2>` : "";
    const monumentsBlock = q.showMonuments ? {
      type: "table",
      headerHTML: `<tr><th>Monument</th><th>Fee</th></tr>`,
      rowsHTML: q.monuments.map(m=>'<tr><td>'+m.name+'</td><td>'+m.fee+'</td></tr>'),
    } : null;

    // 1.5: Remarks -- single free-text field, optional display, placed
    // directly below the (now relocated) Monument Fees section.
    const remarksHeadingBlock = q.showRemarks ? `<h2>${q.remarksHeading || "Remarks"}</h2>` : "";
    const remarksBlock = (q.showRemarks && q.remarks) ? `<p style="font-size:9.5pt;white-space:pre-wrap;">${q.remarks}</p>` : "";

    const inclusionsBlock = `
    <h2>Cost Includes</h2><ol>${q.includes.map(i=>'<li>'+i+'</li>').join('')}</ol>
    <h2>Cost Does Not Include</h2><ol>${q.excludes.map(i=>'<li>'+i+'</li>').join('')}</ol>`;

    const closingBlock = `
    <p style="margin-top:12pt;font-size:9.5pt;">${q.closingLine}</p>
    <div style="margin-top:20pt;font-size:10pt;">${q.signoff.replace(/\n/g,'<br/>')}</div>
      <div style="margin-top:14pt;">
        ${stampHTMLQ}
        ${showStamp ? '' : '<div style="height:44pt;"></div>'}
        <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
        <div style="font-size:10pt;font-weight:700;color:#1A3A52;">For Unitop Tours &amp; Travel (P) Ltd.</div>
        <div style="font-size:9pt;color:#888;">(Authorised Signatory)</div>
      </div>`;

    return buildPaginatedLetterheadDocument({
      title: `Quotation — ${q.attnCompany}`,
      extraHeadCSS: `
        h2{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;margin:22pt 0 8pt;border-bottom:1pt solid #ddd;padding-bottom:2pt;color:#1A3A52;}
        .price-table td:last-child{font-weight:bold;color:#C0392B;}
        ol,ul{margin:3pt 0 0 14pt;padding:0;}
        li{margin-bottom:2pt;font-size:9pt;}
      `,
      bodyBlocks: [
        addresseeBlock,
        itineraryHeading, itineraryBlock,
        ...(q.showFlights && flightsBlock ? [flightsHeadingBlock, flightsBlock] : []),
        ...(q.showTrains && trainsBlock ? [trainsHeadingBlock, trainsBlock] : []),
        accommodationHeading, accommodationBlock,
        ...(monumentsBlock ? [monumentsHeadingBlock, monumentsBlock] : []),
        ...(q.showRemarks && remarksBlock ? [remarksHeadingBlock, remarksBlock] : []),
        priceHeadingBlock, priceBlock,
        inclusionsBlock,
        closingBlock,
      ],
      headerFooterAllPages,
      printOnLetterhead,
      showPageNum,
    });
  };

  const printQuotation = async () => {
    const win = window.open("", "_blank");
    if (!win) { alert('Please allow pop-ups for this site to print/export PDF.'); return; }
    win.document.write(await buildPrintHTML());
    win.document.close();
    setTimeout(()=>win.print(), 500);
  };

  // 1.1: real .docx export -- new feature, the app previously only had
  // Print/Export PDF. Applies the same 4 letterhead toggles as the PDF
  // preview (see src/lib/wordLetterhead.js for how each maps onto Word's
  // own header/footer/margin mechanics).
  const exportQuotationDocx = async () => {
    {
      const blob = await buildQuotationDocxBlob(q, { headerFooterAllPages, showPageNum, showStamp, printOnLetterhead });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quotation - ${q.attnCompany || query.groupName || query.id}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Preview now needs to reflect the same paginated output that will
  // actually print, since buildPaginatedLetterheadDocument is async
  // (requires real DOM measurement) -- can no longer call buildPrintHTML()
  // synchronously inline in the render like the old buildLetterheadDocument
  // allowed.
  const [previewHTML, setPreviewHTML] = useState("");
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (activeTab !== "preview") return;
    let cancelled = false;
    buildPrintHTML().then(html => {
      if (cancelled) return;
      setPreviewHTML(html);
      setPreviewError("");
    }).catch(e => {
      if (cancelled) return;
      setPreviewError(e.message);
    });
    return () => { cancelled = true; };
  }, [activeTab, q, headerFooterAllPages, printOnLetterhead, showPageNum, showStamp]);

  const inputStyle = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5,
    fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800,
    background:G.white };
  const labelStyle = { fontSize:10, fontWeight:600, color:G.gray600, textTransform:"uppercase",
    letterSpacing:"0.5px", display:"block", marginBottom:3 };
  const secTitle = (t) => (
    <div style={{ fontSize:11, fontWeight:700, color:G.white, background:G.navy,
      padding:"5px 10px", borderRadius:5, marginBottom:8, marginTop:16, letterSpacing:"0.5px" }}>{t}</div>
  );

  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:G.white, width:680, height:"100vh", overflowY:"auto",
        boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"16px 20px", display:"flex",
          alignItems:"center", gap:12, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>QUOTATION GENERATOR</div>
            <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
              {query.groupName || query.clientName || query.agentName}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.id} · {query.destination}</div>
          </div>
          <VersionDropdown
            versions={versions}
            viewingVersion={viewingVersion}
            displayVersion={version}
            finalVersion={finalVersion}
            onSelectVersion={loadVersionIntoDraft}
            onMarkFinal={(v) => {
              if (!isFinalPriceComplete(v.finalPriceEntries)) {
                alert('Before marking this version final: open it, go to the "Final Price" tab, add at least one rate line with pax and rate filled in, then save it again.');
                return;
              }
              setFinalVersion(v.version);markQuotationVersionFinal(db,query.id,v.version);
              logAudit(db,query.id,currentUser?.name,`Quotation v${v.version} marked final`);
            }}
            readOnly={readOnly}
            G={G}
          />
          {(costSheetId || finalCostSheetVersion) && !readOnly && (
            <button onClick={()=>pullFromCostSheet(costSheetId ? undefined : finalCostSheetVersion)} disabled={pulling} className="btn btn-ghost" style={{ fontSize:11 }}
              title="Pull addressee, itinerary, accommodation, and pricing from the linked Cost Sheet">
              {pulling ? "Pulling…" : "↻ Pull from Cost Sheet"}
            </button>
          )}
          <button onClick={onClose} className="btn btn-ghost"
            style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
        </div>

        {isStaleVsCostSheet && !readOnly && (
          <div style={{background:"#FEF9E7",borderBottom:"1px solid #F7DC6F",padding:"6px 18px",fontSize:11,color:"#7D6608",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
            <span style={{flex:1}}>
              Cost Sheet v{finalCostSheetVersion.version} (final) has pricing
              {q.pulledFromCostSheetVersion ? ` newer than what this Quotation was last pulled from (v${q.pulledFromCostSheetVersion})` : " that hasn't been pulled in yet"}.
            </span>
            <button onClick={pullLatestFinal} disabled={pulling} className="btn btn-primary" style={{fontSize:10.5,padding:"3px 8px",flexShrink:0}}>
              {pulling ? "Pulling…" : "↻ Pull latest"}
            </button>
          </div>
        )}

        {pullMessage && (
          <div style={{background:"#EFF6FF",borderBottom:"1px solid #BFDBFE",padding:"6px 18px",fontSize:11,color:"#1E40AF",flexShrink:0}}>
            {pullMessage}
          </div>
        )}

        {readOnly && (
          <div style={{background:"#FEF3C7",borderBottom:"1px solid #FCD34D",padding:"8px 18px",fontSize:12,color:"#92400E",flexShrink:0}}>
            🔒 This tour file is cancelled — viewing only, nothing here is editable.
          </div>
        )}

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
          {[['content','✏ Content'],['preview','👁 Preview'],['final','💰 Final Price']].map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{padding:'9px 16px',border:'none',cursor:'pointer',fontSize:12,fontFamily:"'Inter',sans-serif",
                background:'none',color:activeTab===id?G.accent:G.gray600,fontWeight:activeTab===id?700:400,
                borderBottom:`2px solid ${activeTab===id?G.accent:'transparent'}`}}>
              {label}
            </button>
          ))}
        </div>

        {activeTab==='content' && <fieldset ref={fieldsetRef} disabled={readOnly} style={{ flex:1, overflowY:"auto", padding:"16px 20px", border:"none", margin:0, minWidth:0 }}>

          {/* ── ADDRESSEE ── */}
          {secTitle("📬 Addressee")}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
            <div><label style={labelStyle}>Kind Attn (Name)</label>
              <input style={inputStyle} value={q.attnName} onChange={e=>setF("attnName",e.target.value)} placeholder="e.g. Pee Suchint / Khun Nikky"/></div>
            <div><label style={labelStyle}>Company</label>
              <input style={inputStyle} value={q.attnCompany} onChange={e=>setF("attnCompany",e.target.value)} placeholder="e.g. N C Holidays"/></div>
            <div><label style={labelStyle}>City / Country</label>
              <input style={inputStyle} value={q.attnCity} onChange={e=>setF("attnCity",e.target.value)} placeholder="e.g. Bangkok"/></div>
            <div><label style={labelStyle}>Date</label>
              <input style={inputStyle} value={q.date} onChange={e=>setF("date",e.target.value)}/></div>
          </div>

          {/* ── RE LINE ── */}
          {secTitle("📌 Subject")}
          <div style={{ marginBottom:8 }}>
            <label style={labelStyle}>Re: Line</label>
            <input style={inputStyle} value={q.refLine} onChange={e=>setF("refLine",e.target.value)}/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
            <div><label style={labelStyle}>Travel Period</label>
              <input style={inputStyle} value={q.period} onChange={e=>setF("period",e.target.value)} placeholder="Oct '26 – Mar '27"/></div>
            <div><label style={labelStyle}>Pax</label>
              <input style={inputStyle} value={q.paxLine} onChange={e=>setF("paxLine",e.target.value)} placeholder="10–20 Pax"/></div>
          </div>

          {/* ── ITINERARY ── */}
          {secTitle("🗺 Day-wise Itinerary")}
          <div style={{ marginBottom:8 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showItinDate}
                onChange={e=>setToggle("showItinDate",e.target.checked)}/> Show a Date column (dates are often fluid at quotation stage -- leave off if not yet fixed)
            </label>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, marginBottom:8 }}>
            <thead>
              <tr style={{ background:G.gray100 }}>
                {(q.showItinDate ? ["Day","Date","Movement / Itinerary","Breakfast","Lunch","Dinner",""] : ["Day","Movement / Itinerary","Breakfast","Lunch","Dinner",""]).map(h=>(
                  <th key={h} style={{ padding:"5px 6px", textAlign:"left", fontSize:10,
                    fontWeight:600, color:G.gray600, borderBottom:`1px solid ${G.gray200}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.itinerary.map((row,i)=>(
                <tr key={i}>
                  <td style={{ padding:"3px 4px", width:52 }}>
                    <input style={{...inputStyle,padding:"3px 5px"}} value={row.day}
                      onChange={e=>updateItinerary(i,"day",e.target.value)}/></td>
                  {q.showItinDate && (
                    <td style={{ padding:"3px 4px", width:70 }}>
                      <input style={{...inputStyle,padding:"3px 5px"}} value={row.date}
                        onChange={e=>updateItinerary(i,"date",e.target.value)} placeholder="e.g. 12 Oct"/></td>
                  )}
                  <td style={{ padding:"3px 4px" }}>
                    <input style={{...inputStyle,padding:"3px 5px"}} value={row.movement}
                      onChange={e=>updateItinerary(i,"movement",e.target.value)}
                      placeholder="e.g. Bangkok / Delhi / Agra (6E 1064 @ 14:45)"/></td>
                  {["bf","lunch","dinner"].map(f=>(
                    <td key={f} style={{ padding:"3px 4px", width:90 }}>
                      <input style={{...inputStyle,padding:"3px 5px"}} value={row[f]}
                        onChange={e=>updateItinerary(i,f,e.target.value)}
                        placeholder="Hotel / Rest. / —"/></td>
                  ))}
                  <td style={{ padding:"3px 4px", width:24, textAlign:"center" }}>
                    <span style={{ cursor:"pointer", color:G.gray400, fontSize:13 }}
                      onClick={()=>setQ(p=>({...p,itinerary:p.itinerary.filter((_,idx)=>idx!==i)}))}>✕</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={addItinRow}>+ Add Day</button>

          {/* ── DOMESTIC FLIGHTS ── */}
          {secTitle("✈ Domestic Flights")}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showFlights}
                onChange={e=>setToggle("showFlights",e.target.checked)}/> Show domestic flights in quotation
            </label>
          </div>
          {q.showFlights && (
            <>
              {q.flights.map((item,i)=>(
                <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:G.gray400, minWidth:16 }}>{i+1}.</span>
                  <input style={{...inputStyle,width:110,flex:"0 0 110px"}} value={item.day||""}
                    onChange={e=>updateList("flights",i,{...item,day:e.target.value})} placeholder="Day 02 / 12 Oct"/>
                  <input style={{...inputStyle,flex:1}} value={item.detail||""}
                    onChange={e=>updateList("flights",i,{...item,detail:e.target.value})} placeholder="e.g. Delhi / Varanasi — 6E 2134"/>
                  <span style={{ cursor:"pointer", color:G.gray400 }}
                    onClick={()=>removeListItem("flights",i)}>✕</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={()=>addListItem("flights")}>+ Add Flight</button>
            </>
          )}

          {/* ── DOMESTIC TRAINS ── */}
          {secTitle("🚆 Domestic Trains")}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showTrains}
                onChange={e=>setToggle("showTrains",e.target.checked)}/> Show domestic trains in quotation
            </label>
          </div>
          {q.showTrains && (
            <>
              {q.trains.map((item,i)=>(
                <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:G.gray400, minWidth:16 }}>{i+1}.</span>
                  <input style={{...inputStyle,width:110,flex:"0 0 110px"}} value={item.day||""}
                    onChange={e=>updateList("trains",i,{...item,day:e.target.value})} placeholder="Day 03 / 13 Oct"/>
                  <input style={{...inputStyle,flex:1}} value={item.detail||""}
                    onChange={e=>updateList("trains",i,{...item,detail:e.target.value})} placeholder="e.g. Delhi / Agra — Shatabdi Express"/>
                  <span style={{ cursor:"pointer", color:G.gray400 }}
                    onClick={()=>removeListItem("trains",i)}>✕</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={()=>addListItem("trains")}>+ Add Train</button>
            </>
          )}

          {/* ── HOTELS ── */}
          {secTitle("🏨 Accommodation")}
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, marginBottom:8 }}>
            <thead>
              <tr style={{ background:G.gray100 }}>
                {["Place","Nights","Hotel / Property",""].map(h=>(
                  <th key={h} style={{ padding:"5px 6px", textAlign:"left", fontSize:10,
                    fontWeight:600, color:G.gray600, borderBottom:`1px solid ${G.gray200}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.hotels.map((row,i)=>(
                <tr key={i}>
                  <td style={{ padding:"3px 4px" }}>
                    <input style={{...inputStyle,padding:"3px 5px"}} value={row.place}
                      onChange={e=>updateHotel(i,"place",e.target.value)} placeholder="e.g. Agra"/></td>
                  <td style={{ padding:"3px 4px", width:60 }}>
                    <input style={{...inputStyle,padding:"3px 5px"}} value={row.nights}
                      onChange={e=>updateHotel(i,"nights",e.target.value)} placeholder="01"/></td>
                  <td style={{ padding:"3px 4px" }}>
                    <input style={{...inputStyle,padding:"3px 5px"}} value={row.hotel}
                      onChange={e=>updateHotel(i,"hotel",e.target.value)}
                      placeholder="e.g. Saura / Golden Tulip / Similar"/></td>
                  <td style={{ padding:"3px 4px", width:24, textAlign:"center" }}>
                    <span style={{ cursor:"pointer", color:G.gray400 }}
                      onClick={()=>setQ(p=>({...p,hotels:p.hotels.filter((_,idx)=>idx!==i)}))}>✕</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={addHotelRow}>+ Add Hotel</button>

          {/* ── MONUMENTS ── */}
          {secTitle("🏛 Monument Fees")}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showMonuments}
                onChange={e=>setToggle("showMonuments",e.target.checked)}/> Show monument fees in quotation
            </label>
          </div>
          {q.showMonuments && (
            <>
              <div style={{ marginBottom:8 }}>
                <label style={labelStyle}>Section note</label>
                <input style={inputStyle} value={q.monumentNote} onChange={e=>setF("monumentNote",e.target.value)}/>
              </div>
              {q.monuments.map((m,i)=>(
                <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                  <input style={{...inputStyle,flex:2}} value={m.name}
                    onChange={e=>updateMonument(i,"name",e.target.value)} placeholder="Monument name"/>
                  <input style={{...inputStyle,flex:1}} value={m.fee}
                    onChange={e=>updateMonument(i,"fee",e.target.value)} placeholder="₹ 750"/>
                  <span style={{ cursor:"pointer", color:G.gray400 }}
                    onClick={()=>setQ(p=>({...p,monuments:p.monuments.filter((_,idx)=>idx!==i)}))}>✕</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ fontSize:11 }}
                onClick={()=>{saveScrollForRestore();setQ(p=>({...p,monuments:[...p.monuments,{name:"",fee:""}]}));}}>+ Add</button>
            </>
          )}

          {/* ── REMARKS ── */}
          {secTitle("📝 Remarks")}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showRemarks}
                onChange={e=>setToggle("showRemarks",e.target.checked)}/> Show remarks in quotation
            </label>
          </div>
          {q.showRemarks && (
            <textarea style={{...inputStyle, minHeight:52, resize:"vertical"}}
              value={q.remarks} onChange={e=>setF("remarks",e.target.value)} placeholder="Any additional notes for this quotation..."/>
          )}

          {/* ── PRICE SLABS ── */}
          {secTitle("💰 Cost Per Person")}
          <div style={{ marginBottom:8 }}>
            <label style={labelStyle}>Currency</label>
            <select style={{...inputStyle, width:100}}
              value={q.currency} onChange={e=>setF("currency",e.target.value)}>
              {["US $","EUR","GBP","AUD","SGD","NTD","THB","INR","Other"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          {q.slabs.map((slab,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <input style={{...inputStyle, flex:3}} value={slab.label}
                onChange={e=>updateSlab(i,"label",e.target.value)}
                placeholder="e.g. 15–19 Pax + 01 T/L Free (Large Coach)"/>
              <div style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
                <span style={{ fontSize:12, color:G.gray600, whiteSpace:"nowrap" }}>{q.currency}</span>
                <input style={{...inputStyle}} value={slab.price}
                  onChange={e=>updateSlab(i,"price",e.target.value)} placeholder="237"/>
                <span style={{ fontSize:11, color:G.gray400, whiteSpace:"nowrap" }}>/ pax</span>
              </div>
              <span style={{ cursor:"pointer", color:G.gray400 }} onClick={()=>removeSlab(i)}>✕</span>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={addSlab}>+ Add Slab</button>

          {/* ── INCLUDES / EXCLUDES ── */}
          {["includes","excludes"].map(key=>(
            <div key={key}>
              {secTitle(key==="includes"?"✅ Cost Includes":"❌ Cost Does Not Include")}
              {q[key].map((item,i)=>(
                <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:G.gray400, minWidth:16 }}>{i+1}.</span>
                  <input style={{...inputStyle,flex:1}} value={item}
                    onChange={e=>updateList(key,i,e.target.value)}/>
                  <span style={{ cursor:"pointer", color:G.gray400 }}
                    onClick={()=>removeListItem(key,i)}>✕</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ fontSize:11 }}
                onClick={()=>addListItem(key)}>+ Add item</button>
            </div>
          ))}

          {/* ── CLOSING TEXT ── */}
          {secTitle("✍ Closing")}
          <div style={{ marginBottom:8 }}>
            <label style={labelStyle}>Closing paragraph</label>
            <textarea style={{...inputStyle, minHeight:52, resize:"vertical"}}
              value={q.closingLine} onChange={e=>setF("closingLine",e.target.value)}/>
          </div>
          <div>
            <label style={labelStyle}>Sign-off</label>
            <textarea style={{...inputStyle, minHeight:68, resize:"vertical"}}
              value={q.signoff} onChange={e=>setF("signoff",e.target.value)}/>
          </div>

          <div style={{ height:24 }} />
        </fieldset>}

        {/* FINAL PRICE AGREEMENT TAB */}
        {activeTab==='final' && (
          <fieldset disabled={readOnly} style={{ flex:1, overflowY:"auto", padding:"16px 20px", border:"none", margin:0, minWidth:0 }}>
            <div style={{background:"#FEF9E7",border:"1px solid #F9E79F",borderRadius:8,padding:12,marginBottom:16,fontSize:11,color:"#784212"}}>
              Required before this version can be marked final ★. Compose the actual agreed price as one or more lines — e.g. 18 pax on one slab + 2 pax on Single Supplement — pulling rates from this quotation's own slabs, or typing a custom rate when the agreed amount doesn't match any slab exactly.
            </div>

            {q.finalPriceEntries.map((e,i)=>(
              <div key={e.id} style={{display:"grid",gridTemplateColumns:"0.7fr 0.6fr 1fr 1.3fr 0.9fr auto",gap:8,marginBottom:8,alignItems:"end"}}>
                <div>
                  {i===0 && <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Pax Paying</div>}
                  <input style={{...inputStyle,width:"100%"}} type="number" value={e.paxPaying} onChange={ev=>updateFinalPriceEntry(i,"paxPaying",ev.target.value)} placeholder="e.g. 18"/>
                </div>
                <div>
                  {i===0 && <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}} title="Free of cost -- e.g. Tour Leader travelling free. Counts toward total headcount, not toward tour value.">FOC</div>}
                  <input style={{...inputStyle,width:"100%"}} type="number" value={e.foc} onChange={ev=>updateFinalPriceEntry(i,"foc",ev.target.value)} placeholder="0"/>
                </div>
                <div>
                  {i===0 && <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Rate Source</div>}
                  <select style={{...inputStyle,width:"100%"}} value={e.source} onChange={ev=>updateFinalPriceEntry(i,"source",ev.target.value)}>
                    <option value="slab">From a slab</option>
                    <option value="custom">Custom rate</option>
                  </select>
                </div>
                <div>
                  {i===0 && <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{e.source==="custom"?"Description":"Slab"}</div>}
                  {e.source==="slab" ? (
                    <select style={{...inputStyle,width:"100%"}} value={e.slabLabel} onChange={ev=>updateFinalPriceEntry(i,"slabLabel",ev.target.value)}>
                      <option value="">Select slab...</option>
                      {q.slabs.filter(s=>s.label).map((s,si)=><option key={si} value={s.label}>{s.label} — {q.currency} {s.price||0}/pax</option>)}
                    </select>
                  ) : (
                    <input style={{...inputStyle,width:"100%"}} value={e.slabLabel} onChange={ev=>updateFinalPriceEntry(i,"slabLabel",ev.target.value)} placeholder="e.g. Single Supplement"/>
                  )}
                </div>
                <div>
                  {i===0 && <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Rate ({q.currency})</div>}
                  <input style={{...inputStyle,width:"100%",background:e.source==="slab"?G.gray50:G.white}} type="number" value={e.rate}
                    readOnly={e.source==="slab"} onChange={ev=>updateFinalPriceEntry(i,"rate",ev.target.value)} placeholder="0"/>
                </div>
                <span style={{cursor:"pointer",color:G.gray400,fontSize:14}} onClick={()=>removeFinalPriceEntry(i)}>✕</span>
              </div>
            ))}
            <button className="btn btn-ghost" style={{fontSize:11,marginBottom:16}} onClick={addFinalPriceEntry}>+ Add Rate Line</button>

            <div style={{background:q.finalPriceEntries.length && isFinalPriceComplete(q.finalPriceEntries)?"#EAFAF1":G.gray50,border:`1px solid ${q.finalPriceEntries.length && isFinalPriceComplete(q.finalPriceEntries)?"#A9DFBF":G.gray200}`,borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:G.gray600}}>Pax Paying</span>
                <span style={{fontSize:13,fontWeight:700}}>{computeFinalPriceTotals(q.finalPriceEntries).paxPaying}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:G.gray600}}>FOC</span>
                <span style={{fontSize:13,fontWeight:700}}>{computeFinalPriceTotals(q.finalPriceEntries).foc}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${G.gray200}`}}>
                <span style={{fontSize:12,color:G.gray600,fontWeight:600}}>Total Confirmed Pax</span>
                <span style={{fontSize:13,fontWeight:700}}>{q.confirmedPax || 0}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:G.gray600}}>Total Tour Value</span>
                <span style={{fontSize:15,fontWeight:700,color:G.navy}}>{q.currency} {q.tourValue || 0}</span>
              </div>
              {!isFinalPriceComplete(q.finalPriceEntries) && (
                <div style={{fontSize:11,color:"#92400E",marginTop:8}}>⚠ Every line needs both Pax Paying and a rate before this version can be marked final. FOC is optional.</div>
              )}
            </div>

            {viewingVersion===finalVersion && finalVersion!=null && (
              <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:12,marginBottom:20}}>
                <div style={{fontSize:11,color:"#1A5276",marginBottom:8}}>
                  You're viewing v{finalVersion} — the version currently marked final ★. Group size often stays fluid until close to departure: if this is a refinement of the same agreed deal (not a new negotiation), update it in place instead of saving a new version.
                </div>
                <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>{
                  if (!isFinalPriceComplete(q.finalPriceEntries)) { alert("Every line needs Pax Paying and a rate before updating."); return; }
                  updateFinalPriceAgreement(db, query.id, finalVersion, q.finalPriceEntries, q.currency, currentUser?.name)
                    .then(() => {
                      setVersions(p => p.map(v => v.version===finalVersion ? {...v, finalPriceEntries: q.finalPriceEntries, confirmedPax: q.confirmedPax, tourValue: q.tourValue} : v));
                      loadFinalPriceAgreementAudits(db, query.id).then(setFinalPriceAudits);
                    });
                }}>🔄 Update Final Price (same version v{finalVersion})</button>
              </div>
            )}

            <div style={{borderTop:`1px solid ${G.gray200}`,paddingTop:14}}>
              <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Last Changes</div>
              {finalPriceAudits.length===0 ? (
                <div style={{fontSize:11,color:G.gray400}}>No changes logged yet — this fills in as the agreement is saved.</div>
              ) : finalPriceAudits.map((a,i)=>(
                <div key={i} style={{fontSize:11,color:G.gray600,marginBottom:6,paddingLeft:10,borderLeft:`2px solid ${G.gray200}`}}>
                  <strong>{a.by}</strong> · {a.at ? new Date(a.at).toLocaleString("en-IN") : ""}<br/>{a.action}
                </div>
              ))}
            </div>

            <div style={{ height:24 }} />
          </fieldset>
        )}

        {/* PREVIEW TAB */}
        {activeTab==='preview' && (
          <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
            <LetterheadToggleBar toggles={toggles} G={G}/>
            <div style={{flex:1,minHeight:0}}>
              <DocPreviewFrame
                title="Print Preview"
                html={previewError ? '<html><body style="font-family:monospace;padding:20px;color:#c00">Preview error: '+previewError+'</body></html>' : previewHTML}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex",
          gap:10, flexShrink:0, background:G.gray50, alignItems:"center" }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <input value={versionNote} onChange={e=>setVersionNote(e.target.value)} placeholder="Why this version? e.g. client requested discount"
            disabled={readOnly}
            style={{flex:1,padding:"7px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          <ExportMenu G={G} actions={[
            { id:"pdf",   label:"PDF",   icon:"📕", onSelect: printQuotation, hint:"Opens your browser's print dialog" },
            { id:"word",  label:"Word",  icon:"📄", onSelect: exportQuotationDocx, hint:"Downloads a .docx file" },
            { id:"print", label:"Print", icon:"🖨", onSelect: printQuotation, separatorBefore:true },
          ]}/>
          {saveError && (
            <span style={{fontSize:11,color:"#B91C1C",maxWidth:420}} title={saveError}>
              ⚠ Not saved — {saveError}
            </span>
          )}
          {!readOnly && (
            <button className="btn btn-primary" onClick={saveVersion} disabled={saving}>
              {saving ? "Saving…" : `💾 Save v${version}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TEMPLATE EDITOR (Admin only) ────────────────────────────────────────────
