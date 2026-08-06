import { useState, useMemo, useEffect } from 'react';
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
  G,
  inp,
  readOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

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

  useEffect(() => { if (!open) { setTerm(""); setLat(""); setLon(""); } }, [open]);

  const results = term.trim().length >= 2 ? searchGazetteer(term, gazetteer, { limit: 12 }) : [];
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

      {open && !readOnly && (
        <div style={{
          marginTop: 6, marginLeft: 13, padding: 10, borderRadius: 8,
          border: `1px solid ${G.gray200}`, background: G.white,
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
          {term.trim().length >= 2 && results.length === 0 && (
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
            <input style={{ ...inp, fontSize: 11.5, width: 90 }} value={lat}
              onChange={e => setLat(e.target.value)} placeholder="Latitude" aria-label="Latitude"/>
            <input style={{ ...inp, fontSize: 11.5, width: 90 }} value={lon}
              onChange={e => setLon(e.target.value)} placeholder="Longitude" aria-label="Longitude"/>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11 }}
              disabled={!isValidCoordinate(lat, lon)}
              onClick={() => pick(manualPlace(query, lat, lon))}>
              Use these
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
