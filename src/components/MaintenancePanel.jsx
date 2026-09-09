import { useState, useEffect } from "react";
import * as Lib from "../lib/index.js";
const { G, db, exportAllData, getLastBackupInfo, runHealthCheck, USER_MANUAL_SECTIONS,
  buildManualBodyHTML, buildPaginatedLetterheadDocument, printHTML, APP_VERSION } = Lib;

const STATUS_STYLE = {
  ok:      { icon: "✓", color: "#059669", bg: "#ECFDF5" },
  warning: { icon: "⚠", color: "#92400E", bg: "#FFFBEB" },
  error:   { icon: "✕", color: "#991B1B", bg: "#FEF2F2" },
};

function timeAgo(iso) {
  if (!iso) return null;
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.floor(days)} days ago`;
}

export default function MaintenancePanel({ currentUser }) {
  const [tab, setTab] = useState("backup");

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${G.gray200}` }}>
        {[["backup", "🗄 Backup & Export"], ["health", "🩺 Health Check"], ["manual", "📖 User Manual"]].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)}
            style={{
              padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400,
              color: tab === id ? G.navy : G.gray400, borderBottom: tab === id ? `2px solid ${G.accent}` : "2px solid transparent",
            }}>
            {label}
          </div>
        ))}
      </div>
      {tab === "backup" && <BackupTab currentUser={currentUser} />}
      {tab === "health" && <HealthCheckTab />}
      {tab === "manual" && <ManualTab />}
    </div>
  );
}

// ─── BACKUP & EXPORT ─────────────────────────────────────────────────────────
function BackupTab({ currentUser }) {
  const [lastBackup, setLastBackup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getLastBackupInfo(db).then(info => { setLastBackup(info); setLoading(false); });
  }, []);

  const handleExport = async () => {
    setExporting(true); setError(""); setResult(null);
    try {
      const res = await exportAllData(db, currentUser);
      setResult(res);
      setLastBackup({ by: currentUser?.name, at: new Date().toISOString(), summary: res.summary });
    } catch (e) {
      setError(e.message || String(e));
    }
    setExporting(false);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: G.gray600, marginBottom: 16 }}>
        Downloads every real business record -- queries, cost sheets, quotations, payments, agents, vendors, and more --
        as one Excel file, organised into clearly labelled sheets a person can actually open and read. This is separate
        from Supabase's own infrastructure-level backups; it's a copy you hold yourself, in a form that's useful on its own.
      </div>

      <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: G.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
          Last backup
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: G.gray400 }}>Checking…</div>
        ) : lastBackup ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: G.gray800 }}>
              {timeAgo(lastBackup.at)} <span style={{ fontWeight: 400, color: G.gray400, fontSize: 12 }}>
                ({new Date(lastBackup.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })})
              </span>
            </div>
            <div style={{ fontSize: 12, color: G.gray400, marginTop: 2 }}>by {lastBackup.by}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#92400E" }}>No backup has ever been exported yet.</div>
        )}
      </div>

      <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ fontSize: 13 }}>
        {exporting ? "Exporting…" : "⬇ Export Everything Now"}
      </button>

      {error && <div style={{ marginTop: 12, fontSize: 12, color: "#991B1B", background: "#FEF2F2", borderRadius: 6, padding: "8px 12px" }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 16, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#065F46", marginBottom: 8 }}>✓ Export complete -- {result.filename}</div>
          <div style={{ fontSize: 11.5, color: G.gray600, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
            {result.summary.map(s => <div key={s.sheet}>{s.sheet}: <strong>{s.rows}</strong> row{s.rows === 1 ? "" : "s"}</div>)}
          </div>
        </div>
      )}

      <DriveRootFolderSetup />
    </div>
  );
}

// One-time Drive setup utility. Only needed once, when first connecting
// Drive or when switching to a narrower OAuth scope that can no longer
// see a manually-created parent folder -- drive.file only grants access
// to files/folders the app itself creates, so a fresh, app-owned parent
// is created here once, and its id gets pasted into
// GOOGLE_DRIVE_ROOT_FOLDER_ID. Every query folder nests under whatever
// this id points to, keeping Drive organised rather than every query's
// folder scattering across the top level of the account.
function DriveRootFolderSetup() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Unitop Ops Documents");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setCreating(true); setError(""); setResult(null);
    const res = await db.drive.createRootFolder(name.trim() || "Unitop Ops Documents");
    setCreating(false);
    if (!res.success) { setError(res.error || "Could not create the folder"); return; }
    setResult(res);
  };

  return (
    <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${G.gray100}` }}>
      {!open ? (
        <span style={{ fontSize: 11, color: G.gray400, cursor: "pointer" }} onClick={() => setOpen(true)}>
          Drive folder setup (only needed once, or after changing Drive permissions)
        </span>
      ) : (
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 12, color: G.gray600, marginBottom: 10 }}>
            Creates a new, app-owned parent folder in your Drive that every query's own folder will nest inside.
            Run this once, then copy the folder ID it returns into the GOOGLE_DRIVE_ROOT_FOLDER_ID secret in Supabase.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Folder name"
              style={{ flex: 1, padding: "6px 10px", border: `1px solid ${G.gray200}`, borderRadius: 6, fontSize: 12, fontFamily: "'Inter',sans-serif" }} />
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create folder"}
            </button>
          </div>
          {error && <div style={{ marginTop: 8, fontSize: 11.5, color: "#991B1B", background: "#FEF2F2", borderRadius: 6, padding: "6px 10px" }}>{error}</div>}
          {result && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "#065F46", background: "#ECFDF5", borderRadius: 6, padding: "8px 10px" }}>
              ✓ Created "{result.folderName}" -- copy this ID into GOOGLE_DRIVE_ROOT_FOLDER_ID:
              <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11, background: G.white, padding: "4px 8px", borderRadius: 4, wordBreak: "break-all" }}>{result.folderId}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
function HealthCheckTab() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const handleRun = async () => {
    setRunning(true);
    const res = await runHealthCheck(db);
    setReport(res);
    setRunning(false);
  };

  const counts = report ? report.results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {}) : null;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: G.gray600, marginBottom: 16 }}>
        Runs a real set of checks directly against the live data -- orphaned records, incomplete foreign-currency
        payments, tours sitting past their end date, and a few other data-quality signals -- and tells you plainly
        whether things look right.
      </div>
      <div className="manual-scope-note" style={{ fontSize: 11.5, color: G.gray400, background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 6, padding: "8px 12px", marginBottom: 16 }}>
        Worth knowing honestly: this checks real data the app can see about itself. It can't check things like the
        underlying database's security policies or whether the application code itself has a bug -- those need a
        developer looking at the source directly, not something a running app can inspect about itself.
      </div>

      <button className="btn btn-primary" onClick={handleRun} disabled={running} style={{ fontSize: 13, marginBottom: 16 }}>
        {running ? "Running…" : "▶ Run Health Check"}
      </button>

      {report && (
        <div>
          <div style={{ display: "flex", gap: 14, marginBottom: 14, fontSize: 12.5 }}>
            <span style={{ color: "#059669" }}>{counts.ok || 0} passed</span>
            {counts.warning > 0 && <span style={{ color: "#92400E" }}>{counts.warning} warning{counts.warning === 1 ? "" : "s"}</span>}
            {counts.error > 0 && <span style={{ color: "#991B1B" }}>{counts.error} error{counts.error === 1 ? "" : "s"}</span>}
            <span style={{ color: G.gray400, marginLeft: "auto" }}>Ran {new Date(report.ranAt).toLocaleTimeString("en-IN")} · {(report.durationMs / 1000).toFixed(1)}s</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.results.map(r => {
              const s = STATUS_STYLE[r.status];
              return (
                <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: s.bg, borderRadius: 6, padding: "10px 12px" }}>
                  <span style={{ color: s.color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: G.gray800 }}>{r.label}</div>
                    <div style={{ fontSize: 11.5, color: G.gray600, marginTop: 2 }}>{r.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── USER MANUAL ─────────────────────────────────────────────────────────────
function ManualTab() {
  const handleExportPDF = async () => {
    const html = await buildPaginatedLetterheadDocument({
      title: "Unitop Ops -- User Manual",
      bodyBlocks: [buildManualBodyHTML()],
      extraHeadCSS: `
        .manual-note { background:#F0F9FF; border:1px solid #BAE6FD; border-radius:4pt; padding:8pt 10pt; margin:8pt 0; font-size:9.5pt; }
        .manual-warn { background:#FEF2F2; border:1px solid #FECACA; border-radius:4pt; padding:8pt 10pt; margin:8pt 0; font-size:9.5pt; color:#7F1D1D; }
        table.manual-table { width:100%; border-collapse:collapse; margin:8pt 0; }
        table.manual-table th { background:#1A3A52; color:#fff; font-size:8.5pt; padding:5pt 7pt; text-align:left; }
        table.manual-table td { padding:4pt 7pt; border-bottom:0.5pt solid #e5e7eb; font-size:9pt; }
      `,
      headerFooterAllPages: true,
    });
    printHTML(html);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: G.gray600 }}>The same manual shared with the team -- always current, exportable any time.</div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleExportPDF}>⬇ Export to PDF</button>
      </div>
      <div style={{ maxWidth: 760, background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "20px 28px", maxHeight: "65vh", overflowY: "auto" }}>
        <style>{`
          .manual-body h2 { font-size:16px; color:#1A3A52; margin:22px 0 8px; font-family:'Playfair Display',serif; }
          .manual-body h2:first-child { margin-top:0; }
          .manual-body h3 { font-size:13.5px; color:#C0392B; margin:16px 0 6px; }
          .manual-body p, .manual-body li { font-size:13px; line-height:1.6; color:#374151; }
          .manual-body ul { padding-left:20px; margin:6px 0; }
          .manual-note { background:#F0F9FF; border:1px solid #BAE6FD; border-radius:6px; padding:10px 12px; margin:10px 0; font-size:12.5px; }
          .manual-warn { background:#FEF2F2; border:1px solid #FECACA; border-radius:6px; padding:10px 12px; margin:10px 0; font-size:12.5px; color:#7F1D1D; }
          table.manual-table { width:100%; border-collapse:collapse; margin:10px 0; }
          table.manual-table th { background:#1A3A52; color:#fff; font-size:11.5px; padding:6px 9px; text-align:left; }
          table.manual-table td { padding:5px 9px; border-bottom:1px solid #e5e7eb; font-size:12px; }
        `}</style>
        <div className="manual-body" dangerouslySetInnerHTML={{ __html: buildManualBodyHTML() }} />
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${G.gray100}`, fontSize: 11, color: G.gray400, textAlign: "center" }}>
          Unitop Ops {APP_VERSION}
        </div>
      </div>
    </div>
  );
}
