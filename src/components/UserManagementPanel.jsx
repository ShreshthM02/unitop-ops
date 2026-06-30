import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, db } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export function UserManagementPanel({ currentUser, onClose }) {
  const [staffList, setStaffList]   = useState([]);
  const [selected,  setSelected]    = useState(null);
  const [tab, setTab]               = useState("users"); // users | create
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState("");
  const [newPw, setNewPw]           = useState("");
  const [showPwFor, setShowPwFor]   = useState(null);

  // Create form
  const [form, setForm] = useState({ username:"", password:"", name:"", role:"sales", color:"#6C3483" });
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const showMsg = (msg) => { setToast(msg); setTimeout(()=>setToast(""),3000); };

  useEffect(()=>{ loadStaff(); },[]);

  const loadStaff = async () => {
    setLoading(true);
    const list = await db.auth.getStaffList();
    setStaffList(list);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.name) return;
    const res = await db.auth.createStaff(form.username, form.password, form.name, form.role, form.color);
    if (res.success) {
      showMsg(`User "${form.name}" created ✓`);
      setForm({ username:"", password:"", name:"", role:"sales", color:"#6C3483" });
      setTab("users");
      loadStaff();
    } else { showMsg("Error: " + (res.error||"Unknown")); }
  };

  const handleResetPassword = async (userId) => {
    if (!newPw) return;
    const res = await db.auth.changePassword(userId, newPw);
    if (res.success) { showMsg("Password reset ✓"); setShowPwFor(null); setNewPw(""); }
    else { showMsg("Error: " + res.error); }
  };

  const handleToggleActive = async (staff) => {
    const res = await db.auth.updatePermissions(staff.id, null, null, null, !staff.active);
    if (res.success) { showMsg(staff.active ? "User deactivated" : "User reactivated"); loadStaff(); }
  };

  const handlePermChange = async (staff, permKey, val) => {
    const current = { ...(ROLE_DEFAULTS[staff.role]||{}), ...(staff.permissions||{}) };
    const updated = { ...current, [permKey]: val };
    const res = await db.auth.updatePermissions(staff.id, updated, null, null, null);
    if (res.success) {
      setStaffList(prev=>prev.map(s=>s.id===staff.id?{...s,permissions:{...s.permissions,[permKey]:val}}:s));
      setSelected(s=>s?{...s,permissions:{...s.permissions,[permKey]:val}}:s);
    }
  };

  const handleRoleChange = async (staff, newRole) => {
    const res = await db.auth.updatePermissions(staff.id, null, newRole, null, null);
    if (res.success) {
      setStaffList(prev=>prev.map(s=>s.id===staff.id?{...s,role:newRole}:s));
      setSelected(s=>s?{...s,role:newRole}:s);
      showMsg("Role updated ✓");
    }
  };

  const inp = { padding:"8px 10px", border:`1px solid ${G.gray200}`, borderRadius:6,
    fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none",
    color:G.gray800, background:G.white };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:760, height:"100vh", display:"flex",
        flexDirection:"column", boxShadow:"-4px 0 24px rgba(0,0,0,0.15)" }}>

        {/* Header */}
        <div style={{ background:G.navy, padding:"14px 20px", display:"flex",
          alignItems:"center", gap:12, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>ADMIN ONLY</div>
            <div style={{ fontSize:17, fontWeight:700, color:"#fff", fontFamily:"'Playfair Display',serif" }}>User Management</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{staffList.length} staff accounts</div>
          </div>
          <button onClick={()=>setTab(tab==="users"?"create":"users")}
            className={tab==="create"?"btn btn-ghost":"btn btn-primary"}
            style={{ fontSize:11, ...(tab==="create"?{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none"}:{}) }}>
            {tab==="create" ? "← Back to Users" : "+ New User"}
          </button>
          <button onClick={onClose} className="btn btn-ghost"
            style={{ background:"rgba(255,255,255,0.1)", color:"#fff", border:"none" }}>✕</button>
        </div>

        {toast && (
          <div style={{ background:"#059669", color:"#fff", padding:"8px 20px",
            fontSize:12, fontWeight:500, flexShrink:0 }}>✓ {toast}</div>
        )}

        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* ── CREATE USER TAB ── */}
          {tab==="create" && (
            <div style={{ flex:1, overflowY:"auto", padding:20 }}>
              <div style={{ fontSize:14, fontWeight:600, color:G.navy, marginBottom:16 }}>Create New User</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Full Name</div>
                  <input style={inp} value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="e.g. Priya Sharma"/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Username</div>
                  <input style={inp} value={form.username} onChange={e=>setF("username",e.target.value.toLowerCase())} placeholder="e.g. priya (no spaces)"/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Password</div>
                  <input style={inp} type="password" value={form.password} onChange={e=>setF("password",e.target.value)} placeholder="Minimum 8 characters"/>
                </div>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Role</div>
                  <select style={inp} value={form.role} onChange={e=>setF("role",e.target.value)}>
                    {["admin","sales","ops","accounts","other"].map(r=>(
                      <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
                    ))}
                  </select>
                  {form.role==="other"&&<input style={{...inp,marginTop:4}} value={form.roleOther||""} onChange={e=>setF("roleOther",e.target.value)} placeholder="Specify role..."/>}
                </div>
                <div>
                  <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>Avatar Colour</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
                    {["#1A5276","#6C3483","#0E6655","#784212","#C0392B","#117A65","#1F618D","#784212"].map(c=>(
                      <div key={c} onClick={()=>setF("color",c)} style={{ width:24, height:24, borderRadius:"50%",
                        background:c, cursor:"pointer", border:form.color===c?"3px solid #fff":"3px solid transparent",
                        boxShadow:form.color===c?"0 0 0 2px "+c:"none" }}/>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div style={{ background:G.gray50, borderRadius:8, padding:12, marginBottom:16,
                display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:40, height:40, borderRadius:"50%", background:form.color,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:14, fontWeight:700, color:"#fff" }}>
                  {form.name ? form.name.slice(0,2).toUpperCase() : "??"}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{form.name||"Name"}</div>
                  <div style={{ fontSize:11, color:G.gray400 }}>@{form.username||"username"} · {ROLE_LABELS[form.role]||form.role}</div>
                </div>
              </div>

              {/* Role defaults info */}
              <div style={{ background:"#EBF5FB", borderRadius:8, padding:12, marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#1A5276", marginBottom:8 }}>
                  Default permissions for {ROLE_LABELS[form.role]||form.role} role:
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
                  {Object.entries(PERM_LABELS).map(([k,label])=>{
                    const val = ROLE_DEFAULTS[form.role]?.[k];
                    return (
                      <div key={k} style={{ fontSize:11, color:val?"#059669":"#9CA3AF",
                        display:"flex", alignItems:"center", gap:4 }}>
                        <span>{val?"✓":"✗"}</span> {label}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:10, color:G.gray400, marginTop:8 }}>
                  You can override individual permissions after creating the user.
                </div>
              </div>

              <button className="btn btn-primary"
                style={{ opacity:form.name&&form.username&&form.password?1:0.5 }}
                onClick={handleCreate}>
                Create User Account
              </button>
            </div>
          )}

          {/* ── USERS LIST + DETAIL ── */}
          {tab==="users" && (
            <>
              {/* User list */}
              <div style={{ width:240, borderRight:`1px solid ${G.gray200}`, overflowY:"auto", flexShrink:0 }}>
                {loading ? (
                  <div style={{ padding:24, textAlign:"center", color:G.gray400, fontSize:12 }}>Loading…</div>
                ) : staffList.map(s=>(
                  <div key={s.id} onClick={()=>setSelected(s)}
                    style={{ padding:"12px 14px", borderBottom:`1px solid ${G.gray100}`, cursor:"pointer",
                      background:selected?.id===s.id?"#EBF5FB":G.white,
                      opacity:s.active?1:0.5 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:s.color||"#1A5276",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>
                        {s.name?.slice(0,2).toUpperCase()||"??"}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                        <div style={{ fontSize:10, color:G.gray400 }}>@{s.username}</div>
                      </div>
                    </div>
                    <div style={{ marginTop:6, display:"flex", gap:4, alignItems:"center" }}>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10,
                        background:ROLE_BG[s.role]||"#F3F4F6", color:ROLE_COLOR[s.role]||G.gray600,
                        fontWeight:600 }}>{s.role}</span>
                      {!s.active && <span style={{ fontSize:10, color:"#991B1B", fontWeight:600 }}>INACTIVE</span>}
                      {s.id===currentUser.id && <span style={{ fontSize:10, color:G.gray400 }}>you</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* User detail */}
              <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                {!selected ? (
                  <div style={{ textAlign:"center", padding:48, color:G.gray400 }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>👤</div>
                    <div style={{ fontSize:13 }}>Select a user to view and edit</div>
                  </div>
                ) : (
                  <div>
                    {/* User header */}
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16,
                      padding:"12px 14px", background:G.gray50, borderRadius:10 }}>
                      <div style={{ width:48, height:48, borderRadius:"50%", background:selected.color||"#1A5276",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:16, fontWeight:700, color:"#fff", flexShrink:0 }}>
                        {selected.name?.slice(0,2).toUpperCase()||"??"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:700 }}>{selected.name}</div>
                        <div style={{ fontSize:12, color:G.gray400 }}>@{selected.username}</div>
                        {selected.last_login && <div style={{ fontSize:11, color:G.gray400 }}>Last login: {new Date(selected.last_login).toLocaleString("en-IN")}</div>}
                      </div>
                      {selected.id !== currentUser.id && (
                        <button onClick={()=>handleToggleActive(selected)}
                          className="btn btn-ghost" style={{ fontSize:11,
                            color:selected.active?"#C0392B":"#059669",
                            borderColor:selected.active?"#FECACA":"#A9DFBF" }}>
                          {selected.active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </div>

                    {/* Role */}
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:G.gray600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Role</div>
                      <div style={{ display:"flex", gap:6 }}>
                        {["admin","sales","ops","accounts"].map(r=>(
                          <button key={r} onClick={()=>selected.id!==currentUser.id&&handleRoleChange(selected,r)}
                            style={{ padding:"5px 12px", borderRadius:6, fontSize:12, cursor:selected.id===currentUser.id?"not-allowed":"pointer",
                              border:`1px solid ${selected.role===r?ROLE_COLOR[r]:G.gray200}`,
                              background:selected.role===r?ROLE_BG[r]:G.white,
                              color:selected.role===r?ROLE_COLOR[r]:G.gray600,
                              fontWeight:selected.role===r?600:400, fontFamily:"'Inter',sans-serif" }}>
                            {r.charAt(0).toUpperCase()+r.slice(1)}
                          </button>
                        ))}
                      </div>
                      {selected.id===currentUser.id && <div style={{ fontSize:10, color:G.gray400, marginTop:4 }}>You cannot change your own role</div>}
                    </div>

                    {/* Reset password */}
                    <div style={{ marginBottom:16, padding:"10px 14px", background:G.gray50, borderRadius:8 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:G.gray600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Reset Password</div>
                      {showPwFor===selected.id ? (
                        <div style={{ display:"flex", gap:8 }}>
                          <input style={{ ...inp, flex:1 }} type="password" value={newPw}
                            onChange={e=>setNewPw(e.target.value)} placeholder="New password (min 8 chars)"/>
                          <button className="btn btn-primary" style={{ fontSize:11 }}
                            onClick={()=>handleResetPassword(selected.id)}>Set</button>
                          <button className="btn btn-ghost" style={{ fontSize:11 }}
                            onClick={()=>{ setShowPwFor(null); setNewPw(""); }}>Cancel</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={()=>setShowPwFor(selected.id)}>
                          🔑 Reset Password
                        </button>
                      )}
                    </div>

                    {/* Individual permissions */}
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:G.gray600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>
                        Individual Permissions
                      </div>
                      <div style={{ fontSize:10, color:G.gray400, marginBottom:10 }}>
                        Overrides the role defaults. Changes take effect on next login.
                      </div>
                      {Object.entries(PERM_LABELS).map(([key, label])=>{
                        const roleDefault = ROLE_DEFAULTS[selected.role]?.[key] ?? false;
                        const override    = selected.permissions?.[key];
                        const effective   = override !== undefined ? override : roleDefault;
                        const isOverridden = override !== undefined && override !== roleDefault;
                        return (
                          <div key={key} style={{ display:"flex", alignItems:"center", gap:10,
                            padding:"7px 10px", borderRadius:6, marginBottom:4,
                            background:isOverridden?"#FEF9E7":G.gray50,
                            border:`1px solid ${isOverridden?"#F9E79F":G.gray100}` }}>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:12, color:G.gray800 }}>{label}</span>
                              {isOverridden && <span style={{ fontSize:10, color:"#784212", marginLeft:6 }}>overridden</span>}
                            </div>
                            <div style={{ display:"flex", gap:4 }}>
                              {[true, false].map(val=>(
                                <button key={String(val)} onClick={()=>handlePermChange(selected, key, val)}
                                  style={{ padding:"2px 10px", borderRadius:5, fontSize:11,
                                    cursor:"pointer", fontFamily:"'Inter',sans-serif",
                                    border:`1px solid ${effective===val?(val?"#059669":"#C0392B"):G.gray200}`,
                                    background:effective===val?(val?"#EAFAF1":"#FEE2E2"):G.white,
                                    color:effective===val?(val?"#059669":"#C0392B"):G.gray400,
                                    fontWeight:effective===val?600:400 }}>
                                  {val?"✓ Yes":"✗ No"}
                                </button>
                              ))}
                              {isOverridden && (
                                <button onClick={()=>handlePermChange(selected, key, undefined)}
                                  style={{ padding:"2px 8px", borderRadius:5, fontSize:10,
                                    cursor:"pointer", fontFamily:"'Inter',sans-serif",
                                    border:`1px solid ${G.gray200}`, background:G.white, color:G.gray400 }}
                                  title="Reset to role default">↺</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
