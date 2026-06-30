import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, db } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function OwnPasswordChange({ currentUser, onClose, onSuccess }) {
  const [newPw,setNewPw]=useState("");
  const [confirm,setConfirm]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const inp={padding:"9px 11px",border:`1px solid ${G.gray200}`,borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white,marginBottom:10};
  const handle=async()=>{
    setError("");
    if(newPw.length<8){setError("Minimum 8 characters");return;}
    if(newPw!==confirm){setError("Passwords don't match");return;}
    setLoading(true);
    try{const res=await db.auth.changePassword(currentUser.id,newPw);if(res?.success){onSuccess();}else{setError(res?.error||"Failed");}}
    catch(e){setError(e.message);}
    setLoading(false);
  };
  return (
    <div className="modal-overlay">
      <div className="modal" style={{width:380}}>
        <div className="modal-head"><div className="modal-title">Change My Password</div><div className="modal-sub">@{currentUser.username||currentUser.id}</div></div>
        <div className="modal-body">
          {error&&<div style={{background:"#FEE2E2",border:"1px solid #FECACA",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#991B1B",marginBottom:12}}>{error}</div>}
          <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>New Password</div>
          <input style={inp} type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="At least 8 characters"/>
          <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Confirm New Password</div>
          <input style={inp} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat new password" onKeyDown={e=>e.key==="Enter"&&handle()}/>
          <div style={{fontSize:11,color:G.gray400,marginTop:4}}>You will be logged out after changing your password.</div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handle} disabled={loading||!newPw||!confirm}>{loading?"Changing…":"Change Password"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── AGENT MASTER ─────────────────────────────────────────────────────────────
