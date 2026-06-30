import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function NewQueryModal({ onClose, onSave, nextId, agents }) {
  const [form, setForm] = useState({
    // 9.1 Source
    agentId: "", agentCompany:"", agentCountry:"", agentCity:"",
    correspondent:"", nationality:"",
    source:"Agency", groupName:"",
    clientName:"",
    // 9.2 Tour Details
    sector:"", nights:"", hotelCat:"4 Star",
    // 9.3 Group Size
    paxKnown:false, paxExact:"", paxMin:"", paxMax:"",
    // 9.4 Travel Period
    dateKnown:false, travelDateFrom:"", travelDateTo:"", travelMonth:"", travelSeason:"",
    // 9.5 Internal
    assignedTo:1, internalCorrespondent:"",
    notes:"",
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Auto-fill from agent master
  const handleAgentSelect = (id) => {
    const agent = agents.find(a=>a.id===id);
    if (agent) {
      set("agentId", id);
      set("agentCompany", agent.company);
      set("agentCountry", agent.country);
      set("agentCity", agent.city);
      set("nationality", agent.market);
      if (!form.correspondent) set("correspondent", agent.contactName);
    } else {
      set("agentId", "");
    }
  };

  const canSave = form.agentCompany && form.sector;

  const sl = (t,req) => <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{t}{req&&<span style={{color:G.accent}}> *</span>}</div>;
  const secHdr = (icon,t) => (
    <div style={{display:"flex",alignItems:"center",gap:7,margin:"16px 0 10px",paddingBottom:6,borderBottom:`1px solid ${G.gray100}`}}>
      <span style={{fontSize:14}}>{icon}</span>
      <span style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"1px"}}>{t}</span>
    </div>
  );
  const inp = {padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  return (
    <div className="modal-overlay">
      <div className="modal" style={{width:600}}>
        <div className="modal-head">
          <div className="modal-title">New Query</div>
          <div className="modal-sub">Log the enquiry — uncertain fields can be left flexible</div>
        </div>
        <div className="modal-body">
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Query Number (auto-assigned)</div>
            <div className="query-num-preview">{nextId}</div>
          </div>

          {/* 9.1 Source */}
          {secHdr("🌐","Source")}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              {sl("Foreign Agency",true)}
              <select style={inp} value={form.agentId} onChange={e=>handleAgentSelect(e.target.value)}>
                <option value="">— Select or type new —</option>
                {agents.map(a=><option key={a.id} value={a.id}>{a.company} ({a.country})</option>)}
              </select>
            </div>
            <div>
              {sl("Agency Name (if new)")}
              <input style={inp} value={form.agentCompany} onChange={e=>set("agentCompany",e.target.value)} placeholder="e.g. NCH Holidays"/>
            </div>
            <div>
              {sl("Correspondent")}
              <input style={inp} value={form.correspondent} onChange={e=>set("correspondent",e.target.value)} placeholder="Person communicating from agent side"/>
            </div>
            <div>
              {sl("Nationality / Market")}
              <input style={inp} value={form.nationality} onChange={e=>set("nationality",e.target.value)} placeholder="e.g. Thai, German, Colombian"/>
            </div>
            <div>
              {sl("Query Source")}
              <select style={inp} value={form.source} onChange={e=>set("source",e.target.value)}>
                {QUERY_SOURCES.map(s=><option key={s}>{s}</option>)}
              </select>
              {form.source==="Others" && <OtherInput value={form.sourceOther} onChange={v=>set("sourceOther",v)} placeholder="Specify source..."/>}
            </div>
            <div>
              {sl("Group Name")}
              <input style={inp} value={form.groupName} onChange={e=>set("groupName",e.target.value)} placeholder="e.g. COL Group, Smith Family"/>
            </div>

          </div>

          {/* 9.2 Tour Details */}
          {secHdr("🗺️","Tour Details")}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              {sl("Sector / Circuit",true)}
              <input style={inp} value={form.sector} onChange={e=>set("sector",e.target.value)} placeholder="e.g. Golden Triangle, Buddhist Circuit"/>
            </div>
            <div>
              {sl("No. of Nights")}
              <input style={inp} type="number" value={form.nights} onChange={e=>set("nights",e.target.value)} placeholder="e.g. 7"/>
            </div>
            <div>
              {sl("Hotel Category")}
              <select style={inp} value={form.hotelCat} onChange={e=>set("hotelCat",e.target.value)}>
                {["Budget","2 Star","3 Star","4 Star","5 Star","Heritage","Luxury","Mixed","Temple","Hybrid (Hotel + Temple)"].map(h=><option key={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* 9.3 Group Size */}
          {secHdr("👥","Group Size")}
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[["Quote for slabs (pax TBC)",false],["Exact pax known",true]].map(([label,val])=>(
              <button key={label} onClick={()=>set("paxKnown",val)}
                style={{padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",
                  border:`1px solid ${form.paxKnown===val?G.accent:G.gray200}`,
                  background:form.paxKnown===val?"#FDEDEC":G.white,
                  color:form.paxKnown===val?G.accent:G.gray600,
                  fontWeight:form.paxKnown===val?600:400,fontFamily:"'Inter',sans-serif"}}>
                {label}
              </button>
            ))}
          </div>
          {form.paxKnown ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 3fr",gap:10,marginBottom:10}}>
              <div>{sl("Confirmed Pax")}<input style={inp} type="number" value={form.paxExact} onChange={e=>set("paxExact",e.target.value)} placeholder="e.g. 16"/></div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>{sl("Expected Min Pax")}<input style={inp} type="number" value={form.paxMin} onChange={e=>set("paxMin",e.target.value)} placeholder="e.g. 10"/></div>
              <div>{sl("Expected Max Pax")}<input style={inp} type="number" value={form.paxMax} onChange={e=>set("paxMax",e.target.value)} placeholder="e.g. 20"/></div>
            </div>
          )}

          {/* 9.4 Travel Period */}
          {secHdr("📅","Travel Period")}
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[["Month / season only",false],["Dates confirmed",true]].map(([label,val])=>(
              <button key={label} onClick={()=>set("dateKnown",val)}
                style={{padding:"5px 12px",borderRadius:6,fontSize:12,cursor:"pointer",
                  border:`1px solid ${form.dateKnown===val?G.accent:G.gray200}`,
                  background:form.dateKnown===val?"#FDEDEC":G.white,
                  color:form.dateKnown===val?G.accent:G.gray600,
                  fontWeight:form.dateKnown===val?600:400,fontFamily:"'Inter',sans-serif"}}>
                {label}
              </button>
            ))}
          </div>
          {form.dateKnown ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>{sl("From")}<input style={inp} type="date" value={form.travelDateFrom} onChange={e=>set("travelDateFrom",e.target.value)}/></div>
              <div>{sl("To")}<input style={inp} type="date" value={form.travelDateTo} onChange={e=>set("travelDateTo",e.target.value)}/></div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>{sl("Preferred Month(s)")}<input style={inp} value={form.travelMonth} onChange={e=>set("travelMonth",e.target.value)} placeholder="e.g. Oct–Nov"/></div>
              <div>{sl("Season")}
                <select style={inp} value={form.travelSeason} onChange={e=>set("travelSeason",e.target.value)}>
                  <option value="">— select —</option>
                  {["Peak (Oct–Mar)","Shoulder (Apr, Sep)","Off-peak (May–Aug)"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 9.5 Internal */}
          {secHdr("🏢","Internal")}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>{sl("Assigned To")}
              <select style={inp} value={form.assignedTo} onChange={e=>set("assignedTo",Number(e.target.value))}>
                {USERS.map(u=><option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role]})</option>)}
              </select>
            </div>
            <div>{sl("Correspondent")}
              <input style={inp} value={form.internalCorrespondent} onChange={e=>set("internalCorrespondent",e.target.value)} placeholder="Person communicating with client"/>
            </div>
          </div>

          {/* 9.6 Notes */}
          <div>
            {sl("Special Notes / Requirements")}
            <textarea style={{...inp,minHeight:60,resize:"vertical"}} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Dietary needs, special requests, visa requirements..."/>
          </div>
        </div>
        <div className="modal-foot">
          <div style={{flex:1,fontSize:11,color:G.gray400,alignSelf:"center"}}>* Required</div>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            style={{opacity:canSave?1:0.5,cursor:canSave?"pointer":"not-allowed"}}
            onClick={()=>canSave&&onSave(form)}>
            Save & Acknowledge ↗
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── COST SHEET v2 (per spec 10.x) ───────────────────────────────────────────
// ─── QUERY DRAWER WITH QUOTE BUTTON ──────────────────────────────────────────
// Wraps QueryDrawer and adds "Generate Quotation" button in the drawer footer
// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
