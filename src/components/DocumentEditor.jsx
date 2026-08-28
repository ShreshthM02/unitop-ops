import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import * as Lib from '../lib/index.js';
const { G, VersionDropdown, ExportMenu, buildPaginatedLetterheadDocument, buildDocxBlobFromBodyBlocks, downloadDocx, printHTML,
  loadEditorDocuments, saveEditorDocumentVersion, markEditorDocumentVersionFinal, logAudit, db } = Lib;

// Phase 1 scope, deliberately: rich-text formatting, tables, images, A4
// page sizing, save/name/version, document-drawer listing, Print + Word
// export via the SAME infrastructure every other document here already
// uses. Explicitly NOT in this phase: real-time multi-user collaboration
// (needs a completely different sync layer), opening/round-tripping an
// arbitrary uploaded .docx, track changes/comments.

const TOOLBAR_BTN = { border: `1px solid ${G.gray200}`, background: G.white, borderRadius: 4, padding: "4px 8px",
  fontSize: 12, cursor: "pointer", color: G.gray800, marginRight: 2 };
const TOOLBAR_BTN_ACTIVE = { ...TOOLBAR_BTN, background: G.navy, color: "#fff", borderColor: G.navy };

function ToolbarButton({ active, onClick, title, children, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      style={{ ...(active ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN), opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

function EditorToolbar({ editor, readOnly }) {
  if (!editor) return null;
  const addImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => editor.chain().focus().setImage({ src: reader.result }).run();
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("URL", prev);
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (readOnly) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "8px 14px",
      borderBottom: `1px solid ${G.gray200}`, background: G.gray50 }}>
      <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↺</ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↻</ToolbarButton>
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <select value={editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
        onChange={e => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) }).run();
        }}
        style={{ ...TOOLBAR_BTN, padding: "4px 6px" }}>
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
      <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
      <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
      <ToolbarButton title="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>🖍</ToolbarButton>
      <input type="color" title="Text color" onChange={e => editor.chain().focus().setColor(e.target.value).run()}
        style={{ width: 24, height: 24, border: `1px solid ${G.gray200}`, borderRadius: 4, padding: 0, cursor: "pointer" }} />
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>⯇</ToolbarButton>
      <ToolbarButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</ToolbarButton>
      <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>⯈</ToolbarButton>
      <ToolbarButton title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>☰</ToolbarButton>
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>🔗</ToolbarButton>
      <ToolbarButton title="Insert image" onClick={addImage}>🖼</ToolbarButton>
      <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</ToolbarButton>
      <ToolbarButton title="Page break" onClick={() => editor.chain().focus().insertContent('<div class="page-break"></div>').run()}>⤓ Page</ToolbarButton>
      <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />
      <ToolbarButton title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞ Table</ToolbarButton>
      {editor.isActive("table") && <>
        <ToolbarButton title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>+Row</ToolbarButton>
        <ToolbarButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>-Row</ToolbarButton>
        <ToolbarButton title="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Col</ToolbarButton>
        <ToolbarButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>-Col</ToolbarButton>
        <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>✕ Table</ToolbarButton>
      </>}
    </div>
  );
}

const EDITOR_EXTENSIONS = [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Link.configure({ openOnClick: false }),
  ImageExt,
  Table.configure({ resizable: true }),
  TableRow, TableCell, TableHeader,
];

// A4 page, editing view -- full page (not the print content area, which
// is narrower after PRINT_MARGIN; Word/Docs-style page editing shows the
// whole sheet). Print output goes through buildPaginatedLetterheadDocument
// separately, with its own correct margin handling -- this is just the
// on-screen canvas.
const PAGE_CSS = `
  .doc-editor-page{background:#fff;width:210mm;min-height:297mm;margin:16px auto;padding:25mm 20mm;
    box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:'Inter',Arial,sans-serif;font-size:11pt;color:#1a1a1a}
  .doc-editor-page .ProseMirror{outline:none;min-height:247mm}
  .doc-editor-page table{border-collapse:collapse;width:100%;margin:8pt 0}
  .doc-editor-page td,.doc-editor-page th{border:1px solid #ccc;padding:6px 8px;min-width:1em}
  .doc-editor-page th{background:#f3f4f6;font-weight:700}
  .doc-editor-page img{max-width:100%}
  .doc-editor-page hr{border:none;border-top:1px solid #ccc;margin:14pt 0}
  .doc-editor-page .page-break{page-break-after:always;border-top:1px dashed #999;margin:16pt 0;position:relative}
  .doc-editor-page .page-break::after{content:"Page Break";position:absolute;top:-9px;left:8px;background:#fff;
    font-size:8pt;color:#999;padding:0 4px}
`;

function EditorView({ query, docKey, existingVersions, onBack, onSaved, currentUser, readOnly }) {
  const latest = existingVersions.length ? existingVersions[existingVersions.length - 1] : null;
  const [name, setName] = useState(latest?.name || "Untitled Document");
  const [versions, setVersions] = useState(existingVersions);
  const [version, setVersion] = useState((latest?.version || 0) + 1);
  const [finalVersion, setFinalVersion] = useState(existingVersions.find(v => v.isFinal)?.version || null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: latest?.contentHtml || "<p></p>",
    editable: !readOnly,
  });

  const loadVersionIntoDraft = (v) => {
    setViewingVersion(v.version);
    setName(v.name);
    editor?.commands.setContent(v.contentHtml || "<p></p>");
  };

  const saveVersion = async () => {
    if (!editor || saving) return;
    setSaving(true);
    const contentHtml = editor.getHTML();
    const { error } = await saveEditorDocumentVersion(db, query.id, docKey, { name, contentHtml, version }, currentUser?.id);
    if (!error) {
      const newVersions = [...versions, { docKey, name, version, contentHtml, isFinal: false }];
      setVersions(newVersions);
      setVersion(v => v + 1);
      setViewingVersion(null);
      logAudit(db, query.id, currentUser?.name, `Editor document "${name}" saved (v${version})`);
      onSaved && onSaved();
    }
    setSaving(false);
  };

  const buildPrintHTML = async () => buildPaginatedLetterheadDocument({
    title: name,
    bodyBlocks: [editor ? editor.getHTML() : ""],
    headerFooterAllPages: true,
  });
  const handlePrint = async () => printHTML(await buildPrintHTML());
  const exportDocx = async () => {
    const blob = await buildDocxBlobFromBodyBlocks({ bodyBlocks: [editor ? editor.getHTML() : ""], toggles: { headerFooterAllPages: true } });
    await downloadDocx(blob, name);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: G.navy, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>← Documents</button>
        <div style={{ flex: 1 }}>
          {readOnly
            ? <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',serif" }}>{name}</div>
            : <input value={name} onChange={e => setName(e.target.value)}
                style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)", color: "#fff",
                  fontSize: 16, fontWeight: 700, fontFamily: "'Playfair Display',serif", outline: "none", width: "100%", padding: "2px 0" }} />}
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>EDITOR · {versions.length > 0 ? `v${version - 1} saved` : "unsaved"}</div>
        </div>
        <VersionDropdown versions={versions} viewingVersion={viewingVersion} displayVersion={version} finalVersion={finalVersion}
          onSelectVersion={loadVersionIntoDraft}
          onMarkFinal={(v) => {
            setFinalVersion(v.version);
            markEditorDocumentVersionFinal(db, query.id, docKey, v.version);
            logAudit(db, query.id, currentUser?.name, `Editor document "${name}" v${v.version} marked final`);
          }}
          readOnly={readOnly} G={G} />
        {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" disabled={saving} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", fontSize: 11 }}>💾 {saving ? "Saving…" : `Save v${version}`}</button>}
      </div>
      <EditorToolbar editor={editor} readOnly={readOnly} />
      <div style={{ flex: 1, overflowY: "auto", background: G.gray100 }}>
        <style>{PAGE_CSS}</style>
        <div className="doc-editor-page">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
        <button onClick={onBack} className="btn btn-ghost">Back</button>
        <div style={{ flex: 1 }} />
        {!readOnly && <button onClick={saveVersion} className="btn btn-primary" disabled={saving}>💾 {saving ? "Saving…" : `Save v${version}`}</button>}
        <ExportMenu G={G} actions={[
          { id: "pdf", label: "PDF", icon: "📕", onSelect: handlePrint, hint: "Opens your browser's print dialog" },
          { id: "word", label: "Word", icon: "📄", onSelect: exportDocx, hint: "Downloads a .docx file" },
          { id: "print", label: "Print", icon: "🖨", onSelect: handlePrint, separatorBefore: true },
        ]} />
      </div>
    </div>
  );
}

function DocumentList({ query, docs, loading, onOpen, onNew, onClose }) {
  // Group all version rows into one entry per docKey, showing its latest version.
  const grouped = {};
  docs.forEach(d => {
    if (!grouped[d.docKey] || d.version > grouped[d.docKey].version) grouped[d.docKey] = d;
  });
  const list = Object.values(grouped).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: G.navy, padding: "14px 20px", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>EDITOR</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',serif" }}>{query.groupName || query.clientName}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{query.id}{query.tourFileId ? " · 📁 " + query.tourFileId : ""}</div>
        </div>
        <button onClick={onClose} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <button className="btn btn-success" onClick={onNew} style={{ marginBottom: 14 }}>+ New Document</button>
        {loading && <div style={{ textAlign: "center", padding: "32px 0", color: G.gray400, fontSize: 12 }}>Loading documents…</div>}
        {!loading && list.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: G.gray400, fontSize: 12 }}>No documents yet — create one above.</div>
        )}
        {list.map(d => (
          <div key={d.docKey} onClick={() => onOpen(d.docKey)}
            style={{ background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: G.gray800 }}>📝 {d.name}</div>
            <div style={{ fontSize: 11, color: G.gray400, marginTop: 2 }}>v{d.version}{d.isFinal ? " ★ final" : ""}{d.updatedAt ? " · " + new Date(d.updatedAt).toLocaleDateString("en-IN") : ""}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
        <button onClick={onClose} className="btn btn-ghost">Close</button>
      </div>
    </div>
  );
}

export default function DocumentEditor({ query, onClose, currentUser, readOnly }) {
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDocKey, setOpenDocKey] = useState(null);

  const refresh = () => {
    setLoading(true);
    loadEditorDocuments(db, query.id).then(rows => { setAllDocs(rows); setLoading(false); });
  };
  useEffect(refresh, [query.id]);

  const openExisting = (docKey) => setOpenDocKey(docKey);
  const openNew = () => setOpenDocKey(crypto.randomUUID());
  const back = () => { setOpenDocKey(null); refresh(); };

  const existingVersionsForOpenDoc = allDocs.filter(d => d.docKey === openDocKey);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: G.white, width: "min(900px, 100vw)", height: "100vh", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
        {openDocKey
          ? <EditorView query={query} docKey={openDocKey} existingVersions={existingVersionsForOpenDoc} onBack={back} onSaved={refresh} currentUser={currentUser} readOnly={readOnly} />
          : <DocumentList query={query} docs={allDocs} loading={loading} onOpen={openExisting} onNew={openNew} onClose={onClose} />}
      </div>
    </div>
  );
}
