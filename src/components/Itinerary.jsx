import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const { G, DEFAULT_ITINERARY_TEMPLATE, STAMP_B64, useLetterheadToggles, VersionDropdown, DayItemsEditor, itineraryItemHTML, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML, buildLetterheadDocument, buildPaginatedLetterheadDocument, buildDocxBlobFromBodyBlocks, downloadDocx, loadItineraryVersions, saveItineraryVersion, markItineraryVersionFinal, loadFinalCostSheetVersion, extractItineraryBuilderDaysFromCostSheet, loadPhotoLibrary, resolveDayImages, dayImageTextCandidates, buildBrochureDocument, brochureCSS, createMeasurementContext, domMeasureHeightPx, ExportMenu, logAudit, PlacePicker, fetchPlaceCandidates, searchGazetteerDb, buildMapDataFromResolvedDays, buildRouteMapSVG, buildSectorTableHTML, gatewayNoteHTML, partitionGateways, db } = Lib;

// Itinerary -- merges what used to be two separate documents, Brief
// Itinerary and Detailed Itinerary, into one. They always shared the same
// day-by-day structure (both used DayItemsEditor over the same items[]
// shape) and already saved into the same `itineraries` table, split only by
// an `activeTab` tag on each version. The only real difference was which
// extra fields Detailed carried on top -- a resolved place per day, photos,
// a generated map, a closing line -- and which layout each exported to.
//
// That made this a genuine merge, not a rewrite: one shared itinDays, one
// version history (the activeTab split is dropped -- see below), and a
// Brief/Detailed FLAVOR toggle that controls which extra fields are shown
// and which document each export button produces. Nothing about the day
// data itself differs between flavors; only the presentation and export
// layer does.
//
// VERSION HISTORY. Previously two independent sequences under one table,
// filtered apart by `activeTab`. Now a single sequence: every save is one
// point in this document's history, whichever flavor was being looked at
// when it was made. `activeTab` is still written (as the flavor active at
// save time) for anyone reading old data, but nothing filters on it any
// more -- history is no longer split by which tab happened to be open.
//
// PULL FROM BRIEF is GONE. It existed to bring the Brief draft's days into
// Detailed's separate draft. With one shared itinDays there is no longer a
// separate draft to pull from -- editing a day updates both flavors at
// once, which is the entire point of merging them. Pull from Cost Sheet is
// kept: that is still a genuinely separate upstream document.
//
// NOT GATED TO TOUR-FILE STAGE. Like Brief always was: itinerary content is
// drafted while a query is still being won, not only after conversion.
export default function Itinerary({ query, briefTemplate, detailTemplate, onClose, currentUser, readOnly }) {
  const [docFlavor, setDocFlavor] = useState("brief"); // 'brief' | 'detailed'
  const [tourTitle, setTourTitle] = useState(query.destination || "");
  const [tagline, setTagline] = useState("");
  const [route, setRoute] = useState("");
  const [duration, setDuration] = useState(`${query.nights || "?"} Days / ${query.nights ? Number(query.nights)-1 : "?"} Nights`);
  const [itinDays, setItinDays] = useState([
    { id:1, dayLabel:"DAY-1", title:"Arrival", meals:["D"], items:[] },
    { id:2, dayLabel:"DAY-2", title:"", meals:["B","L","D"], items:[] },
    { id:3, dayLabel:"DAY-3", title:"", meals:["B","L","D"], items:[] },
  ]);
  // Closing line and Remarks, now per flavor -- each was Detailed-only
  // before. A short internal remark for Brief has no reason to be a long
  // client-facing paragraph, and vice versa, so each flavor gets its own
  // independent field rather than one shared text box.
  const DEFAULT_CLOSING = "Tour ends as you leave footprints and take memories.";
  const [briefClosingText, setBriefClosingText] = useState(DEFAULT_CLOSING);
  const [detailedClosingText, setDetailedClosingText] = useState(DEFAULT_CLOSING);
  const [briefRemarks, setBriefRemarks] = useState("");
  const [detailedRemarks, setDetailedRemarks] = useState("");
  const closingText = docFlavor === "brief" ? briefClosingText : detailedClosingText;
  const setClosingText = docFlavor === "brief" ? setBriefClosingText : setDetailedClosingText;
  const remarksText = docFlavor === "brief" ? briefRemarks : detailedRemarks;
  const setRemarksText = docFlavor === "brief" ? setBriefRemarks : setDetailedRemarks;
  const [viewMode, setViewMode] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerFooterAllPages, printOnLetterhead } = toggles;

  const [versions, setVersions] = useState([]);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionNote, setVersionNote] = useState("");

  // Separate save-history per flavor, restored per your call: it should be
  // possible to browse and mark final "Brief v3" independently of
  // "Detailed v2" -- they are different documents in every way that
  // matters for review and sign-off, even though editing them draws from
  // one shared working set of days. Old data with no activeTab at all is
  // treated as Brief's, since Brief is what this document always was
  // before Detailed existed.
  const flavorVersions = versions.filter(v => (v.activeTab || "brief") === docFlavor);
  const finalVersion = (flavorVersions.find(v => v.isFinal) || {}).version || null;
  const nextVersion = flavorVersions.length ? Math.max(...flavorVersions.map(v => v.version)) + 1 : 1;

  const loadVersionIntoDraft = (v) => {
    setTourTitle(v.tourTitle || query.destination || "");
    setTagline(v.tagline || "");
    setRoute(v.route || "");
    setDuration(v.duration || duration);
    setItinDays(v.days && v.days.length ? v.days : itinDays);
    setBriefClosingText(v.briefClosingText || DEFAULT_CLOSING);
    setDetailedClosingText(v.detailedClosingText || v.closingText || DEFAULT_CLOSING);
    setBriefRemarks(v.briefRemarks || "");
    setDetailedRemarks(v.detailedRemarks || "");
    setRouteMapImage(v.routeMapImage ?? null);
    setDayImageOverrides(v.dayImageOverrides || {});
    setPulledFromCostSheetVersion(v.pulledFromCostSheetVersion ?? null);
    setViewingVersion(v.version);
  };

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
      const extracted = extractItineraryBuilderDaysFromCostSheet(source.days);
      if (extracted.length > 0) setItinDays(extracted);
      setPulledFromCostSheetVersion(source.version);
      setPullMessage(`Pulled from Cost Sheet v${source.version}.`);
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    }
    setPulling(false);
  };

  // Detailed-flavor extras: photo library, per-day place candidates,
  // per-day photo overrides, an optionally uploaded route-map image.
  const [photoLibrary, setPhotoLibrary] = useState([]);
  const [placeCandidates, setPlaceCandidates] = useState({});
  const [dayImageOverrides, setDayImageOverrides] = useState({});
  const [routeMapImage, setRouteMapImage] = useState(null);

  useEffect(() => {
    // Optional: if the photo table/bucket doesn't exist yet, the brochure
    // simply renders without photography rather than failing.
    loadPhotoLibrary(db).then(({ photos }) => setPhotoLibrary(photos));
    loadItineraryVersions(db, query.id).then(loaded => {
      // The DRAFT you land on is the single overall latest save, regardless
      // of which flavor tab was open when it happened -- editing is one
      // shared working session across both tabs. What IS split by flavor is
      // the browsable history below (flavorVersions) and each flavor's own
      // version numbering: two independent, reviewable timelines you can
      // mark final on their own, even though they both draw from the same
      // day-by-day working set while you edit.
      if (loaded.length === 0) {
        loadFinalCostSheetVersion(db, query.id).then(finalV => {
          if (finalV) { setFinalCostSheetVersion(finalV); pullFromCostSheet(finalV); }
        });
        return;
      }
      setVersions(loaded);
      loadVersionIntoDraft(loaded[loaded.length - 1]);
      loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion && pulledFromCostSheetVersion !== finalCostSheetVersion.version;

  // Version list is only updated AFTER the insert is confirmed -- see the
  // pre-merge components' history for why an optimistic update here once
  // made a failed save look identical to a successful one.
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveVersion = async () => {
    const snap = {
      version: nextVersion, tourTitle, tagline, route, duration,
      // Recorded for anyone reading history, not filtered on any more.
      activeTab: docFlavor,
      days: [...itinDays], note: versionNote,
      pulledFromCostSheetVersion, routeMapImage, dayImageOverrides,
      briefClosingText, detailedClosingText, briefRemarks, detailedRemarks,
    };
    setSaving(true);
    setSaveError(null);
    const { error } = await saveItineraryVersion(db, query.id, snap, currentUser?.id);
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    logAudit(db, query.id, currentUser?.name, `Itinerary v${nextVersion} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(nextVersion);
    setVersionNote("");
  };

  const updateDay = (i, field, val) => setItinDays(prev => prev.map((d,idx) => idx===i ? {...d,[field]:val} : d));
  const toggleMeal = (i, m) => setItinDays(prev => prev.map((d,idx) => {
    if (idx!==i) return d;
    const meals = d.meals.includes(m) ? d.meals.filter(x=>x!==m) : [...d.meals, m].sort();
    return {...d, meals};
  }));
  const addDay = () => setItinDays(prev => [...prev, { id:Date.now(), dayLabel:`DAY-${prev.length+1}`, title:"", meals:["B","L","D"], items:[] }]);
  const removeDay = (i) => setItinDays(prev => prev.filter((_,idx)=>idx!==i));

  const placeQueryFor = (day) =>
    (dayImageTextCandidates(day)[0]) || day.title || day.dayLabel || "";

  // Rule-based day-title suggestion: the same "what is this day actually
  // about" question dayImageTextCandidates already answers for photo
  // search, reused here so a day title doesn't have to be typed from
  // scratch. Deliberately not calling an AI model -- the shape (day's
  // items -> a short heading) is exactly what a future LLM call would take
  // as input, so swapping this out later is a one-line change, but nothing
  // here should depend on an API key or model choice being decided yet.
  const suggestDayTitle = (day) => {
    const text = dayImageTextCandidates(day)[0];
    if (!text) return "";
    return text.length > 40 ? text.slice(0, 37).trimEnd() + "…" : text;
  };

  // Fetches a SMALL candidate set per day from the real gazetteer -- not
  // the whole table -- for the Detailed flavor's PlacePicker. Skips a day
  // that already has an explicit choice, and re-fetches only when a day's
  // derived query text actually changes.
  const placeQuerySignature = itinDays.map(d => `${d.id}:${d.place ? "chosen" : placeQueryFor(d)}`).join("|");
  useEffect(() => {
    let cancelled = false;
    itinDays.forEach(async (d) => {
      if (d.place) return;
      const q = placeQueryFor(d);
      if (!q || q.trim().length < 2) return;
      const cached = placeCandidates[d.id];
      if (cached && cached.query === q) return;
      const rows = await fetchPlaceCandidates(db, q);
      if (!cancelled) setPlaceCandidates(prev => ({ ...prev, [d.id]: { query: q, rows } }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeQuerySignature]);

  const inp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };

  // Both plain builders share this shape: title block, day-by-day content,
  // then Remarks (if any) above the per-instance Closing Line (if any)
  // above the template's own default closing tagline, which always renders
  // exactly as it did before either of the new fields existed.
  const buildDayBlocks = (flavor) => itinDays.map(d => {
    const mealStr = d.meals.map(m => `<span style="background:#FEF3C7;color:#92400E;padding:2pt 7pt;border-radius:10pt;font-size:8.5pt;margin-right:4pt;font-weight:600">${m==="B"?"Breakfast":m==="L"?"Lunch":"Dinner"}</span>`).join("");
    return { text: `<div style="margin-bottom:14pt">
        <div style="font-size:11pt;font-weight:bold;color:#1A3A52;margin-bottom:2pt">${d.dayLabel}${d.title?" | "+d.title:""}</div>
        ${(d.items||[]).map(item => itineraryItemHTML(item, flavor)).join("")}
        <div style="margin-top:5pt">${mealStr}</div>
      </div>` };
  }).map(b => b.text);

  const buildClosingBlock = (tmpl, remarks, closing, stampHTML) => `
    ${remarks ? `<div style="margin-top:16pt;font-size:9.5pt;color:#333;white-space:pre-wrap"><strong style="color:#1A3A52">Remarks</strong><br/>${remarks}</div>` : ""}
    ${closing ? `<div style="margin-top:${remarks?"8pt":"16pt"};font-size:9.5pt;color:#333;white-space:pre-wrap">${closing}</div>` : ""}
    <div style="text-align:center;margin-top:18pt;font-size:9.5pt;color:#8B1A1A;font-weight:bold;letter-spacing:1pt">
      ${tmpl.closingTagline}
    </div>
    ${stampHTML}`;

  const titleBlockFor = () => `
    <div style="text-align:center;margin-bottom:16pt">
      <div class="inv-title" style="margin-bottom:2pt">${tourTitle||"Tour Itinerary"}</div>
      <div style="font-size:11pt;font-weight:600;color:#1A3A52">${duration}</div>
      ${route?`<div style="font-size:10pt;color:#666;margin-top:2pt">${route}</div>`:''}
      ${tagline?`<div style="font-size:9.5pt;font-style:italic;color:#666;margin-top:4pt">"${tagline}"</div>`:''}
    </div>
    <div style="height:2pt;background:linear-gradient(90deg,#cb0f0f,#061bb0);border-radius:2pt;margin-bottom:14pt"></div>
    <div style="text-align:center;font-size:12pt;font-weight:700;letter-spacing:2pt;color:#1A3A52;margin-bottom:14pt">ITINERARY</div>`;

  // ─── BRIEF: plain paginated letterhead, no photos ─────────────────────
  const buildBriefPrintHTML = (asBlocks) => {
    const tmpl = { ...DEFAULT_ITINERARY_TEMPLATE, ...(briefTemplate || {}) };
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin:14pt auto 0" alt="Stamp"/>` : '';
    const docArgs = {
      title: `${tourTitle} — Brief Itinerary`,
      bodyBlocks: [titleBlockFor(), ...buildDayBlocks("brief"), buildClosingBlock(tmpl, briefRemarks, briefClosingText, stampHTML)],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    };
    if (asBlocks) return docArgs;
    return buildPaginatedLetterheadDocument(docArgs);
  };
  const exportBriefDocx = async () => {
    const args = await buildBriefPrintHTML(true);
    const blob = await buildDocxBlobFromBodyBlocks({
      bodyBlocks: args.bodyBlocks,
      toggles: { headerFooterAllPages: args.headerFooterAllPages, printOnLetterhead: args.printOnLetterhead, showPageNum: args.showPageNum },
      orientation: args.orientation,
    });
    await downloadDocx(blob, `Brief Itinerary - ${query.groupName||query.clientName}`);
  };
  const printBrief = async () => printHTML(await buildBriefPrintHTML());

  // ─── DETAILED: plain letterhead (internal) ─────────────────────────────
  // Uses the same paginated/asBlocks builder as Brief now, which is what
  // makes a Detailed Word export possible -- the old buildLetterheadDocument
  // path never produced bodyBlocks, only finished HTML.
  const buildDetailedPrintHTML = (asBlocks) => {
    const tmpl = { ...DEFAULT_ITINERARY_TEMPLATE, ...(detailTemplate || {}) };
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin:14pt auto 0" alt="Stamp"/>` : '';
    const docArgs = {
      title: `${tourTitle} — Itinerary`,
      bodyBlocks: [titleBlockFor(), ...buildDayBlocks("detailed"), buildClosingBlock(tmpl, detailedRemarks, detailedClosingText, stampHTML)],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    };
    if (asBlocks) return docArgs;
    return buildPaginatedLetterheadDocument(docArgs);
  };
  const exportDetailedDocx = async () => {
    const args = await buildDetailedPrintHTML(true);
    const blob = await buildDocxBlobFromBodyBlocks({
      bodyBlocks: args.bodyBlocks,
      toggles: { headerFooterAllPages: args.headerFooterAllPages, printOnLetterhead: args.printOnLetterhead, showPageNum: args.showPageNum },
      orientation: args.orientation,
    });
    await downloadDocx(blob, `Detailed Itinerary - ${query.groupName||query.clientName}`);
  };
  const printDetailedInternal = async () => printHTML(await buildDetailedPrintHTML());

  // ─── DETAILED: client-facing brochure, with photos and generated map ──
  const buildBrochureHTML = () => {
    const ctx = createMeasurementContext(brochureCSS());
    try {
      const { stops, sectors } = buildMapDataFromResolvedDays(itinDays);
      const { ground, gateways } = partitionGateways(stops, sectors);
      const mapHTML = ground.length ? buildRouteMapSVG({ stops: ground, sectors }) : "";
      const sectorTableHTML = stops.length
        ? buildSectorTableHTML(sectors, undefined, itinDays.map(d => ({ title: d.place ? d.place.name : d.title })))
        : "";
      const gatewayNote = gatewayNoteHTML(gateways);
      return buildBrochureDocument({
        cover: {
          title: tourTitle || query.groupName || "Itinerary",
          tagline, duration, route,
          heroImage: resolveDayImages(itinDays, photoLibrary, dayImageOverrides)[itinDays[0] && itinDays[0].id] || null,
        },
        days: itinDays,
        dayImages: resolveDayImages(itinDays, photoLibrary, dayImageOverrides),
        mapHTML, sectorTableHTML, gatewayNote,
        routeMapImage,
        // The brochure is always Detailed's own document regardless of
        // which tab happens to be open when Export is clicked -- it must
        // use detailedRemarks/detailedClosingText directly, never the
        // tab-dependent closingText/remarksText computed above (those are
        // for the editor fields, which correctly follow the active tab).
        remarksText: detailedRemarks,
        closingText: detailedClosingText,
        footerLabel: tourTitle || query.groupName || "",
        measureFn: (html, width) => domMeasureHeightPx(html, width, ctx.doc),
      });
    } finally {
      ctx.cleanup();
    }
  };
  const printBrochure = () => printHTML(buildBrochureHTML());

  // Preview follows whichever flavor tab is active, so what you see is what
  // the matching export produces.
  const [previewHTML, setPreviewHTML] = useState("");
  useEffect(() => {
    if (viewMode !== "preview") return;
    let cancelled = false;
    if (docFlavor === "brief") {
      buildBriefPrintHTML().then(html => { if (!cancelled) setPreviewHTML(html); });
    } else {
      buildDetailedPrintHTML().then(html => { if (!cancelled) setPreviewHTML(html); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, docFlavor, tourTitle, tagline, route, duration, itinDays, briefClosingText, detailedClosingText, briefRemarks, detailedRemarks, showStamp, headerFooterAllPages, printOnLetterhead, showPageNum]);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:780, height:"100vh", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>ITINERARY · {flavorVersions.length>0?`v${nextVersion-1} saved`:"unsaved"}</div>
              <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
                {query.groupName||query.clientName||query.agentName}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.tourFileId||query.id} · {query.destination}</div>
            </div>
            <VersionDropdown
              versions={flavorVersions}
              viewingVersion={viewingVersion}
              displayVersion={nextVersion-1}
              finalVersion={finalVersion}
              onSelectVersion={loadVersionIntoDraft}
              onMarkFinal={(v) => {
                markItineraryVersionFinal(db,query.id,v.version,v.activeTab || docFlavor);
                setVersions(prev => prev.map(x =>
                  (x.activeTab || "brief") !== (v.activeTab || docFlavor) ? x
                  : { ...x, isFinal: x.version === v.version }));
                logAudit(db,query.id,currentUser?.name,`Itinerary v${v.version} (${v.activeTab || docFlavor}) marked final`);
              }}
              readOnly={readOnly}
              G={G}
            />
            {!readOnly && <button onClick={saveVersion} disabled={saving} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>{saving ? "Saving…" : `💾 Save v${nextVersion}`}</button>}
            <button onClick={onClose} className="btn btn-ghost" style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
          </div>
          {isStaleVsCostSheet && !readOnly && (
            <div style={{background:"#FEF9E7",border:"1px solid #F7DC6F",borderRadius:6,padding:"6px 10px",fontSize:10.5,color:"#7D6608",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{flex:1}}>
                Cost Sheet v{finalCostSheetVersion.version} (final) has route/hotel data
                {pulledFromCostSheetVersion ? ` newer than what this was last pulled from (v${pulledFromCostSheetVersion})` : " that hasn't been pulled in yet"}.
              </span>
              <button onClick={()=>pullFromCostSheet(finalCostSheetVersion)} disabled={pulling} className="btn btn-primary" style={{fontSize:10.5,padding:"3px 8px",flexShrink:0}}>
                {pulling ? "Pulling…" : "↻ Pull latest"}
              </button>
            </div>
          )}
          {pullMessage && (
            <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:6,padding:"6px 10px",fontSize:10.5,color:"#1E40AF",marginBottom:8}}>
              {pullMessage}
            </div>
          )}
        </div>

        {/* Brief / Detailed flavor toggle -- a different axis from the
            Content/Preview DocTabBar below it. This controls which extra
            fields show and which document each export produces; it does
            not change itinDays, which both flavors share. */}
        <div style={{ display:"flex", gap:4, padding:"8px 18px 0", background:G.white }}>
          {[["brief","Brief"],["detailed","Detailed"]].map(([id,label]) => (
            <button key={id} onClick={() => setDocFlavor(id)}
              style={{ padding:"6px 14px", borderRadius:6, border:`1px solid ${docFlavor===id ? G.navy : G.gray200}`,
                background: docFlavor===id ? G.navy : G.white, color: docFlavor===id ? "#fff" : G.gray600,
                cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"'Inter',sans-serif", marginRight:6 }}>
              {label}
            </button>
          ))}
        </div>

        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>
        {docFlavor === "detailed" && <LetterheadToggleBar toggles={toggles} G={G}/>}

        {viewMode === "content" ? (
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

            {/* Tour meta -- shared by both flavors */}
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

            {/* Day cards -- shared structure; detailed-only extras (place
                picker) appear only when that flavor is active. */}
            {itinDays.map((d,i)=>(
              <div key={d.id} style={{ background:G.white, border:`1px solid ${G.gray200}`, borderRadius:10, marginBottom:10, overflow:"hidden" }}>
                <div style={{ background:G.gray50, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${G.gray200}` }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:G.navy, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1, display:"flex", gap:8 }}>
                    <input style={{...inp, width:70, textAlign:"center", fontWeight:600}} value={d.dayLabel} onChange={e=>updateDay(i,"dayLabel",e.target.value)}/>
                    <input style={{...inp, flex:1, fontWeight:600}} value={d.title} onChange={e=>updateDay(i,"title",e.target.value)} placeholder="Day title e.g. Arrival at Delhi"/>
                    {!readOnly && !d.title && (
                      // Rule-based suggestion from the day's own text -- see
                      // suggestDayTitle above for why this is not an AI call
                      // yet, and what would change if it became one.
                      <button type="button" className="btn btn-ghost" style={{ fontSize:10, flexShrink:0 }}
                        title="Suggest a title from this day's own text"
                        onClick={() => { const s = suggestDayTitle(d); if (s) updateDay(i, "title", s); }}>
                        ✨ Suggest
                      </button>
                    )}
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

                {docFlavor === "detailed" && (
                  <div style={{ padding:"8px 14px 0" }}>
                    <PlacePicker
                      query={placeQueryFor(d)}
                      value={d.place}
                      gazetteer={(placeCandidates[d.id] && placeCandidates[d.id].rows) || []}
                      context={itinDays.filter((x, xi) => xi !== i && x.place).map(x => x.place)}
                      onChange={(place) => updateDay(i, "place", place)}
                      onSearch={(term) => searchGazetteerDb(db, term)}
                      G={G}
                      inp={inp}
                      readOnly={readOnly}
                    />
                  </div>
                )}

                <div style={{ padding:"12px 14px" }}>
                  <DayItemsEditor
                    items={d.items}
                    onChange={(items) => updateDay(i, "items", items)}
                    style={docFlavor}
                    G={G}
                    inp={inp}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ fontSize:11, marginBottom:24 }} onClick={addDay}>+ Add Day</button>

            <div style={{ background:G.white, border:`1px solid ${G.gray200}`, borderRadius:10, padding:14, marginBottom:24 }}>
              <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Remarks</div>
              <textarea style={{ ...inp, minHeight:64, resize:"vertical", lineHeight:1.5 }} value={remarksText} disabled={readOnly}
                onChange={e=>setRemarksText(e.target.value)}
                placeholder="Internal note or reminder for this document"/>
              <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", margin:"12px 0 3px" }}>Closing Line / Sign-off</div>
              <textarea style={{ ...inp, minHeight:64, resize:"vertical", lineHeight:1.5 }} value={closingText} disabled={readOnly}
                onChange={e=>setClosingText(e.target.value)}
                placeholder="Tour ends as you leave footprints and take memories."/>
            </div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
            <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
              <DocPreviewFrame html={previewHTML}/>
            </div>
          </div>
        )}

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex", gap:10, flexShrink:0, background:G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{ flex:1 }}/>
          <ExportMenu G={G} actions={[
            { id:"brief-pdf",  label:"Brief PDF",       icon:"📕", onSelect: printBrief,     hint:"Plain letterhead, no photos" },
            { id:"brief-word", label:"Brief Word",      icon:"📄", onSelect: exportBriefDocx, hint:"Downloads a .docx file" },
            { id:"det-pdf",    label:"Detailed PDF",    icon:"📗", onSelect: printBrochure,  hint:"Client-facing, with photos", separatorBefore:true },
            { id:"det-word",   label:"Detailed Word",   icon:"📄", onSelect: exportDetailedDocx, hint:"Downloads a .docx file" },
            { id:"print",      label:"Print",           icon:"🖨", onSelect: docFlavor === "brief" ? printBrief : printDetailedInternal, separatorBefore:true },
          ]}/>
          {!readOnly && <button onClick={saveVersion} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : `💾 Save v${nextVersion}`}</button>}
          {saveError && (
            <span style={{fontSize:11,color:"#B91C1C",maxWidth:420}} title={saveError}>
              ⚠ Not saved — {saveError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
