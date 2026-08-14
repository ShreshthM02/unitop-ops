import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { resolvePlace, searchGazetteer, manualPlace, isValidCoordinate } from './placeResolver.js';

// Picking the coordinate behind a place name.
//
// This is the interface half of the resolver, and it is built around one
// rule stated plainly: the user must never feel helpless. Practically that
// means three things, and every part of this component exists to serve one
// of them.
//
//   1. ALWAYS SHOW THE WORKING. The chosen place is displayed with its
//      state and country and the reason it was chosen -- "Exact name match",
//      "Also matches Aurangabad, Maharashtra" -- even when the resolver is
//      confident. A silent correct answer and a silent wrong answer look
//      identical, so neither is offered silently.
//   2. ALWAYS ACCEPT A CORRECTION. Change is available on every state, not
//      only ambiguous ones. Someone who knows the answer should never have
//      to make the software uncertain before it will listen.
//   3. NEVER BLOCK. An unmatched name is not an error. It offers search and
//      manual coordinates and the itinerary carries on either way -- the
//      map simply omits what it does not know rather than refusing to draw.
//
// Resolution happens HERE, while the day is being written, not at export
// time. That is deliberate: it means there is no moment before sending a
// document to a client where the map turns out not to work.

const STATUS_STYLE = {
  resolved:  { dot: "#15803D", label: "Located" },
  ambiguous: { dot: "#B45309", label: "Check this" },
  weak:      { dot: "#B45309", label: "Best guess" },
  unmatched: { dot: "#B91C1C", label: "Not found" },
};

const describe = (p) => [p.name, p.admin1, p.country].filter(Boolean).join(", ");

export function PlacePicker({
  query,
  value,              // an already-chosen place, if there is one
  gazetteer = [],
  context = [],       // coordinates of other resolved stops in this itinerary
  onChange,
  // Optional async search against the real table (1M+ rows), for callers
  // where `gazetteer` only holds the handful of candidates fetched for the
  // day's own text. Without this the search box falls back to filtering
  // `gazetteer` locally, which is exactly right for tests and for any
  // caller that already holds a full array in memory.
  onSearch,
  // Optional: when given, a manually-placed coordinate can be offered to
  // custom_places so the next search for this name -- in this itinerary or
  // any other -- finds it without anyone placing it by hand twice. Without
  // this prop the checkbox simply does not appear; PlacePicker itself never
  // talks to a database, matching onSearch's existing shape.
  onSaveCustomPlace,
  G,
  inp,
  readOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const toggleBtnRef = useRef(null);
  const panelRef = useRef(null);
  // The panel used to render inline, positioned by ordinary document flow
  // right after the toggle button. That is exactly what let it get clipped
  // to invisible: it sits inside a day card rendered with overflow:hidden
  // (for the card's own rounded corners), and a card too short to contain
  // the panel's full height -- easy to hit, since the panel can hold
  // search results, the manual-name/lat/lon row, and the remember
  // checkbox all at once -- clipped the bottom of it, "Use these" included.
  // This is the exact bug class already found and fixed once in this
  // codebase for DayItemsEditor's Add Item dropdown; the fix is the same:
  // render through a portal onto document.body, positioned from the
  // toggle button's real screen coordinates, so no ancestor's overflow can
  // clip it regardless of where in the page this picker is used.
  const [panelPos, setPanelPos] = useState(null);
  useEffect(() => {
    if (!open || !toggleBtnRef.current) { setPanelPos(null); return; }
    const place = () => {
      const r = toggleBtnRef.current.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 4, left: r.left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Dismissal for a portal-rendered panel: it is no longer visually
  // attached to its trigger in the DOM tree, so clicking elsewhere on the
  // page needs to close it explicitly rather than relying on it being
  // "outside" some natural container.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)
        && toggleBtnRef.current && !toggleBtnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  const [term, setTerm] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  // The name typed for a hand-placed coordinate. Previously there was no
  // field for this at all -- manual placement silently used `query` (the
  // day's own auto-derived text) as the name, which is often a whole
  // sentence, blank, or otherwise not what should actually be stored and
  // shown for the place. Defaults to query when the manual section opens,
  // as a sensible starting point, but is now genuinely editable.
  const [manualName, setManualName] = useState("");
  const [dbResults, setDbResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Deliberately NOT reset when the panel closes -- pick() closes it
  // immediately after a manual placement, and a failed remember-save needs
  // to stay visible after that close, not vanish with the panel.
  const [saveError, setSaveError] = useState(null);
  // Checked by default: remembering is the behaviour that actually helps
  // -- someone types Alchi once, places it once, and it is never a blank
  // search again for anyone. Unchecking is the exception, for a coordinate
  // that is genuinely one-off (a client's private meeting point, say) and
  // should not enter a shared table other tours will see.
  const [remember, setRemember] = useState(true);

  // Only resolve when nothing has been chosen. A user's explicit pick must
  // never be silently re-resolved out from under them on the next render.
  const auto = useMemo(
    () => (value ? null : resolvePlace(query, gazetteer, { context })),
    [query, gazetteer, context, value],
  );

  const chosen = value || (auto && auto.match) || null;
  const status = value ? "resolved" : (auto ? auto.status : "unmatched");
  const reason = value ? "Chosen manually." : (auto ? auto.reason : "");
  const alternatives = (auto && auto.candidates) || [];

  useEffect(() => { if (!open) { setTerm(""); setLat(""); setLon(""); setDbResults([]); } else { setManualName(query || ""); setSaveError(null); } }, [open]);

  // Query the real table as the user types. No debounce: this is an
  // internal tool used a few times per itinerary, not a public search box,
  // and the gazetteer's indexes make a single prefix lookup cheap. A stale
  // response is discarded if the term has since changed.
  useEffect(() => {
    if (!onSearch || term.trim().length < 2) { setDbResults([]); return; }
    let cancelled = false;
    setSearching(true);
    Promise.resolve(onSearch(term)).then(rows => {
      if (!cancelled) { setDbResults(rows || []); setSearching(false); }
    }).catch(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [term, onSearch]);

  const results = term.trim().length >= 2
    ? (onSearch ? dbResults : searchGazetteer(term, gazetteer, { limit: 12 }))
    : [];
  const style = STATUS_STYLE[status] || STATUS_STYLE.unmatched;

  const pick = (place) => { onChange && onChange(place); setOpen(false); };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: style.dot, flex: "0 0 auto" }}/>
        <span style={{ color: chosen ? G.gray800 : G.gray400 }}>
          {chosen ? describe(chosen) : `No match for "${query}"`}
        </span>
        {!readOnly && (
          <button
            ref={toggleBtnRef}
            onClick={() => setOpen(o => !o)}
            style={{ border: "none", background: "none", cursor: "pointer", color: G.accent, fontSize: 11, fontWeight: 600, padding: 0 }}>
            {open ? "Close" : "Change"}
          </button>
        )}
      </div>

      {/* The reason is shown on every state, not only the uncertain ones --
          that is what makes a confident answer checkable rather than
          merely asserted. */}
      {reason && (
        <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 2, marginLeft: 13 }}>
          {style.label} · {reason}
        </div>
      )}
      {saveError && (
        <div style={{ fontSize: 10.5, color: '#B91C1C', marginTop: 2, marginLeft: 13 }}>
          Picked for this day, but could not be remembered for next time: {saveError}
        </div>
      )}

      {open && !readOnly && panelPos && createPortal(
        <div ref={panelRef} style={{
          position: "fixed", top: panelPos.top, left: panelPos.left, zIndex: 1000,
          width: 280, padding: 10, borderRadius: 8,
          border: `1px solid ${G.gray200}`, background: G.white, boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
        }}>
          {alternatives.length > 1 && (
            <>
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: G.gray400, marginBottom: 5 }}>
                Other matches
              </div>
              {alternatives.slice(0, 5).map((c, i) => (
                <button key={`${c.name}-${c.lat}-${i}`} onClick={() => pick(c)}
                  style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none",
                    cursor: "pointer", padding: "4px 0", fontSize: 11.5, color: G.gray800 }}>
                  {describe(c)}
                  {c.nearestKm != null && <span style={{ color: G.gray400 }}> · {c.nearestKm} km away</span>}
                </button>
              ))}
              <div style={{ height: 1, background: G.gray100, margin: "8px 0" }}/>
            </>
          )}

          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: G.gray400, marginBottom: 5 }}>
            Search
          </div>
          <input
            style={{ ...inp, fontSize: 11.5 }}
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Type any place name…"
            aria-label="Search places"
          />
          {results.map((r, i) => (
            <button key={`${r.name}-${r.lat}-${i}`} onClick={() => pick(r)}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none",
                cursor: "pointer", padding: "4px 0", fontSize: 11.5, color: G.gray800 }}>
              {describe(r)}
            </button>
          ))}
          {searching && (
            <div style={{ fontSize: 11, color: G.gray400, padding: "4px 0" }}>Searching…</div>
          )}
          {!searching && term.trim().length >= 2 && results.length === 0 && (
            <div style={{ fontSize: 11, color: G.gray400, padding: "4px 0" }}>
              Nothing found — enter coordinates below instead.
            </div>
          )}

          {/* The escape hatch. A village in no gazetteer anywhere still has
              to be plottable, or the map quietly becomes something you
              switch off to avoid embarrassment. */}
          <div style={{ height: 1, background: G.gray100, margin: "8px 0" }}/>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: G.gray400, marginBottom: 5 }}>
            Or place it yourself
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input style={{ ...inp, fontSize: 11.5, flex: 1 }} value={manualName}
              onChange={e => setManualName(e.target.value)} placeholder="Name" aria-label="Manual place name"/>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
            <input style={{ ...inp, fontSize: 11.5, width: 90 }} value={lat}
              onChange={e => setLat(e.target.value)} placeholder="Latitude" aria-label="Latitude"/>
            <input style={{ ...inp, fontSize: 11.5, width: 90 }} value={lon}
              onChange={e => setLon(e.target.value)} placeholder="Longitude" aria-label="Longitude"/>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11 }}
              disabled={!isValidCoordinate(lat, lon) || !manualName.trim()}
              onClick={async () => {
                const place = manualPlace(manualName.trim(), lat, lon);
                // The place is picked for THIS day regardless of whether
                // remembering it for next time succeeds -- the two are
                // separate outcomes, and a failure to save into
                // custom_places should never block using the place today.
                pick(place);
                if (onSaveCustomPlace && remember) {
                  try {
                    const result = await onSaveCustomPlace(place);
                    if (result && result.error) setSaveError(result.error);
                  } catch (e) {
                    // Previously fire-and-forget: a rejected promise here
                    // produced an unhandled rejection in the console and
                    // nothing else -- the place still looked picked, but
                    // silently never made it into custom_places for reuse.
                    setSaveError(e.message || String(e));
                  }
                }
              }}>
              Use these
            </button>
          </div>
          {onSaveCustomPlace && (
            <label style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 10.5, color: G.gray400, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ margin: 0 }} aria-label="Remember this place for future searches"/>
              Remember this place for future searches
            </label>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
