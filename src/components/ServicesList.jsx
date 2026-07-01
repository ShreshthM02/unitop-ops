import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export function ServicesList({ query, sec }) {
  const DEFAULT_SERVICES = [
    {id:1,name:"Hotel — Primary Hotel (Night 1–2)",status:"requested",date:""},
    {id:2,name:"Hotel — Primary Hotel (Night 3–4)",status:"requested",date:""},
    {id:3,name:"Transport — Main Circuit",status:"requested",date:""},
    {id:4,name:"Local Facilitator",status:"requested",date:""},
    {id:5,name:"Restaurant — Lunch (Day 1)",status:"requested",date:""},
  ];
  const STATUS_COLORS = {
    requested:  {bg:"#DBEAFE",color:"#1E40AF"},
    pending:    {bg:"#FEF3C7",color:"#92400E"},
    confirmed:  {bg:"#DCFCE7",color:"#166534"},
    "sold out": {bg:"#FEE2E2",color:"#991B1B"},
    cancelled:  {bg:"#F3F4F6",color:"#6B7280"},
  };
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [newSvc, setNewSvc]     = useState({name:"",date:"",status:"requested"});
  const [adding, setAdding]     = useState(false);

  const addService = () => {
    if(!newSvc.name) return;
    setServices(p=>[...p,{...newSvc,id:Date.now()}]);
    setNewSvc({name:"",date:"",status:"requested"});
    setAdding(false);
  };

  const inp = {padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:11,
    fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  return (
    <div>
      {sec("Service Status")}
      {services.map((s,i)=>(
        <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
          background:G.white,border:`1px solid ${G.gray200}`,borderRadius:7,marginBottom:6}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:500}}>{s.name}</div>
            {s.date&&<div style={{fontSize:11,color:G.gray400}}>{s.date}</div>}
          </div>
          <select value={s.status}
            onChange={e=>setServices(p=>p.map((x,xi)=>xi===i?{...x,status:e.target.value}:x))}
            style={{padding:"3px 8px",borderRadius:6,fontSize:11,fontFamily:"'Inter',sans-serif",
              outline:"none",cursor:"pointer",fontWeight:600,
              border:`1px solid ${(STATUS_COLORS[s.status]||STATUS_COLORS.requested).color}`,
              background:(STATUS_COLORS[s.status]||STATUS_COLORS.requested).bg,
              color:(STATUS_COLORS[s.status]||STATUS_COLORS.requested).color}}>
            {["requested","pending","confirmed","sold out","cancelled"].map(st=>(
              <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>
            ))}
          </select>
          <span style={{cursor:"pointer",color:G.gray400,fontSize:13,flexShrink:0}}
            onClick={()=>setServices(p=>p.filter((_,xi)=>xi!==i))}>✕</span>
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
                {["requested","pending","confirmed","sold out","cancelled"].map(st=><option key={st} value={st}>{st}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" style={{fontSize:11}} onClick={addService}>Add Service</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{fontSize:11,marginBottom:8}} onClick={()=>setAdding(true)}>+ Add Service</button>
      )}

      <div style={{marginTop:8,fontSize:11,color:G.gray400,background:G.gray50,padding:"8px 10px",borderRadius:6}}>
        ℹ Exchange orders are the primary way to issue service vouchers. Add services here to track status. Use the Service Status Report document to share with clients.
      </div>
    </div>
  );
}

// ─── QUERY DRAWER ─────────────────────────────────────────────────────────────
