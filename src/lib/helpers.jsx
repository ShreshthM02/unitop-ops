// Small shared helpers/components used across many components:
// permission checks, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, SearchableSelect, RichTextEditor.

import { useEffect, useRef, useState } from "react";
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

// Real fix: this used to be name.slice(0,2) -- the first two raw
// characters of the full string, so "Priya Sharma" showed "PR"
// instead of real initials "PS". Splits on whitespace and takes the
// first letter of each word (up to two); a single-word name falls
// back to its own first two letters, matching the old behavior only
// for that one case, since there's no second word to take an initial
// from.
export function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ user, size = 28, onClick, style }) {
  // avatarUrl (a real uploaded photo) takes priority over the color +
  // initials fallback, which now only ever shows for someone who
  // hasn't uploaded a photo -- both are still read from user.avatar/
  // user.color, unchanged, so nothing here breaks for anyone without
  // one.
  if (user?.avatarUrl || user?.avatar_url) {
    return (
      <img src={user.avatarUrl || user.avatar_url} onClick={onClick} alt={user?.name || "avatar"}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
          ...(style||{}) }}/>
    );
  }
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: "50%",
      background: user?.color || "#1A5276",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 600, color: "#fff", flexShrink: 0,
      ...(style||{}) }}>
      {user?.avatar || getInitials(user?.name)}
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

// Real, pre-existing bug caught on review: this always prefixed "✓"
// regardless of the message's actual content, so an error toast (e.g.
// "Error: ...", "Failed to save...") displayed with a checkmark as if
// it had succeeded -- misleading on every one of its several call
// sites (UnitopApp, UserManagementPanel), not just newly-added ones.
// type defaults to "success" so every existing call site (none of
// which pass it) keeps its exact current behavior; only genuinely
// error messages need to opt in explicitly.
export function Toast({ msg, onDone, type = "success" }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div className="toast">{type === "error" ? "⚠" : "✓"} {msg}</div>;
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
export function RichTextEditor({ value, onChange, readOnly, minHeight = 90, signatures, placeholder }) {
  const ref = useRef(null);
  const [sigOpen, setSigOpen] = useState(false);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
  }, [value]);
  const exec = (cmd) => {
    document.execCommand(cmd);
    ref.current?.focus();
    onChange(ref.current.innerHTML);
  };
  // Real, direct request: pasted text was carrying its original source's
  // formatting (font, size, color) straight into the editor, with no way
  // to change any of that here -- there's no font/size control in this
  // editor at all. Intercepts the paste, discards everything but the
  // plain text, and inserts that instead, so pasted content always
  // picks up this editor's own default styling like anything typed
  // directly, matching the rest of the text around it.
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    onChange(ref.current.innerHTML);
  };
  const btn = (lbl, cmd, title) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)} title={title}
      style={{ padding: "2px 7px", fontSize: 10, fontWeight: 500, border: `1px solid ${G.gray200}`, borderRadius: 4, background: "transparent", color: G.gray400, cursor: "pointer", marginRight: 3 }}>
      {lbl}
    </button>
  );
  // Item 11: inserts the chosen signature's HTML at the current cursor
  // position via the same execCommand mechanism the B/I/U/List buttons
  // already use -- onMouseDown preventDefault on both the toggle and
  // each signature button keeps focus (and the cursor position) inside
  // the editable area the whole time, so this doesn't need to manually
  // save/restore a selection. Pasted as real, editable content -- the
  // person can immediately adjust it, never a locked block.
  const stripHtml = (html) => { const d = document.createElement("div"); d.innerHTML = (html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li)>/gi, " "); return (d.textContent || "").replace(/\s+/g, " ").trim(); };
  const insertSignature = (sig) => {
    document.execCommand("insertHTML", false, sig.content);
    ref.current?.focus();
    onChange(ref.current.innerHTML);
    setSigOpen(false);
  };
  return (
    <div style={{ position: "relative" }}>
      {!readOnly && (
        <div style={{ marginBottom: 4, display: "flex", alignItems: "center" }}>
          {btn("B", "bold", "Bold")}
          {btn("I", "italic", "Italic")}
          {btn("U", "underline", "Underline")}
          {btn("List", "insertUnorderedList", "Bullet list")}
          {signatures && signatures.length > 0 && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setSigOpen(o => !o)} title="Insert a saved signature"
              style={{ padding: "2px 7px", fontSize: 10, fontWeight: 500, border: `1px solid ${G.gray200}`, borderRadius: 4, background: sigOpen ? G.gray50 : "transparent", color: G.gray600, cursor: "pointer" }}>
              ✒ Signature ▾
            </button>
          )}
        </div>
      )}
      {sigOpen && (
        <div style={{ position: "absolute", zIndex: 20, top: 26, left: 0, minWidth: 220, maxWidth: 320, background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 6, boxShadow: "0 4px 14px rgba(0,0,0,0.12)", padding: 4 }}>
          {signatures.map(sig => (
            <button key={sig.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertSignature(sig)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", border: "none", borderRadius: 4, background: "transparent", cursor: "pointer", fontFamily: "'Inter',sans-serif" }}
              onMouseEnter={e => e.currentTarget.style.background = G.gray50} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontSize: 12, fontWeight: 600, color: G.gray800 }}>{sig.name}</div>
              <div style={{ fontSize: 10, color: G.gray400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripHtml(sig.content) || "(empty)"}</div>
            </button>
          ))}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={() => onChange(ref.current.innerHTML)}
        onPaste={onPaste}
        data-placeholder={placeholder}
        className={placeholder ? "rich-text-area" : undefined}
        style={{ minHeight, padding: "8px 10px", border: `1px solid ${G.gray200}`, borderRadius: 6, fontSize: 12, lineHeight: 1.5, fontFamily: "'Inter',sans-serif", background: readOnly ? G.gray50 : G.white, outline: "none" }} />
    </div>
  );
}

// Items 3/5: a bank-statement-style time-period filter, reused across
// Agent Query History/Financial Ledger and Vendor Service History/
// Contracted Rates/Financial Ledger/Exchange Orders -- one component,
// one matching helper, six call sites, rather than six separate
// implementations that would drift.
export function isWithinPeriod(dateStr, filter) {
  if (!filter || filter.preset === "all") return true;
  if (!dateStr) return false; // no date at all -- can't place it in any period, so excluded once a period is actually selected
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (filter.preset === "custom") {
    if (filter.from && d < new Date(filter.from)) return false;
    if (filter.to && d > new Date(filter.to + "T23:59:59")) return false;
    return true;
  }
  const months = { "3m": 3, "6m": 6, "1y": 12 }[filter.preset];
  if (!months) return true;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d >= cutoff;
}

// For records with their OWN date RANGE rather than a single date
// (Contracted Rates' "Rates From/Till") -- shown when that range
// overlaps the selected period at all, not just when it starts within it.
export function rangeOverlapsPeriod(fromStr, tillStr, filter) {
  if (!filter || filter.preset === "all") return true;
  if (!fromStr && !tillStr) return true; // no dates entered at all -- can't determine relevance, so never hidden by a date filter
  const rangeFrom = fromStr ? new Date(fromStr) : null;
  const rangeTill = tillStr ? new Date(tillStr) : null;
  let periodFrom, periodTo;
  if (filter.preset === "custom") {
    periodFrom = filter.from ? new Date(filter.from) : null;
    periodTo = filter.to ? new Date(filter.to + "T23:59:59") : null;
  } else {
    const months = { "3m": 3, "6m": 6, "1y": 12 }[filter.preset];
    if (!months) return true;
    periodFrom = new Date();
    periodFrom.setMonth(periodFrom.getMonth() - months);
    periodTo = null;
  }
  if (periodTo && rangeFrom && rangeFrom > periodTo) return false;
  if (periodFrom && rangeTill && rangeTill < periodFrom) return false;
  return true;
}

export function TimePeriodFilter({ value, onChange }) {
  const filter = value || { preset: "all" };
  const PRESETS = [["all","All time"],["3m","Past 3 months"],["6m","Past 6 months"],["1y","Past 1 year"],["custom","Custom range"]];
  const selStyle = { padding: "5px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 11, fontFamily: "'Inter',sans-serif", color: G.gray800, background: G.white };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select value={filter.preset} onChange={e=>onChange({ ...filter, preset: e.target.value })} style={selStyle} title="Filter by time period">
        {PRESETS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select>
      {filter.preset === "custom" && (
        <>
          <input type="date" value={filter.from||""} onChange={e=>onChange({...filter, from:e.target.value})} style={selStyle}/>
          <span style={{ fontSize: 11, color: G.gray400 }}>to</span>
          <input type="date" value={filter.to||""} onChange={e=>onChange({...filter, to:e.target.value})} style={selStyle}/>
        </>
      )}
    </div>
  );
}

// Real, direct request: a long native <select> (e.g. every agent in
// the system) forces scrolling through the whole list with no way to
// type and narrow it down. A real combobox instead: a text input that
// shows the current selection, opens a filtered dropdown as you type,
// and closes on an outside click or Escape -- exactly the "type to
// search" affordance a plain <select> can't offer.
export function SearchableSelect({ value, onChange, options, getLabel, getValue, placeholder = "Type to search…", style, emptyLabel = "— None —", fallbackDisplay, onFreeText }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const selected = options.find(o => getValue(o) === value);

  useEffect(() => {
    const onOutside = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => getLabel(o).toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Real, direct request: picking a vendor shouldn't be the only option
  // when the real one (e.g. a hotel) isn't in the vendor list yet --
  // typing something that matches nothing offers an explicit "use this
  // as free text" choice, rather than forcing either a vendor pick or
  // an empty field. onFreeText is opt-in per usage, since most
  // SearchableSelect pickers in this app (staff, agents, etc.)
  // genuinely shouldn't accept arbitrary text.
  const trimmedQuery = query.trim();
  const exactMatch = trimmedQuery && options.some(o => getLabel(o).toLowerCase() === trimmedQuery.toLowerCase());
  const showFreeTextOption = onFreeText && trimmedQuery && !exactMatch;

  return (
    <div ref={boxRef} style={{ position: "relative", ...style }}>
      <input
        style={{ padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12,
          fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white }}
        value={open ? query : (selected ? getLabel(selected) : (fallbackDisplay || ""))}
        placeholder={selected ? getLabel(selected) : (fallbackDisplay || placeholder)}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && showFreeTextOption) { onFreeText(trimmedQuery); setOpen(false); }
        }}
      />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: G.white,
          border: `1px solid ${G.gray200}`, borderRadius: 5, marginTop: 2, maxHeight: 220, overflowY: "auto",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "7px 9px", fontSize: 12, color: G.gray400, cursor: "pointer" }}
            onMouseDown={e => { e.preventDefault(); onChange(""); setOpen(false); }}>{emptyLabel}</div>
          {showFreeTextOption && (
            <div style={{ padding: "7px 9px", fontSize: 12, cursor: "pointer", color: G.accent, fontWeight: 600,
              borderBottom: `1px solid ${G.gray200}` }}
              onMouseDown={e => { e.preventDefault(); onFreeText(trimmedQuery); setOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = G.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              + Use "{trimmedQuery}" (not in vendor list)
            </div>
          )}
          {filtered.length === 0 && !showFreeTextOption && <div style={{ padding: "7px 9px", fontSize: 12, color: G.gray400 }}>No matches</div>}
          {filtered.map(o => (
            <div key={getValue(o)} style={{ padding: "7px 9px", fontSize: 12, cursor: "pointer" }}
              onMouseDown={e => { e.preventDefault(); onChange(getValue(o)); setOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = G.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {getLabel(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Real, direct request: a rich text editing area for vendor rate
// notes, since the free-text terms these carry (FOC policies,
// complimentary-room rules, tax caveats) are genuinely long and
// benefit from real structure -- bold, italic, and bullet lists --
// rather than one flat, unformatted block. Uses the shared
// RichTextEditor above (contentEditable + document.execCommand)
// rather than a separate implementation.
