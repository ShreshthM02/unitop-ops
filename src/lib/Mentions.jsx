// Record-anchored discussion threads: a shared @mention system, now
// with lightweight rich text (bold/italic/underline/bullet list).
//
// Token format embedded directly in stored message text:
//   @[[type:id:label]]
// e.g. "Hey @[[staff:uuid-1:Priya Rao]], can you check @[[query:TUR-2026-045:Smith Family]]?"
// Chosen over a separate offset-based mentions array as the PRIMARY
// source of truth because it can never drift out of sync with the text
// itself (editing/copy-pasting text can't silently invalidate stored
// character offsets) -- the structured `mentions` column on
// query_remarks is still populated at send time (via extractMentions
// below) so notification/search can work off real data without
// re-parsing text every time.
//
// Formatting markers, added for rich text support -- deliberately
// plain-text markdown-like markers (as Slack/Discord also store
// messages), NOT raw HTML. This was a real, considered choice: storing
// actual HTML would mean every render path needs sanitizing against
// XSS, and every one of this app's own existing plain-text messages
// (there are real ones already in the database) would need distinguishing
// from new HTML ones to render safely. Plain-text markers avoid both
// problems entirely -- an old message simply has no markers in it and
// renders exactly as it always did, and there is no HTML to sanitize
// because none is ever stored.
//   **bold**   _italic_   ~underline~   lines starting with "• " are list items
import { useState, useRef, useMemo, useEffect } from "react";
import { G } from "./constants.js";

const MENTION_TYPES = ["staff", "query", "agent", "vendor", "series"];
const MENTION_RE_SOURCE = `@\\[\\[(${MENTION_TYPES.join("|")}):([^:]+):([^\\]]+)\\]\\]`;

export function extractMentions(text) {
  const re = new RegExp(MENTION_RE_SOURCE, "g");
  const found = [];
  let m;
  while ((m = re.exec(text || ""))) {
    found.push({ type: m[1], id: m[2], label: m[3] });
  }
  return found;
}

const MENTION_COLORS = { staff: "#6C3483", query: "#1A5276", agent: "#0E6655", vendor: "#B9770E", series: "#922B21" };

function openMention(type, id, queries) {
  if (type === "staff") return; // no DM system yet -- a mention notifies, doesn't navigate, same as Slack
  if (type === "query") {
    const q = (queries || []).find(qq => qq.id === id || qq.tourFileId === id);
    if (q) document.dispatchEvent(new CustomEvent("unitop-activate-query", { detail: { query: q } }));
    return;
  }
  const eventByType = { agent: "unitop-activate-agent", vendor: "unitop-activate-vendor", series: "unitop-activate-series" };
  const evt = eventByType[type];
  if (evt) document.dispatchEvent(new CustomEvent(evt, { detail: { id } }));
}

// ─── Inline formatting + mention tokenizer ──────────────────────────────────
// A single left-to-right scan of one line of text, trying each inline
// pattern (mention, bold, italic, underline) at the current position and
// taking whichever matches earliest, recursing into matched content so
// formatting can nest inside itself (e.g. "**bold with @[[staff:...]] in it**").
const INLINE_PATTERNS = [
  { re: new RegExp(MENTION_RE_SOURCE), render: (m, key, queries) => {
      const [, type, id, label] = m;
      const openable = type !== "staff";
      return (
        <span key={key} onClick={openable ? () => openMention(type, id, queries) : undefined}
          style={{ color: MENTION_COLORS[type] || G.navy, fontWeight: 600, cursor: openable ? "pointer" : "default", textDecoration: openable ? "underline" : "none" }}>
          @{label}
        </span>
      );
    } },
  // Word-boundary guards on italic/underline (none needed on bold --
  // "**" essentially never appears inside a normal word or filename the
  // way a single "_" or "~" can): a real false positive was caught by
  // this file's own test ("my_file_name.pdf" partially italicizing to
  // "my<em>file</em>name.pdf") before this guard existed. The fix
  // matches how GFM markdown itself avoids the same problem -- require
  // the character immediately outside each marker to NOT be a letter or
  // digit, so a marker has to sit at a real word boundary to count.
  { re: /\*\*(\S(?:[\s\S]*?\S)?)\*\*/, render: (m, key, queries) => <strong key={key}>{renderInline(m[1], queries, key + "-b")}</strong> },
  { re: /(?<![A-Za-z0-9])_(\S(?:[\s\S]*?\S)?)_(?![A-Za-z0-9])/, render: (m, key, queries) => <em key={key}>{renderInline(m[1], queries, key + "-i")}</em> },
  { re: /(?<![A-Za-z0-9])~(\S(?:[\s\S]*?\S)?)~(?![A-Za-z0-9])/, render: (m, key, queries) => <u key={key}>{renderInline(m[1], queries, key + "-u")}</u> },
];

function renderInline(text, queries, keyPrefix = "k") {
  const parts = [];
  let remaining = text || "";
  let key = 0;
  while (remaining.length) {
    let earliest = null, earliestPattern = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(remaining);
      if (m && (earliest === null || m.index < earliest.index)) { earliest = m; earliestPattern = p; }
    }
    if (!earliest) { parts.push(remaining); break; }
    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index));
    parts.push(earliestPattern.render(earliest, `${keyPrefix}-${key++}`, queries));
    remaining = remaining.slice(earliest.index + earliest[0].length);
  }
  return parts;
}

// Renders message text with formatting markers and every @[[...]] token
// as a real, clickable chip -- reuses the exact same event bridge every
// Master Data click-through in this app already uses, so a mention isn't
// a visual decoration, it's a genuine link into the record. Lines
// starting with "• " render as list items; every other line as its own
// paragraph (so line breaks from the composer are preserved).
export function MessageWithMentions({ text, queries }) {
  const lines = (text || "").split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const isListItem = line.startsWith("• ");
        const content = isListItem ? line.slice(2) : line;
        return (
          <div key={i} style={isListItem ? { paddingLeft: 14, position: "relative" } : undefined}>
            {isListItem && <span style={{ position: "absolute", left: 0 }}>•</span>}
            {renderInline(content, queries, `l${i}`)}
          </div>
        );
      })}
    </>
  );
}

// ─── contentEditable -> stored plain-text-with-markers conversion ─────────
// Walks the editor's real DOM (not innerHTML string parsing, which can't
// reliably tell a <b> wrapping a mention apart from one that doesn't) so
// nested formatting round-trips correctly regardless of how deep it goes.
function domToStoredText(node) {
  let out = "";
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName.toLowerCase();
    const inner = domToStoredText(child);
    if (tag === "b" || tag === "strong") out += `**${inner}**`;
    else if (tag === "i" || tag === "em") out += `_${inner}_`;
    else if (tag === "u") out += `~${inner}~`;
    else if (tag === "li") out += `• ${inner}\n`;
    else if (tag === "br") out += "\n";
    else if (tag === "div" || tag === "p") out += inner + "\n";
    else out += inner;
  });
  return out;
}

function storedTextToHTML(text) {
  // Reverse of the above, for loading existing content back into the
  // editor (e.g. opening Edit on a sent message) -- turns markers back
  // into real tags so they display and continue to format correctly,
  // rather than showing the raw ** _ ~ characters while editing.
  const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = (text || "").split("\n");
  return lines.map(line => {
    const isListItem = line.startsWith("• ");
    let content = escapeHtml(isListItem ? line.slice(2) : line);
    content = content
      .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, "<b>$1</b>")
      .replace(/(?<![A-Za-z0-9])_(\S(?:[\s\S]*?\S)?)_(?![A-Za-z0-9])/g, "<i>$1</i>")
      .replace(/(?<![A-Za-z0-9])~(\S(?:[\s\S]*?\S)?)~(?![A-Za-z0-9])/g, "<u>$1</u>");
    return isListItem ? `<div>&bull; ${content}</div>` : `<div>${content}</div>`;
  }).join("") || "<div><br></div>";
}

// Gets the plain text of everything before the cursor within a
// contentEditable element, regardless of how deeply nested the cursor
// is inside formatting tags -- the standard, reliable way to do this
// (a simple string search can't see "before the cursor" at all once
// there's more than one text node involved).
function getTextBeforeCursor(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString();
}

// Rich-text @mention composer. contentEditable-based (matching this
// app's own lightweight rich-text pattern used elsewhere, e.g. the
// Exchange Order Service Details field) rather than the heavier TipTap
// editor used for full standalone documents -- a chat/discussion
// composer needs bold/italic/underline/a list, not tables, images, or
// font pickers, so pulling in that whole stack here would be a real
// mismatch for what this box actually needs to do.
export function MentionInput({ value, onChange, onSubmit, placeholder, minHeight = 64, staff, queries, agents, vendors, series }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const editorRef = useRef(null);
  const lastEmittedValue = useRef(null);

  // Only pushes the editor's own HTML back to real state when `value`
  // changed from OUTSIDE this component (e.g. loading an existing
  // message into Edit mode, or clearing after send) -- never on every
  // keystroke, which would fight the browser's own cursor position and
  // make typing feel broken.
  useEffect(() => {
    if (value !== lastEmittedValue.current && editorRef.current) {
      editorRef.current.innerHTML = storedTextToHTML(value);
    }
  }, [value]);

  const emitChange = () => {
    const text = domToStoredText(editorRef.current).replace(/\n+$/, "");
    lastEmittedValue.current = text;
    onChange(text);
  };

  const handleInput = () => {
    emitChange();
    const before = getTextBeforeCursor(editorRef.current);
    const atMatch = before.match(/@([a-zA-Z0-9 '_-]*)$/);
    if (atMatch) { setSearch(atMatch[1]); setOpen(true); setActiveIdx(0); }
    else setOpen(false);
  };

  const matches = useMemo(() => {
    if (!open) return [];
    const q = search.toLowerCase();
    const results = [];
    (staff || []).forEach(s => { if (!q || s.name?.toLowerCase().includes(q)) results.push({ type: "staff", id: s.id, label: s.name }); });
    (queries || []).filter(qq => !qq.cancelled).forEach(qq => {
      const idLabel = qq.tourFileId || qq.id;
      const searchable = `${qq.id} ${qq.tourFileId || ""} ${qq.groupName || qq.clientName || ""}`.toLowerCase();
      if (!q || searchable.includes(q)) results.push({ type: "query", id: qq.tourFileId || qq.id, label: `${idLabel} — ${qq.groupName || qq.clientName || ""}` });
    });
    (agents || []).forEach(a => { if (!q || a.company?.toLowerCase().includes(q)) results.push({ type: "agent", id: a.id, label: a.company }); });
    (vendors || []).forEach(v => { if (!q || v.name?.toLowerCase().includes(q)) results.push({ type: "vendor", id: v.id, label: v.name }); });
    (series || []).forEach(s => { if (!q || s.name?.toLowerCase().includes(q)) results.push({ type: "series", id: s.id, label: s.name }); });
    return results.slice(0, 8);
  }, [open, search, staff, queries, agents, vendors, series]);

  // Replaces the "@partial-text" just before the cursor with the real
  // token, using the same Range APIs as the cursor-detection above --
  // a plain string-splice (as the old textarea version did) can't work
  // here since the content is a DOM tree, not a single string.
  const selectMention = (m) => {
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    const atLen = search.length + 1; // +1 for the "@" itself
    const deleteRange = range.cloneRange();
    deleteRange.setStart(range.startContainer, Math.max(0, range.startOffset - atLen));
    deleteRange.deleteContents();
    const token = document.createTextNode(`@[[${m.type}:${m.id}:${m.label}]] `);
    deleteRange.insertNode(token);
    deleteRange.setStartAfter(token);
    deleteRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(deleteRange);
    setOpen(false);
    editorRef.current?.focus();
    emitChange();
  };

  const exec = (cmd) => {
    document.execCommand(cmd);
    editorRef.current?.focus();
    emitChange();
  };
  const toolBtn = (lbl, cmd, title) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)} title={title}
      style={{ padding: "3px 8px", fontSize: 11, fontWeight: 700, border: `1px solid ${G.gray200}`, borderRadius: 4, background: G.white, cursor: "pointer", marginRight: 4 }}>
      {lbl}
    </button>
  );

  const TYPE_LABEL = { staff: "Team", query: "Tour Files", agent: "Agents", vendor: "Vendors", series: "Series" };

  return (
    <div style={{ position: "relative" }}>
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", zIndex: 30, bottom: "100%", left: 0, marginBottom: 4, minWidth: 260, maxWidth: 360, maxHeight: 260, overflowY: "auto", background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 6, boxShadow: "0 -4px 14px rgba(0,0,0,0.12)", padding: 4 }}>
          {matches.map((m, i) => (
            <div key={`${m.type}-${m.id}`} onMouseDown={e => { e.preventDefault(); selectMention(m); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: i === activeIdx ? G.gray50 : "transparent" }}
              onMouseEnter={() => setActiveIdx(i)}>
              <span style={{ fontSize: 9, fontWeight: 700, color: MENTION_COLORS[m.type], textTransform: "uppercase", letterSpacing: "0.5px", width: 46, flexShrink: 0 }}>{TYPE_LABEL[m.type]}</span>
              <span style={{ fontSize: 12, color: G.gray800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginBottom: 4 }}>
        {toolBtn("B", "bold", "Bold")}
        {toolBtn("I", "italic", "Italic")}
        {toolBtn("U", "underline", "Underline")}
        {toolBtn("• List", "insertUnorderedList", "Bullet list")}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning data-placeholder={placeholder}
        className="mention-input-editable"
        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${G.gray200}`, borderRadius: 8, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", minHeight, lineHeight: 1.5 }}
        onInput={handleInput}
        onKeyDown={e => {
          if (open && matches.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => (i + 1) % matches.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => (i - 1 + matches.length) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(matches[activeIdx]); return; }
            if (e.key === "Escape") { setOpen(false); return; }
          }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit && onSubmit(); }
        }}/>
      <style>{`.mention-input-editable:empty:before { content: attr(data-placeholder); color: ${G.gray400}; }`}</style>
      {/* Real, live preview -- shows exactly how the message will render
          once sent, with actual colored chips, not the raw @[[...]]
          token the editor itself still has to show while typing (a
          mention is inserted as a real text token, not a visual chip,
          so the @ trigger's cursor-position math stays simple and
          reliable). Only shown once there's an actual mention to
          preview, so it doesn't clutter an ordinary message. */}
      {extractMentions(value).length > 0 && (
        <div style={{ marginTop: 4, padding: "6px 9px", background: G.gray50, border: `1px solid ${G.gray100}`, borderRadius: 6, fontSize: 12, color: G.gray800, lineHeight: 1.5 }}>
          <div style={{ fontSize: 9, color: G.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Preview</div>
          <MessageWithMentions text={value} queries={queries} />
        </div>
      )}
    </div>
  );
}
