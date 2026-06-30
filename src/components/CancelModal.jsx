import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function CancelModal({ query, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="modal-overlay">
      <div className="modal" style={{width:480}}>
        <div className="modal-head" style={{background:"#7B241C"}}>
          <div className="modal-title">Cancel {query.tourFileId?"Tour File":"Query"}</div>
          <div className="modal-sub">{query.id} · {query.groupName||query.clientName}</div>
        </div>
        <div className="modal-body">
          <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:12,marginBottom:14,fontSize:12,color:"#7B241C"}}>
            ⚠ This will move the {query.tourFileId?"tour file":"query"} to Cancelled status. The full history will be preserved and the record can be found in the Cancelled section.
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:600,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>
              Cancellation Reason <span style={{color:G.accent}}>*</span>
            </div>
            <textarea style={{padding:"8px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,
              fontFamily:"'Inter',sans-serif",width:"100%",minHeight:80,resize:"vertical",outline:"none",color:G.gray800}}
              value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="e.g. Client cancelled due to visa issues, Agent withdrew booking, Budget constraints..."/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",color:G.gray800}}>
            <input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} style={{accentColor:"#C0392B"}}/>
            I confirm this cancellation and understand it cannot be undone without creating a new query
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Keep Active</button>
          <div style={{flex:1}}/>
          <button className="btn btn-primary" style={{background:reason&&confirm?"#C0392B":"#ccc",cursor:reason&&confirm?"pointer":"not-allowed"}}
            onClick={()=>reason&&confirm&&onConfirm(reason)}>
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 6. SMART SEARCH BAR ──────────────────────────────────────────────────────
