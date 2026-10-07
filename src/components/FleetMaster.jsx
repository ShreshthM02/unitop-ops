import { useState, useEffect, useMemo, useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, useCan, RichTextEditor, sanitizeRichHtml, richHtmlHasContent, useIsNarrowViewport, defaultResizeImage, formatDateSlash, FileRemark,
  FLEET_PROFILE_FIELDS, blankVehicle, loadFleetVehicles, saveFleetVehicle, loadFleetRows, saveFleetRow, deleteFleetRow,
  mapDbFleetServiceRow, fleetServiceRowToDb, mapDbFleetExpenseRow, fleetExpenseRowToDb, newFleetId, vehicleFolderName,
  filterExpensesByRange, totalExpenses, formatINR, sortByDateDesc, validateServiceRow, validateExpenseRow } = Lib;

// Master Data → Fleet: our own vehicles. A vehicle has a profile plus three
// tabs, all manual (nothing here syncs from tour files or the cost sheet):
// service history, an expense ledger with a date-range total, and documents
// stored in Drive in a folder named after the vehicle.

const inp = { padding: "7px 9px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
const lbl = { fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 };
const kicker = { fontSize: 10, color: G.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 };

function ErrorLine({ msg }) {
  return msg ? <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 6, padding: "6px 10px", fontSize: 11.5, marginBottom: 10 }}>{msg}</div> : null;
}

// ── A manually-kept table: add / edit / delete rows ────────────────────────
// `columns`: [{key,label,type,placeholder,grow,render}]. Rows are saved one at
// a time with an explicit Save, so nothing is half-written.
function ManualRows({ columns, rows, blank, validate, onSave, onDelete, canEdit, emptyText, addLabel, rowLabel }) {
  const [draft, setDraft] = useState(null);   // the row being added/edited
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const grid = columns.map(c => c.grow ? `${c.grow}fr` : "1fr").join(" ") + " auto";
  const set = (k, v) => setDraft(p => ({ ...p, [k]: v }));
  const save = async () => {
    const problem = validate(draft);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr("");
    const res = await onSave(draft);
    setBusy(false);
    if (res && res.error) { setErr(res.error); return; }
    setDraft(null);
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete this ${rowLabel}?`)) return;
    const res = await onDelete(r);
    if (res && res.error) setErr(res.error);
  };
  const form = (
    <div data-testid="fleet-row-form" style={{ background: "#F8FAFC", border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 8 }}>
        {columns.map(c => (
          <div key={c.key} style={c.grow > 1 ? { gridColumn: "1 / -1" } : undefined}>
            <div style={lbl}>{c.label}</div>
            <input aria-label={c.label} style={inp} type={c.type || "text"} step={c.type === "number" ? "0.01" : undefined} placeholder={c.placeholder || ""}
              value={draft?.[c.key] ?? ""} onChange={e => set(c.key, e.target.value)} />
          </div>
        ))}
      </div>
      <ErrorLine msg={err} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "💾 Save"}</button>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setDraft(null); setErr(""); }}>Cancel</button>
      </div>
    </div>
  );
  return (
    <div>
      {canEdit && !draft && <button className="btn btn-primary" style={{ fontSize: 12, marginBottom: 10 }} onClick={() => { setDraft(blank()); setErr(""); }}>{addLabel}</button>}
      {draft && form}
      {!draft && <ErrorLine msg={err} />}
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: G.gray400, padding: "10px 0" }}>{emptyText}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "6px 10px", fontSize: 10, color: G.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {columns.map(c => <div key={c.key}>{c.label}</div>)}<div />
            </div>
            {rows.map(r => (
              <div key={r.id} data-testid="fleet-row" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "8px 10px", background: G.gray50, borderRadius: 6, marginBottom: 4, fontSize: 12, alignItems: "start" }}>
                {columns.map(c => <div key={c.key} style={{ wordBreak: "break-word" }}>{c.render ? c.render(r[c.key], r) : (r[c.key] || "—")}</div>)}
                <div style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
                  {canEdit && <span role="button" aria-label={`Edit ${rowLabel}`} style={{ cursor: "pointer", color: G.accent }} onClick={() => { setDraft({ ...r }); setErr(""); }}>✏</span>}
                  {canEdit && <span role="button" aria-label={`Delete ${rowLabel}`} style={{ cursor: "pointer", color: G.gray400 }} onClick={() => remove(r)}>✕</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Service history ────────────────────────────────────────────────────────
function ServiceHistoryTab({ vehicle, canEdit }) {
  const [rows, setRows] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  useEffect(() => {
    let live = true;
    loadFleetRows(db, "fleet_service_history", vehicle.id, mapDbFleetServiceRow).then(r => { if (live) { setRows(r.rows); setLoadErr(r.error || ""); } });
    return () => { live = false; };
  }, [vehicle.id]);
  const columns = [
    { key: "tourFileNo", label: "Tour File No." },
    { key: "startDate", label: "Start Date", type: "date", render: v => v ? formatDateSlash(v) : "—" },
    { key: "endDate", label: "End Date", type: "date", render: v => v ? formatDateSlash(v) : "—" },
    { key: "sector", label: "Sector" },
    { key: "notes", label: "Notes", grow: 2 },
  ];
  const onSave = async (r) => {
    const row = { ...r, id: r.id || newFleetId(), vehicleId: vehicle.id };
    const res = await saveFleetRow(db, "fleet_service_history", fleetServiceRowToDb(row));
    if (!res.error) setRows(p => p.some(x => x.id === row.id) ? p.map(x => x.id === row.id ? row : x) : [...p, row]);
    return res;
  };
  const onDelete = async (r) => {
    const res = await deleteFleetRow(db, "fleet_service_history", r.id);
    if (!res.error) setRows(p => p.filter(x => x.id !== r.id));
    return res;
  };
  return (
    <div>
      <div style={{ fontSize: 11.5, color: G.gray600, marginBottom: 10 }}>Tours this vehicle has run. Added by hand — nothing is pulled in automatically.</div>
      <ErrorLine msg={loadErr} />
      <ManualRows columns={columns} rows={sortByDateDesc(rows, "startDate")} blank={() => ({ tourFileNo: "", startDate: "", endDate: "", sector: "", notes: "" })}
        validate={validateServiceRow} onSave={onSave} onDelete={onDelete} canEdit={canEdit} addLabel="+ Add Service Entry" rowLabel="service entry"
        emptyText="No service history yet." />
    </div>
  );
}

// ── Expense ledger ─────────────────────────────────────────────────────────
function ExpenseLedgerTab({ vehicle, canEdit }) {
  const [rows, setRows] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    let live = true;
    loadFleetRows(db, "fleet_expenses", vehicle.id, mapDbFleetExpenseRow).then(r => { if (live) { setRows(r.rows); setLoadErr(r.error || ""); } });
    return () => { live = false; };
  }, [vehicle.id]);
  const shown = useMemo(() => sortByDateDesc(filterExpensesByRange(rows, from, to), "date"), [rows, from, to]);
  const filtered = !!(from || to);
  const columns = [
    { key: "date", label: "Date", type: "date", render: v => v ? formatDateSlash(v) : "—" },
    { key: "particulars", label: "Particulars", grow: 2 },
    { key: "amount", label: "Amount (INR)", type: "number", render: v => formatINR(v) },
    { key: "notes", label: "Notes", grow: 2 },
  ];
  const onSave = async (r) => {
    const row = { ...r, id: r.id || newFleetId(), vehicleId: vehicle.id, amount: parseFloat(r.amount) };
    const res = await saveFleetRow(db, "fleet_expenses", fleetExpenseRowToDb(row));
    if (!res.error) setRows(p => p.some(x => x.id === row.id) ? p.map(x => x.id === row.id ? row : x) : [...p, row]);
    return res;
  };
  const onDelete = async (r) => {
    const res = await deleteFleetRow(db, "fleet_expenses", r.id);
    if (!res.error) setRows(p => p.filter(x => x.id !== r.id));
    return res;
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", background: "#F8FAFC", border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
        <div><div style={lbl}>From</div><input aria-label="Filter from date" style={{ ...inp, width: 150 }} type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><div style={lbl}>To</div><input aria-label="Filter to date" style={{ ...inp, width: 150 }} type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        {filtered && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setFrom(""); setTo(""); }}>Clear</button>}
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={kicker}>{filtered ? "Total for selected dates" : "Total expense"}</div>
          <div data-testid="fleet-expense-total" style={{ fontSize: 20, fontWeight: 700, color: G.navy, fontFamily: "'Playfair Display',serif" }}>{formatINR(totalExpenses(shown))}</div>
          {filtered && <div style={{ fontSize: 10.5, color: G.gray400 }}>All time: {formatINR(totalExpenses(rows))}</div>}
        </div>
      </div>
      <ErrorLine msg={loadErr} />
      <ManualRows columns={columns} rows={shown} blank={() => ({ date: "", particulars: "", amount: "", notes: "" })}
        validate={validateExpenseRow} onSave={onSave} onDelete={onDelete} canEdit={canEdit} addLabel="+ Add Expense" rowLabel="expense"
        emptyText={filtered ? "No expenses in this date range." : "No expenses logged yet."} />
    </div>
  );
}

// ── Documents (Drive, folder named after the vehicle) ──────────────────────
function humanSize(b) {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function DocumentsTab({ vehicle, canEdit, onFolderCreated }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    db.from("fleet_documents").select("*").eq("vehicle_id", vehicle.id).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (live) { setDocs(data || []); setErr(error ? (error.message || "Could not load documents") : ""); setLoading(false); } });
    return () => { live = false; };
  }, [vehicle.id]);
  const upload = async (fileList) => {
    setErr("");
    for (const file of Array.from(fileList)) {
      setUploading(true);
      try {
        const toUpload = await defaultResizeImage(file);
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(toUpload);
        });
        const res = await db.drive.uploadFleet(vehicle.id, vehicleFolderName(vehicle), file.name, toUpload.type || file.type, base64);
        if (!res.success) { setErr(res.error || `Could not upload ${file.name}`); continue; }
        setDocs(p => [res.document, ...p]);
        onFolderCreated && onFolderCreated();
      } catch (e) { setErr(e.message || String(e)); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  // Same behaviour as renaming an upload on a tour file: renames the real
  // file in Drive and our record together.
  const startRename = (d) => { setRenamingId(d.id); setRenameValue(d.file_name); setErr(""); };
  const cancelRename = () => { setRenamingId(null); setRenameValue(""); };
  const saveRename = async (d) => {
    const name = renameValue.trim();
    if (!name || name === d.file_name) { cancelRename(); return; }
    setRenameSaving(true);
    const res = await db.drive.renameFile(d.id, name, "fleet");
    setRenameSaving(false);
    if (!res.success) { setErr(res.error || "Could not rename this document"); return; }
    setDocs(p => p.map(x => x.id === d.id ? { ...x, file_name: name } : x));
    cancelRename();
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.file_name}"? It is also removed from Drive.`)) return;
    setBusyId(d.id);
    const res = await db.drive.delete(d.id, "fleet");
    setBusyId(null);
    if (!res.success) { setErr(res.error || "Could not delete this document"); return; }
    setDocs(p => p.filter(x => x.id !== d.id));
  };
  return (
    <div>
      <div style={{ fontSize: 11.5, color: G.gray600, marginBottom: 10 }}>Stored in Google Drive in a folder named <b>{vehicleFolderName(vehicle)}</b>.</div>
      <input ref={fileRef} type="file" multiple style={{ display: "none" }} data-testid="fleet-file-input" onChange={e => e.target.files.length && upload(e.target.files)} />
      {canEdit && <button className="btn btn-primary" style={{ fontSize: 12, marginBottom: 10 }} disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? "Uploading…" : "⬆ Upload Documents"}</button>}
      <ErrorLine msg={err} />
      {loading ? <div style={{ fontSize: 12, color: G.gray400 }}>Loading…</div>
        : docs.length === 0 ? <div style={{ fontSize: 12, color: G.gray400 }}>No documents uploaded yet.</div>
        : docs.map(d => (
          <div key={d.id} data-testid="fleet-doc" style={{ background: G.gray50, borderRadius: 6, padding: "8px 12px", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{d.file_type?.startsWith("image/") ? "🖼" : d.file_type === "application/pdf" ? "📕" : "📄"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {renamingId === d.id ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input autoFocus aria-label="New file name" value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveRename(d); if (e.key === "Escape") cancelRename(); }}
                    style={{ ...inp, padding: "3px 6px", flex: 1, minWidth: 0 }} />
                  <button className="btn btn-primary" style={{ fontSize: 10.5, padding: "3px 8px" }} disabled={renameSaving} onClick={() => saveRename(d)}>{renameSaving ? "…" : "Save"}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: "3px 8px" }} disabled={renameSaving} onClick={cancelRename}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <a href={d.drive_view_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: G.accent, wordBreak: "break-word" }}>{d.file_name}</a>
                  {canEdit && <span role="button" aria-label={`Rename ${d.file_name}`} title="Rename" style={{ cursor: "pointer", color: G.gray400, fontSize: 12 }} onClick={() => startRename(d)}>✏</span>}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: G.gray400 }}>{[humanSize(d.file_size), d.uploaded_by_name && `by ${d.uploaded_by_name}`, d.created_at && new Date(d.created_at).toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}</div>
            </div>
            {canEdit && <button className="btn btn-ghost" style={{ fontSize: 11, color: "#C0392B", borderColor: "#FECACA" }} disabled={busyId === d.id} onClick={() => remove(d)}>{busyId === d.id ? "…" : "Delete"}</button>}
          </div>
          <div style={{ marginLeft: 26 }}>
            <FileRemark doc={d} G={G} canEdit={canEdit} onSave={async (html) => {
              const res = await db.drive.setRemarks(d.id, html, "fleet");
              if (res && res.success) setDocs(p => p.map(x => x.id === d.id ? { ...x, remarks: html || null } : x));
              return res;
            }} />
          </div>
          </div>
        ))}
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────
function ProfileView({ v }) {
  return (
    <div>
      <div style={{ background: G.gray50, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: G.navy }}>{v.name}</div>
        <div style={{ fontSize: 12, color: G.gray600 }}>{[v.model, v.colour].filter(Boolean).join(" · ") || "—"}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {FLEET_PROFILE_FIELDS.filter(f => f.key !== "name").map(f => (
          <div key={f.key}>
            <div style={kicker}>{f.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{f.key === "regDate" ? (v.regDate ? formatDateSlash(v.regDate) : "—") : (v[f.key] === "" || v[f.key] == null ? "—" : String(v[f.key]))}</div>
          </div>
        ))}
      </div>
      <div style={{ ...kicker, marginTop: 16 }}>Remarks</div>
      {richHtmlHasContent(v.remarks)
        ? <div data-testid="fleet-remarks" className="rich-content" style={{ background: G.gray50, borderRadius: 6, padding: "8px 12px", fontSize: 12.5, borderLeft: `3px solid ${G.accent}` }} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(v.remarks) }} />
        : <div style={{ fontSize: 12, color: G.gray400 }}>No remarks.</div>}
    </div>
  );
}

const TABS = [{ id: "profile", label: "Profile" }, { id: "service", label: "Service History" }, { id: "expenses", label: "Expense Ledger" }, { id: "documents", label: "Documents" }];

export default function FleetMaster({ currentUser, asTab = false, onClose }) {
  const can = useCan(currentUser);
  const canEdit = can("vendors_edit"); // same gate as Vendors: master-data editors
  const isNarrow = useIsNarrowViewport();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showDetailMobile, setShowDetailMobile] = useState(false);
  const [tab, setTab] = useState("profile");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blankVehicle());
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const r = await loadFleetVehicles(db);
    setVehicles(r.vehicles); setLoadErr(r.error || ""); setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const selected = vehicles.find(v => v.id === selectedId) || null;
  const list = vehicles.filter(v => {
    const q = search.trim().toLowerCase();
    return !q || [v.name, v.regNo, v.owner, v.model].some(x => String(x || "").toLowerCase().includes(q));
  });
  const setF = (k, val) => setForm(p => ({ ...p, [k]: val }));

  const startNew = () => { setForm(blankVehicle()); setFormErr(""); setEditing(true); setSelectedId(null); setShowDetailMobile(true); };
  const startEdit = () => { setForm({ ...selected }); setFormErr(""); setEditing(true); };
  const saveVehicle = async () => {
    if (!String(form.name || "").trim()) { setFormErr("Vehicle name is required."); return; }
    setSaving(true); setFormErr("");
    const renamed = form.id && selected && String(selected.name).trim() !== String(form.name).trim();
    const res = await saveFleetVehicle(db, form);
    if (res.error) { setSaving(false); setFormErr(res.error); return; }
    // Keep the Drive folder's name in step with the vehicle's name.
    if (renamed) db.drive.renameFleetFolder(res.vehicle.id, vehicleFolderName(res.vehicle));
    await reload();
    setSaving(false); setEditing(false); setSelectedId(res.vehicle.id); setTab("profile");
  };
  const removeVehicle = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}" and all of its service history, expenses and document records? Files already in Drive stay in the "${vehicleFolderName(selected)}" folder.`)) return;
    const res = await db.from("fleet_vehicles").eq("id", selected.id).delete();
    if (res.error) { setLoadErr(res.error.message || "Could not delete this vehicle"); return; }
    setSelectedId(null); setShowDetailMobile(false); await reload();
  };

  return (
    <div className={asTab ? undefined : "overlay"} style={asTab ? { height: "100%" } : undefined}>
      <div style={{ background: G.white, width: asTab ? "100%" : "min(900px, 100vw)", height: asTab ? "100%" : "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: G.navy, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>MASTER DATA</div><div style={{ fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',serif" }}>Fleet</div></div>
          {canEdit && <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={startNew}>+ Add Vehicle</button>}
          {!asTab && <button onClick={onClose} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>✕</button>}
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {(!isNarrow || !showDetailMobile) && (
            <div style={{ width: isNarrow ? "100%" : 240, borderRight: isNarrow ? "none" : `1px solid ${G.gray200}`, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${G.gray200}` }}>
                <input style={{ ...inp, padding: "6px 9px" }} placeholder="Search vehicles..." aria-label="Search vehicles" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {loading ? <div style={{ padding: 14, fontSize: 12, color: G.gray400 }}>Loading…</div>
                : list.length === 0 ? <div style={{ padding: 14, fontSize: 12, color: G.gray400 }}>{vehicles.length === 0 ? "No vehicles yet." : "No match."}</div>
                : list.map(v => (
                  <div key={v.id} data-testid="fleet-vehicle" onClick={() => { setSelectedId(v.id); setEditing(false); setTab("profile"); setShowDetailMobile(true); }}
                    style={{ padding: "10px 14px", borderBottom: `1px solid ${G.gray100}`, cursor: "pointer", background: selectedId === v.id ? "#EFF6FF" : "transparent", borderLeft: `3px solid ${selectedId === v.id ? G.accent : "transparent"}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: G.navy }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: G.gray600 }}>{[v.regNo, v.capacity && `${v.capacity} seats`].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                ))}
            </div>
          )}
          {(!isNarrow || showDetailMobile) && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {isNarrow && <div onClick={() => { setShowDetailMobile(false); setEditing(false); }} style={{ padding: "10px 14px", borderBottom: `1px solid ${G.gray200}`, cursor: "pointer", color: G.accent, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>← Back to list</div>}
              <ErrorLine msg={loadErr} />
              {editing ? (
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: G.navy, marginBottom: 14 }}>{form.id ? "Edit Vehicle" : "New Vehicle"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 12 }}>
                    {FLEET_PROFILE_FIELDS.map(f => (
                      <div key={f.key} style={f.key === "name" ? { gridColumn: "1 / -1" } : undefined}>
                        <div style={lbl}>{f.label}{f.required ? " *" : ""}</div>
                        <input aria-label={f.label} style={inp} type={f.type} min={f.type === "number" ? 1 : undefined} placeholder={f.placeholder || ""} value={form[f.key] ?? ""} onChange={e => setF(f.key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={lbl}>Remarks</div>
                    <RichTextEditor value={form.remarks || ""} onChange={v => setF("remarks", v)} minHeight={110} placeholder="Anything worth noting about this vehicle" />
                  </div>
                  <ErrorLine msg={formErr} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-ghost" onClick={() => { setEditing(false); if (!form.id) setShowDetailMobile(false); }}>Cancel</button>
                    <button className="btn btn-primary" disabled={saving} onClick={saveVehicle}>{saving ? "Saving…" : "Save Vehicle"}</button>
                  </div>
                </div>
              ) : selected ? (
                <>
                  <div style={{ display: "flex", borderBottom: `1px solid ${G.gray200}`, flexShrink: 0, overflowX: "auto" }}>
                    {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "'Inter',sans-serif", background: "none", whiteSpace: "nowrap", color: tab === t.id ? G.accent : G.gray600, fontWeight: tab === t.id ? 600 : 400, borderBottom: tab === t.id ? `2px solid ${G.accent}` : "2px solid transparent" }}>{t.label}</button>)}
                    <div style={{ flex: 1 }} />
                    {canEdit && tab === "profile" && <button className="btn btn-ghost" style={{ fontSize: 11, margin: "6px 12px" }} onClick={startEdit}>✏ Edit</button>}
                    {currentUser?.role === "admin" && tab === "profile" && <button className="btn btn-ghost" style={{ fontSize: 11, margin: "6px 12px 6px 0", color: "#C0392B", borderColor: "#FECACA" }} onClick={removeVehicle}>🗑 Delete</button>}
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                    {tab === "profile" && <ProfileView v={selected} />}
                    {tab === "service" && <ServiceHistoryTab vehicle={selected} canEdit={canEdit} />}
                    {tab === "expenses" && <ExpenseLedgerTab vehicle={selected} canEdit={canEdit} />}
                    {tab === "documents" && <DocumentsTab vehicle={selected} canEdit={canEdit} />}
                  </div>
                </>
              ) : (
                <div style={{ padding: 30, textAlign: "center", color: G.gray400, fontSize: 13 }}>{vehicles.length === 0 && !loading ? "Add your first vehicle to get started." : "Select a vehicle to view its details."}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
