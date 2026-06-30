// Small shared helpers/components used across many components:
// permission checks, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput.

import { useEffect } from "react";
import { ROLE_DEFAULTS, G, WF_STEPS, STATUS_WF_MAP } from "./constants.js";

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

export function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div className="toast">✓ {msg}</div>;
}

// Workflow progress — manual check/uncheck with clear visual distinction

export function WorkflowProgress({ status, manualChecked, onToggle }) {
  const doneByStatus = STATUS_WF_MAP[status] || [];
  return (
    <div className="workflow-steps">
      {WF_STEPS.map(step => {
        const autoD = doneByStatus.includes(step.id);
        const manD  = (manualChecked||[]).includes(step.id);
        const done  = autoD || manD;
        const next  = !done && WF_STEPS.find(s=>!(doneByStatus.includes(s.id)||(manualChecked||[]).includes(s.id)))?.id===step.id;
        return (
          <div key={step.id}
            className={`wf-step ${done?"done":next?"active":""}`}
            onClick={()=>!autoD && onToggle && onToggle(step.id)}
            style={{cursor:!autoD&&onToggle?"pointer":"default"}}>
            <div className={`wf-num ${done?"done":next?"active":"pending"}`}
              style={{background:autoD?"#0E6655":manD?"#1A5276":undefined}}>
              {done?"✓":step.id}
            </div>
            <div className="wf-label" style={{flex:1}}>{step.label}</div>
            {autoD&&<span style={{fontSize:9,color:"#0E6655",fontWeight:600,background:"#EAFAF1",padding:"1px 5px",borderRadius:4,flexShrink:0}}>auto</span>}
            {manD&&!autoD&&<span style={{fontSize:9,color:"#1A5276",fontWeight:600,background:"#EBF5FB",padding:"1px 5px",borderRadius:4,flexShrink:0}} title="Click to unmark">manual ✕</span>}
            {!done&&!next&&onToggle&&<span style={{fontSize:9,color:G.gray400,flexShrink:0}}>tap</span>}
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
