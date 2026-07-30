import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, DEFAULT_ITINERARY_TEMPLATE, STAMP_B64, useLetterheadToggles, LetterheadToggleBar, VersionDropdown, DocTabBar, DocPreviewFrame, printHTML, buildPaginatedLetterheadDocument, loadItineraryVersions, saveItineraryVersion, markItineraryVersionFinal, loadFinalCostSheetVersion, extractItineraryBuilderDaysFromCostSheet, logAudit, db } = Lib;

// Brief Itinerary -- split out 2026-07-24 from the old combined
// ItineraryBuilder.jsx into its own standalone document (Letterhead
// Standardization initiative; Detailed Itinerary is the sibling split,
// kept as its own file with its existing layout unchanged since its
// redesign is a separate, deferred conversation). Still saves into the
// same `itineraries` table Detailed uses, with active_tab hardcoded to
// "brief" -- preserves every previously saved Brief version and keeps
// the two style's version sequences genuinely independent, matching how
// they always worked even when they shared one component.
export default function BriefItinerary({ query, briefTemplate, onClose, currentUser, readOnly }) {
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

  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  const [pulledFromCostSheetVersion, setPulledFromCostSheetVersion] = useState(null);
  const [pullMessage, setPullMessage] = useState("");
  const [pulling, setPulling] = useState(false);

  // Same reasoning as before the split: pulls from the star-marked Cost
  // Sheet directly (not a linked costSheetId), since Brief Itinerary is
  // opened independently from the toolbar.
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

  useEffect(() => {
    loadItineraryVersions(db, query.id).then(loaded => {
      const briefVersions = loaded.filter(v => v.activeTab === "brief");
      if (briefVersions.length === 0) {
        loadFinalCostSheetVersion(db, query.id).then(finalV => {
          if (finalV) { setFinalCostSheetVersion(finalV); pullFromCostSheet(finalV); }
        });
        return;
      }
      setVersions(briefVersions);
      const finalV = briefVersions.find(v => v.isFinal);
      if (finalV) setFinalVersion(finalV.version);
      loadVersionIntoDraft(briefVersions[briefVersions.length - 1]);
      setPulledFromCostSheetVersion(briefVersions[briefVersions.length - 1].pulledFromCostSheetVersion ?? null);
      loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
    });
  }, [query.id]);
  const isStaleVsCostSheet = finalCostSheetVersion && pulledFromCostSheetVersion !== finalCostSheetVersion.version;

  const saveVersion = () => {
    const snap = { version: nextVersion, tourTitle, tagline, route, duration, activeTab: "brief", days: [...itinDays], note: versionNote, pulledFromCostSheetVersion };
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    saveItineraryVersion(db, query.id, snap, currentUser?.id);
    logAudit(db, query.id, currentUser?.name, `Brief Itinerary v${nextVersion} saved${versionNote?" — "+versionNote:""}`);
    setViewingVersion(nextVersion);
    setVersionNote("");
  };

  const updateDay = (i, field, val) => setItinDays(prev => prev.map((d,idx) => idx===i ? {...d,[field]:val} : d));
  const toggleMeal = (i, m) => setItinDays(prev => prev.map((d,idx) => {
    if (idx!==i) return d;
    const meals = d.meals.includes(m) ? d.meals.filter(x=>x!==m) : [...d.meals, m].sort();
    return {...d, meals};
  }));
  const addDay = () => setItinDays(prev => [...prev, { id:Date.now(), dayLabel:`DAY-${prev.length+1}`, title:"", route:"", distance:"", time:"", meals:["B","L","D"], description:"", hotel:"" }]);
  const removeDay = (i) => setItinDays(prev => prev.filter((_,idx)=>idx!==i));

  const inp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };

  const buildPrintHTML = () => {
    const tmpl = { ...DEFAULT_ITINERARY_TEMPLATE, ...(briefTemplate || {}) };
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
      return `<div style="padding:9pt 0;border-bottom:0.5pt solid #eee">
        <div style="font-size:11pt;font-weight:bold;color:#1A3A52">${d.dayLabel}${d.title?" | "+d.title:""}</div>
        ${d.route||d.distance||d.time?`<div style="font-size:9pt;color:#888;margin:2pt 0">${[d.route,d.distance&&d.time?`(${d.distance} / ${d.time})`:d.distance||d.time].filter(Boolean).join(" — ")}</div>`:""}
        <div style="margin-top:5pt">${mealStr}</div>
        ${d.hotel?`<div style="font-size:9pt;color:#555;margin-top:3pt">🏨 ${d.hotel}</div>`:""}
      </div>`;
    });

    const closingBlock = `
      <div style="text-align:center;margin-top:18pt;font-size:9.5pt;color:#8B1A1A;font-weight:bold;letter-spacing:1pt">
        ${tmpl.closingTagline}
      </div>
      ${stampHTML}`;

    return buildPaginatedLetterheadDocument({
      title: `${tourTitle} — Brief Itinerary`,
      bodyBlocks: [titleBlock, ...dayBlocks, closingBlock],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = async () => printHTML(await buildPrintHTML());

  const [previewHTML, setPreviewHTML] = useState("");
  useEffect(() => {
    if (viewMode !== "preview") return;
    let cancelled = false;
    buildPrintHTML().then(html => { if (!cancelled) setPreviewHTML(html); });
    return () => { cancelled = true; };
  }, [viewMode, tourTitle, tagline, route, duration, itinDays, showStamp, headerFooterAllPages, printOnLetterhead, showPageNum]);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:780, height:"100vh", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>BRIEF ITINERARY · {versions.length>0?`v${nextVersion-1} saved`:"unsaved"}</div>
              <div style={{ fontSize:17, fontWeight:700, color:G.white, fontFamily:"'Playfair Display',serif" }}>
                {query.groupName||query.clientName||query.agentName}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{query.tourFileId||query.id} · {query.destination}</div>
            </div>
            <VersionDropdown
              versions={versions}
              viewingVersion={viewingVersion}
              displayVersion={nextVersion-1}
              finalVersion={finalVersion}
              onSelectVersion={loadVersionIntoDraft}
              onMarkFinal={(v) => {
                setFinalVersion(v.version);markItineraryVersionFinal(db,query.id,v.version,"brief");
                logAudit(db,query.id,currentUser?.name,`Brief Itinerary v${v.version} marked final`);
              }}
              readOnly={readOnly}
              G={G}
            />
            {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{nextVersion}</button>}
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

        <DocTabBar activeTab={viewMode} setActiveTab={setViewMode} G={G}/>

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
                  <div>
                    <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>Hotel / Overnight</div>
                    <input style={inp} value={d.hotel} onChange={e=>updateDay(i,"hotel",e.target.value)} placeholder="e.g. Hotel Leh Palace / Similar"/>
                  </div>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ fontSize:11, marginBottom:24 }} onClick={addDay}>+ Add Day</button>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
            <LetterheadToggleBar toggles={toggles} G={G}/>
            <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
              <DocPreviewFrame html={previewHTML}/>
            </div>
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
