// Record-anchored discussion threads: a shared @mention system.
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
import { useState, useRef, useMemo } from "react";
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

// Renders message text with every @[[...]] token as a real, clickable
// chip -- reuses the exact same event bridge every Master Data
// click-through in this app already uses, so a mention isn't a visual
// decoration, it's a genuine link into the record.
export function MessageWithMentions({ text, queries }) {
  const re = new RegExp(MENTION_RE_SOURCE, "g");
  const parts = [];
  let lastIndex = 0, m, key = 0;
  while ((m = re.exec(text || ""))) {
    if (m.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, m.index)}</span>);
    const [, type, id, label] = m;
    const openable = type !== "staff";
    parts.push(
      <span key={key++} onClick={openable ? () => openMention(type, id, queries) : undefined}
        style={{ color: MENTION_COLORS[type] || G.navy, fontWeight: 600, cursor: openable ? "pointer" : "default", textDecoration: openable ? "underline" : "none" }}>
        @{label}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < (text || "").length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return <>{parts}</>;
}

// A plain textarea (deliberately not a rich-text editor -- chat
// composers don't need bold/italic toolbars, and a textarea keeps
// cursor-position math for the @ trigger simple and reliable) with a
// live, searchable @mention dropdown across every mentionable entity
// type. Selecting a match inserts the real token at the cursor.
export function MentionInput({ value, onChange, onSubmit, placeholder, minHeight = 64, staff, queries, agents, vendors, series }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [atPos, setAtPos] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const taRef = useRef(null);

  const handleChange = (e) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(text);
    const before = text.slice(0, cursor);
    const atMatch = before.match(/@([a-zA-Z0-9 '_-]*)$/);
    if (atMatch) {
      setAtPos(cursor - atMatch[0].length);
      setSearch(atMatch[1]);
      setOpen(true);
      setActiveIdx(0);
    } else {
      setOpen(false);
    }
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

  const selectMention = (m) => {
    const before = value.slice(0, atPos);
    const after = value.slice(atPos + 1 + search.length);
    const token = `@[[${m.type}:${m.id}:${m.label}]] `;
    onChange(before + token + after);
    setOpen(false);
    setTimeout(() => taRef.current?.focus(), 0);
  };

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
      <textarea ref={taRef} value={value} placeholder={placeholder} rows={2}
        style={{ width: "100%", padding: "8px 10px", border: `1px solid ${G.gray200}`, borderRadius: 8, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", resize: "none", minHeight }}
        onChange={handleChange}
        onKeyDown={e => {
          if (open && matches.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => (i + 1) % matches.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => (i - 1 + matches.length) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(matches[activeIdx]); return; }
            if (e.key === "Escape") { setOpen(false); return; }
          }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit && onSubmit(); }
        }}/>
    </div>
  );
}
