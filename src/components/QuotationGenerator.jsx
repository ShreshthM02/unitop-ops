import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, loadQuotationVersions, saveQuotationVersion, markQuotationVersionFinal, computeFinalPriceTotals, isFinalPriceComplete, loadFinalPriceAgreementAudits, logFinalPriceAgreementChange, logAudit, updateFinalPriceAgreement, loadCostSheetVersions, mapDbCostSheetRow, calcCostSheetSlabFinalPrice, calcCostSheetTlSlabFinalPrice, loadFinalCostSheetVersion, extractItineraryFromCostSheetDays, extractHotelsFromCostSheetDays, db } = Lib;

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
      { day:"Day 01", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 02", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 03", movement:"", bf:"", lunch:"", dinner:"" },
      { day:"Day 04", movement:"", bf:"", lunch:"", dinner:"" },
    ],
    hotels: [
      { place:"", nights:"", hotel:"" },
    ],
    includes:  [...template.includes],
    excludes:  [...template.excludes],
    monuments: [...template.monuments],
    showMonuments: template.showMonuments,
    greeting:  template.greeting,
    openingLine: template.openingLine,
    closingLine: template.closingLine,
    signoff:   template.signoff,
    monumentNote: template.monumentNote,
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
      if (!match) { setPullMessage("Could not find the linked Cost Sheet version."); setPulling(false); return; }

      // Addressee: Cost Sheet's own Client / Foreign Agent field, if set
      const attnCompany = match.clientAgentName || q.attnCompany;

      // Itinerary and accommodation: both now come from the shared
      // extraction library (utils.js), not duplicated inline logic --
      // Meal Plan and Itinerary Builder use the same functions (Phase 4
      // of the Document Chain plan).
      const extracted = extractItineraryFromCostSheetDays(match.days);
      const itinerary = extracted.map(d => ({ day: d.day, movement: d.movement, bf: d.breakfast, lunch: d.lunch, dinner: d.dinner }));
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
    }
    setPulling(false);
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
    if (!costSheetId) return;
    loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
  }, [query.id, costSheetId]);
  const isStaleVsCostSheet = costSheetId && finalCostSheetVersion &&
    q.pulledFromCostSheetVersion !== finalCostSheetVersion.version;
  const pullLatestFinal = () => { if (finalCostSheetVersion) pullFromCostSheet(finalCostSheetVersion); };

  const saveVersion = () => {
    const snap = { ...q, version, note: versionNote };
    setVersions(p => [...p.filter(v => v.version !== version), snap]);
    saveQuotationVersion(db, query.id, snap, currentUser?.id);
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
  const [showHeader,   setShowHeader]   = useState(true);
  const [showFooter,   setShowFooter]   = useState(false);
  const [showPageNum,  setShowPageNum]  = useState(false);
  const [showStamp,    setShowStamp]    = useState(false);
  const [printOnLetterhead, setPrintOnLetterhead] = useState(false);
  // Turning this on supersedes the header/footer toggles (physical letterhead
  // paper already carries the artwork on every sheet), so switch them off
  // rather than leaving conflicting controls active.
  const togglePrintOnLetterhead = () => setPrintOnLetterhead(p => {
    const next = !p;
    if (next) { setShowHeader(false); setShowFooter(false); }
    return next;
  });
  const setF = (k, v) => setQ(prev => ({ ...prev, [k]: v }));
  const updateSlab = (i, field, val) => setQ(prev => ({
    ...prev, slabs: prev.slabs.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
  }));
  const addSlab = () => setQ(prev => ({ ...prev, slabs: [...prev.slabs, { label:"", price:"" }] }));
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
    ...prev, itinerary: [...prev.itinerary, { day:`Day ${String(prev.itinerary.length+1).padStart(2,"0")}`, movement:"", bf:"", lunch:"", dinner:"" }]
  }));
  const updateHotel = (i, field, val) => setQ(prev => ({
    ...prev, hotels: prev.hotels.map((r,idx) => idx===i ? {...r,[field]:val} : r)
  }));
  const addHotelRow = () => setQ(prev => ({ ...prev, hotels: [...prev.hotels, {place:"",nights:"",hotel:""}] }));
  const updateList = (key, i, val) => setQ(prev => ({ ...prev, [key]: prev[key].map((x,idx)=>idx===i?val:x) }));
  const addListItem = (key) => setQ(prev => ({ ...prev, [key]: [...prev[key], ""] }));
  const removeListItem = (key, i) => setQ(prev => ({ ...prev, [key]: prev[key].filter((_,idx)=>idx!==i) }));
  const updateMonument = (i, field, val) => setQ(prev => ({
    ...prev, monuments: prev.monuments.map((m,idx)=>idx===i?{...m,[field]:val}:m)
  }));

  const buildPrintHTML = () => {
    const stampHTMLQ = showStamp ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Stamp"/>` : '';

    const addresseeBlock = `
    <div style="margin-bottom:10pt;font-size:9pt;">
      ${q.attnName ? '<div><strong>KIND ATTN:</strong> '+q.attnName+(q.attnCompany?', '+q.attnCompany:'')+(q.attnCity?', '+q.attnCity:'')+'</div>' : ''}
      <div><strong>Date:</strong> ${q.date}</div>
      ${q.refLine ? '<div style="margin-top:6pt;"><strong>RE:</strong> '+q.refLine+'</div>' : ''}
    </div>
    <div style="font-style:italic;font-weight:bold;margin:12pt 0;font-size:10pt;">${q.greeting}</div>
    <p style="font-size:9.5pt;margin-bottom:10pt;">${q.openingLine}</p>`;

    const itineraryBlock = `
    <h2>Day-wise Itinerary</h2>
    <table class="content-table"><thead><tr><th>Day</th><th>Itinerary</th><th>B/F</th><th>Lunch</th><th>Dinner</th></tr></thead>
    <tbody>${q.itinerary.map(r=>'<tr><td><strong>'+r.day+'</strong></td><td>'+r.movement+'</td><td>'+(r.bf||'—')+'</td><td>'+(r.lunch||'—')+'</td><td>'+(r.dinner||'—')+'</td></tr>').join('')}</tbody></table>`;

    const accommodationBlock = `
    <h2>Accommodation</h2>
    <table class="content-table"><thead><tr><th>Place</th><th>Nights</th><th>Hotel</th></tr></thead>
    <tbody>${q.hotels.map(h=>'<tr><td>'+h.place+'</td><td>'+h.nights+'</td><td>'+h.hotel+'</td></tr>').join('')}</tbody></table>`;

    const priceBlock = `
    <h2>Cost Per Person (${q.currency})</h2>
    <table class="content-table price-table"><thead><tr><th>Group Size</th><th>Rate</th></tr></thead>
    <tbody>${q.slabs.map(s=>'<tr><td>'+s.label+'</td><td><strong>'+q.currency+' '+s.price+'</strong> Per Pax</td></tr>').join('')}</tbody></table>
    ${q.showMonuments ? '<h2>'+q.monumentNote+'</h2><table class="content-table"><thead><tr><th>Monument</th><th>Fee</th></tr></thead><tbody>'+q.monuments.map(m=>'<tr><td>'+m.name+'</td><td>'+m.fee+'</td></tr>').join('')+'</tbody></table>' : ''}`;

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

    return buildLetterheadDocument({
      title: `Quotation — ${q.attnCompany}`,
      extraHeadCSS: `
        h2{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;margin:10pt 0 4pt;border-bottom:1pt solid #ddd;padding-bottom:2pt;color:#1A3A52;}
        .price-table td:last-child{font-weight:bold;color:#C0392B;}
        ol,ul{margin:3pt 0 0 14pt;padding:0;}
        li{margin-bottom:2pt;font-size:9pt;}
      `,
      bodyBlocks: [addresseeBlock, itineraryBlock, accommodationBlock, priceBlock, inclusionsBlock, closingBlock],
      headerAllPages: showHeader,
      footerAllPages: showFooter,
      showHeader: true,
      showFooter: showFooter,
      printOnLetterhead,
      showPageNum,
    });
  };

  const printQuotation = () => {
    const win = window.open("", "_blank");
    if (!win) { alert('Please allow pop-ups for this site to print/export PDF.'); return; }
    win.document.write(buildPrintHTML());
    win.document.close();
    setTimeout(()=>win.print(), 500);
  };

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
          {versions.length > 0 && (
            <div style={{display:"flex",gap:4}}>
              {versions.map(v=>(
                <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                  <div onClick={()=>loadVersionIntoDraft(v)} title={v.note||`View v${v.version}`}
                    style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                    v{v.version}
                  </div>
                  <div onClick={()=>{
                      if (readOnly) return;
                      if (!isFinalPriceComplete(v.finalPriceEntries)) {
                        alert('Before marking this version final: open it, go to the "Final Price" tab, add at least one rate line with pax and rate filled in, then save it again.');
                        return;
                      }
                      setFinalVersion(v.version);markQuotationVersionFinal(db,query.id,v.version);
                      logAudit(db,query.id,currentUser?.name,`Quotation v${v.version} marked final`);
                    }} title="Mark as final"
                    style={{padding:"3px 6px",background:finalVersion===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                    {finalVersion===v.version?"★":"☆"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {costSheetId && !readOnly && (
            <button onClick={()=>pullFromCostSheet()} disabled={pulling} className="btn btn-ghost" style={{ fontSize:11 }}
              title="Pull addressee, itinerary, accommodation, and pricing from the linked Cost Sheet">
              {pulling ? "Pulling…" : "↻ Pull from Cost Sheet"}
            </button>
          )}
          <button onClick={printQuotation} className="btn btn-success" style={{ fontSize:11 }}>
            🖨 Print / PDF
          </button>
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

        {/* Toggles */}
        <div style={{padding:'7px 18px',background:G.gray50,borderBottom:`1px solid ${G.gray200}`,display:'flex',gap:16,flexShrink:0,alignItems:'center',flexWrap:'wrap'}}>
          {(()=>{const Tog=({label,val,onToggle,disabled})=>(<label style={{display:'flex',alignItems:'center',gap:6,cursor:disabled?'not-allowed':'pointer',fontSize:11,color:disabled?G.gray400:G.gray600,opacity:disabled?0.55:1}}><div onClick={disabled?undefined:onToggle} style={{width:30,height:16,borderRadius:8,background:val?G.navy:G.gray200,position:'relative',flexShrink:0,transition:'background .2s'}}><div style={{position:'absolute',top:2,left:val?14:2,width:12,height:12,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/></div>{label}</label>);return(<><Tog label="Header on all pages" val={showHeader}  onToggle={()=>setShowHeader(p=>!p)} disabled={printOnLetterhead}/><Tog label="Footer on all pages" val={showFooter}  onToggle={()=>setShowFooter(p=>!p)} disabled={printOnLetterhead}/><Tog label="Page number"         val={showPageNum} onToggle={()=>setShowPageNum(p=>!p)}/><Tog label="Digital stamp"       val={showStamp}   onToggle={()=>setShowStamp(p=>!p)}/><span style={{width:1,alignSelf:'stretch',background:G.gray200}}/><Tog label="🖨 Print on Letterhead" val={printOnLetterhead} onToggle={togglePrintOnLetterhead}/></>);})()}
        </div>
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

        {activeTab==='content' && <fieldset disabled={readOnly} style={{ flex:1, overflowY:"auto", padding:"16px 20px", border:"none", margin:0, minWidth:0 }}>

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
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, marginBottom:8 }}>
            <thead>
              <tr style={{ background:G.gray100 }}>
                {["Day","Movement / Itinerary","B'Fast","Lunch","Dinner",""].map(h=>(
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

          {/* ── MONUMENTS ── */}
          {secTitle("🏛 Monument Fees")}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:G.gray800, display:"flex", alignItems:"center", gap:6 }}>
              <input type="checkbox" checked={q.showMonuments}
                onChange={e=>setF("showMonuments",e.target.checked)}/> Show monument fees in quotation
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
                onClick={()=>setQ(p=>({...p,monuments:[...p.monuments,{name:"",fee:""}]}))}>+ Add</button>
            </>
          )}

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
          <div style={{flex:1,overflowY:'auto',background:'#525659',display:'flex',justifyContent:'center',padding:'20px 0'}}>
            <iframe
              title="Print Preview"
              srcDoc={(()=>{try{return buildPrintHTML();}catch(e){return '<html><body style="font-family:monospace;padding:20px;color:#c00">Preview error: '+e.message+'</body></html>';}})()}
              style={{width:'210mm',minHeight:'297mm',border:'none',boxShadow:'0 4px 24px rgba(0,0,0,0.35)',background:'#fff'}}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex",
          gap:10, flexShrink:0, background:G.gray50, alignItems:"center" }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <input value={versionNote} onChange={e=>setVersionNote(e.target.value)} placeholder="Why this version? e.g. client requested discount"
            disabled={readOnly}
            style={{flex:1,padding:"7px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
          <button onClick={printQuotation} className="btn btn-success">🖨 Print / Export PDF</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={saveVersion}>
              💾 Save v{version}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TEMPLATE EDITOR (Admin only) ────────────────────────────────────────────
