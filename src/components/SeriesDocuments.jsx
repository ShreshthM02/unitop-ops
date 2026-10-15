import { useState, useEffect, useRef, useMemo } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, defaultResizeImage, setSeriesMasterQuery, SERIES_SETUP_MSG } = Lib;

// Series → Documents: pick which file is the series master (any query or tour
// file, converted or not), see that file's Cost Sheet / Quotation / Itinerary /
// Tour Briefing right here (live, not a copy), and keep the series' own uploads.

const humanSize = (n) => !n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const lbl = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const inp = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", background: G.white, color: G.gray800 };

export default function SeriesDocuments({ series, queries, currentUser, canEdit = true, onSeriesChange }) {
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const masterId = series.masterQueryId || "";
  const master = useMemo(() => (queries || []).find(q => q.id === masterId) || null, [queries, masterId]);
  const inSeries = (queries || []).filter(q => q.seriesId === series.id);
  const others = (queries || []).filter(q => q.seriesId !== series.id && !q.cancelled);
  const label = (q) => `${q.tourFileId || q.id} — ${q.groupName || q.clientName || "Untitled"}`;

  const [versions, setVersions] = useState({});
  useEffect(() => {
    let live = true;
    setVersions({});
    if (!masterId) return;
    (async () => {
      const get = async (t) => { const { data } = await db.from(t).select("version,is_final").eq("query_id", masterId); return data || []; };
      const [cs, qt, it] = await Promise.all([get("cost_sheets"), get("quotations"), get("itineraries")]);
      const sum = (rows) => rows.length ? `${rows.length} version${rows.length === 1 ? "" : "s"}${rows.some(r => r.is_final) ? " · final marked" : ""}` : "none yet";
      if (live) setVersions({ costsheet: sum(cs), quotation: sum(qt), itinerary: sum(it) });
    })();
    return () => { live = false; };
  }, [masterId]);

  const pick = async (id) => {
    setSaving(true); setMsg("");
    const res = await setSeriesMasterQuery(db, series.id, id, currentUser?.name);
    setSaving(false);
    if (res.error) { setMsg(res.error); return; }
    setMsg(res.warning ? `Master set. Note: ${res.warning}` : "");
    onSeriesChange && onSeriesChange({ ...series, masterQueryId: id });
  };
  const open = (panel) => master && document.dispatchEvent(new CustomEvent("unitop-open", { detail: { panel, query: master } }));
  const tiles = [
    { icon: "📊", name: "Cost Sheet", panel: "costsheet", v: versions.costsheet },
    { icon: "📋", name: "Quotation", panel: "quotation", v: versions.quotation },
    { icon: "🗺", name: "Itinerary", panel: "itinerary", v: versions.itinerary },
    { icon: "📋", name: "Tour Briefing Sheet", panel: "tourbriefing" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={lbl}>Master file for this series</div>
        <select style={inp} value={masterId} disabled={!canEdit || saving} onChange={e => pick(e.target.value)} aria-label="Master file">
          <option value="">— none chosen —</option>
          {inSeries.length > 0 && <optgroup label="Files in this series">{inSeries.map(q => <option key={q.id} value={q.id}>{label(q)}</option>)}</optgroup>}
          {others.length > 0 && <optgroup label="Any other query / tour file (as a reference)">{others.map(q => <option key={q.id} value={q.id}>{label(q)}</option>)}</optgroup>}
        </select>
        <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 4 }}>
          The master's documents show below as they are now. New files created in this series start from them, and each file keeps its own editable copy.
        </div>
        {msg && <div role="alert" style={{ marginTop: 6, fontSize: 11.5, color: "#B91C1C" }}>{msg}</div>}
      </div>

      {masterId && !master && <div style={{ fontSize: 12, color: G.gray600, marginBottom: 12 }}>The chosen master file is no longer available. Pick another.</div>}
      {master && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8, marginBottom: 18 }}>
          {tiles.map(t => (
            <button key={t.name} onClick={() => open(t.panel)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 8, border: `1px solid ${G.gray200}`, background: G.white, cursor: "pointer", textAlign: "left", fontFamily: "'Inter',sans-serif" }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: G.gray800 }}>{t.name}</span>
                {t.v && <span style={{ display: "block", fontSize: 10.5, color: G.gray400 }}>{t.v}</span>}</span>
            </button>
          ))}
        </div>
      )}

      <SeriesUploads series={series} currentUser={currentUser} canEdit={canEdit} />
    </div>
  );
}

function SeriesUploads({ series, currentUser, canEdit }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const fileRef = useRef(null);
  const folderName = `Series - ${series.name}`;

  useEffect(() => {
    let live = true;
    setLoading(true);
    db.from("series_documents").select("*").eq("series_id", series.id).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (live) { setDocs(data || []); setErr(error ? (/series_documents|PGRST205|42P01/.test(error.message || "") ? SERIES_SETUP_MSG : error.message) : ""); setLoading(false); } });
    return () => { live = false; };
  }, [series.id]);

  const upload = async (fileList) => {
    setErr("");
    for (const file of Array.from(fileList)) {
      setUploading(true);
      try {
        const toUpload = await defaultResizeImage(file);
        const base64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(",")[1]); r.onerror = reject; r.readAsDataURL(toUpload); });
        const res = await db.drive.uploadSeries(series.id, folderName, file.name, toUpload.type || file.type, base64);
        if (!res.success) { setErr(res.error || `Could not upload ${file.name}`); continue; }
        setDocs(p => [res.document, ...p]);
      } catch (e) { setErr(e.message || String(e)); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const saveRename = async (d) => {
    const name = renameValue.trim();
    if (!name || name === d.file_name) { setRenamingId(null); return; }
    const res = await db.drive.renameFile(d.id, name, "series");
    if (!res.success) { setErr(res.error || "Could not rename"); return; }
    setDocs(p => p.map(x => x.id === d.id ? { ...x, file_name: name } : x)); setRenamingId(null);
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.file_name}"? It is also removed from Drive.`)) return;
    setBusyId(d.id);
    const res = await db.drive.delete(d.id, "series");
    setBusyId(null);
    if (!res.success) { setErr(res.error || "Could not delete"); return; }
    setDocs(p => p.filter(x => x.id !== d.id));
  };

  return (
    <div>
      <div style={{ ...lbl, marginBottom: 8 }}>Series uploads</div>
      <div style={{ fontSize: 11, color: G.gray600, marginBottom: 8 }}>Contracts, rate letters, group lists and anything shared by every departure. Stored in Google Drive in a folder named <b>{folderName}</b>.</div>
      <input ref={fileRef} type="file" multiple style={{ display: "none" }} data-testid="series-file-input" onChange={e => e.target.files.length && upload(e.target.files)} />
      {canEdit && <button className="btn btn-primary" style={{ fontSize: 12, marginBottom: 10 }} disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? "Uploading…" : "⬆ Upload documents"}</button>}
      {err && <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 6, padding: "6px 10px", fontSize: 11.5, marginBottom: 8 }}>{err}</div>}
      {loading ? <div style={{ fontSize: 12, color: G.gray400 }}>Loading…</div>
        : docs.length === 0 ? <div style={{ fontSize: 12, color: G.gray400 }}>No documents uploaded yet.</div>
        : docs.map(d => (
          <div key={d.id} data-testid="series-doc" style={{ display: "flex", alignItems: "center", gap: 10, background: G.gray50, borderRadius: 6, padding: "8px 12px", marginBottom: 4 }}>
            <span>{d.file_type?.startsWith("image/") ? "🖼" : d.file_type === "application/pdf" ? "📕" : "📄"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {renamingId === d.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input autoFocus aria-label="New file name" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveRename(d); if (e.key === "Escape") setRenamingId(null); }} style={{ ...inp, padding: "3px 6px" }} />
                  <button className="btn btn-primary" style={{ fontSize: 10.5, padding: "3px 8px" }} onClick={() => saveRename(d)}>Save</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <a href={d.drive_view_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: G.accent, wordBreak: "break-word" }}>{d.file_name}</a>
                  {canEdit && <span role="button" aria-label={`Rename ${d.file_name}`} title="Rename" style={{ cursor: "pointer", color: G.gray400, fontSize: 12 }} onClick={() => { setRenamingId(d.id); setRenameValue(d.file_name); }}>✏</span>}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: G.gray400 }}>{[humanSize(d.file_size), d.uploaded_by_name && `by ${d.uploaded_by_name}`, d.created_at && new Date(d.created_at).toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}</div>
            </div>
            {canEdit && <button className="btn btn-ghost" style={{ fontSize: 11, color: "#C0392B", borderColor: "#FECACA" }} disabled={busyId === d.id} onClick={() => remove(d)}>{busyId === d.id ? "…" : "Delete"}</button>}
          </div>
        ))}
    </div>
  );
}
