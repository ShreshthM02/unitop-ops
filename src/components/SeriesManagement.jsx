import { useState } from 'react';
import * as Lib from '../lib/index.js';
const { G, saveSeries, buildQuerySavePayload, db } = Lib;

export default function SeriesManagement({ series, setSeries, queries, currentUser, onClose }) {
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const seriesQueries = (s) => queries.filter(q => q.seriesId === s.id);
  const filtered = series.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()));

  const saveEdit = async () => {
    if (!form.name?.trim()) return;
    if (form.id) {
      const updated = { ...form };
      setSeries(p => p.map(s => s.id === form.id ? updated : s));
      setSelected(updated);
      await saveSeries(db, updated);
    } else {
      const { id, error } = await saveSeries(db, { ...form, createdBy: currentUser?.id });
      if (!error && id) {
        const created = { ...form, id, active: form.active !== false };
        setSeries(p => [...p, created]);
        setSelected(created);
      }
    }
    setEditing(false);
  };

  const toggleActive = async (s) => {
    const updated = { ...s, active: !s.active };
    setSeries(p => p.map(x => x.id === s.id ? updated : x));
    if (selected?.id === s.id) setSelected(updated);
    await saveSeries(db, updated);
  };

  const unassign = async (q) => {
    const updatedQuery = { ...q, seriesId: null };
    db.from("queries").upsert(buildQuerySavePayload(updatedQuery));
    // Local list refresh happens via the same realtime/reload path every
    // other cross-panel query edit already relies on -- this panel
    // doesn't own the queries array, so it doesn't try to mutate it
    // directly beyond what's needed to make the current view accurate.
    setSelected(s => ({ ...s })); // force a re-render of the assigned-queries list
  };

  const inp = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: G.white, width: "min(900px, 100vw)", height: "100vh", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
        <div style={{ background: G.navy, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>MASTER DATA</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',serif" }}>Series</div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setForm({ name: "", notes: "", active: true }); setEditing(true); setSelected(null); }}>+ New Series</button>
          <button onClick={onClose} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>✕</button>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ width: 260, borderRight: `1px solid ${G.gray200}`, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${G.gray200}` }}><input style={{ ...inp, padding: "6px 9px" }} placeholder="Search series..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filtered.length === 0 && <div style={{ padding: 16, fontSize: 12, color: G.gray400, textAlign: "center" }}>No series yet — create one above.</div>}
              {filtered.map(s => (
                <div key={s.id} onClick={() => { setSelected(s); setEditing(false); }}
                  style={{ padding: "12px 14px", borderBottom: `1px solid ${G.gray100}`, cursor: "pointer", background: selected?.id === s.id ? "#EBF5FB" : G.white, opacity: s.active ? 1 : 0.55 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {s.name}
                    {!s.active && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: G.gray100, color: G.gray400, fontWeight: 600 }}>INACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: G.gray400, marginTop: 2 }}>{seriesQueries(s).length} {seriesQueries(s).length === 1 ? "query" : "queries"}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {editing ? (
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: G.navy, marginBottom: 14 }}>{form.id ? "Edit Series" : "New Series"}</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Series Name</div>
                  <input style={inp} value={form.name || ""} onChange={e => setF("name", e.target.value)} placeholder="e.g. Golden Triangle Winter Departures" autoFocus />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Notes</div>
                  <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.notes || ""} onChange={e => setF("notes", e.target.value)} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: G.gray800, marginBottom: 16, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.active !== false} onChange={e => setF("active", e.target.checked)} />
                  Active (shows in the series picker when creating/assigning a query)
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveEdit}>Save Series</button>
                </div>
              </div>
            ) : selected ? (
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: G.navy }}>{selected.name}</div>
                    {selected.notes && <div style={{ fontSize: 12, color: G.gray600, marginTop: 4 }}>{selected.notes}</div>}
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setForm({ ...selected }); setEditing(true); }}>✏ Edit</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => toggleActive(selected)}>{selected.active ? "Mark Inactive" : "Mark Active"}</button>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: G.gray600, textTransform: "uppercase", letterSpacing: "0.5px", margin: "18px 0 10px" }}>
                  Assigned Queries ({seriesQueries(selected).length})
                </div>
                {seriesQueries(selected).length === 0 && (
                  <div style={{ fontSize: 12, color: G.gray400 }}>No queries assigned yet — assign one from New Query or from a query's own Tour Details.</div>
                )}
                {seriesQueries(selected).map(q => (
                  <div key={q.id} style={{ background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => document.dispatchEvent(new CustomEvent("unitop-activate-query", { detail: { query: q } }))}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A5276", textDecoration: "underline" }}>{q.tourFileId || q.id}</div>
                      <div style={{ fontSize: 11, color: G.gray400 }}>{q.groupName || q.clientName} · {q.destination || q.sector || "—"}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => unassign(q)}>Unassign</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: G.gray400, fontSize: 13 }}>
                Select a series, or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
