import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const { G, db, loadBookingCategories, loadSeriesBookings, bookingsForDeparture, statusKind, rowsForDeparture } = Lib;

// Read-only view, inside a tour file's Services tab, of the series bookings that
// cover this file. Edited only from Series → Bookings, so there is one source of
// truth and a status change there shows up here at once.
const KIND = { open: ["#FEF9E7", "#7D6608", "#F7DC6F"], done: ["#EAFAF1", "#0E6655", "#A9DFBF"], cancelled: ["#F4F6F7", "#7B7D7D", "#D5D8DC"] };
const fmt = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

export default function SeriesBookingsForFile({ query, seriesName }) {
  const [state, setState] = useState({ loading: true, rows: [], cats: {}, error: "" });
  useEffect(() => {
    let live = true;
    (async () => {
      const [c, b] = await Promise.all([loadBookingCategories(db), loadSeriesBookings(db, query.seriesId)]);
      if (!live) return;
      setState({ loading: false, rows: bookingsForDeparture(b.bookings, query.id), cats: Object.fromEntries(c.categories.map(x => [x.id, x])), error: c.error || b.error || "" });
    })();
    return () => { live = false; };
  }, [query.id, query.seriesId]);

  if (state.loading) return null;
  if (state.error) return null; // quietly absent until the series tables exist
  return (
    <div style={{ marginTop: 16, padding: "10px 12px", border: `1px solid ${G.gray200}`, borderRadius: 8, background: "#F8F4FB" }} data-testid="series-bookings-for-file">
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6C3483", marginBottom: 6 }}>⛓ Covered by series bookings{seriesName ? ` — ${seriesName}` : ""}</div>
      {state.rows.length === 0 ? (
        <div style={{ fontSize: 11.5, color: G.gray600 }}>Nothing in the series is allocated to this file yet. Add allocations from Series → Bookings.</div>
      ) : state.rows.map(b => {
        const cat = state.cats[b.categoryId]; const mineRows = rowsForDeparture(b, query.id); const st = mineRows.length ? mineRows[0].status : b.status;
        const [bg, fg, bd] = KIND[statusKind(cat, st)];
        const mine = b.allocations.filter(a => a.queryId === query.id || !a.queryId);
        return (
          <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12, marginBottom: 4 }}>
            <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 600, background: bg, color: fg, border: `1px solid ${bd}` }}>{st || "—"}</span>
            <span><b>{b.title}</b> <span style={{ color: G.gray400 }}>{[cat && cat.name, b.vendorName, b.reference && `Ref ${b.reference}`, mineRows.length ? (mineRows[0].confirmationNo && `Conf ${mineRows[0].confirmationNo}`) : (b.dateFrom && fmt(b.dateFrom)), mineRows[0] && mineRows[0].dateFrom && `${fmt(mineRows[0].dateFrom)}${mineRows[0].dateTo ? "–" + fmt(mineRows[0].dateTo) : ""}`].filter(Boolean).join(" · ")}</span></span>
            <span style={{ color: G.gray600 }}>{mine.map(a => `${a.qty} × ${a.item || "—"}`).join(", ")}</span>
          </div>
        );
      })}
    </div>
  );
}
