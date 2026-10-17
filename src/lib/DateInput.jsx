import { useState, useEffect, useRef } from 'react';
import { formatDMY, parseDMY } from './dateUtils.js';

// Drop-in replacement for <input type="date"> that ALWAYS reads and writes
// dd/mm/yyyy, whatever the browser or computer language. Same props as the native
// input (value as yyyy-mm-dd, onChange(e) with e.target.value as yyyy-mm-dd, min,
// max, style, disabled ...), so it can be swapped in anywhere. Type the date
// (slashes are added as you go) or use the 📅 button for a calendar.
const LAYOUT = ["width", "minWidth", "maxWidth", "flex", "flexGrow", "flexShrink", "flexBasis", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "alignSelf", "gridColumn", "gridRow"];
const COMPLETE = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/;

export default function DateInput({ value, onChange, min, max, style, disabled, readOnly, className, placeholder, onBlur, autoFocus, ...rest }) {
  const shown = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || "") ? formatDMY(v) : (v || ""));
  const [text, setText] = useState(shown(value));
  const picker = useRef(null);
  useEffect(() => { setText(shown(value)); }, [value]);
  const emit = (iso) => onChange && onChange({ target: { value: iso }, currentTarget: { value: iso } });
  const inRange = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const commit = () => {
    if (!text.trim()) { if (value) emit(""); return; }
    const iso = parseDMY(text);
    if (iso && inRange(iso)) { if (iso !== value) emit(iso); setText(formatDMY(iso)); }
    else setText(shown(value));
  };
  const onText = (e) => {
    let t = e.target.value;
    // type 14012027 or 14/01/2027 -- slashes appear after the day and the month
    if (t.length > text.length && /^\d{1,2}(\/\d{1,2})?$/.test(t) && /^(\d{2}|\d{2}\/\d{2})$/.test(t)) t += "/";
    setText(t);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t) && inRange(t) && t !== value) { emit(t); return; }
    if (COMPLETE.test(t)) { const iso = parseDMY(t); if (iso && inRange(iso) && iso !== value) emit(iso); }
  };
  const st = style || {}, wrap = { position: "relative", display: "inline-block" }, inner = { ...st };
  LAYOUT.forEach(k => { if (st[k] !== undefined) { wrap[k] = st[k]; delete inner[k]; } });
  if (wrap.width === undefined && wrap.flex === undefined) wrap.width = "100%";
  return (
    <span style={wrap}>
      <input {...rest} className={className} disabled={disabled} readOnly={readOnly} autoFocus={autoFocus} inputMode="numeric" autoComplete="off"
        value={text} placeholder={placeholder || "dd/mm/yyyy"} onChange={onText} maxLength={10}
        onBlur={(e) => { commit(); onBlur && onBlur(e); }} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        style={{ ...inner, width: "100%", boxSizing: "border-box", paddingRight: 24 }} />
      {!disabled && !readOnly && (
        <>
          <button type="button" tabIndex={-1} aria-label="Open calendar" title="Pick from calendar"
            onClick={() => { const el = picker.current; if (!el) return; try { el.showPicker ? el.showPicker() : el.click(); } catch (err) { el.click(); } }}
            style={{ position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>📅</button>
          <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={/^\d{4}-\d{2}-\d{2}/.test(value || "") ? value : ""} min={min} max={max}
            onChange={(e) => e.target.value && emit(e.target.value)}
            style={{ position: "absolute", right: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
        </>
      )}
    </span>
  );
}
