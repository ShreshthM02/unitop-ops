import { useState } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, saveBookingRow, deleteBookingRow, bulkSetRowStatus, addCorrespondence, deleteCorrespondence, setAwaiting,
  statusKind, waitlistDate, chartHtml, chartText } = Lib;

// Inside an expanded booking: the per-departure rows (each with its own status and
// confirmation number), the correspondence log with "whose turn is it", and the
// request / status chart you paste into the vendor email.

const lbl = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const inp = { padding: "6px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", background: G.white, color: G.gray800 };
const KIND_STYLE = {
  open: { bg: "#FEF9E7", fg: "#7D6608", bd: "#F7DC6F" },
  done: { bg: "#EAFAF1", fg: "#0E6655", bd: "#A9DFBF" },
  cancelled: { bg: "#F4F6F7", fg: "#7B7D7D", bd: "#D5D8DC" },
};
const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const DIR = { in: "← From vendor", out: "→ To vendor", call: "☎ Call / WhatsApp" };

export default function SeriesBookingDetail({ booking, category, files, fileLabel, canEdit, currentUser, onChanged, onError }) {
  const [rowDraft, setRowDraft] = useState(null);
  const [picked, setPicked] = useState({});
  const [bulk, setBulk] = useState("");
  const [corr, setCorr] = useState(null);
  const [copied, setCopied] = useState("");
  const rows = booking.rows || [];
  const statuses = category ? category.statuses : [];
  const by = currentUser && currentUser.name;
  const rowById = Object.fromEntries(rows.map(r => [r.id, r]));

  const run = async (p) => { const res = await p; if (res && res.error) onError(res.error); else onChanged(); return res; };

  const saveRow = async () => {
    const prev = rowDraft.id ? rowById[rowDraft.id] : null;
    const res = await saveBookingRow(db, rowDraft, prev, by);
    if (res.error) { onError(res.error); return; }
    setRowDraft(null); onChanged();
  };
  const blankRow = () => ({ bookingId: booking.id, queryId: "", label: "", dateFrom: "", dateTo: "", plan: "", detail: "", foc: "", status: statuses[0] ? statuses[0].name : "", confirmationNo: "", deadlineDate: "", deadlineLabel: "", notes: "" });
  const addForFiles = async () => {
    const have = new Set(rows.map(r => r.queryId).filter(Boolean));
    for (const q of files.filter(f => !have.has(f.id))) {
      const res = await saveBookingRow(db, { ...blankRow(), queryId: q.id, label: q.tourFileId || "" }, null, by);
      if (res.error) { onError(res.error); return; }
    }
    onChanged();
  };
  const setP = (k, v) => setRowDraft(p => ({ ...p, [k]: v }));
  const pickedRows = rows.filter(r => picked[r.id]);

  const copy = async (withStatus) => {
    const opts = { withStatus, fileLabel };
    const html = chartHtml(booking, opts), text = chartText(booking, opts);
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new window.ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else await navigator.clipboard.writeText(text);
      setCopied(withStatus ? "status" : "request"); setTimeout(() => setCopied(""), 2500);
    } catch (e) { onError("Couldn't copy to the clipboard — allow clipboard access and try again."); }
  };

  const startCorr = (direction) => setCorr({ bookingId: booking.id, occurredOn: today(), direction, contact: "", subject: "", summary: "", rowIds: [],
    awaiting: direction === "out" ? "vendor" : "", followUpDate: direction === "out" ? plusDays(3) : "" });
  const saveCorr = async () => {
    const res = await addCorrespondence(db, corr, by);
    if (res.error) { onError(res.error); return; }
    setCorr(null); onChanged();
  };

  return (
    <div data-testid="booking-detail">
      {/* ── Rows ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ ...lbl, marginBottom: 0, flex: 1 }}>Departures / dates ({rows.length})</div>
        {rows.length > 0 && <>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => copy(false)}>{copied === "request" ? "✓ Copied" : "📋 Copy request chart"}</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => copy(true)}>{copied === "status" ? "✓ Copied" : "📋 Copy status chart"}</button>
        </>}
        {canEdit && files.length > 0 && <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={addForFiles}>+ A row per tour file</button>}
        {canEdit && <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => setRowDraft(blankRow())}>+ Add row</button>}
      </div>

      {rows.length === 0 && !rowDraft && <div style={{ fontSize: 11.5, color: G.gray400, marginBottom: 8 }}>No rows. Add one per departure or date, so each can carry its own status and confirmation number.</div>}

      {canEdit && pickedRows.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, fontSize: 11.5 }}>
          <span>{pickedRows.length} selected → set status</span>
          <select style={{ ...inp, width: 170 }} aria-label="Bulk status" value={bulk} onChange={e => setBulk(e.target.value)}>
            <option value="">Choose…</option>{statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!bulk} onClick={async () => { await run(bulkSetRowStatus(db, pickedRows, bulk, by)); setPicked({}); setBulk(""); }}>Apply</button>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr style={{ textAlign: "left", color: G.gray600 }}>
              {canEdit && <th style={{ width: 22 }}><input type="checkbox" aria-label="Select all rows" checked={pickedRows.length === rows.length} onChange={e => setPicked(e.target.checked ? Object.fromEntries(rows.map(r => [r.id, true])) : {})} /></th>}
              <th>Tour / label</th><th>Dates</th><th>Plan · rooms · FOC</th><th>Status</th><th>Confirmation</th><th /></tr></thead>
            <tbody>
              {rows.map(r => {
                const ks = KIND_STYLE[statusKind(category, r.status)];
                const wd = /wait/i.test(r.status || "") ? waitlistDate(booking, r) : null;
                return (
                  <tr key={r.id} data-testid="booking-row" style={{ borderTop: `1px solid ${G.gray100}` }}>
                    {canEdit && <td><input type="checkbox" aria-label={`Select ${r.label || r.dateFrom}`} checked={!!picked[r.id]} onChange={e => setPicked(p => ({ ...p, [r.id]: e.target.checked }))} /></td>}
                    <td style={{ padding: "4px 6px 4px 0" }}><b>{r.label || (r.queryId ? fileLabel(r.queryId) : "—")}</b>{r.queryId && r.label ? <span style={{ color: G.gray400 }}> {fileLabel(r.queryId).replace(r.label, "").trim()}</span> : null}</td>
                    <td>{r.dateFrom ? `${fmt(r.dateFrom)}${r.dateTo ? " – " + fmt(r.dateTo) : ""}` : "—"}</td>
                    <td style={{ color: G.gray600 }}>{[r.plan, r.detail, r.foc && `FOC ${r.foc}`].filter(Boolean).join(" · ")}</td>
                    <td>
                      <select aria-label={`Status of ${r.label || r.dateFrom}`} disabled={!canEdit} value={r.status}
                        onChange={e => run(saveBookingRow(db, { ...r, status: e.target.value }, r, by))}
                        style={{ padding: "2px 6px", fontSize: 10.5, fontWeight: 600, borderRadius: 12, border: `1px solid ${ks.bd}`, background: ks.bg, color: ks.fg }}>
                        {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        {r.status && !statuses.some(s => s.name === r.status) && <option value={r.status}>{r.status}</option>}
                      </select>
                      {wd && <div style={{ fontSize: 10, color: "#B9770E" }}>clears ~{fmt(wd)}</div>}
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{r.confirmationNo || <span style={{ color: G.gray400 }}>—</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{canEdit && <>
                      <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => setRowDraft({ ...r })}>✏</button>
                      <button className="btn btn-ghost" style={{ fontSize: 10.5, color: "#C0392B" }} aria-label={`Remove ${r.label || r.dateFrom}`} onClick={() => { if (window.confirm("Remove this row?")) run(deleteBookingRow(db, r, by)); }}>✕</button>
                    </>}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {rowDraft && (
        <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 6, padding: 10, marginBottom: 10, background: G.gray50 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 170px" }}><div style={lbl}>Tour file</div>
              <select style={inp} aria-label="Row tour file" value={rowDraft.queryId} onChange={e => { const q = files.find(f => f.id === e.target.value); setRowDraft(p => ({ ...p, queryId: e.target.value, label: p.label || (q && q.tourFileId) || "" })); }}>
                <option value="">— none / whole series —</option>{files.map(q => <option key={q.id} value={q.id}>{fileLabel(q.id)}</option>)}
              </select></div>
            <div style={{ flex: "1 1 130px" }}><div style={lbl}>Label</div><input style={inp} aria-label="Row label" value={rowDraft.label} onChange={e => setP("label", e.target.value)} placeholder="Tour 3412 / 6E-123" /></div>
            <div style={{ flex: "1 1 120px" }}><div style={lbl}>From</div><input type="date" style={inp} aria-label="Row from date" value={rowDraft.dateFrom} onChange={e => setP("dateFrom", e.target.value)} /></div>
            <div style={{ flex: "1 1 120px" }}><div style={lbl}>To</div><input type="date" style={inp} aria-label="Row to date" value={rowDraft.dateTo} onChange={e => setP("dateTo", e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 90px" }}><div style={lbl}>Plan / class</div><input style={inp} aria-label="Row plan" value={rowDraft.plan} onChange={e => setP("plan", e.target.value)} placeholder="APAI" /></div>
            <div style={{ flex: "2 1 160px" }}><div style={lbl}>Rooms / qty</div><input style={inp} aria-label="Row rooms" value={rowDraft.detail} onChange={e => setP("detail", e.target.value)} placeholder="38 twin + 2 single" /></div>
            <div style={{ flex: "1 1 120px" }}><div style={lbl}>FOC</div><input style={inp} aria-label="Row FOC" value={rowDraft.foc} onChange={e => setP("foc", e.target.value)} placeholder="3 rooms" /></div>
            <div style={{ flex: "1 1 130px" }}><div style={lbl}>Status</div>
              <select style={inp} aria-label="Row status" value={rowDraft.status} onChange={e => setP("status", e.target.value)}>
                {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                {rowDraft.status && !statuses.some(s => s.name === rowDraft.status) && <option value={rowDraft.status}>{rowDraft.status}</option>}
              </select></div>
            <div style={{ flex: "1 1 130px" }}><div style={lbl}>Confirmation no.</div><input style={inp} aria-label="Row confirmation" value={rowDraft.confirmationNo} onChange={e => setP("confirmationNo", e.target.value)} placeholder="KKR/7607" /></div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 130px" }}><div style={lbl}>Deadline</div><input type="date" style={inp} aria-label="Row deadline" value={rowDraft.deadlineDate} onChange={e => setP("deadlineDate", e.target.value)} /></div>
            <div style={{ flex: "1 1 160px" }}><div style={lbl}>Deadline is for</div><input style={inp} aria-label="Row deadline label" value={rowDraft.deadlineLabel} onChange={e => setP("deadlineLabel", e.target.value)} placeholder="Option release" /></div>
            <div style={{ flex: "2 1 200px" }}><div style={lbl}>Note</div><input style={inp} aria-label="Row note" value={rowDraft.notes} onChange={e => setP("notes", e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => setRowDraft(null)}>Cancel</button><button className="btn btn-primary" onClick={saveRow}>Save row</button></div>
        </div>
      )}

      {/* ── Correspondence ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0 6px" }}>
        <div style={{ ...lbl, marginBottom: 0, flex: 1 }}>Correspondence ({(booking.correspondence || []).length})</div>
        {canEdit && <>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => startCorr("in")}>+ Vendor wrote</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => startCorr("out")}>+ We wrote</button>
          <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => startCorr("call")}>+ Call</button>
        </>}
      </div>
      {booking.awaiting && (
        <div style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 6, marginBottom: 6, background: booking.awaiting === "us" ? "#FDF2F0" : "#EAF2F8", color: booking.awaiting === "us" ? "#922B21" : "#1A5276", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{booking.awaiting === "us" ? "⏳ Waiting on us" : "⏳ Waiting on the vendor"}{booking.followUpDate ? ` — follow up ${fmt(booking.followUpDate)}` : ""}</span>
          {canEdit && <button className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={() => run(setAwaiting(db, booking.id, "", ""))}>Mark done</button>}
        </div>
      )}
      {corr && (
        <div style={{ border: `1px solid ${G.gray200}`, borderRadius: 6, padding: 10, marginBottom: 8, background: G.gray50 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: "1 1 120px" }}><div style={lbl}>Date</div><input type="date" style={inp} aria-label="Correspondence date" value={corr.occurredOn} onChange={e => setCorr(p => ({ ...p, occurredOn: e.target.value }))} /></div>
            <div style={{ flex: "1 1 140px" }}><div style={lbl}>Type</div>
              <select style={inp} aria-label="Correspondence type" value={corr.direction} onChange={e => setCorr(p => ({ ...p, direction: e.target.value }))}>{Object.entries(DIR).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            <div style={{ flex: "1 1 140px" }}><div style={lbl}>Contact</div><input style={inp} aria-label="Correspondence contact" value={corr.contact} onChange={e => setCorr(p => ({ ...p, contact: e.target.value }))} placeholder="e.g. Aman / Rahul" /></div>
            <div style={{ flex: "2 1 200px" }}><div style={lbl}>Subject</div><input style={inp} aria-label="Correspondence subject" value={corr.subject} onChange={e => setCorr(p => ({ ...p, subject: e.target.value }))} /></div>
          </div>
          <div style={lbl}>What was said</div>
          <textarea style={{ ...inp, minHeight: 56, resize: "vertical", marginBottom: 8 }} aria-label="Correspondence summary" value={corr.summary} onChange={e => setCorr(p => ({ ...p, summary: e.target.value }))} placeholder="e.g. Sent updated chart with confirmation numbers; 4 dates still waitlisted" />
          {rows.length > 0 && <>
            <div style={lbl}>Rows this touches</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {rows.map(r => { const on = corr.rowIds.includes(r.id); return (
                <label key={r.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, border: `1px solid ${on ? G.navy : G.gray200}`, background: on ? "#EAF2F8" : G.white, cursor: "pointer" }}>
                  <input type="checkbox" style={{ display: "none" }} checked={on} onChange={() => setCorr(p => ({ ...p, rowIds: on ? p.rowIds.filter(x => x !== r.id) : [...p.rowIds, r.id] }))} />{r.label || fmt(r.dateFrom) || "row"}
                </label>); })}
            </div></>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 160px" }}><div style={lbl}>Whose turn now?</div>
              <select style={inp} aria-label="Waiting on" value={corr.awaiting} onChange={e => setCorr(p => ({ ...p, awaiting: e.target.value, followUpDate: e.target.value && !p.followUpDate ? plusDays(3) : p.followUpDate }))}>
                <option value="">Nobody — nothing pending</option><option value="vendor">Waiting on the vendor</option><option value="us">Waiting on us (vendor needs a reply)</option>
              </select></div>
            {corr.awaiting && <div style={{ flex: "1 1 130px" }}><div style={lbl}>Follow up by</div><input type="date" style={inp} aria-label="Follow up date" value={corr.followUpDate} onChange={e => setCorr(p => ({ ...p, followUpDate: e.target.value }))} /></div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => setCorr(null)}>Cancel</button><button className="btn btn-primary" onClick={saveCorr}>Save entry</button></div>
        </div>
      )}
      {(booking.correspondence || []).length === 0 && !corr && <div style={{ fontSize: 11.5, color: G.gray400 }}>Nothing logged yet. Log each email or call so the whole story stays in one place.</div>}
      {(booking.correspondence || []).map(c => (
        <div key={c.id} data-testid="correspondence-entry" style={{ fontSize: 12, padding: "5px 0", borderTop: `1px solid ${G.gray100}` }}>
          <div style={{ color: G.gray600, fontSize: 11 }}>
            {fmt(c.occurredOn)} · {DIR[c.direction] || c.direction}{c.contact ? ` · ${c.contact}` : ""}{c.by ? ` · logged by ${c.by}` : ""}
            {canEdit && <button className="btn btn-ghost" style={{ fontSize: 10, marginLeft: 6, color: "#C0392B" }} aria-label="Delete entry" onClick={() => { if (window.confirm("Delete this entry?")) run(deleteCorrespondence(db, c.id)); }}>✕</button>}
          </div>
          {c.subject && <div style={{ fontWeight: 600 }}>{c.subject}</div>}
          {c.summary && <div style={{ whiteSpace: "pre-wrap" }}>{c.summary}</div>}
          {c.rowIds.length > 0 && <div style={{ fontSize: 10.5, color: G.gray400 }}>Touches: {c.rowIds.map(id => rowById[id] ? (rowById[id].label || fmt(rowById[id].dateFrom)) : null).filter(Boolean).join(", ")}</div>}
        </div>
      ))}
    </div>
  );
}
