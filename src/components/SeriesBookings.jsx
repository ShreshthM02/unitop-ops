import { useState, useEffect, useMemo, useCallback } from 'react';
import * as Lib from '../lib/index.js';
import DateField from './DateField.jsx';
import StatusSelect from './StatusSelect.jsx';
const { G, db, VENDOR_TYPES, RichTextEditor, loadSeriesBookings, addVendorBooking, deleteVendorBooking, saveServiceEntry, deleteServiceEntry,
  setServiceStatus, filterEntries, stateCounts, seriesSummary, formatDMY, serviceState } = Lib;

// Series → Bookings. Pick a vendor to open a vendor booking, then add the
// individual bookings inside it: tour file, title, dates, reservation / PNR no.,
// status, rates and remarks. Saving one registers it as a service in that tour
// file ("Vendor / Title / Reservation") -- it is the same record, so a status
// changed here shows there and the other way round.

const lbl = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const inp = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", background: G.white, color: G.gray800 };
const STATE_LABEL = { "": "All", open: "Open", confirmed: "Confirmed", soldout: "Sold out", cancelled: "Cancelled" };
const STATE_STYLE = { open: ["#FEF3C7", "#92400E"], confirmed: ["#DCFCE7", "#166534"], soldout: ["#FEE2E2", "#991B1B"], cancelled: ["#F3F4F6", "#6B7280"] };
const blankFilter = { text: "", vendor: "", type: "", queryId: "", state: "", from: "", to: "", noReservation: false };
const blankEntry = (queryId = "") => ({ queryId, title: "", dateFrom: "", dateTo: "", reservationNo: "", status: "requested", rates: "", remarksHtml: "" });

function Field({ label, children, grow }) { return <div style={{ flex: grow || "1 1 150px", minWidth: 0 }}><div style={lbl}>{label}</div>{children}</div>; }

export default function SeriesBookings({ series, queries, vendors, currentUser, canEdit = true, onSummary }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(blankFilter);
  const [groupBy, setGroupBy] = useState("vendor");
  const [picking, setPicking] = useState(null);       // { vendorName } while choosing a vendor
  const [draft, setDraft] = useState(null);           // { groupId, entry }
  const [saving, setSaving] = useState(false);
  const by = currentUser && currentUser.name;

  const files = useMemo(() => (queries || []).filter(q => q.seriesId === series.id), [queries, series.id]);
  const fileById = useMemo(() => Object.fromEntries((queries || []).map(q => [q.id, q])), [queries]);
  const fileLabel = (id) => { const q = fileById[id]; return q ? `${q.tourFileId || q.id}${q.groupName ? " · " + q.groupName : ""}` : id; };

  const reload = useCallback(async () => {
    const r = await loadSeriesBookings(db, series.id);
    setGroups(r.groups); setError(r.error || ""); setLoading(false);
  }, [series.id]);
  useEffect(() => { setLoading(true); reload(); }, [reload]);
  useEffect(() => { onSummary && onSummary(seriesSummary(groups)); }, [groups]); // eslint-disable-line

  const counts = useMemo(() => stateCounts(groups), [groups]);
  const matches = useMemo(() => filterEntries(groups, filter), [groups, filter]);
  const filtering = JSON.stringify(filter) !== JSON.stringify(blankFilter);
  const setF = (k, v) => setFilter(p => ({ ...p, [k]: v }));
  const vendorList = (vendors || []).filter(v => !v.deleted).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const typesInUse = [...new Set(groups.map(g => g.vendorType).filter(Boolean))];

  const startVendor = async () => {
    const name = (picking.vendorName || "").trim();
    const v = vendorList.find(x => x.name === name);
    const res = await addVendorBooking(db, { seriesId: series.id, vendorId: v ? v.id : "", vendorName: name, vendorType: v ? (v.type || v.category || "") : "Other" }, by);
    if (res.error) { setError(res.error); return; }
    setPicking(null); await reload();
    if (res.id) setDraft({ groupId: res.id, entry: blankEntry() });
  };
  const saveEntry = async () => {
    const group = groups.find(g => g.id === draft.groupId);
    setSaving(true); setError("");
    const res = await saveServiceEntry(db, draft.entry, group, by);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setDraft(null); reload();
  };
  const changeStatus = async (entry, status) => {
    setGroups(gs => gs.map(g => ({ ...g, entries: g.entries.map(e => e.id === entry.id ? { ...e, status } : e) })));
    const res = await setServiceStatus(db, entry, status);
    if (res.error) { setError(res.error); reload(); }
  };
  const removeEntry = async (entry) => {
    if (!window.confirm(`Delete "${entry.name || entry.title}"? It is also removed from its tour file's services.`)) return;
    const res = await deleteServiceEntry(db, entry);
    if (res.error) setError(res.error); else reload();
  };
  const removeGroup = async (g) => {
    if (!window.confirm(`Delete the ${g.vendorName} booking${g.entries.length ? ` and its ${g.entries.length} service${g.entries.length === 1 ? "" : "s"} (they are also removed from the tour files)` : ""}?`)) return;
    const res = await deleteVendorBooking(db, g);
    if (res.error) setError(res.error); else reload();
  };

  if (loading) return <div style={{ fontSize: 12, color: G.gray400 }}>Loading bookings…</div>;

  const setE = (k, v) => setDraft(p => ({ ...p, entry: { ...p.entry, [k]: v } }));
  const entryForm = (g) => draft && draft.groupId === g.id && (
    <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, margin: "8px 0", background: G.gray50 }} data-testid="entry-form">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Tour file" grow="2 1 220px">
          <select style={inp} aria-label="Tour file" value={draft.entry.queryId} onChange={e => setE("queryId", e.target.value)}>
            <option value="">— no file yet (series only) —</option>
            {files.map(q => <option key={q.id} value={q.id}>{fileLabel(q.id)}</option>)}
          </select>
        </Field>
        <Field label="Title" grow="2 1 220px"><input style={inp} aria-label="Title" value={draft.entry.title} onChange={e => setE("title", e.target.value)} placeholder="e.g. Twin rooms, 2 nights" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Field label="Start of service"><DateField ariaLabel="Start date" value={draft.entry.dateFrom} onChange={v => setE("dateFrom", v)} /></Field>
        <Field label="End of service"><DateField ariaLabel="End date" value={draft.entry.dateTo} onChange={v => setE("dateTo", v)} /></Field>
        <Field label="Reservation / PNR no."><input style={inp} aria-label="Reservation or PNR number" value={draft.entry.reservationNo} onChange={e => setE("reservationNo", e.target.value)} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
        <Field label="Status" grow="1 1 260px"><StatusSelect value={draft.entry.status} ariaLabel="Entry status" onChange={v => setE("status", v)} /></Field>
        <Field label="Rates" grow="2 1 260px"><input style={inp} aria-label="Rates" value={draft.entry.rates} onChange={e => setE("rates", e.target.value)} placeholder="e.g. ₹6,050 APAI / ₹5,300 MAPAI" /></Field>
      </div>
      <div style={lbl}>Remarks</div>
      <div style={{ marginBottom: 10 }}><RichTextEditor value={draft.entry.remarksHtml} onChange={v => setE("remarksHtml", v)} minHeight={60} placeholder="Anything worth remembering about this booking" /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
        <button className="btn btn-primary" onClick={saveEntry} disabled={saving}>{saving ? "Saving…" : "Save booking"}</button>
      </div>
      {draft.entry.queryId && <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 6 }}>Saving adds or updates this service in that tour file as “{[g.vendorName, draft.entry.title, draft.entry.reservationNo].filter(Boolean).join(" / ")}”.</div>}
    </div>
  );

  const entryRow = ({ group, entry }, showVendor) => {
    const [bg, fg] = STATE_STYLE[serviceState(entry.status)];
    return (
      <div key={entry.id} data-testid="series-entry" style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${G.gray100}` }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{showVendor && <span style={{ color: G.gray600, fontWeight: 500 }}>{group.vendorName} / </span>}{entry.title || "—"}{entry.reservationNo && <span style={{ fontFamily: "monospace", fontWeight: 500, color: G.gray600 }}> / {entry.reservationNo}</span>}</div>
          <div style={{ fontSize: 11, color: G.gray600 }}>
            {entry.queryId ? <span style={{ color: "#1A5276", cursor: "pointer", textDecoration: "underline" }} onClick={() => fileById[entry.queryId] && document.dispatchEvent(new CustomEvent("unitop-activate-query", { detail: { query: fileById[entry.queryId] } }))}>{fileLabel(entry.queryId)}</span> : <span style={{ color: G.gray400 }}>No tour file yet</span>}
            {entry.dateFrom && ` · ${formatDMY(entry.dateFrom)}${entry.dateTo ? " – " + formatDMY(entry.dateTo) : ""}`}
            {entry.rates && ` · ${entry.rates}`}
          </div>
          {entry.remarksHtml && <div style={{ fontSize: 11.5, color: G.gray800, marginTop: 3 }} dangerouslySetInnerHTML={{ __html: entry.remarksHtml }} />}
        </div>
        {canEdit ? <StatusSelect value={entry.status} ariaLabel={`Status of ${entry.title || entry.name}`} compact onChange={v => changeStatus(entry, v)} />
          : <span style={{ padding: "2px 9px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>{entry.status}</span>}
        {canEdit && <span style={{ whiteSpace: "nowrap" }}>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} aria-label={`Edit ${entry.title || entry.name}`} onClick={() => setDraft({ groupId: group.id, entry: { ...entry } })}>✏</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5, color: "#C0392B" }} aria-label={`Delete ${entry.title || entry.name}`} onClick={() => removeEntry(entry)}>✕</button>
        </span>}
      </div>
    );
  };

  const byFile = groupBy === "file" ? (() => {
    const m = new Map();
    matches.forEach(x => { const k = x.entry.queryId || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1));
  })() : null;

  return (
    <div>
      {error && <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 12, color: G.gray600, minWidth: 160 }}>{seriesSummary(groups) || "No bookings yet"}</div>
        <div style={{ display: "inline-flex", border: `1px solid ${G.gray200}`, borderRadius: 6, overflow: "hidden" }}>
          {[["vendor", "By vendor"], ["file", "By tour file"]].map(([k, t]) => (
            <button key={k} onClick={() => setGroupBy(k)} style={{ padding: "5px 10px", fontSize: 11, border: "none", cursor: "pointer", background: groupBy === k ? G.navy : G.white, color: groupBy === k ? "#fff" : G.gray800 }}>{t}</button>
          ))}
        </div>
        {canEdit && <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setPicking({ vendorName: "" })}>+ New vendor booking</button>}
      </div>

      {picking && (
        <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, marginBottom: 12, background: G.gray50, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Vendor" grow="1 1 260px">
            <input style={inp} list="series-vendor-list" aria-label="Vendor" autoFocus value={picking.vendorName} onChange={e => setPicking({ vendorName: e.target.value })} placeholder="Pick from your vendors, or type a name" />
            <datalist id="series-vendor-list">{vendorList.map(v => <option key={v.id || v.name} value={v.name}>{v.type || v.category || ""}</option>)}</datalist>
          </Field>
          <button className="btn btn-ghost" onClick={() => setPicking(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={!picking.vendorName.trim()} onClick={startVendor}>Open booking</button>
        </div>
      )}

      {counts.all > 0 && (<>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {["", "open", "confirmed", "soldout", "cancelled"].map(k => {
            const n = k ? counts[k] : counts.all; const on = filter.state === k;
            return <button key={k || "all"} onClick={() => setF("state", k)} aria-pressed={on}
              style={{ padding: "3px 11px", fontSize: 11, borderRadius: 14, cursor: "pointer", border: `1px solid ${on ? G.navy : G.gray200}`, background: on ? G.navy : G.white, color: on ? "#fff" : G.gray800 }}>{STATE_LABEL[k]} {n}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6, alignItems: "flex-end" }}>
          <input style={{ ...inp, flex: "2 1 170px" }} placeholder="Search vendor, title, reservation, rates…" aria-label="Search bookings" value={filter.text} onChange={e => setF("text", e.target.value)} />
          <select style={{ ...inp, flex: "1 1 130px" }} aria-label="Filter vendor" value={filter.vendor} onChange={e => setF("vendor", e.target.value)}>
            <option value="">All vendors</option>{groups.map(g => <option key={g.id} value={g.id}>{g.vendorName}</option>)}
          </select>
          <select style={{ ...inp, flex: "1 1 120px" }} aria-label="Filter category" value={filter.type} onChange={e => setF("type", e.target.value)}>
            <option value="">All categories</option>{[...new Set([...typesInUse, ...VENDOR_TYPES])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={{ ...inp, flex: "1 1 150px" }} aria-label="Filter tour file" value={filter.queryId} onChange={e => setF("queryId", e.target.value)}>
            <option value="">All tour files</option><option value="__none">No tour file yet</option>{files.map(q => <option key={q.id} value={q.id}>{fileLabel(q.id)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 130px" }}><div style={lbl}>Services from</div><DateField ariaLabel="Filter from" value={filter.from} onChange={v => setF("from", v)} /></div>
          <div style={{ flex: "1 1 130px" }}><div style={lbl}>to</div><DateField ariaLabel="Filter to" value={filter.to} onChange={v => setF("to", v)} /></div>
          <label style={{ fontSize: 11.5, display: "flex", gap: 5, alignItems: "center", padding: "7px 0" }}><input type="checkbox" checked={filter.noReservation} onChange={e => setF("noReservation", e.target.checked)} /> No reservation no.</label>
          {filtering && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setFilter(blankFilter)}>Clear filters</button>}
        </div>
      </>)}

      {groups.length === 0 && <div style={{ fontSize: 12, color: G.gray400 }}>No bookings yet — start with “+ New vendor booking”.</div>}
      {filtering && groups.length > 0 && <div style={{ fontSize: 11, color: G.gray400, marginBottom: 6 }}>{matches.length} of {counts.all} match</div>}

      {groupBy === "vendor" && groups.map(g => {
        const mine = matches.filter(x => x.group.id === g.id);
        if (filtering && !mine.length && draft?.groupId !== g.id) return null;
        return (
          <div key={g.id} data-testid="vendor-booking" style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, background: G.white }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}><span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.vendorName}</span> <span style={{ fontSize: 10.5, color: G.gray400 }}>{g.vendorType}</span></div>
              {canEdit && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setDraft({ groupId: g.id, entry: blankEntry() })}>+ Add booking</button>}
              {canEdit && <button className="btn btn-ghost" style={{ fontSize: 11, color: "#C0392B" }} aria-label={`Delete ${g.vendorName} booking`} onClick={() => removeGroup(g)}>🗑</button>}
            </div>
            {entryForm(g)}
            {g.entries.length === 0 && !(draft && draft.groupId === g.id) && <div style={{ fontSize: 11.5, color: G.gray400, marginTop: 6 }}>No bookings inside yet.</div>}
            {mine.map(x => entryRow(x, false))}
          </div>
        );
      })}

      {groupBy === "file" && (byFile.length === 0 ? <div style={{ fontSize: 12, color: G.gray400 }}>{groups.length ? "Nothing matches." : ""}</div> : byFile.map(([qid, rows]) => (
        <div key={qid || "none"} style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, background: G.white }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{qid ? fileLabel(qid) : "No tour file yet"}</div>
          {rows.map(x => entryRow(x, true))}
        </div>
      )))}
      {groupBy === "file" && draft && <div>{entryForm(groups.find(g => g.id === draft.groupId) || {})}</div>}
    </div>
  );
}
