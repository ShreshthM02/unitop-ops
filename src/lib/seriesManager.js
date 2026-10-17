// Series Manager data layer + pure helpers.
//
// Series → Bookings is a list of VENDOR BOOKINGS (series_vendor_bookings). Each
// entry inside one is a tour-file Service Status row (query_services, linked by
// svb_id): one record, shown in the series and inside the tour file, so the two
// can never disagree. An entry with no tour file yet lives only in the series.
// Migration: supabase/migrations/20261017100000_series_services.sql
//
// Also: series_documents (series uploads) and the master-file pointer.

export const SERIES_SETUP_MSG = "Series bookings aren't set up in the database yet -- run the 20261017100000_series_services.sql migration.";
const isMissingTable = (e) => /series_vendor_bookings|series_documents|master_query_id|svb_id|PGRST205|42P01|42703/.test((e && e.message) || "");
const errText = (e) => isMissingTable(e) ? SERIES_SETUP_MSG : ((e && e.message) || String(e));

// ── Service statuses (shared by the tour file and the series screen) ──
export const SERVICE_STATUSES = ["requested", "pending", "confirmed", "Ex. Order Issued", "sold out", "cancelled"];
export const SERVICE_STATUS_COLORS = {
  requested: { bg: "#DBEAFE", color: "#1E40AF" },
  pending: { bg: "#FEF3C7", color: "#92400E" },
  confirmed: { bg: "#DCFCE7", color: "#166534" },
  "Ex. Order Issued": { bg: "#EAFAF1", color: "#0E6655" },
  "sold out": { bg: "#FEE2E2", color: "#991B1B" },
  cancelled: { bg: "#F3F4F6", color: "#6B7280" },
};
// Free-text statuses get the colour of the closest known one, by keyword.
export function serviceStatusTone(status) {
  const s = (status || "").trim();
  if (SERVICE_STATUS_COLORS[s]) return s;
  if (/cancel|release/i.test(s)) return "cancelled";
  if (/sold|unavailable|no room|no seat|full/i.test(s)) return "sold out";
  if (/confirm|issued|ticketed|voucher|booked/i.test(s)) return /issued/i.test(s) ? "Ex. Order Issued" : "confirmed";
  if (/wait|pending|hold|option|await|quote|tentative/i.test(s)) return "pending";
  return "requested";
}
// open | confirmed | soldout | cancelled -- used by the filters.
export function serviceState(status) {
  const t = serviceStatusTone(status);
  return t === "confirmed" || t === "Ex. Order Issued" ? "confirmed" : t === "cancelled" ? "cancelled" : t === "sold out" ? "soldout" : "open";
}
// "Vendor / Title / Reservation" -- empty parts are left out.
export function composeServiceName(vendorName, title, reservationNo) {
  return [vendorName, title, reservationNo].map(x => (x || "").trim()).filter(Boolean).join(" / ");
}

// ── Mapping ──
export function mapVendorBooking(r) {
  return { id: r.id, seriesId: r.series_id, vendorId: r.vendor_id || "", vendorName: r.vendor_name || "", vendorType: r.vendor_type || "", createdAt: r.created_at };
}
export function mapServiceEntry(r) {
  return { id: r.id, svbId: r.svb_id, seriesId: r.series_id, queryId: r.query_id || "", name: r.name || "", title: r.title || "",
    dateFrom: r.date || "", dateTo: r.date_to || "", reservationNo: r.reservation_no || "", status: r.status || "requested",
    rates: r.rates || "", remarksHtml: r.remarks_html || "", sortOrder: r.sort_order || 0 };
}

// ── Loading ──
export async function loadSeriesBookings(db, seriesId) {
  try {
    const vb = await db.from("series_vendor_bookings").select("*").eq("series_id", seriesId).is("deleted_at", null).order("created_at", { ascending: true });
    if (vb.error) return { groups: [], error: errText(vb.error) };
    const sv = await db.from("query_services").select("*").eq("series_id", seriesId).order("date", { ascending: true });
    if (sv.error) return { groups: [], error: errText(sv.error) };
    const groups = (vb.data || []).map(mapVendorBooking).map(g => ({ ...g, entries: [] }));
    const byId = Object.fromEntries(groups.map(g => [g.id, g]));
    (sv.data || []).forEach(r => { const g = byId[r.svb_id]; if (g) g.entries.push(mapServiceEntry(r)); });
    return { groups, error: null };
  } catch (e) { return { groups: [], error: errText(e) }; }
}

// ── Saving ──
let idCounter = 0;
const newServiceId = () => Date.now() * 10 + (idCounter++ % 10);   // bigint ids, same scheme the tour file uses

export async function addVendorBooking(db, { seriesId, vendorId, vendorName, vendorType }, byName) {
  if (!(vendorName || "").trim()) return { id: null, error: "Pick a vendor" };
  try {
    const { data, error } = await db.from("series_vendor_bookings").insert({ series_id: seriesId, vendor_id: vendorId || null, vendor_name: vendorName.trim(), vendor_type: vendorType || null, created_by: byName || null });
    if (error) return { id: null, error: errText(error) };
    return { id: data && data[0] && data[0].id, error: null };
  } catch (e) { return { id: null, error: errText(e) }; }
}
export async function deleteVendorBooking(db, group) {
  try {
    const d = await db.from("query_services").eq("svb_id", group.id).delete();
    if (d.error) return { error: errText(d.error) };
    const { error } = await db.from("series_vendor_bookings").eq("id", group.id).update({ deleted_at: new Date().toISOString() });
    return { error: error ? errText(error) : null };
  } catch (e) { return { error: errText(e) }; }
}

// Saving an entry registers (or updates) its service in the chosen tour file.
export async function saveServiceEntry(db, entry, group, byName) {
  if (!(entry.title || "").trim() && !(entry.reservationNo || "").trim()) return { id: null, error: "Give the booking a title" };
  if (entry.dateFrom && entry.dateTo && entry.dateTo < entry.dateFrom) return { id: null, error: "The end date is before the start date" };
  const name = composeServiceName(group.vendorName, entry.title, entry.reservationNo);
  const id = entry.id || newServiceId();
  const row = {
    id, query_id: entry.queryId || null, series_id: group.seriesId, svb_id: group.id, name, title: (entry.title || "").trim() || null,
    status: (entry.status || "requested").trim() || "requested", date: entry.dateFrom || null, date_to: entry.dateTo || null,
    reservation_no: (entry.reservationNo || "").trim() || null, rates: (entry.rates || "").trim() || null, remarks_html: entry.remarksHtml || null,
    ...(entry.id ? {} : { sort_order: 1000 }),
  };
  try {
    const { error } = await db.from("query_services").upsert(row);
    if (error) return { id: null, error: errText(error) };
    if (entry.queryId) {
      try { await db.from("query_audit").insert({ query_id: entry.queryId, by_name: byName || "Unknown", action: `Service "${name}" ${entry.id ? "updated" : "added"} from Series bookings` }); } catch (e) { /* audit is best-effort */ }
    }
    return { id, error: null };
  } catch (e) { return { id: null, error: errText(e) }; }
}
export async function deleteServiceEntry(db, entry) {
  try { const { error } = await db.from("query_services").eq("id", entry.id).delete(); return { error: error ? errText(error) : null }; }
  catch (e) { return { error: errText(e) }; }
}
// Quick status change from the series list (touches only the status).
export async function setServiceStatus(db, entry, status) {
  try { const { error } = await db.from("query_services").eq("id", entry.id).update({ status }); return { error: error ? errText(error) : null }; }
  catch (e) { return { error: errText(e) }; }
}
// A cancelled tour file: every series-backed service in it becomes cancelled.
export async function cancelLinkedServices(db, queryId) {
  try {
    const { data } = await db.from("query_services").select("id,svb_id,status").eq("query_id", queryId);
    for (const r of (data || []).filter(x => x.svb_id && x.status !== "cancelled")) await db.from("query_services").eq("id", r.id).update({ status: "cancelled" });
    return { error: null };
  } catch (e) { return { error: errText(e) }; }
}

// Choosing a master file for the series: remembers the pointer, and refreshes
// the copy-source snapshot used when starting new files from the series.
export async function setSeriesMasterQuery(db, seriesId, queryId, byName) {
  try {
    const { error } = await db.from("series").eq("id", seriesId).update({ master_query_id: queryId || null, updated_at: new Date().toISOString() });
    if (error) return { error: errText(error) };
    if (queryId) {
      const { data } = await db.authRpc("promote_series_master", { p_series: seriesId, p_query: queryId, p_by: byName || "" });
      if (data && data.success === false) return { error: null, warning: data.error };
    }
    return { error: null };
  } catch (e) { return { error: errText(e) }; }
}

// ── Filtering / summary (pure) ──
// filters: { text, vendor, type, queryId ("" any | "__none" unassigned | id), state, from, to (ISO), noReservation }
export function filterEntries(groups, f = {}) {
  const t = (f.text || "").trim().toLowerCase();
  const out = [];
  for (const g of groups || []) for (const e of g.entries) {
    if (f.vendor && g.id !== f.vendor) continue;
    if (f.type && g.vendorType !== f.type) continue;
    if (f.queryId === "__none" ? e.queryId : (f.queryId && e.queryId !== f.queryId)) continue;
    if (f.state && serviceState(e.status) !== f.state) continue;
    if (f.noReservation && e.reservationNo) continue;
    if (f.from || f.to) {
      const a = e.dateFrom || e.dateTo, b = e.dateTo || e.dateFrom;
      if (!a) continue;
      if (f.from && b < f.from) continue;
      if (f.to && a > f.to) continue;
    }
    if (t && ![g.vendorName, e.title, e.reservationNo, e.status, e.rates, e.name].some(x => (x || "").toLowerCase().includes(t))) continue;
    out.push({ group: g, entry: e });
  }
  return out;
}
export function stateCounts(groups) {
  const c = { all: 0, open: 0, confirmed: 0, soldout: 0, cancelled: 0 };
  for (const g of groups || []) for (const e of g.entries) { c.all++; c[serviceState(e.status)]++; }
  return c;
}
export function seriesSummary(groups) {
  const c = stateCounts(groups);
  if (!c.all) return "";
  return `${c.all} service${c.all === 1 ? "" : "s"} · ${c.confirmed} confirmed · ${c.open} open` + (c.soldout ? ` · ${c.soldout} sold out` : "") + (c.cancelled ? ` · ${c.cancelled} cancelled` : "");
}

// dd/mm/yyyy helpers live in dateUtils.js
export { formatDMY, parseDMY } from "./dateUtils.js";
