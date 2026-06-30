import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, db } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function UserProfilePanel({currentUser,onClose,onSave}){
  const [name,setName]=React.useState(currentUser.name||"");
  const [color,setColor]=React.useState(currentUser.color||"#1A5276");
  const [showPw,setShowPw]=React.useState(false);
  const [newPw,setNewPw]=React.useState("");
  const [confirmPw,setConfirmPw]=React.useState("");
  const [pwError,setPwError]=React.useState("");
  const [saving,setSaving]=React.useState(false);
  const [saved,setSaved]=React.useState(false);
  const inp={padding:"8px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:13,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const handleSave=()=>{if(onSave)onSave({...currentUser,name,color});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const handlePwChange=async()=>{setPwError("");if(newPw.length<8){setPwError("Min 8 chars");return;}if(newPw!==confirmPw){setPwError("Don't match");return;}setSaving(true);try{const res=await db.auth.changePassword(currentUser.id,newPw);if(res?.success){setShowPw(false);setTimeout(async()=>{await db.auth.logout();window.location.reload();},1500);}else setPwError(res?.error||"Failed");}catch(e){setPwError(e.message);}setSaving(false);};
  const initials=(name||"??").split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{position:"fixed",bottom:80,left:220,background:G.white,width:340,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",border:`1px solid ${G.gray200}`,overflow:"hidden",zIndex:200}}>
        <div style={{background:G.navy,padding:"20px 20px 16px",textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",margin:"0 auto 10px",border:"3px solid rgba(255,255,255,0.2)"}}>{initials}</div>
          <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{name||currentUser.name}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{currentUser.role}</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{marginBottom:12}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Display Name</div><input style={inp} value={name} onChange={e=>setName(e.target.value)}/></div>
          <div style={{marginBottom:14}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Avatar Colour</div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{AVATAR_COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",border:color===c?"3px solid #fff":"3px solid transparent",boxShadow:color===c?`0 0 0 2px ${c}`:"none"}}/>)}</div></div>
          <button className="btn btn-primary" style={{width:"100%",fontSize:12,marginBottom:10}} onClick={handleSave}>{saved?"✓ Saved":"Save Profile"}</button>
          <div style={{borderTop:`1px solid ${G.gray100}`,paddingTop:10}}>
            {!showPw?<button className="btn btn-ghost" style={{width:"100%",fontSize:12}} onClick={()=>setShowPw(true)}>🔑 Change Password</button>:(
              <div>
                {pwError&&<div style={{fontSize:11,color:"#991B1B",background:"#FEE2E2",borderRadius:5,padding:"5px 8px",marginBottom:8}}>{pwError}</div>}
                <input style={{...inp,marginBottom:6}} type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password (min 8)"/>
                <input style={{...inp,marginBottom:8}} type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm"/>
                <div style={{display:"flex",gap:6}}><button className="btn btn-ghost" style={{flex:1,fontSize:11}} onClick={()=>{setShowPw(false);setNewPw("");setConfirmPw("");}}>Cancel</button><button className="btn btn-primary" style={{flex:1,fontSize:11}} onClick={handlePwChange} disabled={saving}>{saving?"...":"Change"}</button></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── TEMPLATES HUB ────────────────────────────────────────────────────────────
