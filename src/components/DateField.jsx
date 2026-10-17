import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, formatDMY, parseDMY } = Lib;

// A date box that always reads and writes dd/mm/yyyy (the browser's own date input
// follows the computer's language setting), with a calendar button for picking.
export default function DateField({ value, onChange, ariaLabel, disabled, style }) {
  const [text, setText] = useState(formatDMY(value));
  const picker = useRef(null);
  useEffect(() => { setText(formatDMY(value)); }, [value]);
  const commit = () => {
    if (!text.trim()) { if (value) onChange(""); return; }
    const iso = parseDMY(text);
    if (iso) { if (iso !== value) onChange(iso); setText(formatDMY(iso)); }
    else setText(formatDMY(value));           // not a real date -> put the old one back
  };
  const base = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", background: G.white, color: G.gray800 };
  return (
    <span style={{ position: "relative", display: "inline-flex", width: "100%", ...style }}>
      <input aria-label={ariaLabel} disabled={disabled} value={text} placeholder="dd/mm/yyyy" inputMode="numeric"
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        style={{ ...base, width: "100%", paddingRight: 28 }} />
      <button type="button" tabIndex={-1} disabled={disabled} aria-label={`${ariaLabel || "Date"} calendar`}
        onClick={() => { const el = picker.current; if (!el) return; try { el.showPicker ? el.showPicker() : el.click(); } catch (e) { el.click(); } }}
        style={{ position: "absolute", right: 4, top: 3, border: "none", background: "none", cursor: "pointer", fontSize: 13 }}>📅</button>
      <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ position: "absolute", right: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
    </span>
  );
}
