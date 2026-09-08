import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, formatDateSlash, defaultResizeImage, logAudit } = Lib;

// Real Google Drive document upload -- replaces the old "log a paper
// document + optionally paste a Drive link" placeholder that was
// always explicitly labeled as awaiting this. The old standalone
// (non-inline) DocumentRegistry overlay was dead code (nothing
// rendered it) and has been removed rather than carried forward
// unused.
//
// Deliberately simpler than the old metadata-heavy log (category/
// status/received-from): those fields were designed around tracking a
// PAPER document's whereabouts before real upload existed. Now that a
// real file lives here, the file itself -- its name, who uploaded it,
// when -- is the record; there's no paper trail left to separately log.
//
// Uploads work identically whether or not this query has been
// converted to a tour file yet -- never gated on tourFileId. The
// underlying Drive folder is created lazily on the first real upload,
// named after the query, and renamed (not recreated) the moment a
// query converts, so nothing uploaded beforehand ever moves or breaks.
function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS = {
  "application/pdf": "📕",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📘",
  "application/msword": "📘",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📗",
  "application/vnd.ms-excel": "📗",
};
function fileIcon(mimeType) {
  if (FILE_ICONS[mimeType]) return FILE_ICONS[mimeType];
  if (mimeType?.startsWith("image/")) return "🖼";
  return "📄";
}

export function DocRegistryInline({ queryId, tourFileId, groupName, clientName, currentUser, readOnly }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const loadDocs = () => {
    db.from("query_documents").select("*").eq("query_id", queryId).order("created_at", { ascending: false })
      .then(({ data }) => { setDocs(data || []); setLoading(false); });
  };
  useEffect(() => { loadDocs(); }, [queryId]);

  const folderLabel = () => {
    const name = groupName || clientName || "Untitled";
    return tourFileId ? `${tourFileId} - ${name}` : `${queryId} - ${name}`;
  };

  const handleFilesSelected = async (fileList) => {
    setUploadError("");
    for (const file of Array.from(fileList)) {
      setUploading(true);
      try {
        // Compression: real and meaningful for images (resized/
        // re-encoded via canvas, same helper the photo library
        // already uses), left untouched for PDF/docx/xlsx -- those
        // are already-compressed container formats, and attempting
        // further compression on them client-side risks corrupting
        // the document for a saving that isn't realistically there.
        const toUpload = await defaultResizeImage(file);
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(toUpload);
        });
        const res = await db.drive.upload(queryId, folderLabel(), file.name, toUpload.type || file.type, base64);
        if (!res.success) { setUploadError(res.error || `Could not upload ${file.name}`); continue; }
        setDocs(prev => [res.document, ...prev]);
        logAudit(db, queryId, currentUser?.name, `Document uploaded: "${file.name}"`);
      } catch (e) {
        setUploadError(e.message || String(e));
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (doc) => {
    setDeletingId(doc.id);
    const res = await db.drive.delete(doc.id);
    setDeletingId(null);
    if (!res.success) { setUploadError(res.error || "Could not delete this document"); return; }
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    logAudit(db, queryId, currentUser?.name, `Document deleted: "${doc.file_name}"`);
  };

  return (
    <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      {readOnly && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#92400E", marginBottom: 10 }}>
          🔒 This tour file is cancelled — viewing only, nothing here is editable.
        </div>
      )}
      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
        onChange={e => e.target.files.length && handleFilesSelected(e.target.files)} />
      <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 10 }} disabled={uploading}
        onClick={() => fileInputRef.current?.click()}>
        {uploading ? "Uploading…" : "+ Upload document"}
      </button>
      {uploadError && <div style={{ fontSize: 11, color: "#991B1B", background: "#FEF2F2", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>{uploadError}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: G.gray400, fontSize: 12 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: G.gray400, fontSize: 12 }}>No documents uploaded yet</div>
      ) : docs.map(d => (
        <div key={d.id} style={{ background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 7, padding: "9px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(d.file_type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file_name}</div>
            <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 2 }}>
              {humanSize(d.file_size)} · {d.uploaded_by_name || "Unknown"} · {formatDateSlash(d.created_at?.slice(0, 10))}
            </div>
          </div>
          <a href={d.drive_view_link} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#1A5276", background: "#EBF5FB", padding: "3px 9px", borderRadius: 5, textDecoration: "none", flexShrink: 0 }}>
            View
          </a>
          <button onClick={() => handleDelete(d)} disabled={deletingId === d.id}
            style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid #FECACA", background: "#FFF5F5", color: "#C0392B", cursor: "pointer", fontFamily: "'Inter',sans-serif", flexShrink: 0 }}>
            {deletingId === d.id ? "…" : "Delete"}
          </button>
        </div>
      ))}
    </fieldset>
  );
}
