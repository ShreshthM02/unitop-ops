import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Mark, mergeAttributes } from '@tiptap/core';
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
// borderColor similarly, for the cell-border picker added in Phase 2.
const TableCell = BaseTableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor: {
      default: null,
      parseHTML: el => el.style.backgroundColor || null,
      renderHTML: attrs => attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {},
    }, borderColor: {
      default: null,
      parseHTML: el => el.style.borderColor || null,
      renderHTML: attrs => attrs.borderColor ? { style: `border-color:${attrs.borderColor};border-width:2px;border-style:solid` } : {},
    } };
  },
});
const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor: {
      default: null,
      parseHTML: el => el.style.backgroundColor || null,
      renderHTML: attrs => attrs.backgroundColor ? { style: `background-color:${attrs.backgroundColor}` } : {},
    }, borderColor: {
      default: null,
      parseHTML: el => el.style.borderColor || null,
      renderHTML: attrs => attrs.borderColor ? { style: `border-color:${attrs.borderColor};border-width:2px;border-style:solid` } : {},
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

// Phase 2: threaded inline comments -- a real, achievable alternative to
// full Word-style track changes (accept/reject revision marks), which
// would need a genuine diff/revision data model built from scratch. A
// comment is a mark wrapping the anchored text with a stable commentId;
// the comment's own text/author/timestamp/resolved-state lives in the
// document's separate `comments` array (saved alongside content_html),
// not in the mark itself -- marks only carry small attributes, and
// comments need to be listable/resolvable independent of their anchor.
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return { commentId: {
      default: null,
      parseHTML: el => el.getAttribute('data-comment-id'),
      renderHTML: attrs => attrs.commentId ? { 'data-comment-id': attrs.commentId } : {},
    } };
  },
  parseHTML() { return [{ tag: 'span[data-comment-id]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'editor-comment-highlight' }), 0];
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
      <SwatchPicker title="Cell border" icon="▭ Border" colors={TEXT_COLORS}
        onPick={(c) => editor.chain().focus().setCellAttribute("borderColor", c).run()}
        onClear={() => editor.chain().focus().setCellAttribute("borderColor", null).run()} />
      <VSEP />
      <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>✕ Delete Table</ToolbarButton>
    </div>
  );
}

function EditorToolbar({ editor, readOnly, onAddComment }) {
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
      {onAddComment && <ToolbarButton title="Add comment" disabled={editor.state.selection.empty} onClick={onAddComment}>💬</ToolbarButton>}
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
  CommentMark,
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
  .doc-editor-page .editor-comment-highlight{background:#FEF9C3;border-bottom:2px solid #EAB308;cursor:pointer}
  .doc-editor-page .editor-comment-highlight.editor-comment-active{background:#FDE047}
  .doc-editor-page .editor-comment-highlight.editor-comment-resolved{background:transparent;border-bottom:2px dotted #ccc}
`;

function EditorView({ query, docKey, existingVersions, onBack, onSaved, currentUser, readOnly, importedContent }) {
  const latest = existingVersions.length ? existingVersions[existingVersions.length - 1] : null;
  const [name, setName] = useState(latest?.name || importedContent?.name || "Untitled Document");
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

  // Phase 2: threaded comments, saved alongside content_html as their
  // own array (see saveEditorDocumentVersion). dirty tracks unsaved
  // edits since the last successful save -- a real gap in Phase 1: 20
  // minutes of editing lost to an accidental tab close with no warning
  // at all. showFindReplace/find/replace drive the Find & Replace panel.
  const [comments, setComments] = useState(latest?.comments || []);
  const [activeCommentId, setActiveCommentId] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [dirty, setDirty] = useState(!!importedContent);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: latest?.contentHtml || importedContent?.html || "<p></p>",
    editable: !readOnly,
    // Without this, TipTap does not re-render the consuming component on
    // transactions -- every toolbar active/disabled state (bold, undo/
    // redo, alignment, etc) is computed once at mount and then never
    // updates, which is what "undo/redo malfunctioning" actually was:
    // editor.can().undo() was correct, but the button never re-read it.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => {
      setDirty(true);
      const text = editor.getText().trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    },
    onCreate: ({ editor }) => {
      const text = editor.getText().trim();
      setWordCount(text ? text.split(/\s+/).length : 0);
    },
  });

  const loadVersionIntoDraft = (v) => {
    setViewingVersion(v.version);
    setName(v.name);
    setComments(v.comments || []);
    editor?.commands.setContent(v.contentHtml || "<p></p>");
    setDirty(false);
  };

  const saveVersion = async () => {
    if (!editor || saving) return;
    setSaving(true);
    const contentHtml = editor.getHTML();
    const { error } = await saveEditorDocumentVersion(db, query.id, docKey, { name, contentHtml, comments, version }, currentUser?.id);
    if (!error) {
      const newVersions = [...versions, { docKey, name, version, contentHtml, comments, isFinal: false }];
      setVersions(newVersions);
      setVersion(v => v + 1);
      setViewingVersion(null);
      setDirty(false);
      logAudit(db, query.id, currentUser?.name, `Editor document "${name}" saved (v${version})`);
      onSaved && onSaved();
    }
    setSaving(false);
  };

  // Find & Replace -- TipTap has no built-in find/replace. Walks each
  // text node's own string (not the full doc's flattened text) since a
  // match spanning two adjacent differently-formatted text runs is a
  // real edge case not worth the complexity for a v1.
  const findAllMatches = (query) => {
    if (!editor || !query) return [];
    const matches = [];
    const q = query.toLowerCase();
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const text = node.text.toLowerCase();
      let idx = 0;
      while ((idx = text.indexOf(q, idx)) !== -1) {
        matches.push({ from: pos + idx, to: pos + idx + query.length });
        idx += query.length;
      }
    });
    return matches;
  };
  const [matchCursor, setMatchCursor] = useState(0);
  const findNext = () => {
    const matches = findAllMatches(findQuery);
    if (!matches.length) return;
    const idx = matchCursor % matches.length;
    const m = matches[idx];
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
    setMatchCursor(idx + 1);
  };
  const replaceOne = () => {
    const matches = findAllMatches(findQuery);
    if (!matches.length) return;
    const m = matches[0];
    editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, replaceQuery).run();
  };
  const replaceAll = () => {
    const matches = findAllMatches(findQuery);
    // Replace back-to-front so earlier match positions don't shift as
    // later-in-document ones are replaced first.
    [...matches].reverse().forEach(m => editor.chain().insertContentAt({ from: m.from, to: m.to }, replaceQuery).run());
    editor.commands.focus();
  };

  // Comments -- see CommentMark above for why the anchor (a mark) and
  // the comment's own data (this array) are kept separate.
  const addComment = () => {
    if (!editor || editor.state.selection.empty) return;
    const text = window.prompt("Comment");
    if (!text) return;
    const commentId = crypto.randomUUID();
    editor.chain().focus().setMark("comment", { commentId }).run();
    setComments(cs => [...cs, { id: commentId, text, author: currentUser?.name || "", createdAt: new Date().toISOString(), resolved: false }]);
    setDirty(true);
  };
  const resolveComment = (id) => { setComments(cs => cs.map(c => c.id===id ? { ...c, resolved: !c.resolved } : c)); setDirty(true); };
  const deleteComment = (id) => {
    setComments(cs => cs.filter(c => c.id !== id));
    // Also strip the now-orphaned mark from the text -- resolving a
    // comment leaves its highlight visible (dimmed) as a record it
    // existed; deleting it removes the highlight entirely.
    if (editor) {
      const { state } = editor;
      let from = null, to = null;
      state.doc.descendants((node, pos) => {
        if (from !== null) return;
        const mark = node.marks?.find(m => m.type.name==="comment" && m.attrs.commentId===id);
        if (mark) { from = pos; to = pos + node.nodeSize; }
      });
      if (from !== null) editor.chain().setTextSelection({ from, to }).unsetMark("comment").run();
    }
    setDirty(true);
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
        <button onClick={()=>{ if(!dirty || window.confirm("You have unsaved changes. Leave without saving?")) onBack(); }} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>← Documents</button>
        <div style={{ flex: 1 }}>
          {readOnly
            ? <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',serif" }}>{name}</div>
            : <input value={name} onChange={e => setName(e.target.value)}
                style={{ background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.3)", color: "#fff",
                  fontSize: 16, fontWeight: 700, fontFamily: "'Playfair Display',serif", outline: "none", width: "100%", padding: "2px 0" }} />}
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>EDITOR · {versions.length > 0 ? `v${version - 1} saved` : "unsaved"}{dirty?" · unsaved changes":""}</div>
        </div>
        <VersionDropdown versions={versions} viewingVersion={viewingVersion} displayVersion={version} finalVersion={finalVersion}
          onSelectVersion={loadVersionIntoDraft}
          onMarkFinal={(v) => {
            setFinalVersion(v.version);
            markEditorDocumentVersionFinal(db, query.id, docKey, v.version);
            logAudit(db, query.id, currentUser?.name, `Editor document "${name}" v${v.version} marked final`);
          }}
          readOnly={readOnly} G={G} />
        {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" disabled={saving} style={{ background: dirty?"rgba(234,179,8,0.35)":"rgba(255,255,255,0.1)", color: "#fff", border: "none", fontSize: 11 }}>💾 {saving ? "Saving…" : `Save v${version}`}</button>}
      </div>
      {!readOnly && (
        <div style={{ padding: "7px 18px", background: G.gray50, borderBottom: `1px solid ${G.gray200}`, display: "flex", gap: 16, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
          <Tog label="Header" val={showHeader} onToggle={() => setShowHeader(p => !p)} />
          <Tog label="Footer" val={showFooter} onToggle={() => setShowFooter(p => !p)} />
          <Tog label="Page number" val={showPageNum} onToggle={() => setShowPageNum(p => !p)} />
          <Tog label="Digital stamp" val={showStamp} onToggle={() => setShowStamp(p => !p)} />
          <span style={{ width: 1, alignSelf: "stretch", background: G.gray200 }} />
          <Tog label="🖨 Print on Letterhead" val={printOnLetterhead} onToggle={() => setPrintOnLetterhead(p => !p)} />
          <span style={{ width: 1, alignSelf: "stretch", background: G.gray200 }} />
          <button onClick={()=>setShowFindReplace(s=>!s)} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px"}}>🔍 Find & Replace</button>
          <button onClick={()=>setShowComments(s=>!s)} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px"}}>
            💬 Comments{comments.filter(c=>!c.resolved).length>0?` (${comments.filter(c=>!c.resolved).length})`:""}
          </button>
          <span style={{fontSize:10,color:G.gray400,marginLeft:"auto"}}>{wordCount} word{wordCount===1?"":"s"}</span>
        </div>
      )}
      {showFindReplace && !readOnly && (
        <div style={{ padding: "8px 18px", background: "#EEF2FF", borderBottom: `1px solid ${G.gray200}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <input value={findQuery} onChange={e=>{setFindQuery(e.target.value);setMatchCursor(0);}} placeholder="Find..."
            style={{padding:"5px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:140}}/>
          <button onClick={findNext} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px"}}>Find Next</button>
          <input value={replaceQuery} onChange={e=>setReplaceQuery(e.target.value)} placeholder="Replace with..."
            style={{padding:"5px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:140}}/>
          <button onClick={replaceOne} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px"}}>Replace</button>
          <button onClick={replaceAll} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px"}}>Replace All</button>
          <span style={{fontSize:10,color:G.gray400}}>{findQuery?`${findAllMatches(findQuery).length} match(es)`:""}</span>
          <button onClick={()=>setShowFindReplace(false)} className="btn btn-ghost" style={{fontSize:11,padding:"4px 9px",marginLeft:"auto"}}>✕</button>
        </div>
      )}
      <EditorToolbar editor={editor} readOnly={readOnly} onAddComment={addComment} />
      <TableToolbar editor={editor} />
      {!readOnly && <div style={{padding:"5px 14px",background:"#FFFBEB",borderBottom:`1px solid ${G.gray200}`,fontSize:10,color:G.gray600,display:editor&&editor.state.selection.empty?"none":"block"}}>
        Select text, then use 🖍 Highlight or 💬 Comments to mark it up.
      </div>}
      <div style={{ flex: 1, overflowY: "auto", background: G.gray100, display:"flex" }}>
        <style>{PAGE_CSS}</style>
        <div className="doc-editor-page" style={{flex:1}}>
          <EditorContent editor={editor} />
        </div>
        {showComments && (
          <div style={{width:260,flexShrink:0,borderLeft:`1px solid ${G.gray200}`,background:G.white,overflowY:"auto",padding:12}}>
            <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Comments</div>
            {comments.length===0 && <div style={{fontSize:11,color:G.gray400}}>Select text and click 💬 in the toolbar to add one.</div>}
            {[...comments].sort((a,b)=>a.resolved-b.resolved).map(c=>(
              <div key={c.id} style={{background:c.resolved?G.gray50:"#FEFCE8",border:`1px solid ${c.resolved?G.gray200:"#FDE047"}`,borderRadius:8,padding:10,marginBottom:8,opacity:c.resolved?0.6:1}}>
                <div style={{fontSize:11,color:G.gray800,marginBottom:6,textDecoration:c.resolved?"line-through":"none"}}>{c.text}</div>
                <div style={{fontSize:9,color:G.gray400,marginBottom:6}}>{c.author}{c.createdAt?" · "+new Date(c.createdAt).toLocaleDateString("en-IN"):""}</div>
                <div style={{display:"flex",gap:6}}>
                  {!readOnly && <button onClick={()=>resolveComment(c.id)} className="btn btn-ghost" style={{fontSize:9,padding:"2px 6px"}}>{c.resolved?"↺ Reopen":"✓ Resolve"}</button>}
                  {!readOnly && <button onClick={()=>deleteComment(c.id)} className="btn btn-ghost" style={{fontSize:9,padding:"2px 6px"}}>🗑</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
        <button onClick={()=>{ if(!dirty || window.confirm("You have unsaved changes. Leave without saving?")) onBack(); }} className="btn btn-ghost">Back</button>
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

function DocumentList({ query, docs, loading, onOpen, onNew, onImport, onClose }) {
  // Group all version rows into one entry per docKey, showing its latest version.
  const grouped = {};
  docs.forEach(d => {
    if (!grouped[d.docKey] || d.version > grouped[d.docKey].version) grouped[d.docKey] = d;
  });
  const list = Object.values(grouped).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow importing the same filename again later
    if (!file) return;
    setImporting(true);
    try {
      const mammoth = (await import("mammoth")).default;
      const arrayBuffer = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      const name = file.name.replace(/\.docx$/i, "");
      onImport(html || "<p></p>", name);
    } catch (err) {
      window.alert("Could not read this Word file. Only .docx (not the older .doc format) is supported.");
    }
    setImporting(false);
  };

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
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button className="btn btn-success" onClick={onNew}>+ New Document</button>
          <button className="btn btn-ghost" onClick={handleImportClick} disabled={importing}>{importing?"Importing…":"📄 Import Word Document"}</button>
          <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFileChange} style={{display:"none"}}/>
        </div>
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
  const [importedContent, setImportedContent] = useState(null); // {html, name} | null -- prefills a brand-new document from an uploaded .docx

  const refresh = () => {
    setLoading(true);
    loadEditorDocuments(db, query.id).then(rows => { setAllDocs(rows); setLoading(false); });
  };
  useEffect(refresh, [query.id]);

  const openExisting = (docKey) => { setImportedContent(null); setOpenDocKey(docKey); };
  const openNew = () => { setImportedContent(null); setOpenDocKey(crypto.randomUUID()); };
  const openImported = (html, name) => { setImportedContent({ html, name }); setOpenDocKey(crypto.randomUUID()); };
  const back = () => { setOpenDocKey(null); setImportedContent(null); refresh(); };

  const existingVersionsForOpenDoc = allDocs.filter(d => d.docKey === openDocKey);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: G.white, width: "min(900px, 100vw)", height: "100vh", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
        {openDocKey
          ? <EditorView query={query} docKey={openDocKey} existingVersions={existingVersionsForOpenDoc} onBack={back} onSaved={refresh} currentUser={currentUser} readOnly={readOnly} importedContent={importedContent} />
          : <DocumentList query={query} docs={allDocs} loading={loading} onOpen={openExisting} onNew={openNew} onImport={openImported} onClose={onClose} />}
      </div>
    </div>
  );
}
