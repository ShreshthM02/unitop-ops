import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadQueryServices, saveQueryServices, logAudit, db, formatDateSlash, reorderArray } = Lib;

const SERVICE_STATUSES = ["requested","pending","confirmed","Ex. Order Issued","sold out","cancelled"];

export function ServicesList({ query, sec, currentUser, readOnly }) {
  const DEFAULT_SERVICES = [
    {id:1,name:"Hotel — Primary Hotel (Night 1–2)",status:"requested",date:"",notes:""},
    {id:2,name:"Hotel — Primary Hotel (Night 3–4)",status:"requested",date:"",notes:""},
    {id:3,name:"Transport — Main Circuit",status:"requested",date:"",notes:""},
    {id:4,name:"Local Facilitator",status:"requested",date:"",notes:""},
    {id:5,name:"Restaurant — Lunch (Day 1)",status:"requested",date:"",notes:""},
  ];
  const STATUS_COLORS = {
    requested:  {bg:"#DBEAFE",color:"#1E40AF"},
    pending:    {bg:"#FEF3C7",color:"#92400E"},
    confirmed:  {bg:"#DCFCE7",color:"#166534"},
    "Ex. Order Issued": {bg:"#EAFAF1",color:"#0E6655"},
    "sold out": {bg:"#FEE2E2",color:"#991B1B"},
    cancelled:  {bg:"#F3F4F6",color:"#6B7280"},
  };
  const [services, setServices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newSvc, setNewSvc]     = useState({name:"",date:"",status:"requested"});
  const [adding, setAdding]     = useState(false);
  const dragIndex = useRef(null);

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

  const persist = (updated) => { setServices(updated); saveQueryServices(db, query.id, updated); };

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
              <input value={s.name} disabled={readOnly}
                onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,name:e.target.value}:x))}
                onBlur={()=>persist(services)}
                style={{fontSize:12,fontWeight:500,border:"none",outline:"none",background:"transparent",
                  width:"100%",padding:0,color:G.gray800,fontFamily:"'Inter',sans-serif",
                  cursor:readOnly?"default":"text"}}/>
              <input type="date" value={s.date||""} disabled={readOnly}
                onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,date:e.target.value}:x))}
                onBlur={()=>persist(services)}
                style={{fontSize:11,color:G.gray400,border:"none",outline:"none",background:"transparent",
                  padding:0,marginTop:2,fontFamily:"'Inter',sans-serif",cursor:readOnly?"default":"text"}}/>
            </div>
            <select value={s.status} disabled={readOnly}
              onChange={e=>{persist(services.map((x,xi)=>xi===i?{...x,status:e.target.value}:x));logAudit(db,query.id,currentUser?.name,`Service "${s.name}" status changed to "${e.target.value}"`);}}
              style={{padding:"3px 8px",borderRadius:6,fontSize:11,fontFamily:"'Inter',sans-serif",
                outline:"none",cursor:readOnly?"default":"pointer",fontWeight:600,
                border:`1px solid ${(STATUS_COLORS[s.status]||STATUS_COLORS.requested).color}`,
                background:(STATUS_COLORS[s.status]||STATUS_COLORS.requested).bg,
                color:(STATUS_COLORS[s.status]||STATUS_COLORS.requested).color}}>
              {SERVICE_STATUSES.map(st=>(
                <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>
              ))}
            </select>
            {!readOnly && (
              <span style={{cursor:"pointer",color:G.gray400,fontSize:13,flexShrink:0}}
                onClick={()=>{persist(services.filter((_,xi)=>xi!==i));logAudit(db,query.id,currentUser?.name,`Service "${s.name}" removed`);}}>✕</span>
            )}
          </div>
          {/* Note: deliberately NEVER disabled, even when the rest of this
              service (and the tour file itself) is read-only -- a direct
              instruction, since a note is information, not an action, and
              stays useful to add/edit regardless of the service or tour
              file's own status. */}
          <input value={s.notes||""} placeholder="Add a note…"
            onChange={e=>setServices(prev=>prev.map((x,xi)=>xi===i?{...x,notes:e.target.value}:x))}
            onBlur={()=>persist(services)}
            style={{...inp,marginTop:6,fontSize:11,padding:"4px 7px"}}/>
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
              <input style={inp} type="date" value={newSvc.date} onChange={e=>setNewSvc(p=>({...p,date:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Status</div>
              <select style={inp} value={newSvc.status} onChange={e=>setNewSvc(p=>({...p,status:e.target.value}))}>
                {SERVICE_STATUSES.map(st=><option key={st} value={st}>{st}</option>)}
              </select>
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
