import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadQueryServices, saveQueryServices, logAudit, db, formatDateSlash, reorderArray, queueSequential, SERVICE_STATUSES, SERVICE_STATUS_COLORS, serviceStatusTone, RichTextEditor } = Lib;
import StatusSelect from './StatusSelect.jsx';
import DateInput from '../lib/DateInput.jsx';

export function ServicesList({ query, sec, currentUser, readOnly }) {
  const DEFAULT_SERVICES = [
    {id:1,name:"Hotel — Primary Hotel (Night 1–2)",status:"requested",date:"",notes:""},
    {id:2,name:"Hotel — Primary Hotel (Night 3–4)",status:"requested",date:"",notes:""},
    {id:3,name:"Transport — Main Circuit",status:"requested",date:"",notes:""},
    {id:4,name:"Local Facilitator",status:"requested",date:"",notes:""},
    {id:5,name:"Restaurant — Lunch (Day 1)",status:"requested",date:"",notes:""},
  ];
  const [services, setServices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newSvc, setNewSvc]     = useState({name:"",date:"",status:"requested"});
  const [adding, setAdding]     = useState(false);
  const dragIndex = useRef(null);
  // Serializes every saveQueryServices call via queueSequential (see
  // persist() below and queueSequential's own comment in lib/utils.js) --
  // the real, reproducible cause of a real data-loss incident (tour file
  // UT-3495, 2026-09-24: 4 confirmed hotel entries silently vanished
  // after being renamed from the default placeholder rows and marked
  // confirmed in quick succession).
  const saveChainsRef = useRef({});

  useEffect(() => {
    loadQueryServices(db, query.id).then(loadedServices => {
      // Older saved services predate the notes field -- default it in
      // rather than leaving it undefined, so the input below always has
      // a real controlled value.
      const withNotes = (loadedServices.length > 0 ? loadedServices : DEFAULT_SERVICES)
        .map(s => ({ ...s, notes: s.notes || "" }));
      setServices(withNotes);
      setLoaded(true);
    });
  }, [query.id]);

  // Two layers of protection against services silently vanishing, for two
  // different failure modes:
  //
  // 1. Same-tab overlapping saves (tour file UT-3495, 2026-09-24): every
  //    field in this component (name, date, status, notes) fires its own
  //    persist() independently. Two calls fired close together (e.g.
  //    renaming a service, then immediately confirming its status) used to
  //    be able to run concurrently. Chaining every save through this ref
  //    guarantees each one fully completes before the next starts, so
  //    saves always apply in the order they were fired.
  //
  // 2. Cross-tab/cross-session staleness (tour file UT-3497, recurred
  //    2026-09-2x despite #1 above): queueSequential only serializes calls
  //    within THIS component instance -- it has no effect across two
  //    different browser tabs, or two different staff logged in at once.
  //    saveQueryServices used to delete any DB row not present in whatever
  //    `services` array it was handed; a tab with a stale snapshot (it
  //    simply hasn't reloaded since another tab added a service) would
  //    delete that other tab's addition on its very next save, with no
  //    race required at all. Fixed at the root in saveQueryServices itself
  //    (see lib/utils.js): deletion is no longer inferred from a diff --
  //    it only happens for ids explicitly passed here as `deletedIds`,
  //    which is only ever the one id the user just clicked ✕ on below.
  const persist = (updated, deletedIds = []) => {
    setServices(updated);
    queueSequential(saveChainsRef.current, query.id, () => saveQueryServices(db, query.id, updated, deletedIds));
  };

  const addService = () => {
    if(!newSvc.name) return;
    persist([...services,{...newSvc,id:Date.now(),notes:""}]);
    logAudit(db, query.id, currentUser?.name, `Service "${newSvc.name}" added`);
    setNewSvc({name:"",date:"",status:"requested"});
    setAdding(false);
  };

  const handleDrop = (dropIndex) => {
    if (dragIndex.current === null || dragIndex.current === dropIndex) return;
    persist(reorderArray(services, dragIndex.current, dropIndex));
    dragIndex.current = null;
  };

  const inp = {padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:11,
    fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  if (!loaded) return <div>{sec("Service Status")}<div style={{textAlign:"center",padding:"20px 0",color:G.gray400,fontSize:12}}>Loading…</div></div>;

  return (
    <div style={{minWidth:0}}>
      {sec("Service Status")}
      {readOnly && (
        <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#92400E",marginBottom:10}}>
          🔒 This tour file is cancelled — the service itself is view-only, but notes can still be added below.
        </div>
      )}
      <div style={{fontSize:10,color:G.gray400,marginBottom:6}}>{readOnly?"":"Drag ⠿ to reorder"}</div>
      {services.map((s,i)=>(
        <div key={s.id} draggable={!readOnly}
          onDragStart={()=>!readOnly&&(dragIndex.current=i)}
          onDragOver={e=>e.preventDefault()}
          onDrop={()=>!readOnly&&handleDrop(i)}
          style={{padding:"8px 10px",
          background:G.white,border:`1px solid ${G.gray200}`,borderRadius:7,marginBottom:6,cursor:readOnly?"default":"grab"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {!readOnly && <span style={{color:G.gray400,fontSize:14,flexShrink:0}} title="Drag to reorder">⠿</span>}
            <div style={{flex:1}}>
              <input value={s.name} disabled={readOnly||!!s.svbId} title={s.svbId?"Linked to Series → Bookings — edit the details there":undefined}
                onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,name:e.target.value}:x))}
                onBlur={()=>persist(services)}
                style={{fontSize:12,fontWeight:500,border:"none",outline:"none",background:"transparent",
                  width:"100%",padding:0,color:G.gray800,fontFamily:"'Inter',sans-serif",
                  cursor:readOnly?"default":"text"}}/>
              {s.svbId ? (
                <div style={{fontSize:11,color:G.gray600,marginTop:2}} data-testid="linked-service-details">
                  ⛓ {[s.date&&(formatDateSlash(s.date)+(s.dateTo?" – "+formatDateSlash(s.dateTo):"")), s.reservationNo&&`Res. ${s.reservationNo}`, s.rates&&`Rates: ${s.rates}`].filter(Boolean).join(" · ")||"Series booking"}
                  <span style={{color:G.gray400}}> · edit in Series → Bookings</span>
                </div>
              ) : <DateInput  value={s.date||""} disabled={readOnly}
                onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,date:e.target.value}:x))}
                onBlur={()=>persist(services)}
                style={{fontSize:11,color:G.gray400,border:"none",outline:"none",background:"transparent",
                  padding:0,marginTop:2,fontFamily:"'Inter',sans-serif",cursor:readOnly?"default":"text"}}/>}
            </div>
            <StatusSelect value={s.status} disabled={readOnly}
              onChange={v=>{persist(services.map((x,xi)=>xi===i?{...x,status:v}:x));logAudit(db,query.id,currentUser?.name,`Service "${s.name}" status changed to "${v}"`);}}/>
            {!readOnly && (
              <span style={{cursor:"pointer",color:G.gray400,fontSize:13,flexShrink:0}}
                onClick={()=>{persist(services.filter((_,xi)=>xi!==i),[s.id]);logAudit(db,query.id,currentUser?.name,`Service "${s.name}" removed`);}}>✕</span>
            )}
          </div>
          {/* Note: deliberately NEVER disabled, even when the rest of this
              service (and the tour file itself) is read-only -- a direct
              instruction, since a note is information, not an action, and
              stays useful to add/edit regardless of the service or tour
              file's own status. */}
          {s.svbId ? (
            <div style={{marginTop:6}}>
              <RichTextEditor value={s.remarksHtml||""} minHeight={50} placeholder="Remarks"
                onChange={v=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,remarksHtml:v}:x))} />
              <button className="btn btn-ghost" style={{fontSize:10.5,marginTop:4}} onClick={()=>persist(services)}>Save remarks</button>
            </div>
          ) : <input value={s.notes||""} placeholder="Add a note…"
            onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,notes:e.target.value}:x))}
            onBlur={()=>persist(services)}
            style={{...inp,marginTop:6,fontSize:11,padding:"4px 7px"}}/>}
        </div>
      ))}

      {adding ? (
        <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
            <div>
              <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Service</div>
              <input style={inp} value={newSvc.name} onChange={e=>setNewSvc(p=>({...p,name:e.target.value}))} placeholder="e.g. Hotel Taj Mahal 3N"/>
            </div>
            <div>
              <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Date</div>
              <DateInput style={inp}  value={newSvc.date} onChange={e=>setNewSvc(p=>({...p,date:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Status</div>
              <StatusSelect value={newSvc.status} ariaLabel="New service status" onChange={v=>setNewSvc(p=>({...p,status:v}))}/>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" style={{fontSize:11}} onClick={addService}>Add Service</button>
          </div>
        </div>
      ) : (
        !readOnly && <button className="btn btn-ghost" style={{fontSize:11,marginBottom:8}} onClick={()=>setAdding(true)}>+ Add Service</button>
      )}

      <div style={{marginTop:8,fontSize:11,color:G.gray400,background:G.gray50,padding:"8px 10px",borderRadius:6}}>
        ℹ Select "Ex. Order Issued" once an Exchange Order has actually been issued for this service — this is a manual confirmation, not automatic, to avoid misrepresenting status due to a naming mismatch.
      </div>
    </div>
  );
}

// ─── QUERY DRAWER ─────────────────────────────────────────────────────────────
