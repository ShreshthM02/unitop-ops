import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// "You have unsaved changes" guard for documents (Cost Sheet, Quotation,
// Itinerary, Invoice, Exchange Order, Tour Briefing ...).
//
//   const guard = useUnsavedGuard({ snapshot: {...everything editable...}, onClose, onSave, enabled: !readOnly });
//   <button onClick={guard.requestClose}>Close</button>   {guard.dialog}
//
// How "changed" is decided: the editable state is serialised on every render.
// A difference only counts as the person's edit if they touched the page just
// before it appeared (keyboard, mouse, paste, drop). Changes that arrive on
// their own (data loading, auto-fill from another sheet) quietly become the new
// baseline. After a save, or after opening an older version, call markSaved() /
// rebase() so what is on screen counts as saved again.
const INTERACTION_WINDOW_MS = 2500;

export function useUnsavedGuard({ snapshot, onClose, onSave, enabled = true, what = "document" }) {
  const ser = (() => { try { return JSON.stringify(snapshot); } catch (e) { return ""; } })();
  const baseline = useRef(null);
  const serRef = useRef(ser);
  serRef.current = ser;
  const lastTouch = useRef(0);
  const rebaseUntil = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const touch = () => { lastTouch.current = Date.now(); };
    const evs = ["keydown", "input", "change", "mousedown", "paste", "drop", "touchstart"];
    evs.forEach(e => document.addEventListener(e, touch, true));
    return () => evs.forEach(e => document.removeEventListener(e, touch, true));
  }, []);

  useEffect(() => {
    if (baseline.current === null) { baseline.current = ser; return; }
    if (ser === baseline.current) { setDirty(false); return; }
    const now = Date.now();
    if (now < rebaseUntil.current) { baseline.current = ser; setDirty(false); return; }
    if (now - lastTouch.current < INTERACTION_WINDOW_MS) setDirty(true);
    else if (!dirty) baseline.current = ser;      // arrived by itself: not the person's edit
  }, [ser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the tab / refreshing with unsaved work.
  useEffect(() => {
    if (!enabled || !dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [enabled, dirty]);

  // Call when a save succeeded (the document's own Save button, or ours): what is on
  // screen now counts as saved. Uses the latest content, not a stale render's.
  const markSaved = () => { rebaseUntil.current = Date.now() + 1000; baseline.current = serRef.current; setDirty(false); };
  const rebase = markSaved;

  const requestClose = () => { if (enabled && dirty) setAsk(true); else onClose && onClose(); };
  const exitAnyway = () => { setAsk(false); onClose && onClose(); };
  const saveAndExit = async () => {
    setBusy(true);
    let ok = true;
    try { const r = onSave ? await onSave() : true; if (r === false) ok = false; } catch (e) { ok = false; }
    setBusy(false);
    if (ok) { markSaved(); setAsk(false); onClose && onClose(); }
    else setAsk(false);   // the document itself shows why the save failed
  };

  const btn = (bg, color, border) => ({ padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", background: bg, color, border: border || "none" });
  const dialog = ask && typeof document !== "undefined" ? createPortal(
    <div role="dialog" aria-modal="true" aria-label="Unsaved changes" data-testid="unsaved-dialog"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 420, width: "100%", padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>You have unsaved changes</div>
        <div style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.5, marginBottom: 16 }}>
          The changes you made to this {what} haven't been saved. Do you want to exit without saving them, or save them as a new version first?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button disabled={busy} onClick={saveAndExit} style={btn("#1A5276", "#fff")}>{busy ? "Saving…" : "Save as new version & exit"}</button>
          <button disabled={busy} onClick={exitAnyway} style={btn("#fff", "#B91C1C", "1px solid #FECACA")}>Exit without saving</button>
          <button disabled={busy} onClick={() => setAsk(false)} style={btn("#fff", "#374151", "1px solid #D1D5DB")}>Keep editing</button>
        </div>
      </div>
    </div>, document.body) : null;

  return { requestClose, dirty, markSaved, rebase, dialog };
}
