import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, db } = Lib;
import AgentMaster from './AgentMaster.jsx';
import AllQueriesView from './AllQueriesView.jsx';
import CancelModal from './CancelModal.jsx';
import Dashboard from './Dashboard.jsx';
import EnhancedPaymentTracker from './EnhancedPaymentTracker.jsx';
import ExchangeOrderGenerator from './ExchangeOrderGenerator.jsx';
import GanttView from './GanttView.jsx';
import InAppChat from './InAppChat.jsx';
import ItineraryBuilder from './ItineraryBuilder.jsx';
import KanbanView from './KanbanView.jsx';
import NewQueryModal from './NewQueryModal.jsx';
import PLReport from './PLReport.jsx';
import ProformaInvoice from './ProformaInvoice.jsx';
import QueryDrawerWithQuote from './QueryDrawerWithQuote.jsx';
import QuotationGenerator from './QuotationGenerator.jsx';
import ReportsView from './ReportsView.jsx';
import SmartSearch from './SmartSearch.jsx';
import TaxInvoice from './TaxInvoice.jsx';
import TeamView from './TeamView.jsx';
import TemplatesHub from './TemplatesHub.jsx';
import MealPlanDocument from './MealPlanDocument.jsx';
import TourBriefingSheet from './TourBriefingSheet.jsx';
import UserProfilePanel from './UserProfilePanel.jsx';
import VendorMaster from './VendorMaster.jsx';
import { CostSheet } from './CostSheet.jsx';
import { UserManagementPanel } from './UserManagementPanel.jsx';

export default function UnitopApp({ authUser, onOpenVendorLedger, onOpenAgentLedger }) {
  const [view, setView]           = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [queries, setQueries]     = useState(INITIAL_QUERIES);
  const [tours, setTours]         = useState(TOUR_DATA);
  const [agents, setAgents]       = useState(INITIAL_AGENTS);
  const [vendors, setVendors]     = useState(INITIAL_VENDORS);
  const [payments, setPayments]   = useState(INITIAL_PAYMENTS);
  const [docSettings, setDocSettings] = useState(DEFAULT_DOC_SETTINGS);
  const [template, setTemplate]   = useState(DEFAULT_TEMPLATE);
  const [activeQuery, setActiveQuery]   = useState(null);
  const [showNewQuery, setShowNewQuery] = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showCostSheet,  setShowCostSheet]  = useState(null);
  const [showItinerary,  setShowItinerary]  = useState(null);
  const [showQuotation,  setShowQuotation]  = useState(null);
  const [showProforma,   setShowProforma]   = useState(null);
  const [showTaxInv,     setShowTaxInv]     = useState(null);
  const [showPayments,   setShowPayments]   = useState(null);
  const [showPL,         setShowPL]         = useState(false);
  const [showVoucher,    setShowVoucher]    = useState(null);
  const [showMealPlan,   setShowMealPlan]   = useState(null);
  const [showTourBrief,  setShowTourBrief]  = useState(null);
  const [showAgents,     setShowAgents]     = useState(false);
  const [showVendors,    setShowVendors]    = useState(false);
  const [showUserMgmt,   setShowUserMgmt]   = useState(false);
  const [cancelTarget,   setCancelTarget]   = useState(null);
  const [showChat,       setShowChat]       = useState(false);
  const [showProfile,    setShowProfile]    = useState(false);
  const [statFilter,     setStatFilter]     = useState(null); // {key, label, items}
  const [toast, setToast] = useState(null);
  // Build currentUser from authUser (Supabase) or fall back to demo
  const currentUser = authUser ? {
    id:     authUser.id,
    name:   authUser.name,
    role:   authUser.role,
    avatar: authUser.name ? authUser.name.slice(0,2).toUpperCase() : "U",
    color:  authUser.color || "#1A5276",
    permissions: authUser.permissions || {},
  } : USERS[0];

  // Keyboard shortcut for search
  useEffect(()=>{
    const keyHandler = (e) => { if((e.metaKey||e.ctrlKey)&&e.key==="k"){ e.preventDefault(); setShowSearch(true); } };
    window.addEventListener("keydown", keyHandler);
    return ()=>window.removeEventListener("keydown", keyHandler);
  },[]);

  // Handle drawer panel events (allows drawer buttons to open panels)
  useEffect(()=>{
    const handler = (e) => {
      const {panel, query} = e.detail;
      if(panel==="costsheet") setShowCostSheet(query);
      else if(panel==="itinerary") setShowItinerary(query);
      else if(panel==="quotation") setShowQuotation(query);
      else if(panel==="proforma")  setShowProforma(query);
      else if(panel==="payments")  setShowPayments(query);
      else if(panel==="taxinv")    setShowTaxInv(query);
      else if(panel==="voucher")      setShowVoucher(query);
      else if(panel==="mealplan")     setShowMealPlan(query);
      else if(panel==="tourbriefing") setShowTourBrief(query);
    };
    document.addEventListener("unitop-open", handler);
    return ()=>document.removeEventListener("unitop-open", handler);
  },[]);

  const can = useCan(currentUser);

  // ── Load data from Supabase on mount ──────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load queries
        const { data: qData } = await db.from("queries").select("*").order("created_at", {ascending:false});
        if (qData && qData.length > 0) {
          const mapped = qData.map(q => ({
            ...q,
            id:          q.id,
            agentCompany:q.agent_company,
            agentCountry:q.agent_country,
            correspondent:q.correspondent,
            groupName:   q.group_name,
            clientName:  q.client_name || q.group_name,
            sector:      q.sector,
            destination: q.sector,
            nights:      q.nights,
            hotelCat:    q.hotel_cat,
            paxKnown:    q.pax_known,
            paxExact:    q.pax_exact,
            paxMin:      q.pax_min,
            paxMax:      q.pax_max,
            paxDisplay:  q.pax_display,
            dateKnown:   q.date_known,
            travelDate:  q.travel_date_from ? q.travel_date_from.split("T")[0] : (q.travel_month||""),
            travelMonth: q.travel_month,
            travelSeason:q.travel_season,
            dateDisplay: q.date_display,
            status:      q.status,
            cancelled:   q.cancelled,
            cancellationReason: q.cancellation_reason,
            tourFileId:  q.tour_file_id,
            notes:       q.notes,
            manualWF:    q.manual_wf || [],
            date:        q.date || q.created_at?.split("T")[0],
            audit:       [],
            remarks:     [],
          }));
          // Load audit trails
          const { data: auditData } = await db.from("query_audit").select("*").order("created_at", {ascending:true});
          const { data: remarkData } = await db.from("query_remarks").select("*").order("created_at", {ascending:true});
          const auditMap = {};
          (auditData||[]).forEach(a => {
            if (!auditMap[a.query_id]) auditMap[a.query_id] = [];
            auditMap[a.query_id].push({ by: a.by_name, at: new Date(a.created_at).toLocaleString("en-IN"), action: a.action });
          });
          const remarkMap = {};
          (remarkData||[]).forEach(r => {
            if (!remarkMap[r.query_id]) remarkMap[r.query_id] = [];
            remarkMap[r.query_id].push({ by: r.by_name, at: new Date(r.created_at).toLocaleString("en-IN"), text: r.text });
          });
          mapped.forEach(q => {
            q.audit   = auditMap[q.id]   || [];
            q.remarks = remarkMap[q.id]  || [];
          });
          setQueries(mapped);
        }
        // Load agents
        const { data: agData } = await db.from("agents").select("*").order("company", {ascending:true});
        if (agData && agData.length > 0) {
          setAgents(agData.map(a => ({
            id: a.id, company: a.company, country: a.country, city: a.city,
            market: a.market, contactName: a.contact_name, contactPhone: a.contact_phone,
            contactEmail: a.contact_email, notes: a.notes, active: a.active,
          })));
        }
        // Load vendors
        const { data: vData } = await db.from("vendors").select("*").order("name", {ascending:true});
        if (vData && vData.length > 0) {
          setVendors(vData.map(v => ({
            id: v.id, name: v.name, type: v.type, city: v.city,
            contactName: v.contact_name, contactPhone: v.contact_phone,
            contactEmail: v.contact_email, gstin: v.gstin, notes: v.notes,
          })));
        }
      } catch(e) {
        console.warn("Could not load from Supabase, using demo data:", e);
      }
    };
    loadData();
  }, []);

  // ── Persist query to Supabase ──────────────────────────────────────────────
  const saveQueryToDB = async (q, auditAction) => {
    try {
      await db.from("queries").upsert({
        id:                  q.id,
        agent_company:       q.agentCompany,
        agent_country:       q.agentCountry,
        correspondent:       q.correspondent,
        group_name:          q.groupName,
        client_name:         q.clientName,
        sector:              q.sector || q.destination,
        nights:              parseInt(q.nights) || null,
        hotel_cat:           q.hotelCat,
        pax_known:           q.paxKnown,
        pax_exact:           parseInt(q.paxExact) || null,
        pax_min:             parseInt(q.paxMin) || null,
        pax_max:             parseInt(q.paxMax) || null,
        pax_display:         q.paxDisplay,
        date_known:          q.dateKnown,
        travel_date_from:    q.travelDate || q.travelDateFrom || null,
        travel_month:        q.travelMonth,
        travel_season:       q.travelSeason,
        date_display:        q.dateDisplay,
        status:              q.status,
        cancelled:           q.cancelled || false,
        cancellation_reason: q.cancellationReason,
        tour_file_id:        q.tourFileId,
        notes:               q.notes,
        manual_wf:           q.manualWF || [],
        source:              q.source,
        nationality:         q.nationality,
        date:                q.date,
      });
      if (auditAction) {
        await db.from("query_audit").insert({
          query_id: q.id,
          by_name:  currentUser.name,
          action:   auditAction,
        });
      }
    } catch(e) { console.warn("Save to DB failed:", e); }
  };

  const nextQueryId = () => {
    const nums = queries.map(q=>parseInt(q.id.split("-")[2])).filter(Boolean);
    return `UTQ-${new Date().getFullYear()}-${String(Math.max(...nums,0)+1).padStart(3,"0")}`;
  };
  const showToast = msg => setToast(msg);
  const updatePayments = (queryId, data) => setPayments(p=>({...p,[queryId]:data}));

  const handleNewQuery = (form) => {
    const id = nextQueryId();
    const now = new Date().toLocaleString("en-IN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const paxDisplay = form.paxKnown?`${form.paxExact} pax (confirmed)`:`${form.paxMin||"?"}–${form.paxMax||"?"} pax (TBC)`;
    const dateDisplay = form.dateKnown?`${form.travelDateFrom}${form.travelDateTo?" → "+form.travelDateTo:""}`:`${form.travelMonth||""}${form.travelSeason?" · "+form.travelSeason:""} (TBC)`;
    const newQ = {...form,id,type:"query",status:"new_query",
      clientName:form.groupName||form.agentCompany,
      destination:form.sector,nationality:form.nationality,
      pax:form.paxKnown?form.paxExact:`${form.paxMin||"?"}–${form.paxMax||"?"}`,
      paxDisplay,dateDisplay,
      travelDate:form.dateKnown?form.travelDateFrom:(form.travelMonth||form.travelSeason||"TBC"),
      date:new Date().toISOString().split("T")[0],
      manualWF:[],cancelled:false,
      audit:[{by:currentUser.name,at:now,action:`Query received via ${form.source}${form.sourceOther?" ("+form.sourceOther+")":""} from ${form.agentCompany}${form.correspondent?" ("+form.correspondent+")":""} — acknowledged`}]
    };
    setQueries(q=>[newQ,...q]);
    saveQueryToDB(newQ, newQ.audit[0].action);
    setShowNewQuery(false);
    showToast(`Query ${id} created and acknowledged`);
  };

  const handleConvertToCaseFile = (query) => {
    const tourNum = "TUR-2025-0"+(tours.length+19);
    const now = new Date().toLocaleString("en-IN");
    const auditMsg = `Converted to Tour File — Tour No. ${tourNum} assigned`;
    const updQ = {...query,tourFileId:tourNum,audit:[...(query.audit||[]),{by:currentUser.name,at:now,action:auditMsg}]};
    setQueries(qs=>qs.map(q=>q.id===query.id?updQ:q));
    setTours(ts=>[...ts,{id:tourNum,queryId:query.id,name:`${query.clientName} — ${query.destination||query.sector||""}`,dates:query.travelDate,pax:query.pax,status:"Upcoming",color:"#C0392B",ganttStart:16,ganttLen:Number(query.nights)||7}]);
    setActiveQuery(q=>q?{...q,tourFileId:tourNum}:null);
    saveQueryToDB(updQ, auditMsg);
    showToast(`Tour File opened — ${tourNum}`);
  };

  const handleAdvance = (query, newStatus) => {
    const now = new Date().toLocaleString("en-IN");
    const label = KANBAN_COLS.find(c=>c.id===newStatus)?.label;
    if(newStatus==="costing") setShowCostSheet(query);
    setQueries(qs=>qs.map(q=>q.id===query.id?{...q,status:newStatus,audit:[...q.audit,{by:currentUser.name,at:now,action:`Moved to ${label}`}]}:q));
    setActiveQuery(q=>q?{...q,status:newStatus}:null);
    saveQueryToDB({...query,status:newStatus}, `Moved to ${label}`);
    showToast(`Query moved to ${label}`);
  };

  const handleToggleWF = (queryId, stepId) => {
    setQueries(qs=>qs.map(q=>{
      if(q.id!==queryId) return q;
      const autoD = STATUS_WF_MAP[q.status]||[];
      if(autoD.includes(stepId)) return q; // auto steps can't be toggled
      const manualWF = q.manualWF||[];
      return {...q, manualWF:manualWF.includes(stepId)?manualWF.filter(s=>s!==stepId):[...manualWF,stepId]};
    }));
  };

  const handleAddRemark = async (queryId, remark) => {
    setQueries(qs=>qs.map(q=>{
      if(q.id!==queryId) return q;
      return {...q, remarks:[...(q.remarks||[]), remark]};
    }));
    setActiveQuery(q=>q&&q.id===queryId?{...q,remarks:[...(q.remarks||[]),remark]}:q);
    // Save to DB
    try {
      await db.from("query_remarks").insert({
        query_id: queryId, by_name: currentUser.name, text: remark.text
      });
    } catch(e) { console.warn("Remark save failed:", e); }
    showToast("Remark logged");
  };

  // 5. Cancel handler
  const handleStatClick = (filterKey) => {
    const now = new Date();
    const seasonStartYear = now.getMonth() < 3 ? now.getFullYear()-1 : now.getFullYear();
    const seasonStart = new Date(seasonStartYear, 3, 1);
    const seasonEnd   = new Date(seasonStartYear+1, 2, 31, 23, 59, 59);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);

    const filterMap = {
      active:    { label:"Active Queries",    items: queries.filter(q=>!q.cancelled&&q.status!=="completed") },
      new_query: { label:"New This Week",     items: queries.filter(q=>{ const d=new Date(q.date||""); return d>=weekAgo&&!q.cancelled; }) },
      operations:{ label:"In Operations",     items: queries.filter(q=>q.status==="operations"&&!q.cancelled) },
      onground:  { label:"Tours On Ground",   items: queries.filter(q=>["operations","finance"].includes(q.status)&&!q.cancelled) },
      completed: { label:`Completed This Season (Apr ${seasonStartYear}–Mar ${seasonStartYear+1})`,
                   items: queries.filter(q=>{ const d=new Date(q.date||q.travelDate||""); return q.status==="completed"&&d>=seasonStart&&d<=seasonEnd; }) },
    };
    const f = filterMap[filterKey];
    if(f) setStatFilter({ key:filterKey, label:f.label, items:f.items });
  };

  const handleCancel = (query, reason) => {
    const now = new Date().toLocaleString("en-IN");
    const updatedQ = {...query,status:"cancelled",cancelled:true,cancellationReason:reason,
      audit:[...(query.audit||[]),{by:currentUser.name,at:now,action:`CANCELLED — Reason: ${reason}`}]};
    setQueries(qs=>qs.map(q=>q.id===query.id?updatedQ:q));
    saveQueryToDB(updatedQ, `CANCELLED — Reason: ${reason}`);
    setCancelTarget(null);
    setActiveQuery(null);
    showToast(`Query/Tour File cancelled`);
  };

  const NAV = [
    {section:"Main",items:[
      {id:"dashboard",    icon:"⊞", label:"Dashboard"},
      {id:"kanban",       icon:"▤", label:"Kanban Board"},
      {id:"gantt",        icon:"▦", label:"Tour Calendar"},
    ]},
    {section:"Work",items:[
      {id:"queries",      icon:"✉", label:"All Queries"},
      {id:"tourfiles",    icon:"📁",label:"Tour Files"},
      {id:"cancelled",    icon:"✕", label:"Cancelled"},
      {id:"completed",    icon:"✅",label:"Completed"},
      {id:"team",         icon:"◎", label:"Team"},
      {id:"chat",         icon:"💬",label:"Chat"},
    ]},
    {section:"Master Data",items:[
      {id:"agents",       icon:"🌐",label:"Agents / Clients"},
      {id:"vendors",      icon:"🏢",label:"Vendors"},
    ]},
    {section:"Finance",items:[
      {id:"invoices",     icon:"🧾",label:"Invoices"},
      {id:"payments",     icon:"₹", label:"Payments"},
      {id:"reports",      icon:"📈",label:"Reports"},
    ]},
    ...((can("templates")||can("user_management"))?[{section:"Admin",items:[
      ...(can("templates")?[{id:"templates_hub",icon:"🗂",label:"Templates"}]:[]),
      ...(can("user_management")?[{id:"usermgmt",icon:"👥",label:"User Management"}]:[]),
    ]}]:[]),
  ];

  const VIEW_TITLES={dashboard:"Dashboard",kanban:"Kanban Board",gantt:"Tour Calendar",queries:"All Queries",tourfiles:"Tour Files",cancelled:"Cancelled",completed:"Completed Tour Files",team:"Team",chat:"Team Chat",agents:"Agents & Clients",vendors:"Vendors",invoices:"Invoices",payments:"Payments",reports:"Reports",templates_hub:"Templates",usermgmt:"User Management"};
  const anyPanel = showCostSheet||showItinerary||showQuotation||showProforma||showTaxInv||showPayments||showPL||showVoucher||showAgents||showVendors||showMealPlan||showTourBrief;

  const DocButtons = ({q,stopProp=false}) => (
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
      {[["📊","Cost Sheet",()=>setShowCostSheet(q)],["🗺","Itinerary",()=>setShowItinerary(q)],["📋","Quotation",()=>setShowQuotation(q)],["🧾","Proforma",()=>setShowProforma(q)],["₹","Payments",()=>setShowPayments(q)],["🧾","Tax Inv.",()=>setShowTaxInv(q)],["🎫","Vouchers",()=>setShowVoucher(q)],["✕","Cancel",()=>setCancelTarget(q)]].map(([icon,label,fn])=>(
      <button key={label} className="btn btn-ghost" style={{fontSize:10,padding:"4px 7px",color:label==="Cancel"?G.accent:undefined}}
        onClick={e=>{ if(stopProp)e.stopPropagation(); fn(); }}>{icon} {label}</button>
    ))}
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {sidebarOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:49}} onClick={()=>setSidebarOpen(false)}/>}

        <div className={`sidebar ${sidebarOpen?"open":""}`}>
          <div className="sidebar-logo">
            <img src={LOGO_B64} alt="Unitop Tours" style={{width:"100%",maxWidth:168,display:"block",padding:"6px 10px"}}/>
          </div>
          <div style={{padding:"3px 12px 6px",background:G.navy,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="logo-sub">Operations System</div>
          </div>
          <div className="sidebar-nav">
            {NAV.map(sec=>(
              <div key={sec.section}>
                <div className="nav-section">{sec.section}</div>
                {sec.items.map(item=>(
                  <div key={item.id} className={`nav-item ${view===item.id?"active":""}`}
                    onClick={()=>{setView(item.id);setSidebarOpen(false);}}>
                    <span className="nav-icon">{item.icon}</span>{item.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-user">
            <Avatar user={currentUser} size={30} onClick={()=>setShowProfile(true)} style={{cursor:"pointer"}}/>
            <div className="user-info">
              <div className="user-name">{currentUser.name}</div>
              <div className="user-role">{ROLE_LABELS[currentUser.role]}</div>
            </div>
            <span title="Sign out" style={{cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:14,flexShrink:0}}
              onClick={async()=>{ await db.auth.logout(); window.location.reload(); }}>
              ⏻
            </span>
          </div>
          <div style={{textAlign:"center",padding:"4px 0 6px",fontSize:9,color:"rgba(255,255,255,0.18)",letterSpacing:"0.5px"}}>
            v1.9.3
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={()=>setSidebarOpen(o=>!o)}>☰</button>
            <div className="topbar-title">{VIEW_TITLES[view]}</div>
            {view==="kanban"&&<span className="topbar-badge">{queries.filter(q=>q.status!=="completed"&&!q.cancelled).length} active</span>}
            {/* Smart Search button */}
            <button className="btn btn-ghost" style={{fontSize:11,gap:6}} onClick={()=>setShowSearch(true)}>
              🔍 Search
            </button>
            <button className="btn btn-ghost" onClick={()=>setView("gantt")}>📅 Calendar</button>
            {can("queries_create") && <button className="btn btn-primary" onClick={()=>setShowNewQuery(true)}>+ New Query</button>}
          </div>

          <div className="content">
            {view==="dashboard"  && <Dashboard queries={queries.filter(q=>!q.cancelled)} tours={tours} onOpenQuery={setActiveQuery} currentUser={currentUser} onStatClick={handleStatClick}/>}
            {view==="kanban"     && <KanbanView queries={queries.filter(q=>!q.cancelled)} onOpenQuery={setActiveQuery} onConvert={handleConvertToCaseFile}/>}
            {view==="gantt"      && <GanttView queries={queries.filter(q=>!q.cancelled)} tours={tours}/>}

            {view==="team"       && <TeamView queries={queries.filter(q=>!q.cancelled)}/>}
            {view==="chat" && (
              <div style={{textAlign:"center",padding:48,color:G.gray400}}>
                <div style={{fontSize:32,marginBottom:8}}>💬</div>
                <div style={{fontSize:14,fontWeight:500,color:G.gray600,marginBottom:12}}>Team Chat</div>
                <button className="btn btn-primary" onClick={()=>setShowChat(true)}>Open Chat →</button>
              </div>
            )}
            {view==="queries"    && <AllQueriesView queries={queries} agents={agents} onOpenQuery={setActiveQuery} currentUser={currentUser}/>}
            {view==="templates_hub" && <TemplatesHub template={template} onSaveTemplate={t=>{setTemplate(t);showToast("Template saved");}} docSettings={docSettings} setDocSettings={setDocSettings}/>}

            {view==="cancelled" && (
              <div>
                <div style={{marginBottom:12,fontSize:13,color:G.gray600}}>All cancelled queries and tour files. History is fully preserved.</div>
                {queries.filter(q=>q.cancelled).length===0?(
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}><div style={{fontSize:32,marginBottom:8}}>✓</div><div style={{fontSize:14}}>No cancelled queries</div></div>
                ):queries.filter(q=>q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid #FECACA`,padding:"12px 16px",marginBottom:8,opacity:0.85}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>CANCELLED</span>
                      <div style={{flex:1}}><span style={{fontSize:13,fontWeight:600}}>{q.clientName||q.groupName}</span><span style={{fontSize:11,color:G.gray400,marginLeft:8}}>{q.id} · {q.destination||q.sector}</span></div>
                    </div>
                    {q.cancellationReason&&<div style={{fontSize:12,color:"#991B1B",background:"#FFF5F5",borderRadius:6,padding:"6px 10px",marginBottom:6}}>Reason: {q.cancellationReason}</div>}
                    <div style={{fontSize:11,color:G.gray400}}>{q.audit[q.audit.length-1]?.at} · by {q.audit[q.audit.length-1]?.by}</div>
                  </div>
                ))}
              </div>
            )}



            {view==="completed" && (
              <div>
                <div style={{marginBottom:12,fontSize:13,color:G.gray600}}>All completed tour files — full history preserved.</div>
                {queries.filter(q=>q.status==="completed"&&!q.cancelled).length===0 ? (
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}>
                    <div style={{fontSize:32,marginBottom:8}}>✅</div>
                    <div style={{fontSize:14,fontWeight:500}}>No completed tour files yet</div>
                  </div>
                ) : queries.filter(q=>q.status==="completed"&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"14px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}>
                      <div style={{fontSize:22}}>✅</div>
                      <div style={{flex:1}}>
                        {q.tourFileId&&<div style={{fontSize:11,fontWeight:700,color:G.navy,marginBottom:1}}>{q.tourFileId}</div>}
                        <div style={{fontSize:13,fontWeight:600}}>{q.clientName||q.groupName}</div>
                        <div style={{fontSize:11,color:G.gray400}}>{q.id} · {q.destination||q.sector} · {q.travelDate||q.travelMonth||""}</div>
                      </div>
                      <StatusBadge status={q.status}/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view==="tourfiles" && (
              <div>
                {queries.filter(q=>q.tourFileId&&!q.cancelled).length===0?(
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}><div style={{fontSize:32,marginBottom:8}}>📁</div><div style={{fontSize:14,fontWeight:500}}>No tour files yet</div></div>
                ):queries.filter(q=>q.tourFileId&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"14px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}>
                      <div style={{fontSize:22}}>📁</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{q.tourFileId}</div>
                        <div style={{fontSize:13,color:G.gray600}}>{q.clientName||q.groupName} — {q.destination||q.sector}</div>
                        <div style={{fontSize:11,color:G.gray400}}>Travel: {q.travelDate||q.travelMonth||"TBC"} · {q.pax} pax · {q.nights}N</div>
                      </div>
                      <StatusBadge status={q.status}/>
                    </div>
                    <DocButtons q={q} stopProp={true}/>
                  </div>
                ))}
              </div>
            )}

            {view==="agents" && (
              <div>
                <div style={{marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{fontSize:13,color:G.gray600,flex:1}}>Master data for all foreign agents and clients.</div>
                  <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>setShowAgents(true)}>Open Full Agent Dashboard</button>
                </div>
                {agents.map(a=>(
                  <div key={a.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setShowAgents(true)}>
                    <div style={{fontSize:20}}>🌐</div>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{a.company}</div><div style={{fontSize:11,color:G.gray400}}>{a.country} · {a.market} · {a.contactName}</div></div>
                    <button className="btn btn-ghost" style={{fontSize:11}}>View →</button>
                  </div>
                ))}
              </div>
            )}

            {view==="vendors" && (
              <div>
                <div style={{marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{fontSize:13,color:G.gray600,flex:1}}>Master data for all vendors — hotels, restaurants, transport, guides, handlers.</div>
                  <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>setShowVendors(true)}>Open Full Vendor Dashboard</button>
                </div>
                {vendors.map(v=>(
                  <div key={v.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setShowVendors(true)}>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{v.name}</div><div style={{fontSize:11,color:G.gray400}}>{v.type} · {v.city} · {v.contactName}</div></div>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#EBF5FB",color:"#154360",fontWeight:600}}>{v.type}</span>
                    <button className="btn btn-ghost" style={{fontSize:11}}>View →</button>
                  </div>
                ))}
              </div>
            )}

            {view==="invoices" && (
              <div>
                {queries.filter(q=>["operations","finance","completed"].includes(q.status)&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{q.clientName||q.groupName}</div><div style={{fontSize:11,color:G.gray400}}>{q.id} · {q.destination||q.sector}</div></div>
                    <StatusBadge status={q.status}/>
                    <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowProforma(q)}>🧾 Proforma</button>
                    <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowTaxInv(q)}>🧾 Tax Inv.</button>
                  </div>
                ))}
              </div>
            )}

            {view==="payments" && (
              <div>
                {queries.filter(q=>["operations","finance","completed"].includes(q.status)&&!q.cancelled).map(q=>{
                  const pt=payments[q.id];
                  const tourValueINR=pt?(parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1):0;
                  const received=pt?pt.entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0):0;
                  const pct=tourValueINR>0?Math.round(received/tourValueINR*100):0;
                  return (
                    <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"12px 16px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{q.clientName||q.groupName}</div><div style={{fontSize:11,color:G.gray400}}>{q.id}</div></div>
                        <StatusBadge status={q.status}/>
                        <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowPayments(q)}>₹ Open Tracker</button>
                      </div>
                      {pt&&<>
                        <div style={{display:"flex",gap:16,marginBottom:5}}>
                          <span style={{fontSize:11,color:G.gray600}}>Tour: ₹ {Math.round(tourValueINR).toLocaleString()}</span>
                          <span style={{fontSize:11,color:"#059669",fontWeight:600}}>In: ₹ {Math.round(received).toLocaleString()}</span>
                          <span style={{fontSize:11,color:"#6B21A8",fontWeight:600}}>Out: ₹ {Math.round((pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0)).toLocaleString()}</span>
                        </div>
                        <div style={{height:5,background:G.gray100,borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:Math.min(pct,100)+"%",background:pct>=100?"#059669":pct>=50?"#F59E0B":G.accent,borderRadius:3}}/>
                        </div>
                      </>}
                    </div>
                  );
                })}
              </div>
            )}

            {view==="usermgmt" && can("user_management") && (
              <div style={{textAlign:"center",padding:48,color:G.gray400}}>
                <div style={{fontSize:24,marginBottom:8}}>👥</div>
                <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>User Management</div>
                <button className="btn btn-primary" onClick={()=>setShowUserMgmt(true)}>Open User Management →</button>
              </div>
            )}

            {view==="reports" && (
              <ReportsView queries={queries} payments={payments} currentUser={currentUser}/>
            )}

          </div>{/* end content */}
        </div>{/* end main */}

        {showChat    && <InAppChat currentUser={currentUser} queries={queries} onClose={()=>setShowChat(false)}/>}
        {showProfile && <UserProfilePanel currentUser={currentUser} onClose={()=>setShowProfile(false)} onSave={(u)=>{}}/>}

        {activeQuery&&!anyPanel&&!cancelTarget&&(
          <QueryDrawerWithQuote
            query={activeQuery}
            onClose={()=>setActiveQuery(null)}
            onConvert={handleConvertToCaseFile}
            onAdvance={handleAdvance}
            onGenerateQuote={()=>setShowQuotation(activeQuery)}
            onToggleWF={(stepId)=>handleToggleWF(activeQuery.id,stepId)}
            onCancel={()=>setCancelTarget(activeQuery)}
            onUpdateRemarks={handleAddRemark}
            currentUser={currentUser}
          />
        )}

        {/* PANELS */}
        {showCostSheet  && <CostSheet query={showCostSheet} onClose={()=>setShowCostSheet(null)} onProceedToQuotation={()=>{setShowQuotation(showCostSheet);setShowCostSheet(null);}} currentUser={currentUser}/>}
        {showItinerary  && <ItineraryBuilder query={showItinerary} onClose={()=>setShowItinerary(null)} currentUser={currentUser}/>}
        {showQuotation  && <QuotationGenerator query={showQuotation} template={template} onClose={()=>setShowQuotation(null)} onSaved={()=>showToast("Quotation saved")} currentUser={currentUser}/>}
        {showProforma   && <ProformaInvoice query={showProforma} onClose={()=>setShowProforma(null)}/>}
        {showTaxInv     && <TaxInvoice query={showTaxInv} payments={payments} onClose={()=>setShowTaxInv(null)}/>}
        {showPayments   && <EnhancedPaymentTracker query={showPayments} payments={payments} onUpdatePayments={updatePayments} onClose={()=>setShowPayments(null)}/>}
        {showPL         && <PLReport queries={queries} payments={payments} onClose={()=>setShowPL(false)}/>}
        {showVoucher    && <ExchangeOrderGenerator query={showVoucher} onClose={()=>setShowVoucher(null)} currentUser={currentUser}/>}
        {showMealPlan   && <MealPlanDocument query={showMealPlan} onClose={()=>setShowMealPlan(null)}/>}
        {showTourBrief  && <TourBriefingSheet query={showTourBrief} onClose={()=>setShowTourBrief(null)}/>}
        {showUserMgmt  && can("user_management") && (
          <UserManagementPanel currentUser={currentUser} onClose={()=>setShowUserMgmt(false)}/>
        )}
        {showAgents     && <AgentMaster agents={agents} setAgents={setAgents} queries={queries} payments={payments} onClose={()=>setShowAgents(false)}/>}
        {showVendors    && <VendorMaster vendors={vendors} setVendors={setVendors} queries={queries} onClose={()=>setShowVendors(false)}/>}

        {/* Cancel modal */}
        {cancelTarget && <CancelModal query={cancelTarget} onClose={()=>setCancelTarget(null)} onConfirm={(reason)=>handleCancel(cancelTarget,reason)}/>}

        {/* Smart Search */}
        {showSearch && <SmartSearch queries={queries} tours={tours} agents={agents} vendors={vendors} onSelectQuery={q=>{setActiveQuery(q);}} onClose={()=>setShowSearch(false)}/>}

        {/* Stat filter list modal */}
        {statFilter && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={e=>e.target===e.currentTarget&&setStatFilter(null)}>
            <div style={{background:G.white,borderRadius:12,width:560,maxHeight:"75vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,fontSize:15,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{statFilter.label}</div>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>{statFilter.items.length} {statFilter.items.length===1?"result":"results"}</span>
                <button onClick={()=>setStatFilter(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:13}}>✕</button>
              </div>
              <div style={{overflowY:"auto",flex:1}}>
                {statFilter.items.length===0&&(
                  <div style={{padding:32,textAlign:"center",color:G.gray400,fontSize:13}}>No results in this category</div>
                )}
                {statFilter.items.map(q=>(
                  <div key={q.id} onClick={()=>{setActiveQuery(q);setStatFilter(null);}}
                    style={{padding:"12px 18px",borderBottom:`1px solid ${G.gray100}`,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=G.gray50}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>{q.clientName||q.groupName}</div>
                      <div style={{fontSize:11,color:G.gray400}}>{q.id} · {q.destination||q.sector||""} · {q.travelDate||q.travelMonth||""}</div>
                      {q.tourFileId&&<div style={{fontSize:10,color:G.navy,fontWeight:600,marginTop:2}}>📁 {q.tourFileId}</div>}
                    </div>
                    <StatusBadge status={q.status}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showNewQuery && <NewQueryModal onClose={()=>setShowNewQuery(false)} onSave={handleNewQuery} nextId={nextQueryId()} agents={agents}/>}
        {toast && <Toast msg={toast} onDone={()=>setToast(null)}/>}
      </div>
    </>
  );
}

