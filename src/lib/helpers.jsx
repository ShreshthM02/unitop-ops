// Small shared helpers/components used across many components:
// permission checks, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput.

import { useEffect, useRef } from "react";
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
    operations: { label: "Operations", bg: "#FCE4EC", color: "#AD1457" },
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

// ─── RichTextEditor (extracted 2026-08-27 from Exchange Order's Service
// Details field, which was the first place this shipped) -- a small
// contentEditable field with a Bold/Italic/Underline/Bullet-list toolbar,
// no character limit. Deliberately shared across every document that
// needs the same free-form formatted-text field (RE lines, notes,
// remarks, closing paragraphs, sign-offs, opening lines, etc.) rather
// than reimplemented per document. Exchange Order's own Service Details
// field keeps its separate character/line fit-budget footer (that
// belongs to Exchange Order's specific print-space constraint, not to
// rich text editing in general) -- this shared version is the plain
// editor without that budget UI, for every other document's use.
//
// The toolbar is deliberately understated -- thin border, light gray
// text, no fill -- so it reads as a quiet editing affordance sitting
// just above the field, not a loud, attention-grabbing control bar.
export function RichTextEditor({ value, onChange, readOnly, minHeight = 90 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
  }, [value]);
  const exec = (cmd) => {
    document.execCommand(cmd);
    ref.current?.focus();
    onChange(ref.current.innerHTML);
  };
  const btn = (lbl, cmd, title) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)} title={title}
      style={{ padding: "2px 7px", fontSize: 10, fontWeight: 500, border: `1px solid ${G.gray200}`, borderRadius: 4, background: "transparent", color: G.gray400, cursor: "pointer", marginRight: 3 }}>
      {lbl}
    </button>
  );
  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 4 }}>
          {btn("B", "bold", "Bold")}
          {btn("I", "italic", "Italic")}
          {btn("U", "underline", "Underline")}
          {btn("List", "insertUnorderedList", "Bullet list")}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={() => onChange(ref.current.innerHTML)}
        style={{ minHeight, padding: "8px 10px", border: `1px solid ${G.gray200}`, borderRadius: 6, fontSize: 12, lineHeight: 1.5, fontFamily: "'Inter',sans-serif", background: readOnly ? G.gray50 : G.white, outline: "none" }} />
    </div>
  );
}
