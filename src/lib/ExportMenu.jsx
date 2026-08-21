import { useState, useRef, useEffect } from 'react';

// Shared export menu, used by every document that has more than one output
// route. Replaces the row of separate footer buttons ("Print / Export PDF",
// "Export Word", ...) with a single Export button that opens a short list of
// formats plus Print. Added 2026-07-31.
//
// Same extraction rationale as VersionDropdown: without this, adding a
// format to a document means touching that document's footer markup by
// hand, and the seven documents drift apart. Callers declare what they
// support and hand over the handlers; this component owns the button, the
// panel, outside-click dismissal, and the busy state while an export runs.
//
// Usage:
//   <ExportMenu G={G} actions={[
//     { id:'pdf',   label:'PDF',   icon:'📕', onSelect: printQuotation, hint:'Opens the print dialog' },
//     { id:'word',  label:'Word',  icon:'📄', onSelect: exportDocx },
//     { id:'print', label:'Print', icon:'🖨', onSelect: printQuotation },
//   ]}/>
//
// A single-action list is rendered as a plain button rather than a
// dropdown -- a menu holding one item is just a slower button. That keeps
// documents with only a PDF route (e.g. Exchange Order) looking unchanged
// while still going through this component, so they pick up a second
// format later with a one-line change.
//
// openDirection ("up" default, or "down"): the panel opens upward by
// default since most callers place this button in a bottom toolbar/footer.
// Pass "down" for buttons that sit inside a scrollable list of rows (e.g.
// Exchange Order's Repository tab) -- opening upward there gets clipped by
// the list's own overflow:auto for rows near the top of the visible area,
// rendering the menu invisible behind whatever sits above the scroll
// container. Added 2026-08-21 after exactly that report.
export function ExportMenu({ actions, G, label = "Export", disabled = false, openDirection = "up" }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const usable = (actions || []).filter(Boolean);
  if (usable.length === 0) return null;

  const run = async (action) => {
    setOpen(false);
    // Only show a busy state if the action is actually asynchronous.
    // A synchronous export (the PDF path just builds a string and hands it
    // to the print window) completes before the browser could paint
    // anything, so flipping into "Working…" and back only produces a
    // flicker -- and leaves the toggle showing a stale label for anyone,
    // test or user, who looks at it in the same tick.
    let result;
    try {
      result = action.onSelect();
    } catch (err) {
      alert(`${action.label} export failed: ${err && err.message ? err.message : err}`);
      return;
    }
    if (!result || typeof result.then !== "function") return;
    setBusyId(action.id);
    try {
      await result;
    } catch (err) {
      // Surfaced rather than swallowed: a silently failing export is worse
      // than a noisy one, and the document components don't otherwise get
      // told the click went nowhere.
      alert(`${action.label} export failed: ${err && err.message ? err.message : err}`);
    } finally {
      setBusyId(null);
    }
  };

  // One action -> plain button, no menu.
  if (usable.length === 1) {
    const only = usable[0];
    return (
      <button className="btn btn-success" disabled={disabled || busyId !== null} onClick={() => run(only)}>
        {busyId === only.id ? "Working…" : `${only.icon || "⬇"} ${only.label}`}
      </button>
    );
  }

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn btn-success"
        disabled={disabled || busyId !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        {busyId !== null ? "Working…" : `⬇ ${label} ▾`}
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", ...(openDirection === "down" ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }), right: 0, zIndex: 50,
          background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 8,
          boxShadow: "0 8px 28px rgba(0,0,0,0.16)", minWidth: 208, padding: 4,
        }}>
          {usable.map((a, i) => (
            <div key={a.id}>
              {a.separatorBefore && i > 0 && (
                <div style={{ borderTop: `1px solid ${G.gray100}`, margin: "4px 0" }}/>
              )}
              <button
                role="menuitem"
                onClick={() => run(a)}
                style={{
                  display: "block", width: "100%", textAlign: "left", border: "none",
                  background: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 6,
                  fontSize: 12, fontFamily: "'Inter',sans-serif", color: G.gray800,
                }}
                onMouseEnter={e => e.currentTarget.style.background = G.gray50}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <span style={{ fontWeight: 600 }}>{a.icon || "⬇"} {a.label}</span>
                {a.hint && <span style={{ display: "block", fontSize: 10, color: G.gray400, marginTop: 1 }}>{a.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
