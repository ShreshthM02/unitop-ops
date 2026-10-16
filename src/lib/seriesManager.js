// Series Manager data layer + pure helpers.
// Tables: supabase/migrations/20261015200000_series_manager.sql
//   series_bookings (one booking = one reference/PNR/contract)
//   series_booking_allocations (which departure uses how much of it)
//   series_booking_history (who changed what, when)
//   series_booking_categories (editable categories + status lists)
//   series_documents (uploads that belong to the series itself)

export const SERIES_SETUP_MSG = "Series Manager isn't set up in the database yet -- run the 20261015200000_series_manager.sql and 20261016100000_series_booking_rows.sql migrations.";
const isMissingTable = (e) => /series_booking|series_documents|master_query_id|waitlist_days|PGRST205|42P01|42703/.test((e && e.message) || "");
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
    waitlistDays: r.waitlist_days === null || r.waitlist_days === undefined ? "" : r.waitlist_days,
    rates: Array.isArray(r.rates) ? r.rates.map(x => ({ label: x.label || "", budget: x.budget ?? "", quoted: x.quoted ?? "" })) : [],
    awaiting: r.awaiting || "", followUpDate: r.follow_up_date || "", lastContactOn: r.last_contact_on || "",
    createdAt: r.created_at, updatedAt: r.updated_at, allocations: [], history: [], rows: [], correspondence: [] };
}
export function mapBookingRow(r) {
  return { id: r.id, bookingId: r.booking_id, queryId: r.query_id || "", label: r.label || "", dateFrom: r.date_from || "", dateTo: r.date_to || "",
    plan: r.plan || "", detail: r.detail || "", foc: r.foc || "", status: r.status || "", confirmationNo: r.confirmation_no || "",
    deadlineDate: r.deadline_date || "", deadlineLabel: r.deadline_label || "", notes: r.notes || "", sortOrder: r.sort_order || 0 };
}
export function bookingRowToDb(x) {
  return { booking_id: x.bookingId, query_id: x.queryId || null, label: (x.label || "").trim() || null, date_from: x.dateFrom || null, date_to: x.dateTo || null,
    plan: x.plan || null, detail: x.detail || null, foc: x.foc || null, status: x.status || null, confirmation_no: (x.confirmationNo || "").trim() || null,
    deadline_date: x.deadlineDate || null, deadline_label: x.deadlineLabel || null, notes: x.notes || null, sort_order: x.sortOrder || 0, updated_at: new Date().toISOString() };
}
export function mapCorrespondence(r) {
  return { id: r.id, bookingId: r.booking_id, occurredOn: r.occurred_on || "", direction: r.direction || "in", contact: r.contact || "", subject: r.subject || "",
    summary: r.summary || "", rowIds: Array.isArray(r.row_ids) ? r.row_ids : [], by: r.by_name || "", createdAt: r.created_at };
}
export function bookingToDb(b) {
  return { series_id: b.seriesId, category_id: b.categoryId || null, title: (b.title || "").trim(),
    vendor_id: b.vendorId || null, vendor_name: b.vendorName || null, reference: b.reference || null, city: b.city || null,
    date_from: b.dateFrom || null, date_to: b.dateTo || null, status: b.status || null,
    deadline_date: b.deadlineDate || null, deadline_label: b.deadlineLabel || null,
    lines: (b.lines || []).filter(l => l && (l.item || "").trim()).map(l => ({ item: l.item.trim(), qty: Number(l.qty) || 0 })),
    waitlist_days: b.waitlistDays === "" || b.waitlistDays === null || b.waitlistDays === undefined ? null : Number(b.waitlistDays) || 0,
    rates: (b.rates || []).filter(x => x && ((x.label || "").trim() || x.budget !== "" || x.quoted !== "")).map(x => ({ label: (x.label || "").trim(), budget: x.budget === "" ? null : Number(x.budget), quoted: x.quoted === "" ? null : Number(x.quoted) })),
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
      const [al, hi, rw, co] = await Promise.all([
        db.from("series_booking_allocations").select("*").or(orExpr),
        db.from("series_booking_history").select("*").or(orExpr).order("at", { ascending: false }),
        db.from("series_booking_rows").select("*").or(orExpr).order("date_from", { ascending: true }),
        db.from("series_booking_correspondence").select("*").or(orExpr).order("occurred_on", { ascending: false }),
      ]);
      if (rw.error) return { bookings: [], error: errText(rw.error) };
      const byId = Object.fromEntries(bookings.map(b => [b.id, b]));
      (al.data || []).forEach(a => byId[a.booking_id] && byId[a.booking_id].allocations.push({ id: a.id, queryId: a.query_id || "", item: a.item || "", qty: a.qty || 0, dateFrom: a.date_from || "", dateTo: a.date_to || "", notes: a.notes || "" }));
      (hi.data || []).forEach(h => byId[h.booking_id] && byId[h.booking_id].history.push({ id: h.id, at: h.at, by: h.by_name, kind: h.kind, from: h.from_status, to: h.to_status, note: h.note, rowId: h.row_id || "" }));
      (rw.data || []).forEach(x => byId[x.booking_id] && byId[x.booking_id].rows.push(mapBookingRow(x)));
      (co.data || []).forEach(x => byId[x.booking_id] && byId[x.booking_id].correspondence.push(mapCorrespondence(x)));
    }
    return { bookings, error: null };
  } catch (e) { return { bookings: [], error: errText(e) }; }
}

// ── Saving ──
async function addHistory(db, bookingId, byName, kind, fromStatus, toStatus, note, rowId) {
  try { await db.from("series_booking_history").insert({ booking_id: bookingId, by_name: byName || "Unknown", kind, from_status: fromStatus || null, to_status: toStatus || null, note: note || null, ...(rowId ? { row_id: rowId } : {}) }); }
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

// ── Rows (one per departure / date / segment) ──
export async function saveBookingRow(db, row, previous, byName) {
  if (!row.bookingId) return { id: null, error: "Row has no booking" };
  const payload = bookingRowToDb(row);
  const what = (payload.label || (payload.date_from ? payload.date_from : "row"));
  try {
    if (row.id) {
      const { error } = await db.from("series_booking_rows").eq("id", row.id).update(payload);
      if (error) return { id: null, error: errText(error) };
      if (previous && previous.status !== row.status) await addHistory(db, row.bookingId, byName, "row_status", previous.status, row.status, what, row.id);
      else if (previous && (previous.confirmationNo || "") !== (row.confirmationNo || "")) await addHistory(db, row.bookingId, byName, "row_ref", null, null, `${what}: confirmation no. ${previous.confirmationNo || "—"} → ${row.confirmationNo || "—"}`, row.id);
      return { id: row.id, error: null };
    }
    const { data, error } = await db.from("series_booking_rows").insert(payload);
    if (error) return { id: null, error: errText(error) };
    const id = data && data[0] && data[0].id;
    if (id) await addHistory(db, row.bookingId, byName, "row_added", null, row.status, `Added ${what}`, id);
    return { id, error: null };
  } catch (e) { return { id: null, error: errText(e) }; }
}
export async function deleteBookingRow(db, row, byName) {
  try {
    const { error } = await db.from("series_booking_rows").eq("id", row.id).delete();
    if (error) return { error: errText(error) };
    await addHistory(db, row.bookingId, byName, "row_removed", row.status, null, `Removed ${row.label || row.dateFrom || "row"}`);
    return { error: null };
  } catch (e) { return { error: errText(e) }; }
}
// Same status on several rows at once, e.g. "all seven Available dates -> Confirmed".
export async function bulkSetRowStatus(db, rows, status, byName) {
  for (const r of rows) {
    if (r.status === status) continue;
    const res = await saveBookingRow(db, { ...r, status }, r, byName);
    if (res.error) return { error: res.error };
  }
  return { error: null };
}

// ── Correspondence ──
// entry: { bookingId, occurredOn, direction, contact, subject, summary, rowIds, awaiting, followUpDate }
// Logging also records whose turn it is (awaiting) and when to chase.
export async function addCorrespondence(db, entry, byName) {
  if (!(entry.summary || "").trim() && !(entry.subject || "").trim()) return { id: null, error: "Write a short summary of what was said" };
  try {
    const { data, error } = await db.from("series_booking_correspondence").insert({
      booking_id: entry.bookingId, occurred_on: entry.occurredOn || new Date().toISOString().slice(0, 10), direction: entry.direction || "in",
      contact: entry.contact || null, subject: entry.subject || null, summary: entry.summary || null, row_ids: entry.rowIds || [], by_name: byName || null });
    if (error) return { id: null, error: errText(error) };
    const up = await db.from("series_bookings").eq("id", entry.bookingId).update({
      awaiting: entry.awaiting || null, follow_up_date: entry.awaiting ? (entry.followUpDate || null) : null,
      last_contact_on: entry.occurredOn || new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() });
    if (up.error) return { id: data && data[0] && data[0].id, error: errText(up.error) };
    return { id: data && data[0] && data[0].id, error: null };
  } catch (e) { return { id: null, error: errText(e) }; }
}
export async function deleteCorrespondence(db, id) {
  try { const { error } = await db.from("series_booking_correspondence").eq("id", id).delete(); return { error: error ? errText(error) : null }; }
  catch (e) { return { error: errText(e) }; }
}
// Clears "waiting on ..." without logging anything new.
export async function setAwaiting(db, bookingId, awaiting, followUpDate) {
  try {
    const { error } = await db.from("series_bookings").eq("id", bookingId).update({ awaiting: awaiting || null, follow_up_date: awaiting ? (followUpDate || null) : null, updated_at: new Date().toISOString() });
    return { error: error ? errText(error) : null };
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

// Date the vendor said they would clear a waitlist: arrival minus the booking's
// "clears N days before arrival" rule. Null when the rule or the date is missing.
export function waitlistDate(booking, row) {
  const n = Number(booking && booking.waitlistDays);
  const from = (row && row.dateFrom) || null;
  if (!from || !(n > 0)) return null;
  const d = new Date(from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const isWaitlist = (status) => /wait/i.test(status || "");

// A booking with rows is judged by its rows: all done -> done, all cancelled ->
// cancelled, anything else -> open. Without rows its own status decides.
export function bookingKind(booking, category) {
  const rows = (booking && booking.rows) || [];
  if (!rows.length) return statusKind(category, booking && booking.status);
  const kinds = rows.map(r => statusKind(category, r.status));
  const live = kinds.filter(k => k !== "cancelled");
  if (!live.length) return "cancelled";
  return live.every(k => k === "done") ? "done" : "open";
}
// "7 of 14 confirmed · 4 waitlisted · 2 sold out" -- short text for a booking's header.
export function rowsSummary(booking, category) {
  const rows = (booking && booking.rows) || [];
  if (!rows.length) return "";
  const live = rows.filter(r => statusKind(category, r.status) !== "cancelled");
  const done = live.filter(r => statusKind(category, r.status) === "done").length;
  const other = {};
  live.filter(r => statusKind(category, r.status) !== "done").forEach(r => { const k = r.status || "No status"; other[k] = (other[k] || 0) + 1; });
  const parts = [`${done} of ${live.length} confirmed`, ...Object.entries(other).map(([k, n]) => `${n} ${k.toLowerCase()}`)];
  const gone = rows.length - live.length;
  if (gone) parts.push(`${gone} cancelled`);
  return parts.join(" · ");
}
// Quoted vs budget per rate line. gap > 0 means we are being quoted above budget.
export function rateStatus(booking) {
  return ((booking && booking.rates) || []).map(r => {
    const budget = r.budget === "" || r.budget === null || r.budget === undefined ? null : Number(r.budget);
    const quoted = r.quoted === "" || r.quoted === null || r.quoted === undefined ? null : Number(r.quoted);
    return { label: r.label || "Rate", budget, quoted, gap: budget !== null && quoted !== null ? quoted - budget : null };
  });
}

// Things that need a human today. Rules (kept simple and predictable):
//  - open booking/row whose deadline is today/past (overdue) or within `soonDays`
//  - open booking/row starting within `startDays` that is still not confirmed
//  - waitlisted row whose vendor-promised clearing date is near or has passed
//  - confirmed row with no confirmation number
//  - vendor waiting on us, or our chase date reached with no reply
//  - quoted rate above our budget
//  - confirmed/open booking over-allocated against what was blocked
//  - cancelled booking/row that still has allocations to a departure
export function bookingAttention(bookings, categories, today = new Date().toISOString().slice(0, 10), { soonDays = 7, startDays = 14 } = {}) {
  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const out = [];
  const money = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const deadlineCheck = (id, name, kind, deadlineDate, label) => {
    if (kind !== "open" || !deadlineDate) return;
    const d = daysBetween(today, deadlineDate);
    if (d !== null && d < 0) out.push({ bookingId: id, level: "high", reason: `${name}${label || "Deadline"} passed ${-d} day${d === -1 ? "" : "s"} ago` });
    else if (d !== null && d <= soonDays) out.push({ bookingId: id, level: d <= 2 ? "high" : "medium", reason: `${name}${label || "Deadline"} ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}` });
  };
  const startCheck = (id, name, kind, dateFrom, status) => {
    if (kind !== "open" || !dateFrom) return;
    const d = daysBetween(today, dateFrom);
    if (d !== null && d >= 0 && d <= startDays) out.push({ bookingId: id, level: d <= 3 ? "high" : "medium", reason: `${name}Starts in ${d} day${d === 1 ? "" : "s"} but is still "${status || "not confirmed"}"` });
  };
  for (const b of bookings || []) {
    const cat = catById[b.categoryId];
    const kind = statusKind(cat, b.status);
    const rows = b.rows || [];
    if (!rows.length) { deadlineCheck(b.id, "", kind, b.deadlineDate, b.deadlineLabel); startCheck(b.id, "", kind, b.dateFrom, b.status); }
    else if (b.deadlineDate) deadlineCheck(b.id, "", bookingKind(b, cat), b.deadlineDate, b.deadlineLabel);
    for (const r of rows) {
      const rk = statusKind(cat, r.status);
      const nm = `${r.label || (r.dateFrom ? fmtShort(r.dateFrom) : "Row")}: `;
      deadlineCheck(b.id, nm, rk, r.deadlineDate, r.deadlineLabel);
      if (rk === "open" && isWaitlist(r.status)) {
        const wd = waitlistDate(b, r);
        if (wd) {
          const d = daysBetween(today, wd);
          if (d !== null && d < 0) out.push({ bookingId: b.id, level: "high", reason: `${nm}waitlist should have cleared ${-d} day${d === -1 ? "" : "s"} ago (${fmtShort(wd)}) — chase the vendor` });
          else if (d !== null && d <= soonDays) out.push({ bookingId: b.id, level: "medium", reason: `${nm}vendor to clear waitlist ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`} (${fmtShort(wd)})` });
        }
      }
      startCheck(b.id, nm, rk, r.dateFrom, r.status);
      if (rk === "done" && !(r.confirmationNo || "").trim()) out.push({ bookingId: b.id, level: "medium", reason: `${nm}marked ${r.status || "confirmed"} but has no confirmation number` });
      if (rk === "cancelled" && r.queryId && (b.allocations || []).some(a => a.queryId === r.queryId && (Number(a.qty) || 0) > 0)) out.push({ bookingId: b.id, level: "high", reason: `${nm}cancelled, but its departure is still allocated to this booking` });
    }
    if (b.awaiting === "us") out.push({ bookingId: b.id, level: b.followUpDate && b.followUpDate < today ? "high" : "medium", reason: `Vendor is waiting on us${b.followUpDate ? ` (reply by ${fmtShort(b.followUpDate)})` : ""}` });
    else if (b.awaiting === "vendor" && b.followUpDate) {
      const d = daysBetween(b.followUpDate, today);
      if (d !== null && d >= 0) out.push({ bookingId: b.id, level: d >= 3 ? "high" : "medium", reason: d === 0 ? "Chase the vendor today — no reply yet" : `No reply from the vendor — chase was due ${d} day${d === 1 ? "" : "s"} ago` });
    }
    for (const rt of rateStatus(b)) if (rt.gap !== null && rt.gap > 0 && kind !== "cancelled") out.push({ bookingId: b.id, level: "medium", reason: `${rt.label} quoted ${money(rt.quoted)} is ${money(rt.gap)} above our budget of ${money(rt.budget)}` });
    if (kind !== "cancelled" && lineUsage(b).some(r => r.over)) out.push({ bookingId: b.id, level: "medium", reason: "More allocated than was blocked" });
    if (!rows.length && kind === "cancelled" && (b.allocations || []).some(a => (Number(a.qty) || 0) > 0)) out.push({ bookingId: b.id, level: "high", reason: "Cancelled, but departures are still allocated to it" });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
}
function fmtShort(iso) { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }

// Columns for the timeline view: one per day when the span is short, else one
// per week. Returns { step, cols: [{ start, end, label }] } covering every dated
// booking, or null when nothing has dates.
export function timelineBuckets(bookings) {
  const dates = [];
  (bookings || []).forEach(b => { [b.dateFrom, b.dateTo, b.deadlineDate].forEach(d => d && dates.push(d)); (b.rows || []).forEach(r => [r.dateFrom, r.dateTo, r.deadlineDate].forEach(d => d && dates.push(d))); });
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
// For a booking with rows: the row (if any) that covers this column, so the
// timeline can colour each stay by its own status.
export function rowCovering(b, col) {
  return (b.rows || []).find(r => coversColumn(r, col)) || null;
}

// Bookings (with allocations) that apply to one departure: those allocated to it,
// plus ones allocated to the whole series (no specific departure).
export function bookingsForDeparture(bookings, queryId) {
  return (bookings || []).filter(b => (b.allocations || []).some(a => a.queryId === queryId || !a.queryId) || (b.rows || []).some(r => r.queryId === queryId));
}
// This departure's own rows inside a booking (status + confirmation number).
export function rowsForDeparture(booking, queryId) { return ((booking && booking.rows) || []).filter(r => r.queryId === queryId); }

// One-line health summary: "Hotel 3/4 · Flight 1/1 · 2 need attention"
export function seriesHealth(bookings, categories, attentionCount = 0) {
  const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
  const per = {};
  for (const b of bookings || []) {
    const c = catById[b.categoryId]; const name = (c && c.name) || "Other";
    const k = bookingKind(b, c);
    if (k === "cancelled") continue;
    per[name] = per[name] || { done: 0, total: 0 };
    per[name].total++; if (k === "done") per[name].done++;
  }
  const parts = Object.entries(per).map(([n, v]) => `${n} ${v.done}/${v.total}`);
  if (attentionCount) parts.push(`${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`);
  return parts.join(" · ");
}

// ── Outbound chart: the table you paste into the vendor email ──
// Same rows, two flavours: a request (what we need) and a status chart (what we
// hold, with confirmation numbers) to send back as an acknowledgement.
export function chartModel(booking, { withStatus = false, fileLabel = () => "" } = {}) {
  const rows = (booking.rows || []).slice().sort((a, b) => (a.dateFrom || "").localeCompare(b.dateFrom || ""));
  const head = ["Tour", "Check-in", "Check-out", "Plan", "Rooms / qty", "FOC"];
  if (withStatus) head.push("Status", "Confirmation");
  const d = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-") : "";
  const body = rows.map(r => {
    const line = [r.label || (r.queryId ? fileLabel(r.queryId) : ""), d(r.dateFrom), d(r.dateTo), r.plan, r.detail, r.foc];
    if (withStatus) line.push(r.status, r.confirmationNo);
    return line.map(x => x || "");
  });
  const rates = rateStatus(booking).filter(r => r.budget !== null || r.quoted !== null);
  return { head, body, rates };
}
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function chartHtml(booking, opts = {}) {
  const { head, body, rates } = chartModel(booking, opts);
  const cell = "border:1px solid #000;padding:4px 8px;text-align:center;font-family:Arial,sans-serif;font-size:13px";
  let h = `<table style="border-collapse:collapse"><tr><th colspan="${head.length}" style="${cell}">${esc(booking.title || booking.vendorName || "")}</th></tr><tr>${head.map(x => `<th style="${cell}">${esc(x)}</th>`).join("")}</tr>`;
  h += body.map(r => `<tr>${r.map(x => `<td style="${cell}">${esc(x)}</td>`).join("")}</tr>`).join("") + "</table>";
  if (!opts.withStatus && rates.some(r => r.budget !== null)) h += `<p style="font-family:Arial,sans-serif;font-size:13px"><b>Maximum budget:</b> ${rates.filter(r => r.budget !== null).map(r => `Rs. ${Number(r.budget).toLocaleString("en-IN")} ${esc(r.label)}`).join(" &amp; ")}</p>`;
  return h;
}
export function chartText(booking, opts = {}) {
  const { head, body, rates } = chartModel(booking, opts);
  let t = [head, ...body].map(r => r.join("\t")).join("\n");
  if (!opts.withStatus && rates.some(r => r.budget !== null)) t += "\n\nMaximum budget: " + rates.filter(r => r.budget !== null).map(r => `Rs. ${Number(r.budget).toLocaleString("en-IN")} ${r.label}`).join(" & ");
  return t;
}
