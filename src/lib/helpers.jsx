// Small shared helpers/components used across many components:
// permission checks, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput.

import { useEffect } from "react";
import { ROLE_DEFAULTS, G, WF_STEPS } from "./constants.js";
import { getWFStepStatus } from "./utils.js";

// Merge role defaults with per-user overrides
export function getPermissions(user) {
  if (!user) return {};
  const defaults = ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS.ops;
  return { ...defaults, ...(user.permissions || {}) };
}

// Hook: check if current user can do something
export function useCan(user) {
  const perms = getPermissions(user);
  return (key) => perms[key] === true;
}

export function Avatar({ user, size = 28, onClick, style }) {
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: "50%",
      background: user?.color || "#1A5276",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 600, color: "#fff", flexShrink: 0,
      ...(style||{}) }}>
      {user?.avatar || (user?.name ? user.name.slice(0,2).toUpperCase() : "U")}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    new_query:  { label: "New Query",  bg: "#DBEAFE", color: "#1E40AF" },
    costing:    { label: "Costing",    bg: "#FEF3C7", color: "#92400E" },
    operations: { label: "Operations", bg: "#DCFCE7", color: "#166534" },
    finance:    { label: "Finance",    bg: "#F3E8FF", color: "#6B21A8" },
    completed:  { label: "Completed",  bg: "#ECFDF5", color: "#065F46" },
  };
  const s = map[status] || map.new_query;
  return <span className="status-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

// FIT (15 pax or less, yellow) vs GIT (16 pax or more, green) -- a small,
// deliberately subtle label meant to sit inline next to a tour/query name
// without competing with it. Manually set and edited by staff, not derived
// from any pax field, so it never silently misclassifies a group.
export function FileTypeBadge({ fileType }) {
  if (!fileType) return null;
  const isFit = fileType === "FIT";
  return (
    <span title={isFit ? "FIT — 15 pax or less" : "GIT — 16 pax or more"} style={{
      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
      background: isFit ? "#FEF9E7" : "#EAFAF1",
      color: isFit ? "#7D6608" : "#0E6655",
      border: `1px solid ${isFit ? "#F7DC6F" : "#A9DFBF"}`,
      marginLeft: 5, letterSpacing: "0.3px", whiteSpace: "nowrap", display: "inline-block",
    }}>{fileType}</span>
  );
}

export function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div className="toast">✓ {msg}</div>;
}

// Workflow progress — manual check/uncheck with clear visual distinction

export function WorkflowProgress({ autoDetected, manualWF, onToggle }) {
  const auto = autoDetected || {};
  const statuses = WF_STEPS.map(step => ({ step, ...getWFStepStatus(step.id, auto, manualWF) }));
  const nextId = statuses.find(s => !s.done)?.step.id;
  return (
    <div className="workflow-steps">
      {statuses.map(({ step, done, source }) => {
        const next = !done && step.id === nextId;
        return (
          <div key={step.id}
            className={`wf-step ${done?"done":next?"active":""}`}
            onClick={()=>onToggle && onToggle(step.id)}
            style={{cursor:onToggle?"pointer":"default"}}>
            <div className={`wf-num ${done?"done":next?"active":"pending"}`}
              style={{background:source==="auto"?"#0E6655":source==="manual"&&done?"#1A5276":undefined}}>
              {done?"✓":step.id}
            </div>
            <div className="wf-label" style={{flex:1}}>{step.label}</div>
            {source==="auto"&&<span style={{fontSize:9,color:"#0E6655",fontWeight:600,background:"#EAFAF1",padding:"1px 5px",borderRadius:4,flexShrink:0}} title="Automatically detected from real data -- click to override">auto</span>}
            {source==="manual"&&<span style={{fontSize:9,color:"#1A5276",fontWeight:600,background:"#EBF5FB",padding:"1px 5px",borderRadius:4,flexShrink:0}} title={done?"Manually confirmed -- click to mark pending":"Manually marked pending -- click to confirm done"}>{done?"confirmed":"marked pending"}</span>}
            {source==="pending"&&onToggle&&<span style={{fontSize:9,color:G.gray400,flexShrink:0}}>tap to confirm</span>}
          </div>
        );
      })}
    </div>
  );
}


export function OtherInput({ value, onChange, placeholder="Please specify..." }) {
  return (
    <input
      style={{marginTop:6,padding:"6px 9px",border:`1px solid ${G.accent}`,borderRadius:5,fontSize:12,
        fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:"#FFF9F8"}}
      value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    />
  );
}
