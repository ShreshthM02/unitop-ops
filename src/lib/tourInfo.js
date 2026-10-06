// ─── TOUR INFO LIBRARY (2026-10-06 restructure) ────────────────────────────
// Pure helpers behind the reworked Tour Info tabs and the date-driven
// Ground View. Deliberately dependency-free (no imports from utils.js, which
// itself imports this file) and DOM-free apart from sanitizeRichHtml, so
// every rule below is unit-testable without mounting a component.
//
// Data shape added to tour_execution (all of it lives in ONE new jsonb
// column, `extras`, so a single additive migration covers it -- see
// supabase/migrations/20261006_tour_execution_extras.sql):
//   hotelRows      [{ id, dayLabel, date, hotelName, rooms,
//                     breakfast, lunch, dinner, source }]
//                  source: "quotation" (pulled from the final quotation),
//                          "manual" (added by hand, never overwritten by a
//                          sync) or "legacy" (derived from an old day's
//                          hotelName/rooms, replaced on first sync).
//   otherServices  [{ id, startDate, endDate, detailsHtml }]
//   arrFlight / depFlight   one flight/train leg each, same fields as a
//                  domestic leg: { date, type, number, from, fromTime,
//                  to, toTime }
//   syncedFromQuotationVersion   which quotation version hotelRows came from
// Transporters / facilitators / local handlers keep their existing arrays
// but each entry now also carries startDate / endDate.

const pad2 = (n) => String(n).padStart(2, "0");

function parseDate(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ISO date + n days -> ISO date ("" when the input isn't a real date).
export function addDaysToDateStr(str, n) {
  const d = parseDate(str);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// A tour's own date range: travelDate through travelDate + nights (arrival
// through departure day), the convention used everywhere else in the app.
export function tourDateRange(query) {
  const start = parseDate(query?.travelDate);
  if (!start) return { start: "", end: "" };
  const end = new Date(start);
  end.setDate(end.getDate() + (parseInt(query?.nights) || 0));
  return { start: toDateStr(start), end: toDateStr(end) };
}

// "Day 02", "Day 2", "DAY-2" all compare equal -- Quotation and Tour Info
// have never agreed on label padding.
export function normalizeDayLabel(label) {
  return String(label || "").toLowerCase().replace(/[\s-]+/g, "").replace(/\d+/g, m => String(parseInt(m, 10)));
}

// ── Reordering ─────────────────────────────────────────────────────────────
export function moveItem(list, from, to) {
  const arr = (list || []).slice();
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
}

// Reordering itinerary days swaps CONTENT between slots: the calendar date
// belongs to the slot (Day 2 is always the 2nd date), and a plain "Day N"
// label is renumbered to match its new position. A custom label
// ("Arrival day") is left alone.
export function reorderItineraryDays(days, from, to) {
  const list = days || [];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
  const slotDates = list.map(d => d.date || "");
  return moveItem(list, from, to).map((d, i) => {
    const m = /^(\s*day\s*-?\s*)(0*)(\d+)\s*$/i.exec(d.dayLabel || "");
    const n = i + 1;
    const label = m ? `${m[1]}${m[2].length > 0 ? String(n).padStart(2, "0") : String(n)}` : d.dayLabel;
    return { ...d, date: slotDates[i], dayLabel: label };
  });
}

// ── Hotel rows ─────────────────────────────────────────────────────────────
export function blankHotelRow(base = {}) {
  return {
    id: `h${Date.now()}${Math.floor(Math.random() * 1000)}`,
    dayLabel: base.dayLabel || "", date: base.date || "",
    hotelName: "", rooms: "", breakfast: "", lunch: "", dinner: "",
    source: "manual",
  };
}

// The hotel rows for a Tour File. Before anyone has used the new tab,
// `hotelRows` doesn't exist yet and the old per-day hotelName/rooms are
// shown as legacy rows -- with meals left BLANK on purpose: the old
// per-day mealPlan was copied raw from Cost Sheet ("B/L-800/D", i.e.
// internal costing), which must never surface as a meal plan.
export function getHotelRows(te) {
  if (te && Array.isArray(te.hotelRows)) return te.hotelRows;
  return (te?.days || []).filter(d => d.hotelName || d.rooms).map(d => ({
    id: `legacy-${d.id}`, dayLabel: d.dayLabel || "", date: d.date || "",
    hotelName: d.hotelName || "", rooms: d.rooms || "",
    breakfast: "", lunch: "", dinner: "", source: "legacy",
  }));
}

// Does a hotel row belong to a Tour Info itinerary day? By date when both
// have one, otherwise by (normalised) day label.
export function rowMatchesDay(row, day) {
  if (!row || !day) return false;
  if (row.date && day.date) return row.date === day.date;
  if (row.dayLabel && day.dayLabel) return normalizeDayLabel(row.dayLabel) === normalizeDayLabel(day.dayLabel);
  return false;
}

// Where the group sleeps that night: the LAST named hotel row for the day
// (a day with two hotels ends at the second).
export function getOvernightHotel(te, day) {
  // Before the new Hotels + Meals tab has ever been used, the day itself
  // still carries its hotel -- read it directly (also covers old days with
  // neither a date nor a label to match a row against).
  if (!Array.isArray(te?.hotelRows)) return day?.hotelName || "";
  const matches = getHotelRows(te).filter(r => rowMatchesDay(r, day) && r.hotelName);
  return matches.length ? matches[matches.length - 1].hotelName : "";
}

// Hotel rows to show on Ground View for one calendar date. A row with its
// own date matches on that alone; a row with no date falls back to the
// itinerary day's label.
export function hotelRowsForDate(te, dateStr, dayInfo) {
  return getHotelRows(te).filter(r =>
    r.date ? r.date === dateStr
      : !!(dayInfo && r.dayLabel && normalizeDayLabel(r.dayLabel) === normalizeDayLabel(dayInfo.dayLabel)));
}

// "Hotel A (5 Twin); Hotel B" -- Movement Chart's Rooming column.
export function roomingSummary(te) {
  const seen = new Set();
  getHotelRows(te).filter(r => r.hotelName).forEach(r => seen.add(`${r.hotelName}${r.rooms ? " (" + r.rooms + ")" : ""}`));
  return [...seen].join("; ");
}

// ── Quotation -> hotel rows ────────────────────────────────────────────────
// A final quotation is the source of truth for each day's meals (the user
// edits breakfast/lunch/dinner there before saving) and hotels. Its hotels
// are per STAY (place + nights), so they're expanded across days: a 2-night
// stay covers the next two days in order. The departure day, past the last
// night, has no hotel but keeps its meals. Rooming does not exist in a
// quotation at all, so it is always left for the user (and kept on re-sync).
export function pickQuotationSourceVersion(versions) {
  const list = versions || [];
  const fin = list.find(v => v.isFinal);
  if (fin) return { version: fin, isFinal: true };
  return list.length ? { version: list[list.length - 1], isFinal: false } : null;
}

export function quotationToHotelRows(quotation, travelDate) {
  const itin = quotation?.itinerary || [];
  const hotelByDay = [];
  (quotation?.hotels || []).forEach(h => {
    const n = parseInt(h.nights) || 0;
    for (let k = 0; k < n; k++) hotelByDay.push(h.hotel || "");
  });
  return itin.map((d, i) => ({
    id: `qt-${i}`,
    dayLabel: d.day || `Day ${i + 1}`,
    date: d.date || addDaysToDateStr(travelDate, i),
    hotelName: hotelByDay[i] || "",
    rooms: "",
    breakfast: d.bf || "", lunch: d.lunch || "", dinner: d.dinner || "",
    source: "quotation",
  }));
}

function sameDay(a, b) {
  if (a.date && b.date) return a.date === b.date;
  return !!(a.dayLabel && b.dayLabel && normalizeDayLabel(a.dayLabel) === normalizeDayLabel(b.dayLabel));
}

// Re-sync: quotation-sourced and legacy rows are replaced; rows added by
// hand are kept (placed after the last row of their day); rooming already
// typed against a day is carried onto the new row for that day, preferring
// the same hotel when a day has several.
export function mergeQuotationHotelRows(existingRows, freshRows) {
  const existing = existingRows || [];
  const manual = existing.filter(r => r.source === "manual");
  const replaced = existing.filter(r => r.source !== "manual");
  const roomsFor = (row) => {
    const sameDayRows = replaced.filter(o => o.rooms && sameDay(o, row));
    const sameHotel = sameDayRows.find(o => (o.hotelName || "").trim().toLowerCase() === (row.hotelName || "").trim().toLowerCase());
    return (sameHotel || sameDayRows[0])?.rooms || "";
  };
  const placed = new Set();
  const out = [];
  (freshRows || []).forEach(row => {
    out.push({ ...row, rooms: roomsFor(row) });
    manual.forEach(m => { if (!placed.has(m.id) && sameDay(m, row)) { out.push(m); placed.add(m.id); } });
  });
  manual.forEach(m => { if (!placed.has(m.id)) out.push(m); });
  return out;
}

// ── Date-windowed services ─────────────────────────────────────────────────
// A service (facilitator, local handler, transporter, other service) is on
// the ground for [startDate, endDate]. Direct decision: NO dates means it
// does NOT appear on Ground View -- existing entries are amended by hand.
// Only one date given = that single day.
export function serviceActiveOnDate(entry, dateStr) {
  if (!entry || !dateStr) return false;
  const s = entry.startDate || entry.endDate;
  const e = entry.endDate || entry.startDate;
  if (!s || !e) return false;
  return s <= dateStr && dateStr <= e;
}

// ── Flights / trains ───────────────────────────────────────────────────────
export function blankFlightLeg(date = "") {
  return { date, type: "Flight", number: "", from: "", fromTime: "", to: "", toTime: "" };
}

export function isLegFilled(leg) {
  return !!(leg && (leg.number || leg.from || leg.to || leg.fromTime || leg.toTime));
}

// "AI 101 · DEL 06:30 → BKK 12:10" -- also what the Movement Chart's
// Arr./Dep. Flight columns show.
export function formatFlightLeg(leg) {
  if (!leg) return "";
  const route = [
    leg.from ? `${leg.from}${leg.fromTime ? " " + leg.fromTime : ""}` : (leg.fromTime || ""),
    leg.to ? `${leg.to}${leg.toTime ? " " + leg.toTime : ""}` : (leg.toTime || ""),
  ].filter(Boolean).join(" → ");
  return [leg.number, route].filter(Boolean).join(" · ");
}

// ── Rich text ──────────────────────────────────────────────────────────────
const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI", "A", "H1", "H2", "H3", "H4", "BLOCKQUOTE"]);
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT"]);
const SAFE_STYLE_PROPS = new Set(["background-color", "color", "font-weight", "font-style", "text-decoration"]);

function cleanStyle(style) {
  return String(style || "").split(";").map(s => s.trim()).filter(Boolean).filter(decl => {
    const i = decl.indexOf(":");
    if (i < 0) return false;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().toLowerCase();
    return SAFE_STYLE_PROPS.has(prop) && !/url\(|expression|javascript:|@import|\\/.test(val);
  }).join("; ");
}

// Strips everything but basic formatting from rich-text HTML before it is
// rendered with dangerouslySetInnerHTML (Ground View). Allow-list based:
// unknown tags are unwrapped (text kept), script-like elements are dropped
// with their content, every on* attribute and non-http(s)/mailto/tel link
// is removed.
export function sanitizeRichHtml(html) {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node) => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 8) { node.removeChild(child); return; }
      if (child.nodeType !== 1) return;
      const tag = child.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) { node.removeChild(child); return; }
      walk(child);
      if (!ALLOWED_TAGS.has(tag)) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }
      Array.from(child.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name === "style") {
          const cleaned = cleanStyle(attr.value);
          if (cleaned) child.setAttribute("style", cleaned); else child.removeAttribute("style");
        } else if (name === "href" && tag === "A") {
          if (!/^(https?:|mailto:|tel:)/i.test(attr.value.trim())) child.removeAttribute("href");
          else { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
        } else {
          child.removeAttribute(attr.name);
        }
      });
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function richHtmlHasContent(html) {
  return !!String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

// ── Vendor or custom name ──────────────────────────────────────────────────
// A transporter / facilitator / local handler row is either linked to a
// vendor in Master Data (vendorId) or carries a one-off typed name
// (customName) for someone who isn't in the vendor list. Every place that
// shows a service name goes through this one function.
export function entryServiceName(entry, vendors) {
  if (!entry) return "";
  const v = entry.vendorId ? (vendors || []).find(x => x.id === entry.vendorId) : null;
  if (v?.name) return v.name;
  return String(entry.customName || "").trim();
}

// ── Everything on the ground on one date ───────────────────────────────────
// The "all Tour Info goes to Ground View according to dates" rule, in one
// place. `te` is a tour_execution record, `vendors` the vendor list.
export function getServicesForDate(te, vendors, dateStr) {
  const vendorEntries = (list) => (list || [])
    .filter(e => serviceActiveOnDate(e, dateStr))
    .map(e => ({ name: entryServiceName(e, vendors), sector: e.sector || "", notes: e.notes || "" }))
    .filter(e => e.name);
  const legOn = (leg) => (isLegFilled(leg) && leg.date === dateStr ? leg : null);
  return {
    facilitators: vendorEntries(te?.facilitators),
    localHandlers: vendorEntries(te?.localHandlers),
    transporters: vendorEntries(te?.transporters),
    legs: (te?.flights || []).filter(l => isLegFilled(l) && l.date === dateStr),
    arrival: legOn(te?.arrFlight),
    departure: legOn(te?.depFlight),
    other: (te?.otherServices || []).filter(s => serviceActiveOnDate(s, dateStr) && richHtmlHasContent(s.detailsHtml)),
  };
}
