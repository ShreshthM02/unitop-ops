import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function LoginScreen({ onDemoMode, onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password) return;
    setLoading(true); setError("");
    const { user, error } = await db.auth.login(username.trim(), password);
    if (error) { setError(error); setLoading(false); return; }
    setLoading(false);
    onSuccess && onSuccess(user);
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, #0D1B2A 0%, #1A3A52 100%)`,
      display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif" }}>
      <div style={{ width:380, background:"#fff", borderRadius:16, overflow:"hidden",
        boxShadow:"0 24px 80px rgba(0,0,0,0.4)" }}>

        {/* Logo area */}
        <div style={{ background:"#fff", padding:"24px 32px 16px", textAlign:"center",
          borderBottom:`1px solid #F3F4F6` }}>
          <img src={LOGO_B64} alt="Unitop Tours" style={{ height:72, width:"auto", maxWidth:"100%" }}/>
          <div style={{ fontSize:10, color:"#9CA3AF", letterSpacing:"2px",
            textTransform:"uppercase", marginTop:8 }}>Operations System</div>
        </div>

        <div style={{ padding:"28px 32px" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#0D1B2A",
            fontFamily:"'Playfair Display',serif", marginBottom:4 }}>Welcome back</div>
          <div style={{ fontSize:12, color:"#9CA3AF", marginBottom:24 }}>Sign in to your Unitop account</div>

          {error && (
            <div style={{ background:"#FEE2E2", border:"1px solid #FECACA", borderRadius:8,
              padding:"10px 14px", fontSize:12, color:"#991B1B", marginBottom:16 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#6B7280",
              textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Username</div>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              type="text" placeholder="your username"
              style={{ width:"100%", padding:"10px 12px", border:"1px solid #E5E7EB",
                borderRadius:8, fontSize:13, fontFamily:"'Inter',sans-serif",
                outline:"none", color:"#1F2937", boxSizing:"border-box" }}
              onFocus={e=>e.target.style.borderColor="#C0392B"}
              onBlur={e=>e.target.style.borderColor="#E5E7EB"}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#6B7280",
              textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Password</div>
            <input value={password} onChange={e=>setPassword(e.target.value)}
              type="password" placeholder="••••••••"
              style={{ width:"100%", padding:"10px 12px", border:"1px solid #E5E7EB",
                borderRadius:8, fontSize:13, fontFamily:"'Inter',sans-serif",
                outline:"none", color:"#1F2937", boxSizing:"border-box" }}
              onFocus={e=>e.target.style.borderColor="#C0392B"}
              onBlur={e=>e.target.style.borderColor="#E5E7EB"}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          </div>

          <button onClick={handleLogin} disabled={loading||!username||!password}
            style={{ width:"100%", padding:"11px", background: username&&password?"#C0392B":"#E5E7EB",
              color: username&&password?"#fff":"#9CA3AF", border:"none", borderRadius:8,
              fontSize:14, fontWeight:600, cursor: username&&password?"pointer":"not-allowed",
              fontFamily:"'Inter',sans-serif", marginBottom:12, transition:"all .15s" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <button onClick={onDemoMode}
            style={{ width:"100%", padding:"10px", background:"transparent",
              color:"#6B7280", border:"1px solid #E5E7EB", borderRadius:8,
              fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif",
              transition:"all .15s" }}
            onMouseEnter={e=>{e.target.style.background="#F9FAFB";}}
            onMouseLeave={e=>{e.target.style.background="transparent";}}>
            Continue in Demo Mode →
          </button>
        </div>

        <div style={{ padding:"14px 32px 20px", background:"#F9FAFB",
          borderTop:"1px solid #F3F4F6", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9CA3AF" }}>
            Login with your Unitop username and password.<br/>Contact your admin if you need access.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VENDOR LEDGER PANEL ──────────────────────────────────────────────────────
