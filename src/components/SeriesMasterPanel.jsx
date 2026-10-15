import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/supabase.js';
import { loadSeriesMaster } from '../lib/utils.js';
import { G } from '../lib/constants.js';

// Shown in a query's Docs tab when the query belongs to a series. Lets staff
// (1) make THIS file's final Cost Sheet / Quotation / Itinerary the series
// master, and (2) copy the master into this file as ordinary editable v1
// documents. Copies are never a live link -- each file keeps its own versions.
export default function SeriesMasterPanel({ query, seriesName, onPromote, onApply, readOnly }) {
  const [master, setMaster] = useState(undefined); // undefined = loading, null = none
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { setMaster(await loadSeriesMaster(db, query.seriesId)); }, [query.seriesId]);
  useEffect(() => { setMaster(undefined); reload(); }, [reload]);

  const run = async (fn) => { setBusy(true); try { await fn(); await reload(); } finally { setBusy(false); } };
  const isSource = master && master.sourceQueryId === query.id;
  const names = master ? [master.has.costSheet && "Cost Sheet", master.has.quotation && "Quotation", master.has.itinerary && "Itinerary"].filter(Boolean).join(", ") : "";
  const btn = { fontSize: 11, padding: "6px 10px" };

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${G.gray200}`, borderRadius: 8, background: "#F8F4FB" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6C3483", marginBottom: 6 }}>⛓ Series master{seriesName ? ` — ${seriesName}` : ""}</div>
      {master === undefined && <div style={{ fontSize: 11, color: G.gray600 }}>Checking…</div>}
      {master === null && <div style={{ fontSize: 11, color: G.gray600, marginBottom: 8 }}>No master yet. Make this file's Cost Sheet, Quotation and Itinerary the master so new files in the series start from them.</div>}
      {master && (
        <div style={{ fontSize: 11, color: G.gray800, marginBottom: 8 }}>
          From <b>{master.sourceLabel || master.sourceQueryId}</b>{master.promotedBy ? ` · set by ${master.promotedBy}` : ""}{master.promotedAt ? ` · ${new Date(master.promotedAt).toLocaleDateString("en-IN")}` : ""}
          <div style={{ color: G.gray600 }}>Holds: {names}</div>
        </div>
      )}
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {master && !isSource && (
            <button className="btn btn-ghost" style={btn} disabled={busy} onClick={() => run(() => onApply(query))}>⬇ Copy master into this file</button>
          )}
          {!isSource && (
            <button className="btn btn-ghost" style={btn} disabled={busy}
              onClick={() => {
                if (master && !window.confirm("Replace the current series master with this file's documents? Files already created from the old master are not changed.")) return;
                run(() => onPromote(query));
              }}>
              {master ? "↻ Replace master with this file" : "⭐ Make this file the series master"}
            </button>
          )}
          {isSource && <span style={{ fontSize: 11, color: G.gray600 }}>This file is the source of the master. To refresh it after editing, use "Replace master" from another file or re-promote after changes.</span>}
        </div>
      )}
    </div>
  );
}
