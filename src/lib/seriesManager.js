// Series Manager data layer + pure helpers.
// Tables: supabase/migrations/20261015200000_series_manager.sql
//   series_bookings (one booking = one reference/PNR/contract)
//   series_booking_allocations (which departure uses how much of it)
//   series_booking_history (who changed what, when)
//   series_booking_categories (editable categories + status lists)
//   series_documents (uploads that belong to the series itself)

export const SERIES_SETUP_MSG = "Series Manager isn't set up in the database yet -- run the 20261015200000_series_manager.sql migration.";
const isMissingTable = (e) => /series_booking|series_documents|master_query_id|PGRST205|42P01|42703/.test((e && e.message) || "");
const errText = (e) => isMissingTable(e) ? SERIES_SETUP_MSG : ((e && e.message) || String(e));

// ── Mapping ──
export function mapBookingCategory(r) {
  let statuses = r.statuses;
  if (typeof statuses === "string") { try { statuses = JSON.parse(statuses); } catch (e) { statuses = []; } }
  return { id: r.id, name: r.name, sortOrder: r.sort_order || 0, active: r.active !== false,
    statuses: Array.isArray(statuses) ? statuses.map(s => typeof s === "string" ? { name: s, kind: "open" } : { name: s.name, kind: s.kind || "open" }) : [] };
}
export function mapBooking(r) {
  return { id: r.id, seriesId: r.series_id, categoryId: r.category_id || "", title: r.title || "",
    vendorId: r.vendor_id || "", vendorName: r.vendor_name || "", reference: r.reference || "", city: r.city || "",
    dateFrom: r.date_from || "", dateTo: r.date_to || "", status: r.status || "",
    deadlineDate: r.deadline_date || "", deadlineLabel: r.deadline_label || "",
    lines: Array.isArray(r.lines) ? r.lines : [], notes: r.notes || "", createdBy: r.created_by || "",
    createdAt: r.created_at, updatedAt: r.updated_at, allocations: [], history: [] };
}
export function bookingToDb(b) {
  return { series_id: b.seriesId, category_id: b.categoryId || null, title: (b.title || "").trim(),
    vendor_id: b.vendorId || null, vendor_name: b.vendorName || null, reference: b.reference || null, city: b.city || null,
    date_from: b.dateFrom || null, date_to: b.dateTo || null, status: b.status || null,
    deadline_date: b.deadlineDate || null, deadline_label: b.deadlineLabel || null,
    lines: (b.lines || []).filter(l => l && (l.item || "").trim()).map(l => ({ item: l.item.trim(), qty: Number(l.qty) || 0 })),
    notes: b.notes || null, updated_at: new Date().toISOString() };
}

// ── Loading ──
export async function loadBookingCategories(db) {
  try {
    const { data, error } = await db.from("series_booking_categories").select("*").order("sort_order", { ascending: true });
    if (error) return { categories: [], error: errText(error) };
    return { categories: (data || []).map(mapBookingCategory), error: null };
  } catch (e) { return { categories: [], error: errText(e) }; }
}
export async function loadSeriesBookings(db, seriesId) {
  try {
    const { data, error } = await db.from("series_bookings").select("*").eq("series_id", seriesId).is("deleted_at", null).order("date_from", { ascending: true });
    if (error) return { bookings: [], error: errText(error) };
    const bookings = (data || []).map(mapBooking);
    if (bookings.length) {
      const orExpr = bookings.map(b => `booking_id.eq.${b.id}`).join(",");
      const [al, hi] = await Promise.all([
        db.from("series_booking_allocations").select("*").or(orExpr),
        db.from("series_booking_history").select("*").or(orExpr).order("at", { ascending: false }),
      ]);
      const byId = Object.fromEntries(bookings.map(b => [b.id, b]));
      (al.data || []).forEach(a => byId[a.booking_id] && byId[a.booking_id].allocations.push({ id: a.id, queryId: a.query_id || "", item: a.item || "", qty: a.qty || 0, dateFrom: a.date_from || "", dateTo: a.date_to || "", notes: a.notes || "" }));
      (hi.data || []).forEach(h => byId[h.booking_id] && byId[h.booking_id].history.push({ id: h.id, at: h.at, by: h.by_name, kind: h.kind, from: h.from_status, to: h.to_status, note: h.note }));
    }
    return { bookings, error: null };
  } catch (e) { return { bookings: [], error: errText(e) }; }
}

// ── Saving ──
async function addHistory(db, bookingId, byName, kind, fromStatus, toStatus, note) {
  try { await db.from("series_booking_history").insert({ booking_id: bookingId, by_name: byName || "Unknown", kind, from_status: fromStatus || null, to_status: toStatus || null, note: note || null }); }
  catch (e) { console.warn("Booking history failed:", e); }
}
// previous = the saved booking before this edit (null when creating).
export async function saveSeriesBooking(db, booking, previous, byName) {
  const payload = bookingToDb(booking);
  if (!payload.title) return { id: null, error: "Give the booking a title" };
  try {
    if (booking.id) {
      const { error } = await db.from("series_bookings").eq("id", booking.id).update(payload);
      if (error) return { id: null, error: errText(error) };
      if (previous && previous.status !== booking.status) await addHistory(db, booking.id, byName, "status", previous.status, booking.status, null);
      else if (previous) {
        const changed = ["title", "reference", "vendorName", "dateFrom", "dateTo", "deadlineDate"].filter(k => (previous[k] || "") !== (booking[k] || ""));
        if (changed.length) await addHistory(db, booking.id, byName, "edit", null, null, `Edited: ${changed.join(", ")}`);
      }
      return { id: booking.id, error: null };
    }
    const { data, error } = await db.from("series_bookings").insert({ ...payload, created_by: byName || null });
    if (error) return { id: null, error: errText(error) };
    const id = data && data[0] && data[0].id;
    if (id) await addHistory(db, id, byName, "created", null, booking.status, "Booking created");
    return { id, error: null };
  } catch (e) { return { id: null, error: errText(e) }; }
}
export async function deleteSeriesBooking(db, bookingId) {
  try {
    const { error } = await db.from("series_bookings").eq("id", bookingId).update({ deleted_at: new Date().toISOString() });
    return { error: error ? errText(error) : null };
  } catch (e) { return { error: errText(e) }; }
}
export async function replaceBookingAllocations(db, bookingId, rows, byName) {
  try {
    const del = await db.from("series_booking_allocations").eq("booking_id", bookingId).delete();
    if (del.error) return { error: errText(del.error) };
    const clean = (rows || []).filter(r => r.queryId || (r.item || "").trim()).map(r => ({
      booking_id: bookingId, query_id: r.queryId || null, item: (r.item || "").trim() || null,
      qty: Number(r.qty) || 0, date_from: r.dateFrom || null, date_to: r.dateTo || null, notes: r.notes || null }));
    if (clean.length) {
      const ins = await db.from("series_booking_allocations").insert(clean);
      if (ins.error) return { error: errText(ins.error) };
    }
    await addHistory(db, bookingId, byName, "allocation", null, null, `Allocations updated (${clean.length} row${clean.length === 1 ? "" : "s"})`);
    return { error: null };
  } catch (e) { return { error: errText(e) }; }
}
export async function saveBookingCategory(db, cat) {
  const payload = { name: (cat.name || "").trim(), sort_order: cat.sortOrder || 0, active: cat.active !== false,
    statuses: (cat.statuses || []).filter(s => (s.name || "").trim()).map(s => ({ name: s.name.trim(), kind: s.kind || "open" })) };
  if (!payload.name) return { error: "Category needs a name" };
  try {
    const { error } = cat.id ? await db.from("series_booking_categories").upsert({ id: cat.id, ...payload }) : await db.from("series_booking_categories").insert(payload);
    return { error: error ? errText(error) : null };
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

// ── Pure helpers ──
export function statusKind(category, status) {
  const s = category && (category.statuses || []).find(x => x.name === status);
  return s ? s.kind : (/cancel/i.test(status || "") ? "cancelled" : "open");
}
const day = (d) => (d ? new Date(d + "T00:00:00") : null);
export function daysBetween(fromIso, toIso) { const a = day(fromIso), b = day(toIso); return a && b ? Math.round((b - a) / 86400000) : null; }

// Blocked vs allocated per line item. Items are matched case-insensitively.
export function lineUsage(booking) {
  const norm = (s) => (s || "").trim().toLowerCase();
  const used = {};
  (booking.allocations || []).forEach(a => { const k = norm(a.item); if (k) used[k] = (used[k] || 0) + (Number(a.qty) || 0); });
  const rows = (booking.lines || []).map(l => ({ item: l.item, blocked: Number(l.qty) || 0, used: used[norm(l.item)] || 0 }));
  const known = new Set(rows.map(r => norm(r.item)));
  Object.keys(used).filter(k => !known.has(k)).forEach(k => rows.push({ item: k, blocked: 0, used: used[k] }));
  return rows.map(r => ({ ...r, over: r.used > r.blocked, left: r.blocked - r.used }));
}

// Things that need a human today. Rules (kept simple and predictable):
//  - open booking whose deadline is today/past (overdue) or within `soonDays`
//  - open booking starting within `startDays` that is still not confirmed
//  - confirmed/open booking over-allocated against what was blocked
//  - cancelled booking that still has allocations to a departure
export function bookingAttention(bookings, categories, today = new Date().toISOString().slice(0, 10), { soonDays = 7, startDays = 14 } = {}) {
  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const out = [];
  for (const b of bookings || []) {
    const kind = statusKind(catById[b.categoryId], b.status);
    if (kind === "open" && b.deadlineDate) {
      const d = daysBetween(today, b.deadlineDate);
      if (d !== null && d < 0) out.push({ bookingId: b.id, level: "high", reason: `${b.deadlineLabel || "Deadline"} passed ${-d} day${d === -1 ? "" : "s"} ago` });
      else if (d !== null && d <= soonDays) out.push({ bookingId: b.id, level: d <= 2 ? "high" : "medium", reason: `${b.deadlineLabel || "Deadline"} ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}` });
    }
    if (kind === "open" && b.dateFrom) {
      const d = daysBetween(today, b.dateFrom);
      if (d !== null && d >= 0 && d <= startDays) out.push({ bookingId: b.id, level: d <= 3 ? "high" : "medium", reason: `Starts in ${d} day${d === 1 ? "" : "s"} but is still "${b.status || "not confirmed"}"` });
    }
    if (kind !== "cancelled" && lineUsage(b).some(r => r.over)) out.push({ bookingId: b.id, level: "medium", reason: "More allocated than was blocked" });
    if (kind === "cancelled" && (b.allocations || []).some(a => (Number(a.qty) || 0) > 0)) out.push({ bookingId: b.id, level: "high", reason: "Cancelled, but departures are still allocated to it" });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
}

// Columns for the timeline view: one per day when the span is short, else one
// per week. Returns { step, cols: [{ start, end, label }] } covering every dated
// booking, or null when nothing has dates.
export function timelineBuckets(bookings) {
  const dates = [];
  (bookings || []).forEach(b => { [b.dateFrom, b.dateTo, b.deadlineDate].forEach(d => d && dates.push(d)); });
  if (!dates.length) return null;
  dates.sort();
  const first = dates[0], last = dates[dates.length - 1];
  const span = daysBetween(first, last) + 1;
  const step = span <= 62 ? 1 : 7;
  const cols = [];
  const add = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  for (let s = first; s <= last && cols.length < 200; s = add(s, step)) {
    const end = add(s, step - 1);
    cols.push({ start: s, end, label: s.slice(8, 10) + (step === 1 && s.slice(8, 10) !== "01" ? "" : "/" + s.slice(5, 7)) });
  }
  return { step, cols };
}
// Does a booking cover this column?
export function coversColumn(b, col) {
  const from = b.dateFrom || b.dateTo, to = b.dateTo || b.dateFrom;
  return !!from && from <= col.end && to >= col.start;
}

// Bookings (with allocations) that apply to one departure: those allocated to it,
// plus ones allocated to the whole series (no specific departure).
export function bookingsForDeparture(bookings, queryId) {
  return (bookings || []).filter(b => (b.allocations || []).some(a => a.queryId === queryId || !a.queryId));
}

// One-line health summary: "Hotel 3/4 · Flight 1/1 · 2 need attention"
export function seriesHealth(bookings, categories, attentionCount = 0) {
  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const per = {};
  for (const b of bookings || []) {
    const c = catById[b.categoryId]; const name = (c && c.name) || "Other";
    const k = statusKind(c, b.status);
    if (k === "cancelled") continue;
    per[name] = per[name] || { done: 0, total: 0 };
    per[name].total++; if (k === "done") per[name].done++;
  }
  const parts = Object.entries(per).map(([n, v]) => `${n} ${v.done}/${v.total}`);
  if (attentionCount) parts.push(`${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`);
  return parts.join(" · ");
}
