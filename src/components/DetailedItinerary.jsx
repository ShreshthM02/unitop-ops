import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const { G, DEFAULT_ITINERARY_TEMPLATE, STAMP_B64, useLetterheadToggles, VersionDropdown, DayItemsEditor, itineraryItemHTML, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML, buildLetterheadDocument, loadItineraryVersions, saveItineraryVersion, markItineraryVersionFinal, mergeBriefDaysIntoDetailed, logAudit, db } = Lib;

// Detailed Itinerary -- split out 2026-07-24 from the old combined
// ItineraryBuilder.jsx into its own standalone document (Letterhead
// Standardization initiative; Brief Itinerary is the sibling split, now
// on the new paginated letterhead system). This file is DELIBERATELY
// left on the old buildLetterheadDocument and its existing layout --
// Detailed's redesign is its own custom-layout conversation, explicitly
// deferred by the user, not part of this split. The only change from
// the old ItineraryBuilder is removing the now-unnecessary Brief/Detailed
// style switcher, since this document is always "detailed" now. Still
// saves into the same `itineraries` table Brief uses, with active_tab
// hardcoded to "detailed" -- preserves every previously saved Detailed
// version and keeps the two style's version sequences genuinely
// independent, matching how they always worked even when they shared
// one component.
export default function DetailedItinerary({ query, detailTemplate, onClose, currentUser, readOnly }) {
  const [tourTitle, setTourTitle] = useState(query.destination || "");
  const [tagline, setTagline] = useState("");
  const [route, setRoute] = useState("");
  const [duration, setDuration] = useState(`${query.nights || "?"} Days / ${query.nights ? Number(query.nights)-1 : "?"} Nights`);
  const [itinDays, setItinDays] = useState([
    { id:1, dayLabel:"DAY-1", title:"Arrival", route:"", distance:"", time:"", meals:["D"], description:"Meeting & greeting at the airport and transfer to hotel.\nOvernight stay at the hotel.", hotel:"" },
    { id:2, dayLabel:"DAY-2", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
    { id:3, dayLabel:"DAY-3", title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" },
  ]);
  const [viewMode, setViewMode] = useState("content");
  const [editingDay, setEditingDay] = useState(null);
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerFooterAllPages, printOnLetterhead } = toggles;

  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [versionNote, setVersionNote] = useState("");
  const nextVersion = versions.length ? Math.max(...versions.map(v => v.version)) + 1 : 1;

  const loadVersionIntoDraft = (v) => {
    setTourTitle(v.tourTitle || query.destination || "");
    setTagline(v.tagline || "");
    setRoute(v.route || "");
    setDuration(v.duration || duration);
    setItinDays(v.days && v.days.length ? v.days : itinDays);
    setViewingVersion(v.version);
  };

  // Detailed's source is now the Brief Itinerary, not the Cost Sheet (1.12).
  // Brief owns the itinerary content and pulls from the Cost Sheet itself, so
  // the chain is Cost Sheet -> Brief -> Detailed rather than two siblings
  // drawing on the same source and drifting apart.
  const [latestBriefVersion, setLatestBriefVersion] = useState(null);
  const [pulledFromBriefVersion, setPulledFromBriefVersion] = useState(null);
  const [pulledFromCostSheetVersion, setPulledFromCostSheetVersion] = useState(null);
  const [pullMessage, setPullMessage] = useState("");
  const [pulling, setPulling] = useState(false);

  const pullFromBrief = async (targetVersion) => {
    setPulling(true);
    setPullMessage("");
    try {
      const source = targetVersion || latestBriefVersion;
      if (!source) { setPullMessage("No saved Brief Itinerary found for this tour yet."); setPulling(false); return; }
      // Merge rather than replace: description blocks are the only thing this
      // document contributes, so a pull that wiped them would punish anyone
      // who pulls a corrected hotel name after writing a page of prose.
      const { days, preserved, droppedDescriptions } = mergeBriefDaysIntoDetailed(source.days, itinDays);
      setItinDays(days);
      if (source.tourTitle) setTourTitle(source.tourTitle);
      if (source.tagline) setTagline(source.tagline);
      if (source.route) setRoute(source.route);
      if (source.duration) setDuration(source.duration);
      setPulledFromBriefVersion(source.version);
      setPulledFromCostSheetVersion(source.pulledFromCostSheetVersion ?? null);
      setPullMessage(
        `Pulled from Brief Itinerary v${source.version}.`
        + (preserved ? ` ${preserved} description block${preserved === 1 ? "" : "s"} kept.` : "")
        + (droppedDescriptions ? ` ${droppedDescriptions} description block${droppedDescriptions === 1 ? "" : "s"} dropped — the Brief no longer has those days.` : "")
      );
    } catch (e) {
      setPullMessage("Failed to pull from Brief Itinerary.");
    }
    setPulling(false);
  };

  useEffect(() => {
    loadItineraryVersions(db, query.id).then(loaded => {
      // Both styles live in the same table; the star-marked Brief version is
      // the source of truth if there is one, otherwise the latest saved.
      const briefVersions = loaded.filter(v => v.activeTab === "brief");
      const briefSource = briefVersions.find(v => v.isFinal) || briefVersions[briefVersions.length - 1] || null;
      setLatestBriefVersion(briefSource);

      const detailedVersions = loaded.filter(v => v.activeTab === "detailed");
      if (detailedVersions.length === 0) {
        if (briefSource) pullFromBrief(briefSource);
        return;
      }
      setVersions(detailedVersions);
      const finalV = detailedVersions.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      const latest = detailedVersions[detailedVersions.length - 1];
      loadVersionIntoDraft(latest);
      setPulledFromBriefVersion(latest.pulledFromBriefVersion ?? null);
      setPulledFromCostSheetVersion(latest.pulledFromCostSheetVersion ?? null);
    });
  }, [query.id]);
  const isStaleVsBrief = latestBriefVersion && pulledFromBriefVersion !== latestBriefVersion.version;

  // See BriefItinerary for the full note: the version list must only be
  // updated after the insert is confirmed, because the db wrapper resolves
  // with {data, error} rather than throwing, so a failed write used to be
  // indistinguishable from a successful one.
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveVersion = async () => {
    const snap = { version: nextVersion, tourTitle, tagline, route, duration, activeTab: "detailed", days: [...itinDays], note: versionNote, pulledFromCostSheetVersion, pulledFromBriefVersion };
    setSaving(true);
    setSaveError(null);
    const { error } = await saveItineraryVersion(db, query.id, snap, currentUser?.id);
    setSaving(false);
    if (error) { setSaveError(error); return; }
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    logAudit(db, query.id, currentUser?.name, `Detailed Itinerary v${nextVersion} saved${versionNote?" — "+versionNote:""}`);
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

  const inp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };
  const ta = { ...inp, minHeight:80, resize:"vertical" };

  const buildPrintHTML = () => {
    const tmpl = { ...DEFAULT_ITINERARY_TEMPLATE, ...(detailTemplate || {}) };
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin:14pt auto 0" alt="Stamp"/>` : '';

    const titleBlock = `
      <div style="text-align:center;margin-bottom:16pt">
        <div class="inv-title" style="margin-bottom:2pt">${tourTitle||"Tour Itinerary"}</div>
        <div style="font-size:11pt;font-weight:600;color:#1A3A52">${duration}</div>
        ${route?`<div style="font-size:10pt;color:#666;margin-top:2pt">${route}</div>`:''}
        ${tagline?`<div style="font-size:9.5pt;font-style:italic;color:#666;margin-top:4pt">"${tagline}"</div>`:''}
      </div>
      <div style="height:2pt;background:linear-gradient(90deg,#cb0f0f,#061bb0);border-radius:2pt;margin-bottom:14pt"></div>
      <div style="text-align:center;font-size:12pt;font-weight:700;letter-spacing:2pt;color:#1A3A52;margin-bottom:14pt">ITINERARY</div>`;

    const dayBlocks = itinDays.map(d => {
      const mealStr = d.meals.map(m => `<span style="background:#FEF3C7;color:#92400E;padding:2pt 7pt;border-radius:10pt;font-size:8.5pt;margin-right:4pt;font-weight:600">${m==="B"?"Breakfast":m==="L"?"Lunch":"Dinner"}</span>`).join("");
      return `<div style="margin-bottom:16pt">
        <div style="font-size:12pt;font-weight:bold;color:#1A3A52;margin-bottom:2pt">${d.dayLabel}${d.title?" | "+d.title:""}</div>
        ${(d.items||[]).map(itineraryItemHTML).join("")}
        <div style="margin-top:6pt">${mealStr}</div>
      </div>`;
    }).join("");

    const closingBlock = `
      <div style="text-align:center;margin-top:18pt;font-size:9.5pt;color:#8B1A1A;font-weight:bold;letter-spacing:1pt">
        ${tmpl.closingTagline}
      </div>
      ${stampHTML}`;

    return buildLetterheadDocument({
      title: `${tourTitle} — Itinerary`,
      bodyBlocks: [titleBlock, dayBlocks, closingBlock],
      headerAllPages: headerFooterAllPages, footerAllPages: headerFooterAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = () => printHTML(buildPrintHTML());

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:780, height:"100vh", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>DETAILED ITINERARY · {versions.length>0?`v${nextVersion-1} saved`:"unsaved"}</div>
              <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
                {query.groupName||query.clientName||query.agentName}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.tourFileId||query.id} · {query.destination}</div>
            </div>
            {/* Detailed Itinerary was the one document left on the old
                always-expanded version-pill row when VersionDropdown was
                rolled out to the other seven, because its redesign was
                deferred. The redesign no longer blocks this -- the pills
                behave identically, they just take more room and look
                inconsistent beside every other document. */}
            <VersionDropdown
              versions={versions}
              viewingVersion={viewingVersion}
              displayVersion={nextVersion - 1}
              finalVersion={finalVersion}
              onSelectVersion={loadVersionIntoDraft}
              onMarkFinal={(v) => {
                setFinalVersion(v.version);
                markItineraryVersionFinal(db, query.id, v.version, "detailed");
                logAudit(db, query.id, currentUser?.name, `Detailed Itinerary v${v.version} marked final`);
              }}
              readOnly={readOnly}
              G={G}
            />
            {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{nextVersion}</button>}
            <button onClick={handlePrint} className="btn btn-success" style={{ fontSize:11 }}>🖨 Print / PDF</button>
            <button onClick={onClose} className="btn btn-ghost" style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
          </div>
          {isStaleVsBrief && !readOnly && (
            <div style={{background:"#FEF9E7",border:"1px solid #F7DC6F",borderRadius:6,padding:"6px 10px",fontSize:10.5,color:"#7D6608",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{flex:1}}>
                Brief Itinerary v{latestBriefVersion.version} has itinerary content
                {pulledFromBriefVersion ? ` newer than what this was last pulled from (v${pulledFromBriefVersion})` : " that hasn't been pulled in yet"}. Your description blocks are kept.
              </span>
              <button onClick={()=>pullFromBrief(latestBriefVersion)} disabled={pulling} className="btn btn-primary" style={{fontSize:10.5,padding:"3px 8px",flexShrink:0}}>
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

        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>
        <LetterheadToggleBar toggles={toggles} G={G}/>

        {viewMode === "content" ? (
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

                {/* Day body -- an ordered list of typed items, same editor as
                    Brief. Detailed additionally offers the Description type
                    (1.12), which can be added as many times as needed and
                    dragged anywhere in the day. The old fixed Route /
                    Description / Hotel fields, the separate Flights/Trains
                    list and the Arrival/Departure block (1.8) are all gone --
                    they are item types now, or in the case of
                    arrival/departure, dropped as requested. */}
                <div style={{ padding:"12px 14px" }}>
                  <DayItemsEditor
                    items={d.items}
                    onChange={(items) => updateDay(i, "items", items)}
                    style="detailed"
                    G={G}
                    inp={inp}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ fontSize:11, marginBottom:24 }} onClick={addDay}>+ Add Day</button>
          </div>
        ) : (
          <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
            <DocPreviewFrame html={buildPrintHTML()}/>
          </div>
        )}

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, display:"flex", gap:10, flexShrink:0, background:G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{ flex:1 }}/>
          <button onClick={handlePrint} className="btn btn-primary">🖨 Print</button>
          {!readOnly && <button onClick={saveVersion} className="btn btn-primary">💾 Save v{nextVersion}</button>}
        </div>
      </div>
    </div>
  );
}
