// Fleet (Master Data): our own vehicles, each with a profile, a manually
// kept service history, an expense ledger and a documents folder.
// Dependency-free on purpose (same reason as tourInfo.js): imported by
// index.js, tested directly, and never imports from utils.js.

export const FLEET_PROFILE_FIELDS = [
  { key: "name", label: "Vehicle Name", type: "text", required: true, placeholder: "e.g. Innova Crysta – Delhi 01" },
  { key: "owner", label: "Vehicle Owner", type: "text" },
  { key: "regNo", label: "Registration Number", type: "text", placeholder: "e.g. DL 1Z 1234" },
  { key: "regDate", label: "Registration Date", type: "date" },
  { key: "model", label: "Model", type: "text" },
  { key: "colour", label: "Colour", type: "text" },
  { key: "capacity", label: "Passenger Capacity", type: "number" },
];

export function newFleetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for very old runtimes: RFC4122-shaped, good enough for a row key.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const blankVehicle = () => ({ id: null, name: "", owner: "", regNo: "", regDate: "", model: "", colour: "", capacity: "", driveFolderId: null });

// The Drive folder is named exactly after the vehicle, as asked.
export const vehicleFolderName = (v) => String(v?.name || "").trim() || "Untitled vehicle";

// ── DB shape <-> app shape ─────────────────────────────────────────────────
const nz = (v) => (v === "" || v === undefined ? null : v);
export function mapDbFleetVehicle(r) {
  return {
    id: r.id, name: r.name || "", owner: r.owner || "", regNo: r.reg_no || "", regDate: r.reg_date || "",
    model: r.model || "", colour: r.colour || "", capacity: r.capacity ?? "", driveFolderId: r.drive_folder_id || null,
  };
}
export function fleetVehicleToDb(v) {
  const cap = parseInt(v.capacity, 10);
  return {
    id: v.id, name: String(v.name || "").trim(), owner: nz(v.owner), reg_no: nz(v.regNo), reg_date: nz(v.regDate),
    model: nz(v.model), colour: nz(v.colour), capacity: Number.isFinite(cap) ? cap : null,
  };
}
export const mapDbFleetServiceRow = (r) => ({ id: r.id, vehicleId: r.vehicle_id, tourFileNo: r.tour_file_no || "", startDate: r.start_date || "", endDate: r.end_date || "", sector: r.sector || "", notes: r.notes || "" });
export const fleetServiceRowToDb = (r) => ({ id: r.id, vehicle_id: r.vehicleId, tour_file_no: nz(r.tourFileNo), start_date: nz(r.startDate), end_date: nz(r.endDate), sector: nz(r.sector), notes: nz(r.notes) });
export const mapDbFleetExpenseRow = (r) => ({ id: r.id, vehicleId: r.vehicle_id, date: r.expense_date || "", particulars: r.particulars || "", amount: r.amount === null || r.amount === undefined ? "" : Number(r.amount), notes: r.notes || "" });
export const fleetExpenseRowToDb = (r) => ({ id: r.id, vehicle_id: r.vehicleId, expense_date: nz(r.date), particulars: nz(r.particulars), amount: Number.isFinite(parseFloat(r.amount)) ? parseFloat(r.amount) : 0, notes: nz(r.notes) });

// ── Expense ledger maths ───────────────────────────────────────────────────
// Dates are ISO yyyy-mm-dd strings, so plain string comparison is correct.
// A blank bound means open-ended; rows with no date only show when there is
// no date filter at all.
export function filterExpensesByRange(rows, from, to) {
  return (rows || []).filter(r => {
    if (!from && !to) return true;
    if (!r.date) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
}
export const totalExpenses = (rows) => Math.round((rows || []).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) * 100) / 100;
export const formatINR = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const sortByDateDesc = (rows, key) => [...(rows || [])].sort((a, b) => String(b[key] || "").localeCompare(String(a[key] || "")));

// Service history: end can't be before start. Returns an error string or "".
export function validateServiceRow(r) {
  if (!String(r.tourFileNo || "").trim() && !String(r.sector || "").trim() && !r.startDate) return "Enter at least a tour file number, sector or start date.";
  if (r.startDate && r.endDate && r.endDate < r.startDate) return "End date can't be before the start date.";
  return "";
}
export function validateExpenseRow(r) {
  if (!r.date) return "Pick a date.";
  if (!String(r.particulars || "").trim()) return "Enter the particulars.";
  if (!Number.isFinite(parseFloat(r.amount))) return "Enter the amount in INR.";
  return "";
}

// ── DB access (db = the app's Supabase wrapper) ────────────────────────────
// Every function returns { error } (null on success) rather than throwing,
// so the screen can show a visible message instead of failing silently.
const errOf = (res) => (res && res.error ? (res.error.message || String(res.error)) : null);
export async function loadFleetVehicles(db) {
  try {
    const res = await db.from("fleet_vehicles").select("*").order("name", { ascending: true });
    if (res.error) return { vehicles: [], error: errOf(res) };
    return { vehicles: (res.data || []).map(mapDbFleetVehicle), error: null };
  } catch (e) { return { vehicles: [], error: e.message || String(e) }; }
}
export async function saveFleetVehicle(db, v) {
  try {
    const id = v.id || newFleetId();
    const res = await db.from("fleet_vehicles").upsert(fleetVehicleToDb({ ...v, id }));
    const error = errOf(res);
    return { vehicle: error ? null : { ...v, id }, error };
  } catch (e) { return { vehicle: null, error: e.message || String(e) }; }
}
export async function loadFleetRows(db, table, vehicleId, mapper) {
  try {
    const res = await db.from(table).select("*").eq("vehicle_id", vehicleId);
    if (res.error) return { rows: [], error: errOf(res) };
    return { rows: (res.data || []).map(mapper), error: null };
  } catch (e) { return { rows: [], error: e.message || String(e) }; }
}
export async function saveFleetRow(db, table, dbRow) {
  try { return { error: errOf(await db.from(table).upsert(dbRow)) }; } catch (e) { return { error: e.message || String(e) }; }
}
export async function deleteFleetRow(db, table, id) {
  try { return { error: errOf(await db.from(table).eq("id", id).delete()) }; } catch (e) { return { error: e.message || String(e) }; }
}
