import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import ImageBase from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import * as Lib from '../lib/index.js';
const { G, VersionDropdown, ExportMenu, buildPaginatedLetterheadDocument, buildDocxBlobFromBodyBlocks, downloadDocx, printHTML,
  loadEditorDocuments, saveEditorDocumentVersion, markEditorDocumentVersionFinal, logAudit, db, STAMP_B64 } = Lib;

// Phase 1 scope, deliberately: rich-text formatting, tables, images, A4
// page sizing, save/name/version, document-drawer listing, Print + Word
// export via the SAME infrastructure every other document here already
// uses. Explicitly NOT in this phase: real-time multi-user collaboration
// (needs a completely different sync layer), opening/round-tripping an
// arbitrary uploaded .docx, track changes/comments.

// Table cells/headers need a real backgroundColor attribute -- the base
// extensions don't carry one, so cell shading had nowhere to persist.
const TableCell = BaseTableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor: {
      default: null,
      parseHTML: el => el.style.backgroundColor || null,
      renderHTML: attrs => attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {},
    } };
  },
});
const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor: {
      default: null,
      parseHTML: el => el.style.backgroundColor || null,
      renderHTML: attrs => attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {},
    } };
  },
});
// Images need a real style attribute so a float (text-wrap) can persist
// through save/reload -- the base extension has no such attribute.
const ImageExt = ImageBase.extend({
  addAttributes() {
    return { ...this.parent?.(), style: {
      default: null,
      parseHTML: el => el.getAttribute('style'),
      renderHTML: attrs => attrs.style ? { style: attrs.style } : {},
    } };
  },
});

const FONT_FAMILIES = [
  ['Inter (default, body)', "'Inter',sans-serif"],
  ["Playfair Display (default, headings)", "'Playfair Display',serif"],
  ['Georgia', 'Georgia,serif'],
  ['Times New Roman', "'Times New Roman',Times,serif"],
  ['Arial', 'Arial,Helvetica,sans-serif'],
  ['Courier New', "'Courier New',Courier,monospace"],
];
const FONT_SIZES = ['8pt','9pt','10pt','11pt','12pt','14pt','16pt','18pt','20pt','24pt','28pt','32pt'];
const HIGHLIGHT_COLORS = ['#FEF08A','#BBF7D0','#BFDBFE','#FBCFE8','#FED7AA','#DDD6FE'];
const TEXT_COLORS = ['#1a1a1a','#DC2626','#059669','#2563EB','#D97706','#7C3AED','#0D1B2A'];

const TOOLBAR_BTN = { border: `1px solid ${G.gray200}`, background: G.white, borderRadius: 4, padding: "4px 8px",
  fontSize: 12, cursor: "pointer", color: G.gray800, marginRight: 2 };
const TOOLBAR_BTN_ACTIVE = { ...TOOLBAR_BTN, background: G.navy, color: "#fff", borderColor: G.navy };
const VSEP = () => <span style={{ width: 1, background: G.gray200, alignSelf: "stretch", margin: "0 4px" }} />;

function ToolbarButton({ active, onClick, title, children, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      style={{ ...(active ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN), opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

// A small color-swatch dropdown -- used for both highlight and text color.
function SwatchPicker({ title, colors, onPick, onClear, icon }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <ToolbarButton title={title} onClick={() => setOpen(o => !o)}>{icon}</ToolbarButton>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: G.white, border: `1px solid ${G.gray200}`,
          borderRadius: 6, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 20 }}>
          {colors.map(c => (
            <div key={c} onClick={() => { onPick(c); setOpen(false); }} title={c}
              style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: "pointer", border: `1px solid ${G.gray200}` }} />
          ))}
          {onClear && (
            <div onClick={() => { onClear(); setOpen(false); }} title="Remove"
              style={{ width: 20, height: 20, borderRadius: 4, cursor: "pointer", border: `1px solid ${G.gray200}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: G.gray400 }}>✕</div>
          )}
        </div>
      )}
    </div>
  );
}

function TableToolbar({ editor }) {
  if (!editor || !editor.isActive("table")) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "6px 14px",
      borderBottom: `1px solid ${G.gray200}`, background: "#EEF2FF" }}>
      <span style={{ fontSize: 10, color: G.gray600, fontWeight: 700, textTransform: "uppercase", marginRight: 4 }}>Table</span>
      <ToolbarButton title="Add row above" onClick={() => editor.chain().focus().addRowBefore().run()}>+Row ↑</ToolbarButton>
      <ToolbarButton title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}>+Row ↓</ToolbarButton>
      <ToolbarButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>-Row</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Add column left" onClick={() => editor.chain().focus().addColumnBefore().run()}>+Col ←</ToolbarButton>
      <ToolbarButton title="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Col →</ToolbarButton>
      <ToolbarButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>-Col</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Merge cells" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()}>Merge</ToolbarButton>
      <ToolbarButton title="Split cell" onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()}>Split</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Toggle header row" active={editor.isActive("tableHeader")} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header Row</ToolbarButton>
      <ToolbarButton title="Toggle header column" onClick={() => editor.chain().focus().toggleHeaderColumn().run()}>Header Col</ToolbarButton>
      <VSEP />
      <SwatchPicker title="Cell shading" icon="🎨 Shade" colors={HIGHLIGHT_COLORS}
        onPick={(c) => editor.chain().focus().setCellAttribute("backgroundColor", c).run()}
        onClear={() => editor.chain().focus().setCellAttribute("backgroundColor", null).run()} />
      <VSEP />
      <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>✕ Delete Table</ToolbarButton>
    </div>
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
  const setImageWrap = useCallback((mode) => {
    if (!editor.isActive("image")) return;
    const styles = {
      left: "float:left;margin:4px 14px 8px 0;max-width:45%",
      right: "float:right;margin:4px 0 8px 14px;max-width:45%",
      none: null,
    };
    editor.chain().focus().updateAttributes("image", { style: styles[mode] }).run();
  }, [editor]);

  if (readOnly) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "8px 14px",
      borderBottom: `1px solid ${G.gray200}`, background: G.gray50 }}>
      <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↺</ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↻</ToolbarButton>
      <VSEP />
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
      <select title="Font" value={editor.getAttributes("textStyle").fontFamily || ""}
        onChange={e => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}
        style={{ ...TOOLBAR_BTN, padding: "4px 6px", maxWidth: 130 }}>
        <option value="">Font…</option>
        {FONT_FAMILIES.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
      </select>
      <select title="Font size" value={editor.getAttributes("textStyle").fontSize || ""}
        onChange={e => e.target.value ? editor.chain().focus().setFontSize(e.target.value).run() : editor.chain().focus().unsetFontSize().run()}
        style={{ ...TOOLBAR_BTN, padding: "4px 6px", width: 64 }}>
        <option value="">Size…</option>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <VSEP />
      <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
      <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
      <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
      <SwatchPicker title="Text color" icon="A" colors={TEXT_COLORS}
        onPick={(c) => editor.chain().focus().setColor(c).run()}
        onClear={() => editor.chain().focus().unsetColor().run()} />
      <SwatchPicker title="Highlight color" icon="🖍" colors={HIGHLIGHT_COLORS}
        onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
        onClear={() => editor.chain().focus().unsetHighlight().run()} />
      <VSEP />
      <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>⯇</ToolbarButton>
      <ToolbarButton title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</ToolbarButton>
      <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>⯈</ToolbarButton>
      <ToolbarButton title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>☰</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>🔗</ToolbarButton>
      <ToolbarButton title="Insert image" onClick={addImage}>🖼</ToolbarButton>
      {editor.isActive("image") && <>
        <ToolbarButton title="Wrap text left of image" onClick={() => setImageWrap("left")}>⇤ Wrap</ToolbarButton>
        <ToolbarButton title="Wrap text right of image" onClick={() => setImageWrap("right")}>Wrap ⇥</ToolbarButton>
        <ToolbarButton title="No text wrap" onClick={() => setImageWrap("none")}>No Wrap</ToolbarButton>
      </>}
      <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</ToolbarButton>
      <ToolbarButton title="Page break" onClick={() => editor.chain().focus().insertContent('<div class="page-break"></div>').run()}>⤓ Page</ToolbarButton>
      <VSEP />
      <ToolbarButton title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞ Table</ToolbarButton>
    </div>
  );
}

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  ImageExt,
  Table.configure({ resizable: true }),
  TableRow, TableCell, TableHeader,
];

// A4 page, editing view -- full page (not the print content area, which
// is narrower after PRINT_MARGIN; Word/Docs-style page editing shows the
// whole sheet). Print output goes through buildPaginatedLetterheadDocument
// separately, with its own correct margin handling -- this is just the
// on-screen canvas. Playfair Display for headings / Inter for body match
// this app's own document convention by default; either is overridable
// per-selection via the toolbar's font picker.
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
  .doc-editor-page{background:#fff;width:210mm;min-height:297mm;margin:16px auto;padding:25mm 20mm;
    box-shadow:0 1px 4px rgba(0,0,0,0.15);font-family:'Inter',Arial,sans-serif;font-size:11pt;color:#1a1a1a}
  .doc-editor-page h1,.doc-editor-page h2,.doc-editor-page h3{font-family:'Playfair Display',serif}
  .doc-editor-page .ProseMirror{outline:none;min-height:247mm}
  .doc-editor-page table{border-collapse:collapse;width:100%;margin:8pt 0}
  .doc-editor-page td,.doc-editor-page th{border:1px solid #ccc;padding:6px 8px;min-width:1em;position:relative}
  .doc-editor-page th{background:#f3f4f6;font-weight:700}
  .doc-editor-page img{max-width:100%}
  .doc-editor-page hr{border:none;border-top:1px solid #ccc;margin:14pt 0}
  .doc-editor-page .page-break{page-break-after:always;border-top:1px dashed #999;margin:16pt 0;position:relative}
  .doc-editor-page .page-break::after{content:"Page Break";position:absolute;top:-9px;left:8px;background:#fff;
    font-size:8pt;color:#999;padding:0 4px}
  .doc-editor-page .selectedCell{background:rgba(37,99,235,0.08)}
`;

function EditorView({ query, docKey, existingVersions, onBack, onSaved, currentUser, readOnly }) {
  const latest = existingVersions.length ? existingVersions[existingVersions.length - 1] : null;
  const [name, setName] = useState(latest?.name || "Untitled Document");
  const [versions, setVersions] = useState(existingVersions);
  const [version, setVersion] = useState((latest?.version || 0) + 1);
  const [finalVersion, setFinalVersion] = useState(existingVersions.find(v => v.isFinal)?.version || null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [saving, setSaving] = useState(false);

  // Independent Header / Footer / Print on Letterhead toggles, plus Page
  // Number and Digital Stamp for parity with every other letterhead
  // document -- deliberately NOT the shared LetterheadToggleBar, which
  // bundles header+footer into one combined toggle; these are kept
  // genuinely separate on request.
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [printOnLetterhead, setPrintOnLetterhead] = useState(false);
  const [showPageNum, setShowPageNum] = useState(false);
  const [showStamp, setShowStamp] = useState(false);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: latest?.contentHtml || "<p></p>",
    editable: !readOnly,
    // Without this, TipTap does not re-render the consuming component on
    // transactions -- every toolbar active/disabled state (bold, undo/
    // redo, alignment, etc) is computed once at mount and then never
    // updates, which is what "undo/redo malfunctioning" actually was:
    // editor.can().undo() was correct, but the button never re-read it.
    shouldRerenderOnTransaction: true,
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

  const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:60pt;width:auto;display:block;margin-top:10pt" alt="Stamp"/>` : "";
  const buildPrintHTML = async () => buildPaginatedLetterheadDocument({
    title: name,
    bodyBlocks: [editor ? editor.getHTML() : "", stampHTML],
    showHeader, showFooter, printOnLetterhead, showPageNum,
    // "on all pages" only makes sense when the header/footer is shown at
    // all -- printOnLetterhead already implies repetition (blank space
    // reserved on every physical sheet) independent of this flag.
    headerFooterAllPages: printOnLetterhead || (showHeader && showFooter),
  });
  const handlePrint = async () => printHTML(await buildPrintHTML());
  const exportDocx = async () => {
    const args = await buildPrintHTML();
    const blob = await buildDocxBlobFromBodyBlocks({ bodyBlocks: [editor ? editor.getHTML() : "", stampHTML],
      toggles: { headerFooterAllPages: args.headerFooterAllPages, printOnLetterhead, showPageNum } });
    await downloadDocx(blob, name);
  };

  const Tog = ({ label, val, onToggle, disabled }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer", fontSize: 11,
      color: disabled ? G.gray400 : G.gray600, opacity: disabled ? 0.55 : 1 }}>
      <div onClick={disabled ? undefined : onToggle} style={{ width: 30, height: 16, borderRadius: 8, background: val ? G.navy : G.gray200,
        position: "relative", flexShrink: 0, transition: "background .2s" }}>
        <div style={{ position: "absolute", top: 2, left: val ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
      </div>
      {label}
    </label>
  );

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
      {!readOnly && (
        <div style={{ padding: "7px 18px", background: G.gray50, borderBottom: `1px solid ${G.gray200}`, display: "flex", gap: 16, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
          <Tog label="Header" val={showHeader} onToggle={() => setShowHeader(p => !p)} />
          <Tog label="Footer" val={showFooter} onToggle={() => setShowFooter(p => !p)} />
          <Tog label="Page number" val={showPageNum} onToggle={() => setShowPageNum(p => !p)} />
          <Tog label="Digital stamp" val={showStamp} onToggle={() => setShowStamp(p => !p)} />
          <span style={{ width: 1, alignSelf: "stretch", background: G.gray200 }} />
          <Tog label="🖨 Print on Letterhead" val={printOnLetterhead} onToggle={() => setPrintOnLetterhead(p => !p)} />
        </div>
      )}
      <EditorToolbar editor={editor} readOnly={readOnly} />
      <TableToolbar editor={editor} />
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
