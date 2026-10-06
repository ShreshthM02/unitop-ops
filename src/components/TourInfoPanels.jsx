import { useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, RichTextEditor, blankHotelRow, moveItem, getHotelRows, tourDateRange } = Lib;

// Building blocks for the reworked Tour Info tabs (2026-10-06). Kept out of
// QueryDrawerWithQuote.jsx, which is already ~760 lines; the pure rules
// behind all of this live in lib/tourInfo.js.

const labelStyle = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const inputStyle = { padding: "6px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };

// ── Reordering ─────────────────────────────────────────────────────────────
// HTML5 drag-and-drop does not work on touch screens, so every draggable
// list ALSO gets ↑/↓ buttons. `draggable` sits on the ⠿ handle only, never
// the whole row, so selecting text inside an input doesn't start a drag.
export function useReorder(onMove) {
  const from = useRef(null);
  return {
    handleProps: (i) => ({
      draggable: true,
      onDragStart: (e) => {
        from.current = i;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", String(i)); } catch (err) { /* some browsers refuse; the ref is what we use */ }
        }
      },
      onDragEnd: () => { from.current = null; },
    }),
    rowProps: (i) => ({
      onDragOver: (e) => { if (from.current !== null) e.preventDefault(); },
      onDrop: (e) => {
        e.preventDefault();
        if (from.current !== null && from.current !== i) onMove(from.current, i);
        from.current = null;
      },
    }),
  };
}

export function ReorderControls({ index, count, onMove, handleProps }) {
  const btn = (disabled) => ({ border: "none", background: "none", padding: 0, lineHeight: 1, fontSize: 11, color: disabled ? G.gray200 : G.gray600, cursor: disabled ? "default" : "pointer" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, alignSelf: "center" }}>
      <span {...handleProps} title="Drag to reorder" aria-label="Drag to reorder" style={{ cursor: "grab", color: G.gray400, fontSize: 14, userSelect: "none", padding: "0 2px" }}>⠿</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button type="button" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)} style={btn(index === 0)}>▲</button>
        <button type="button" title="Move down" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} style={btn(index === count - 1)}>▼</button>
      </div>
    </div>
  );
}

// ── Dates ──────────────────────────────────────────────────────────────────
// Start/end pickers for a service. Picking a start with no end (or an end
// before it) sets the end to the same day, so the window is never inverted.
export function DateRangeFields({ start, end, onChange }) {
  const bad = !!(start && end && end < start);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>From</span>
      <input type="date" aria-label="Start date" value={start || ""} style={{ ...inputStyle, width: 140 }}
        onChange={e => { const s = e.target.value; onChange({ startDate: s, endDate: (!end || (s && end < s)) ? s : end }); }} />
      <span style={{ ...labelStyle, marginBottom: 0 }}>To</span>
      <input type="date" aria-label="End date" value={end || ""} min={start || undefined} style={{ ...inputStyle, width: 140, borderColor: bad ? "#C0392B" : G.gray200 }}
        onChange={e => onChange({ startDate: start || e.target.value, endDate: e.target.value })} />
      {bad && <span style={{ fontSize: 10, color: "#C0392B" }}>End is before start</span>}
      {!start && !end && <span style={{ fontSize: 10, color: "#B9770E" }}>No dates: won't show on Ground View</span>}
    </div>
  );
}

// One flight/train leg: the same fields as a domestic leg, used for the
// Arrival and Departure legs.
export function FlightLegFields({ leg, onChange }) {
  const l = leg || {};
  return (
    <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 6, padding: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
        <input style={inputStyle} type="date" aria-label="Date" value={l.date || ""} onChange={e => onChange({ date: e.target.value })} />
        <select style={inputStyle} aria-label="Type" value={l.type || "Flight"} onChange={e => onChange({ type: e.target.value })}>
          <option>Flight</option><option>Train</option>
        </select>
        <input style={inputStyle} aria-label="Number" value={l.number || ""} placeholder="No." onChange={e => onChange({ number: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        <input style={inputStyle} aria-label="From" value={l.from || ""} placeholder="From" onChange={e => onChange({ from: e.target.value })} />
        <input style={inputStyle} type="time" value={l.fromTime || ""} title="Departure time from origin" onChange={e => onChange({ fromTime: e.target.value })} />
        <input style={inputStyle} aria-label="To" value={l.to || ""} placeholder="To" onChange={e => onChange({ to: e.target.value })} />
        <input style={inputStyle} type="time" value={l.toTime || ""} title="Arrival time at destination" onChange={e => onChange({ toTime: e.target.value })} />
      </div>
    </div>
  );
}

// ── Hotels + Meals ─────────────────────────────────────────────────────────
// Day + date + hotel + rooming + breakfast + lunch + dinner. One row per
// hotel-stay-on-a-day, so a larger group using two hotels in a day simply
// has two rows. Meals come from the final quotation by default and are
// freely editable afterwards.
export function HotelsMealsPanel({ te, onChange, quotationSource, onSync, readOnly }) {
  const rows = getHotelRows(te);
  const days = te.days || [];
  const move = (from, to) => onChange(moveItem(rows, from, to));
  const { handleProps, rowProps } = useReorder(move);
  const update = (i, patch) => onChange(rows.map((r, xi) => xi === i ? { ...r, ...patch } : r));
  const remove = (i) => onChange(rows.filter((_, xi) => xi !== i));
  const add = () => { const last = rows[rows.length - 1]; onChange([...rows, blankHotelRow({ dayLabel: last?.dayLabel, date: last?.date })]); };
  const pickDay = (i, label) => {
    const day = days.find(d => d.dayLabel === label);
    update(i, { dayLabel: label, ...(day?.date ? { date: day.date } : {}) });
  };

  const synced = te.syncedFromQuotationVersion;
  const qv = quotationSource?.version?.version;
  const sourceLabel = quotationSource?.isFinal ? "final" : "latest, none marked final yet";
  const cols = "auto 0.9fr 1.05fr 1.5fr 1.1fr 0.9fr 0.9fr 0.9fr auto";

  return (
    <div>
      {!quotationSource ? (
        <div style={{ background: "#EBF5FB", border: "1px solid #A9CCE3", borderRadius: 6, padding: "8px 10px", fontSize: 10.5, color: "#1A5276", marginBottom: 10 }}>
          No quotation saved yet. Add rows by hand, or sync once a quotation exists (mark one final with the star).
        </div>
      ) : synced !== qv ? (
        <div style={{ background: "#FEF9E7", border: "1px solid #F7DC6F", borderRadius: 6, padding: "8px 10px", fontSize: 10.5, color: "#7D6608", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>
            Quotation v{qv} ({sourceLabel}) has hotel and meal data
            {synced ? ` newer than what this was last synced from (v${synced})` : " that hasn't been pulled in yet"}.
          </span>
          {!readOnly && <button type="button" className="btn btn-primary" style={{ fontSize: 10.5, padding: "3px 8px", flexShrink: 0 }} onClick={onSync}>↻ Sync from Quotation</button>}
        </div>
      ) : (
        <div style={{ background: "#EAFAF1", border: "1px solid #A9DFBF", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#196F3D", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>✓ In sync with Quotation v{qv} ({sourceLabel})</span>
          {!readOnly && <button type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px" }} onClick={onSync}>↻ Re-sync</button>}
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "16px 0", color: G.gray400, fontSize: 12 }}>No hotel rows yet. Sync from the quotation or add a row.</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 820 }}>
          {rows.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, padding: "0 8px", marginBottom: 4 }}>
              {["", "Day", "Date", "Hotel", "Rooming", "Breakfast", "Lunch", "Dinner", ""].map((h, i) => <div key={i} style={labelStyle}>{h}</div>)}
            </div>
          )}
          {rows.map((r, i) => {
            const labelKnown = !r.dayLabel || days.some(d => d.dayLabel === r.dayLabel);
            return (
              <div key={r.id || i} {...rowProps(i)} data-testid="hotel-row"
                style={{ display: "grid", gridTemplateColumns: cols, gap: 6, marginBottom: 6, background: G.gray50, padding: 8, borderRadius: 6, border: `1px solid ${G.gray200}` }}>
                <ReorderControls index={i} count={rows.length} onMove={move} handleProps={handleProps(i)} />
                <select style={inputStyle} aria-label="Day" value={r.dayLabel || ""} onChange={e => pickDay(i, e.target.value)}>
                  <option value="">Day…</option>
                  {!labelKnown && <option value={r.dayLabel}>{r.dayLabel}</option>}
                  {days.map(d => <option key={d.id} value={d.dayLabel}>{d.dayLabel}</option>)}
                </select>
                <input style={inputStyle} type="date" aria-label="Date" value={r.date || ""} onChange={e => update(i, { date: e.target.value })} />
                <input style={inputStyle} aria-label="Hotel name" value={r.hotelName || ""} placeholder="Hotel name" onChange={e => update(i, { hotelName: e.target.value })} />
                <input style={inputStyle} aria-label="Rooming" value={r.rooms || ""} placeholder="e.g. 5 Twin, 1 Sgl" onChange={e => update(i, { rooms: e.target.value })} />
                <input style={inputStyle} aria-label="Breakfast" value={r.breakfast || ""} placeholder="—" onChange={e => update(i, { breakfast: e.target.value })} />
                <input style={inputStyle} aria-label="Lunch" value={r.lunch || ""} placeholder="—" onChange={e => update(i, { lunch: e.target.value })} />
                <input style={inputStyle} aria-label="Dinner" value={r.dinner || ""} placeholder="—" onChange={e => update(i, { dinner: e.target.value })} />
                {!readOnly && <span title="Remove row" aria-label="Remove row" style={{ cursor: "pointer", color: G.gray400, fontSize: 14, alignSelf: "center" }} onClick={() => remove(i)}>✕</span>}
              </div>
            );
          })}
        </div>
      </div>
      {!readOnly && <button type="button" className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 10 }} onClick={add}>+ Add row</button>}
    </div>
  );
}

// ── Other services ─────────────────────────────────────────────────────────
// Anything that isn't a transporter / facilitator / local handler / leg:
// a start and end date and a rich-text description.
export function OtherServicesPanel({ services, onChange, query, readOnly }) {
  const list = services || [];
  const update = (i, patch) => onChange(list.map((s, xi) => xi === i ? { ...s, ...patch } : s));
  const remove = (i) => onChange(list.filter((_, xi) => xi !== i));
  const add = () => {
    const range = tourDateRange(query);
    onChange([...list, { id: Date.now(), startDate: range.start, endDate: range.end, detailsHtml: "" }]);
  };
  return (
    <div>
      {list.map((s, i) => (
        <div key={s.id} data-testid="other-service" style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <DateRangeFields start={s.startDate} end={s.endDate} onChange={patch => update(i, patch)} />
            </div>
            {!readOnly && <span title="Remove service" aria-label="Remove service" style={{ cursor: "pointer", color: G.gray400, fontSize: 14 }} onClick={() => remove(i)}>✕</span>}
          </div>
          <div style={{ marginTop: 6 }}>
            <RichTextEditor value={s.detailsHtml || ""} onChange={v => update(i, { detailsHtml: v })} readOnly={readOnly} minHeight={70} placeholder="Details of the service" />
          </div>
        </div>
      ))}
      {!readOnly && <button type="button" className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 14 }} onClick={add}>+ Add Other Service</button>}
    </div>
  );
}

// ── Vendor picker with a "write your own" option ───────────────────────────
// A row is either linked to a Master Data vendor (vendorId) or carries a
// typed one-off name (customName) for someone not in the vendor list. An
// empty-string customName with no vendorId means "custom, not typed yet".
export const CUSTOM_VENDOR = "__custom__";
export function VendorOrCustomSelect({ entry, vendorOptions, onChange, ariaLabel = "Vendor" }) {
  const isCustom = !entry.vendorId && typeof entry.customName === "string";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select aria-label={ariaLabel} style={inputStyle} value={isCustom ? CUSTOM_VENDOR : (entry.vendorId || "")}
        onChange={e => {
          const v = e.target.value;
          if (v === CUSTOM_VENDOR) onChange({ vendorId: "", customName: entry.customName || "" });
          else onChange({ vendorId: v, customName: undefined });
        }}>
        <option value="">Select...</option>
        {vendorOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        <option value={CUSTOM_VENDOR}>✍ Other (write a name)…</option>
      </select>
      {isCustom && (
        <input style={inputStyle} aria-label="Custom name" placeholder="Type the name" value={entry.customName || ""}
          onChange={e => onChange({ customName: e.target.value })} />
      )}
    </div>
  );
}

// ── Save bar for the Tour Info tabs ────────────────────────────────────────
// Always visible (the old button only appeared once something changed, which
// read as "there is no save"). Disabled until there is something to save, and
// says plainly whether the last save went through.
export function TourInfoSaveBar({ dirty, saving, status, onSave, label = "Save", readOnly }) {
  if (readOnly) return null;
  const note = saving ? "Saving…"
    : dirty ? "Unsaved changes"
    : status === "error" ? "Last save failed — try again"
    : status === "saved" ? "✓ All changes saved" : "";
  return (
    <div style={{ position: "sticky", bottom: 0, background: G.white, borderTop: `1px solid ${G.gray100}`, padding: "8px 0", marginTop: 8, display: "flex", alignItems: "center", gap: 10, zIndex: 2 }}>
      <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} disabled={!dirty || saving} onClick={onSave}>💾 {label}</button>
      <span role="status" style={{ fontSize: 10.5, whiteSpace: "nowrap", color: dirty ? "#B7791F" : status === "error" ? "#C0392B" : "#196F3D" }}>{note}</span>
    </div>
  );
}
