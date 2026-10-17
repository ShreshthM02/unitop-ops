import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const { G, SERVICE_STATUSES, SERVICE_STATUS_COLORS, serviceStatusTone } = Lib;

// The usual status dropdown, plus a "Custom…" option for free text. A status that
// is not in the list (typed here, or by anyone, anywhere) is shown as-is in a small
// text box and coloured by keyword, so the list never has to keep growing.
const CUSTOM = "__custom__";
export default function StatusSelect({ value, onChange, disabled, ariaLabel = "Status", compact }) {
  const known = SERVICE_STATUSES.includes(value);
  const isCustom = !!value && !known;
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(isCustom ? value : "");
  useEffect(() => { setDraft(isCustom ? value : ""); if (known) setTyping(false); }, [value]); // eslint-disable-line
  const showText = isCustom || typing;
  const tone = SERVICE_STATUS_COLORS[serviceStatusTone(value)] || SERVICE_STATUS_COLORS.requested;
  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else if (!t && !isCustom) setTyping(false);
  };
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select aria-label={ariaLabel} disabled={disabled} value={showText ? CUSTOM : value}
        onChange={e => { if (e.target.value === CUSTOM) { setTyping(true); } else { setTyping(false); onChange(e.target.value); } }}
        style={{ padding: compact ? "2px 6px" : "3px 8px", borderRadius: 6, fontSize: 11, fontFamily: "'Inter',sans-serif", outline: "none", cursor: disabled ? "default" : "pointer", fontWeight: 600,
          border: `1px solid ${tone.color}`, background: tone.bg, color: tone.color }}>
        {SERVICE_STATUSES.map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {showText && (
        <input aria-label={`${ariaLabel} (custom)`} value={draft} disabled={disabled} placeholder="Type a status" autoFocus={typing && !isCustom}
          onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          style={{ padding: "3px 7px", borderRadius: 6, fontSize: 11, width: 150, border: `1px solid ${tone.color}`, background: G.white, color: G.gray800, fontFamily: "'Inter',sans-serif", outline: "none" }} />
      )}
    </span>
  );
}
