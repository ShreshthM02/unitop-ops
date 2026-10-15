import { useState, useEffect, useMemo, useCallback } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, loadBookingCategories, loadSeriesBookings, saveSeriesBooking, deleteSeriesBooking, replaceBookingAllocations,
  saveBookingCategory, bookingAttention, seriesHealth, lineUsage, statusKind, timelineBuckets, coversColumn } = Lib;

// Series → Bookings. One booking = one reference (PNR / confirmation / contract)
// with a vendor, dates, a status from an editable per-category list, an optional
// deadline, what was blocked (e.g. 20 × Deluxe Double), and which departures use
// how much of it. Every status change is kept in a history.

const lbl = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const inp = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", background: G.white, color: G.gray800 };
const KIND_STYLE = {
  open: { bg: "#FEF9E7", fg: "#7D6608", bd: "#F7DC6F" },
  done: { bg: "#EAFAF1", fg: "#0E6655", bd: "#A9DFBF" },
  cancelled: { bg: "#F4F6F7", fg: "#7B7D7D", bd: "#D5D8DC" },
};
const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
const range = (a, b) => a && b && a !== b ? `${fmt(a)} – ${fmt(b)}` : fmt(a || b);
const blankDraft = (seriesId, cat) => ({ seriesId, categoryId: cat ? cat.id : "", title: "", vendorId: "", vendorName: "", reference: "", city: "", dateFrom: "", dateTo: "", status: cat && cat.statuses[0] ? cat.statuses[0].name : "", deadlineDate: "", deadlineLabel: "", lines: [], notes: "", allocations: [] });

function Field({ label, children, grow }) { return <div style={{ flex: grow || "1 1 150px", minWidth: 0 }}><div style={lbl}>{label}</div>{children}</div>; }

export default function SeriesBookings({ series, queries, vendors, currentUser, canEdit = true, onAttentionCount }) {
  const [categories, setCategories] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState({ cat: "", kind: "", text: "" });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showCats, setShowCats] = useState(false);

  const files = useMemo(() => (queries || []).filter(q => q.seriesId === series.id), [queries, series.id]);
  const fileLabel = (id) => { const q = (queries || []).find(x => x.id === id); return q ? `${q.tourFileId || q.id}${q.groupName ? " · " + q.groupName : ""}` : id; };
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [c, b] = await Promise.all([loadBookingCategories(db), loadSeriesBookings(db, series.id)]);
    setCategories(c.categories); setBookings(b.bookings); setError(c.error || b.error || "");
    setLoading(false);
  }, [series.id]);
  useEffect(() => { reload(); }, [reload]);

  const attention = useMemo(() => bookingAttention(bookings, categories), [bookings, categories]);
  useEffect(() => { onAttentionCount && onAttentionCount(attention.length, seriesHealth(bookings, categories, attention.length)); }, [attention.length, bookings, categories]); // eslint-disable-line

  const shown = bookings.filter(b => {
    if (filter.cat && b.categoryId !== filter.cat) return false;
    if (filter.kind && statusKind(catById[b.categoryId], b.status) !== filter.kind) return false;
    if (filter.text) { const t = filter.text.toLowerCase(); if (![b.title, b.vendorName, b.reference, b.city].some(x => (x || "").toLowerCase().includes(t))) return false; }
    return true;
  });

  const setD = (k, v) => setDraft(p => ({ ...p, [k]: v }));
  const startNew = () => setDraft(blankDraft(series.id, categories.find(c => c.active) || categories[0]));
  const startEdit = (b) => setDraft(JSON.parse(JSON.stringify(b)));
  const draftCat = draft ? catById[draft.categoryId] : null;

  const save = async () => {
    setSaving(true); setError("");
    const previous = draft.id ? bookings.find(b => b.id === draft.id) : null;
    const res = await saveSeriesBooking(db, draft, previous, currentUser?.name);
    if (res.error) { setError(res.error); setSaving(false); return; }
    if (res.id) {
      const r2 = await replaceBookingAllocations(db, res.id, draft.allocations || [], currentUser?.name);
      if (r2.error) { setError(r2.error); setSaving(false); return; }
    }
    setSaving(false); setDraft(null); reload();
  };
  const quickStatus = async (b, status) => {
    const res = await saveSeriesBooking(db, { ...b, status }, b, currentUser?.name);
    if (res.error) setError(res.error); else reload();
  };
  const remove = async (b) => {
    if (!window.confirm(`Delete booking "${b.title}"? Its history is removed with it.`)) return;
    const res = await deleteSeriesBooking(db, b.id);
    if (res.error) setError(res.error); else reload();
  };

  const vendorNames = (vendors || []).filter(v => !v.deleted).map(v => v.name);
  const onVendorText = (text) => { const v = (vendors || []).find(x => x.name === text); setDraft(p => ({ ...p, vendorName: text, vendorId: v ? v.id : "" })); };
  const itemNames = draft ? [...new Set((draft.lines || []).map(l => l.item).filter(Boolean))] : [];

  if (loading) return <div style={{ fontSize: 12, color: G.gray400 }}>Loading bookings…</div>;

  return (
    <div>
      {error && <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 12, color: G.gray600, minWidth: 160 }}>{seriesHealth(bookings, categories, attention.length) || "No bookings yet"}</div>
        <div style={{ display: "inline-flex", border: `1px solid ${G.gray200}`, borderRadius: 6, overflow: "hidden" }}>
          {[["list", "By booking"], ["departures", "By departure"], ["timeline", "Timeline"]].map(([k, t]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "5px 10px", fontSize: 11, border: "none", cursor: "pointer", background: view === k ? G.navy : G.white, color: view === k ? "#fff" : G.gray800 }}>{t}</button>
          ))}
        </div>
        {canEdit && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowCats(s => !s)}>⚙ Categories &amp; statuses</button>}
        {canEdit && <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={startNew} disabled={!categories.length}>+ New booking</button>}
      </div>

      {showCats && <CategoryEditor categories={categories} onSaved={reload} onError={setError} />}

      {attention.length > 0 && (
        <div style={{ border: "1px solid #F5B7B1", background: "#FDF2F0", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#922B21", marginBottom: 6 }}>⚠ Needs attention ({attention.length})</div>
          {attention.map((a, i) => { const b = bookings.find(x => x.id === a.bookingId); return b && (
            <div key={i} style={{ fontSize: 12, color: G.gray800, padding: "2px 0", cursor: "pointer" }} onClick={() => setExpanded(p => ({ ...p, [b.id]: true }))}>
              <span style={{ color: a.level === "high" ? "#C0392B" : "#B9770E", fontWeight: 700 }}>{a.level === "high" ? "●" : "○"}</span> <b>{b.title}</b> — {a.reason}
            </div>); })}
        </div>
      )}

      {draft && (
        <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 14, marginBottom: 14, background: G.gray50 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: G.navy, marginBottom: 10 }}>{draft.id ? "Edit booking" : "New booking"}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Field label="Category">
              <select style={inp} value={draft.categoryId} aria-label="Category" onChange={e => { const c = catById[e.target.value]; setDraft(p => ({ ...p, categoryId: e.target.value, status: c && c.statuses.some(s => s.name === p.status) ? p.status : (c && c.statuses[0] ? c.statuses[0].name : "") })); }}>
                {categories.filter(c => c.active || c.id === draft.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Title" grow="2 1 220px"><input style={inp} aria-label="Title" value={draft.title} onChange={e => setD("title", e.target.value)} placeholder="e.g. Hotel Imperial, Bodhgaya — 12 Nov block" /></Field>
            <Field label="Status">
              <select style={inp} value={draft.status} aria-label="Status" onChange={e => setD("status", e.target.value)}>
                {(draftCat ? draftCat.statuses : []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                {draft.status && !(draftCat && draftCat.statuses.some(s => s.name === draft.status)) && <option value={draft.status}>{draft.status}</option>}
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Field label="Vendor">
              <input style={inp} list="series-vendor-list" aria-label="Vendor" value={draft.vendorName} onChange={e => onVendorText(e.target.value)} placeholder="Pick or type" />
              <datalist id="series-vendor-list">{vendorNames.map(n => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field label="Reference (PNR / confirmation no.)"><input style={inp} aria-label="Reference" value={draft.reference} onChange={e => setD("reference", e.target.value)} /></Field>
            <Field label="City"><input style={inp} aria-label="City" value={draft.city} onChange={e => setD("city", e.target.value)} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Field label="From"><input type="date" style={inp} aria-label="From date" value={draft.dateFrom} onChange={e => setD("dateFrom", e.target.value)} /></Field>
            <Field label="To"><input type="date" style={inp} aria-label="To date" value={draft.dateTo} onChange={e => setD("dateTo", e.target.value)} /></Field>
            <Field label="Deadline (hold expiry / ticketing limit)"><input type="date" style={inp} aria-label="Deadline date" value={draft.deadlineDate} onChange={e => setD("deadlineDate", e.target.value)} /></Field>
            <Field label="Deadline is for"><input style={inp} aria-label="Deadline label" value={draft.deadlineLabel} onChange={e => setD("deadlineLabel", e.target.value)} placeholder="e.g. Option release" /></Field>
          </div>

          <div style={lbl}>What is blocked / bought</div>
          {(draft.lines || []).map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input style={inp} aria-label={`Line item ${i + 1}`} value={l.item} placeholder="e.g. Deluxe Double, 45-seater coach, Economy seat" onChange={e => setD("lines", draft.lines.map((x, xi) => xi === i ? { ...x, item: e.target.value } : x))} />
              <input type="number" min="0" style={{ ...inp, width: 90 }} aria-label={`Line qty ${i + 1}`} value={l.qty} onChange={e => setD("lines", draft.lines.map((x, xi) => xi === i ? { ...x, qty: e.target.value } : x))} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setD("lines", draft.lines.filter((_, xi) => xi !== i))}>✕</button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 12 }} onClick={() => setD("lines", [...(draft.lines || []), { item: "", qty: 1 }])}>+ Add line</button>

          <div style={lbl}>Which departures use it</div>
          {(draft.allocations || []).map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <select style={{ ...inp, flex: "2 1 180px" }} aria-label={`Allocation departure ${i + 1}`} value={a.queryId} onChange={e => setD("allocations", draft.allocations.map((x, xi) => xi === i ? { ...x, queryId: e.target.value } : x))}>
                <option value="">— whole series / unassigned —</option>
                {files.map(q => <option key={q.id} value={q.id}>{fileLabel(q.id)}</option>)}
              </select>
              <input style={{ ...inp, flex: "1 1 120px" }} list="series-item-list" aria-label={`Allocation item ${i + 1}`} value={a.item} placeholder="Item" onChange={e => setD("allocations", draft.allocations.map((x, xi) => xi === i ? { ...x, item: e.target.value } : x))} />
              <input type="number" min="0" style={{ ...inp, width: 80 }} aria-label={`Allocation qty ${i + 1}`} value={a.qty} onChange={e => setD("allocations", draft.allocations.map((x, xi) => xi === i ? { ...x, qty: e.target.value } : x))} />
              <input style={{ ...inp, flex: "1 1 120px" }} aria-label={`Allocation note ${i + 1}`} value={a.notes} placeholder="Note (e.g. 2 nights)" onChange={e => setD("allocations", draft.allocations.map((x, xi) => xi === i ? { ...x, notes: e.target.value } : x))} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setD("allocations", draft.allocations.filter((_, xi) => xi !== i))}>✕</button>
            </div>
          ))}
          <datalist id="series-item-list">{itemNames.map(n => <option key={n} value={n} />)}</datalist>
          <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 12 }} onClick={() => setD("allocations", [...(draft.allocations || []), { queryId: "", item: "", qty: 1, notes: "" }])}>+ Add allocation</button>

          <div style={lbl}>Notes</div>
          <textarea style={{ ...inp, minHeight: 50, resize: "vertical", marginBottom: 12 }} aria-label="Notes" value={draft.notes} onChange={e => setD("notes", e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save booking"}</button>
          </div>
        </div>
      )}

      {view === "list" && (<>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input style={{ ...inp, flex: "2 1 160px" }} placeholder="Search title, vendor, reference, city…" aria-label="Search bookings" value={filter.text} onChange={e => setFilter(p => ({ ...p, text: e.target.value }))} />
          <select style={{ ...inp, flex: "1 1 120px" }} aria-label="Filter category" value={filter.cat} onChange={e => setFilter(p => ({ ...p, cat: e.target.value }))}>
            <option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={{ ...inp, flex: "1 1 120px" }} aria-label="Filter state" value={filter.kind} onChange={e => setFilter(p => ({ ...p, kind: e.target.value }))}>
            <option value="">Any state</option><option value="open">Open</option><option value="done">Confirmed / done</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        {shown.length === 0 && <div style={{ fontSize: 12, color: G.gray400 }}>{bookings.length ? "No bookings match." : "No bookings yet — add the first one."}</div>}
        {shown.map(b => {
          const cat = catById[b.categoryId]; const kind = statusKind(cat, b.status); const ks = KIND_STYLE[kind];
          const usage = lineUsage(b); const open = !!expanded[b.id];
          return (
            <div key={b.id} data-testid="series-booking" style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, background: G.white, opacity: kind === "cancelled" ? 0.65 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180, cursor: "pointer" }} onClick={() => setExpanded(p => ({ ...p, [b.id]: !open }))}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: G.gray400 }}>
                    {[cat && cat.name, b.vendorName, b.reference && `Ref ${b.reference}`, b.city, range(b.dateFrom, b.dateTo)].filter(Boolean).join(" · ")}
                  </div>
                  {b.deadlineDate && <div style={{ fontSize: 11, color: "#B9770E" }}>⏰ {b.deadlineLabel || "Deadline"}: {fmt(b.deadlineDate)}</div>}
                  {usage.length > 0 && <div style={{ fontSize: 11, color: G.gray600, marginTop: 3 }}>{usage.map(u => <span key={u.item} style={{ marginRight: 10, color: u.over ? "#C0392B" : G.gray600 }}>{u.item}: {u.used}/{u.blocked}</span>)}</div>}
                </div>
                <select aria-label={`Status of ${b.title}`} disabled={!canEdit} value={b.status} onChange={e => quickStatus(b, e.target.value)}
                  style={{ padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 14, border: `1px solid ${ks.bd}`, background: ks.bg, color: ks.fg }}>
                  {(cat ? cat.statuses : []).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  {b.status && !(cat && cat.statuses.some(s => s.name === b.status)) && <option value={b.status}>{b.status}</option>}
                </select>
              </div>
              {open && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${G.gray100}` }}>
                  {b.notes && <div style={{ fontSize: 12, color: G.gray800, marginBottom: 8, whiteSpace: "pre-wrap" }}>{b.notes}</div>}
                  <div style={lbl}>Departures</div>
                  {b.allocations.length === 0 ? <div style={{ fontSize: 11.5, color: G.gray400, marginBottom: 8 }}>Not allocated to any departure yet.</div>
                    : b.allocations.map((a, i) => <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>{a.queryId ? fileLabel(a.queryId) : "Whole series"} — {a.qty} × {a.item || "—"}{a.notes ? ` (${a.notes})` : ""}</div>)}
                  <div style={{ ...lbl, marginTop: 8 }}>History</div>
                  {b.history.length === 0 ? <div style={{ fontSize: 11.5, color: G.gray400 }}>No history.</div>
                    : b.history.map(h => <div key={h.id} style={{ fontSize: 11.5, color: G.gray600, marginBottom: 1 }}>
                        {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.by || "—"} · {h.kind === "status" ? `${h.from || "—"} → ${h.to || "—"}` : (h.note || h.kind)}
                      </div>)}
                  {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => startEdit(b)}>✏ Edit</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, color: "#C0392B", borderColor: "#FECACA" }} onClick={() => remove(b)}>Delete</button>
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </>)}

      {view === "timeline" && (() => {
        const tl = timelineBuckets(bookings);
        if (!tl) return <div style={{ fontSize: 12, color: G.gray400 }}>Add dates to your bookings to see them on a timeline.</div>;
        const dated = bookings.filter(b => b.dateFrom || b.dateTo || b.deadlineDate);
        return (
          <div style={{ overflowX: "auto" }} data-testid="series-timeline">
            <div style={{ fontSize: 10.5, color: G.gray400, marginBottom: 6 }}>{tl.step === 1 ? "One column per day." : "One column per week."} ⏰ marks a deadline.</div>
            <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${tl.cols.length}, minmax(${tl.step === 1 ? 22 : 34}px, 1fr))`, fontSize: 10.5, minWidth: 200 + tl.cols.length * (tl.step === 1 ? 22 : 34) }}>
              <div />
              {tl.cols.map(c => <div key={c.start} style={{ textAlign: "center", color: G.gray400, padding: "2px 0" }}>{c.label}</div>)}
              {dated.map(b => { const cat = catById[b.categoryId]; const ks = KIND_STYLE[statusKind(cat, b.status)]; return (
                <div key={b.id} style={{ display: "contents" }}>
                  <div style={{ padding: "4px 6px 4px 0", fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${b.title} — ${b.status || ""}`}>
                    <b>{b.title}</b> <span style={{ color: G.gray400 }}>{cat && cat.name}</span>
                  </div>
                  {tl.cols.map(c => {
                    const on = coversColumn(b, c);
                    const dl = b.deadlineDate && b.deadlineDate >= c.start && b.deadlineDate <= c.end;
                    return <div key={c.start} title={on ? `${b.title}: ${b.status || ""}` : ""} style={{ background: on ? ks.bg : "transparent", borderTop: `3px solid ${on ? ks.fg : "transparent"}`, borderBottom: `1px solid ${G.gray100}`, textAlign: "center", minHeight: 22 }}>{dl ? "⏰" : ""}</div>;
                  })}
                </div>); })}
            </div>
          </div>
        );
      })()}

      {view === "departures" && (
        files.length === 0 ? <div style={{ fontSize: 12, color: G.gray400 }}>No files in this series yet.</div> :
        files.map(q => {
          const rows = bookings.map(b => ({ b, allocs: b.allocations.filter(a => a.queryId === q.id) })).filter(r => r.allocs.length);
          return (
            <div key={q.id} style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1A5276" }}
                onClick={() => document.dispatchEvent(new CustomEvent("unitop-activate-query", { detail: { query: q } }))}>{fileLabel(q.id)}</div>
              <div style={{ fontSize: 11, color: G.gray400, marginBottom: 6 }}>{q.dateDisplay || q.travelDate || ""}</div>
              {rows.length === 0 ? <div style={{ fontSize: 11.5, color: G.gray400 }}>No bookings allocated to this departure yet.</div> :
                rows.map(({ b, allocs }) => { const cat = catById[b.categoryId]; const ks = KIND_STYLE[statusKind(cat, b.status)]; return (
                  <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 600, background: ks.bg, color: ks.fg, border: `1px solid ${ks.bd}` }}>{b.status || "—"}</span>
                    <span><b>{b.title}</b> <span style={{ color: G.gray400 }}>{[cat && cat.name, b.vendorName, b.reference && `Ref ${b.reference}`].filter(Boolean).join(" · ")}</span></span>
                    <span style={{ color: G.gray600 }}>{allocs.map(a => `${a.qty} × ${a.item || "—"}`).join(", ")}</span>
                  </div>); })}
            </div>
          );
        })
      )}
    </div>
  );
}

// Editable categories, each with its own status list (name + whether it counts
// as open, done or cancelled -- that drives the "needs attention" rules).
function CategoryEditor({ categories, onSaved, onError }) {
  const [edit, setEdit] = useState(null);
  const save = async () => {
    const res = await saveBookingCategory(db, edit);
    if (res.error) { onError(res.error); return; }
    setEdit(null); onSaved();
  };
  return (
    <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, marginBottom: 12, background: G.gray50 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Categories &amp; status lists</div>
      {!edit && <>
        {categories.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 4, opacity: c.active ? 1 : 0.5 }}>
            <b style={{ minWidth: 130 }}>{c.name}</b><span style={{ flex: 1, color: G.gray600 }}>{c.statuses.map(s => s.name).join(" → ")}</span>
            <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => setEdit(JSON.parse(JSON.stringify(c)))}>Edit</button>
          </div>))}
        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 6 }} onClick={() => setEdit({ name: "", sortOrder: categories.length + 1, active: true, statuses: [{ name: "Enquiry", kind: "open" }, { name: "Confirmed", kind: "done" }, { name: "Cancelled", kind: "cancelled" }] })}>+ New category</button>
      </>}
      {edit && <>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input style={inp} aria-label="Category name" value={edit.name} onChange={e => setEdit(p => ({ ...p, name: e.target.value }))} placeholder="Category name" />
          <label style={{ fontSize: 11, whiteSpace: "nowrap" }}><input type="checkbox" checked={edit.active} onChange={e => setEdit(p => ({ ...p, active: e.target.checked }))} /> Active</label>
        </div>
        {edit.statuses.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <input style={inp} aria-label={`Status ${i + 1}`} value={s.name} onChange={e => setEdit(p => ({ ...p, statuses: p.statuses.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x) }))} />
            <select style={{ ...inp, width: 150 }} aria-label={`Status ${i + 1} meaning`} value={s.kind} onChange={e => setEdit(p => ({ ...p, statuses: p.statuses.map((x, xi) => xi === i ? { ...x, kind: e.target.value } : x) }))}>
              <option value="open">Still open</option><option value="done">Confirmed / done</option><option value="cancelled">Cancelled</option>
            </select>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={i === 0} onClick={() => setEdit(p => { const a = [...p.statuses]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...p, statuses: a }; })}>↑</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEdit(p => ({ ...p, statuses: p.statuses.filter((_, xi) => xi !== i) }))}>✕</button>
          </div>))}
        <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 8 }} onClick={() => setEdit(p => ({ ...p, statuses: [...p.statuses, { name: "", kind: "open" }] }))}>+ Add status</button>
        <div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save category</button></div>
      </>}
    </div>
  );
}
