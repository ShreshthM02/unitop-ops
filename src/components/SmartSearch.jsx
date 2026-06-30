import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function SmartSearch({ queries, tours, agents, vendors, onSelectQuery, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const inputRef = React.useRef(null);

  useEffect(()=>{ inputRef.current?.focus(); },[]);

  const score = (item, query) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const fields = Object.values(item).filter(v=>typeof v==="string").join(" ").toLowerCase();
    let s = 0;
    terms.forEach(t=>{
      if(fields.includes(t)) s += fields.startsWith(t) ? 3 : 1;
      if(fields.split(" ").some(w=>w===t)) s += 2; // exact word match bonus
    });
    return s;
  };

  useEffect(()=>{
    if(!q.trim()) { setResults([]); return; }
    const qr = queries.map(item=>({...item,_type:"query",_score:score(item,q)})).filter(i=>i._score>0);
    const ag = agents.map(item=>({...item,_type:"agent",_score:score(item,q)})).filter(i=>i._score>0);
    const vn = vendors.map(item=>({...item,_type:"vendor",_score:score(item,q)})).filter(i=>i._score>0);
    const tr = tours.map(item=>({...item,_type:"tour",_score:score(item,q)})).filter(i=>i._score>0);
    const all = [...qr,...ag,...vn,...tr].sort((a,b)=>b._score-a._score).slice(0,12);
    setResults(all);
  },[q]);

  const TypeBadge = ({type}) => {
    const map = {query:{label:"Query",bg:"#DBEAFE",color:"#1E40AF"},agent:{label:"Agent",bg:"#D1FAE5",color:"#065F46"},
      vendor:{label:"Vendor",bg:"#FEF3C7",color:"#92400E"},tour:{label:"Tour",bg:"#F3E8FF",color:"#6B21A8"}};
    const s=map[type]||map.query;
    return <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:s.bg,color:s.color,fontWeight:600}}>{s.label}</span>;
  };

  const getTitle = r => {
    if(r._type==="query") return r.clientName||r.groupName||r.agentCompany;
    if(r._type==="agent") return r.company;
    if(r._type==="vendor") return r.name;
    if(r._type==="tour") return r.name;
    return "";
  };
  const getSub = r => {
    if(r._type==="query") return `${r.id} · ${r.destination||r.sector||""} · ${r.travelDate||r.travelMonth||""}`;
    if(r._type==="agent") return `${r.country} · ${r.contactName}`;
    if(r._type==="vendor") return `${r.type} · ${r.city}`;
    if(r._type==="tour") return `${r.id} · ${r.dates}`;
    return "";
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,borderRadius:12,width:620,maxHeight:"70vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${G.gray200}`,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18,color:G.gray400}}>🔍</span>
          <input ref={inputRef} style={{flex:1,border:"none",outline:"none",fontSize:15,fontFamily:"'Inter',sans-serif",color:G.gray800}}
            placeholder="Search queries, clients, agents, vendors, tour numbers, destinations..."
            value={q} onChange={e=>setQ(e.target.value)}/>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:G.gray400}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {q.trim()==='' && (
            <div style={{padding:"24px 16px",textAlign:"center",color:G.gray400}}>
              <div style={{fontSize:13}}>Type to search across all queries, agents, vendors and tours</div>
              <div style={{fontSize:11,marginTop:6}}>Try: client name, tour number, destination, agent company, vendor name...</div>
            </div>
          )}
          {q.trim()!=='' && results.length===0 && (
            <div style={{padding:"24px 16px",textAlign:"center",color:G.gray400}}>
              <div style={{fontSize:24,marginBottom:6}}>🔍</div>
              <div style={{fontSize:13}}>No results for "{q}"</div>
            </div>
          )}
          {results.map((r,i)=>(
            <div key={i} onClick={()=>{ if(r._type==="query"){ onSelectQuery(r); onClose(); } }}
              style={{padding:"12px 16px",borderBottom:`1px solid ${G.gray100}`,cursor:r._type==="query"?"pointer":"default",
                display:"flex",alignItems:"center",gap:10,transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=G.gray50}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:G.gray800}}>{getTitle(r)}</div>
                <div style={{fontSize:11,color:G.gray400,marginTop:2}}>{getSub(r)}</div>
              </div>
              <TypeBadge type={r._type}/>
              {r._type==="query"&&<StatusBadge status={r.status}/>}
            </div>
          ))}
        </div>
        {results.length>0&&<div style={{padding:"8px 16px",background:G.gray50,borderTop:`1px solid ${G.gray200}`,fontSize:11,color:G.gray400}}>{results.length} result{results.length>1?"s":""} — click any query to open</div>}
      </div>
    </div>
  );
}

// ── 10. ENHANCED PAYMENT TRACKER (incoming + outgoing + receipt upload) ──────
