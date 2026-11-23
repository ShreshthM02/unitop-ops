// Cost Sheet pricing maths, as pure functions.
//
// This used to live inside the CostSheet component. It is separate now so
// the on-screen sheet, the PDF and the Excel workbook all price from the
// exact same code, and so it can be tested (and compared against the Excel
// formulas) without rendering anything.
//
// Rounding is deliberate and must not change: the intermediate per-pax
// figures are rounded only for DISPLAY, while subtotal / tax / markup run on
// the unrounded values, exactly as the app has always done.

const n = (v) => parseFloat(v) || 0;

// Round UP to a whole unit, ignoring floating-point dust. Plain Math.ceil
// turns an exact 495 that arrives as 495.00000000000006 into 496; Excel's
// CEILING ignores such dust, so the app must as well to agree with the sheet.
export const ceilFX = (x) => Math.ceil(Math.round(x * 1e6) / 1e6);


// ── Per-slab cost lines ─────────────────────────────────────────────────────
// A transport / local handler / extra line carries ONE cost ("same for every
// slab") and, optionally, a different figure for particular slabs:
//   line.cells = { [slabId]: "12000" }  -> that slab uses its own figure
//   line.cells = { [slabId]: "x" }      -> the line does not apply to that slab
// A slab with no entry uses line.cost. Lines saved before this existed have
// no `cells`: local handlers and extras applied to every slab, and transports
// applied only to the slabs listed in `line.slabs`. Both shapes price the same.
export const NOT_APPLIED = "x";
// A line quoted in a foreign currency carries fx = { cur, roe } (roe = rupees
// for one unit of that currency). Every figure typed on that line is then in
// that currency; this is the ONE place it becomes rupees, so the screen, the
// quotation maths, the PDF and the Excel all agree. No fx = rupees, as before.
export const fxRate = (line) => (line && line.fx && n(line.fx.roe) > 0 ? n(line.fx.roe) : 1);
export const hasFx = (line) => !!(line && line.fx && line.fx.cur);
export function lineCostFor(line, slabId, kind) {
  const l = line || {};
  const k = fxRate(l);
  const hasCells = l.cells && typeof l.cells === "object";
  if (!hasCells) {
    if (kind === "transport" && !(l.slabs || []).includes(slabId)) return null;
    return n(l.cost) * k;
  }
  const own = l.cells[slabId];
  if (own === NOT_APPLIED) return null;
  if (own !== undefined && own !== null && String(own).trim() !== "") return n(own) * k;
  return n(l.cost) * k;
}
// Turn an old transport (explicit list of ticked slabs) into the cells shape,
// so the matrix can show and edit it. Prices stay exactly the same.
export function withCells(line, slabIds, kind) {
  if (!line || (line.cells && typeof line.cells === "object")) return line;
  const cells = {};
  if (kind === "transport") (slabIds || []).forEach((id) => { if (!(line.slabs || []).includes(id)) cells[id] = NOT_APPLIED; });
  const { slabs: _old, ...rest } = line;
  return { ...rest, cells };
}
// The ids of the slabs a line applies to (what the old `slabs` list held).
export function appliedSlabIds(line, slabIds, kind) {
  return (slabIds || []).filter((id) => lineCostFor(line, id, kind) !== null);
}

// ── Matrix read-out (PDF / Story view) ──────────────────────────────────────
// For one cost line, walk the slab columns left to right and join neighbouring
// slabs that show the same whole cost and the same paying pax (and the same
// kind of column), so a row reads as a few blocks instead of one cell per slab.
//   cols: [{ id, pax, tl }]   kind: "transport" | "local" | "extra"
// Each block: { span, total, pp, custom, none } where total is the figure as
// quoted by the supplier (whole group cost, or per-pax cost for a per-pax
// line) and pp is that line's cost per paying pax in the slab.
export function matrixSpans(line, kind, cols) {
  const isPP = kind === "local" ? line.mode === "pp" : kind === "extra" ? line.mode === "PP" : false;
  const cell = (c) => {
    const total = lineCostFor(line, c.id, kind);
    if (total === null) return { none: true, total: null, pp: null, custom: false, key: "x|" + !!c.tl };
    const pax = n(c.pax);
    const pp = isPP ? total : (pax > 0 ? total / pax : 0);
    const own = line.cells && line.cells[c.id];
    const custom = own !== undefined && own !== null && String(own).trim() !== "" && own !== NOT_APPLIED;
    return { none: false, total, pp, pax, custom, isPP, orig: total / fxRate(line), key: [total, isPP ? "pp" : pax, custom, !!c.tl].join("|") };
  };
  const out = [];
  let i = 0;
  while (i < cols.length) {
    const a = cell(cols[i]);
    let j = i + 1;
    while (j < cols.length && cell(cols[j]).key === a.key) j++;
    out.push({ span: j - i, ...a });
    i = j;
  }
  return out;
}

// The single supplement's own build-up (it is one figure, not per slab), in the
// same steps as a slab's price: GST, markup, then rupees into the quote currency.
export function ssBuild(totSS, gst, markup, roe) {
  const sub = n(totSS);
  const tax = Math.round(sub * gst / 100);
  const afterTax = sub + tax;
  const markupAmt = Math.round(afterTax * markup / 100);
  const sellingINR = afterTax + markupAmt;
  // Same expression the quotation has always used, so the figure cannot drift.
  const finalFX = ceilFX(((sub + sub * gst / 100) * (1 + markup / 100)) / roe);
  return { sub: Math.round(sub), tax, afterTax: Math.round(afterTax), markupAmt, sellingINR: Math.round(sellingINR), finalFX };
}

export function computeTotals({ days = [], localHandlers = [], monuments = [], monExtra = "" }) {
  const totMeal = days.reduce((s, d) => s + n(d.mealCost), 0);
  const totHotel = days.reduce((s, d) => s + n(d.hotelNetPP), 0);
  const daySS = days.reduce((s, d) => s + n(d.singleSupp), 0);
  const handlerSS = localHandlers.reduce((s, h) => s + n(h.singleSupp) * fxRate(h), 0);
  const totSS = daySS + handlerSS;
  const monTotal = monuments.filter((m) => m.include).reduce((s, m) => s + n(m.fee), 0) + n(monExtra);
  return { totMeal, totHotel, daySS, handlerSS, totSS, monTotal };
}

export function makeCalculators(s) {
  const {
    transports = [], tlMode, tlCost, miscMode, miscCost, monMode, localHandlers = [], extras = [],
    gst, markup, roe,
  } = s;
  const { totMeal, totHotel, totSS, monTotal } = s.totals || computeTotals(s);

  const calcSlab = (slab) => {
    const tptTotal = transports.reduce((a, t) => a + (lineCostFor(t, slab.id, "transport") || 0), 0);
    const tptPP = slab.foc > 0 ? tptTotal / slab.foc : 0;
    const tlPP = tlMode === "pp" ? n(tlCost) : (slab.foc > 0 ? n(tlCost) / slab.foc : 0);
    const miscPP = miscMode === "pp" ? n(miscCost) : (slab.foc > 0 ? n(miscCost) / slab.foc : 0);
    const monPP = monMode === "pp" ? monTotal : (slab.foc > 0 ? monTotal / slab.foc : 0);
    const localPP = localHandlers.reduce((a, h) => { const c = lineCostFor(h, slab.id, "local"); return a + (c === null ? 0 : h.mode === "pp" ? c : (slab.foc > 0 ? c / slab.foc : 0)); }, 0);
    // "PP" is already per-pax; Lumpsum / Per Vehicle / Per Group are one total
    // for the group, divided across the paying pax like local handler lumpsums.
    const extrasPP = extras.reduce((a, e) => { const c = lineCostFor(e, slab.id, "extra"); return a + (c === null ? 0 : e.mode === "PP" ? c : (slab.foc > 0 ? c / slab.foc : 0)); }, 0);

    const sub = totHotel + totMeal + tptPP + tlPP + miscPP + monPP + localPP + extrasPP;
    const tax = Math.round(sub * gst / 100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup / 100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = ceilFX(sellingINR / roe);
    const ssFX = ceilFX(((totSS + totSS * gst / 100) * (1 + markup / 100)) / roe);
    return {
      tptTotal, tptPP: Math.round(tptPP), tlPP: Math.round(tlPP), miscPP: Math.round(miscPP), monPP: Math.round(monPP),
      localPP: Math.round(localPP), extrasPP: Math.round(extrasPP), sub: Math.round(sub), tax, afterTax: Math.round(afterTax),
      markupAmt, sellingINR: Math.round(sellingINR), finalFX, ssFX,
      subRaw: sub, // unrounded; T/L slabs build on this, never on the rounded display figure
    };
  };

  // A Tour Leader slab is a normal slab (its own paying pax as the divisor)
  // plus the T/L surcharge: the foreign agent's own escort has no FOC cover
  // in a small group, so their costs are spread over the paying guests.
  const calcTlSlab = (tl) => {
    const base = calcSlab({ id: tl.id, foc: n(tl.pax) });
    const surchargeTotal = Object.entries(tl.costs || {}).reduce((a, [k, v]) => a + ((tl.includes || {})[k] ? n(v) : 0), 0);
    const surchargePP = n(tl.pax) > 0 ? surchargeTotal / n(tl.pax) : 0;
    const sub = base.subRaw + surchargePP;
    const tax = Math.round(sub * gst / 100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup / 100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = ceilFX(sellingINR / roe);
    return { ...base, surchargeTotal: Math.round(surchargeTotal), surchargePP: Math.round(surchargePP), sub: Math.round(sub), tax, afterTax: Math.round(afterTax), markupAmt, sellingINR: Math.round(sellingINR), finalFX };
  };

  return { calcSlab, calcTlSlab };
}

// ── Export read-outs shared by the PDF and the Excel ────────────────────────

// The parts a Tour Leader's own cost is made of, in display order. Used by the
// matrix, the PDF and the Excel so the bifurcation reads the same everywhere.
export const TL_PARTS = [["hotel", "Hotel"], ["singleSupp", "Single supplement"], ["meals", "Extra meals"], ["transport", "Transport"], ["monument", "Monument"], ["localHandler", "Local handler"], ["extras", "Extras"]];
// One T/L slab's own costs split by part: [{ key, label, total, perPax }] (only parts that are included and above zero).
export function tlBreakdown(tl) {
  const pax = n(tl && tl.pax);
  return TL_PARTS.map(([key, label]) => {
    const total = (tl && tl.includes && tl.includes[key]) ? n(tl.costs && tl.costs[key]) : 0;
    return { key, label, total, perPax: pax > 0 ? total / pax : 0 };
  }).filter((x) => x.total > 0);
}

const rs = (v) => "₹" + Math.round(v).toLocaleString("en-IN");
const fxAmt = (cur, v) => cur + " " + (Math.round(v * 100) / 100).toLocaleString("en-IN");

// One short sentence for the "What was quoted" column: the figure as the
// supplier quoted it, who it is for, and any foreign-currency conversion.
//   cols: [{ id, label, pax, tl }]   kind: "transport" | "local" | "extra"
export function lineBasis(line, kind, cols) {
  const l = line || {};
  const isPP = kind === "local" ? l.mode === "pp" : kind === "extra" ? l.mode === "PP" : false;
  const fx = hasFx(l) && fxRate(l) !== 1 ? l.fx : null;
  const k = fxRate(l);
  const show = (amt) => (fx ? fxAmt(fx.cur, amt) : rs(amt)) + (isPP ? " per pax" : " group");
  const parts = [];
  const base = n(l.cost);
  const cells = l.cells && typeof l.cells === "object" ? l.cells : {};
  const own = (c) => { const v = cells[c.id]; return v !== undefined && v !== null && String(v).trim() !== "" && v !== NOT_APPLIED; };
  const out = cols.filter((c) => lineCostFor(l, c.id, kind) === null);
  const applied = cols.filter((c) => lineCostFor(l, c.id, kind) !== null);
  if (base > 0 || !applied.some(own)) parts.push(fx ? `${show(base)} @ ₹${l.fx.roe} = ${rs(base * k)}${isPP ? " pp" : ""}` : show(base));
  // slab-specific figures, one phrase per distinct figure
  const byAmt = new Map();
  applied.filter(own).forEach((c) => { const a = n(cells[c.id]); if (!byAmt.has(a)) byAmt.set(a, []); byAmt.get(a).push(c.label || "slab"); });
  byAmt.forEach((names, a) => parts.push(`${fx ? fxAmt(fx.cur, a) : rs(a)} for ${names.join(", ")}`));
  if (out.length && out.length < cols.length) parts.push(`not for ${out.map((c) => c.label || "slab").join(", ")}`);
  else if (out.length === cols.length && cols.length) parts.push("not applied to any slab");
  return parts.filter(Boolean).join(" · ");
}

// What to look at before a cost sheet goes out. Pure: reads the saved figures
// and the app's own results. Each item is { ok, text }; an "ok" line means a
// whole group of checks passed.
export function costSheetChecks(snap, { calcSlab, calcTlSlab }) {
  const { days = [], slabs = [], tlSlabs = [], transports = [], localHandlers = [], extras = [], monuments = [], monExtra = "", roe } = snap;
  const cols = [
    ...slabs.map((s) => ({ id: s.id, label: s.label, pax: n(s.foc), tl: false, calc: calcSlab(s) })),
    ...tlSlabs.map((t) => ({ id: t.id, label: t.label, pax: n(t.pax), tl: true, calc: calcTlSlab(t), obj: t })),
  ];
  const out = [];
  const group = (okText, warns) => { if (warns.length) warns.forEach((w) => out.push({ ok: false, text: w })); else if (okText) out.push({ ok: true, text: okText }); };

  // Slabs
  const slabWarns = [];
  cols.forEach((c) => {
    const nm = c.label || "A slab";
    if (!(c.pax > 0)) slabWarns.push(`${nm} has no paying pax`);
    else if (!(c.calc.tptPP > 0)) slabWarns.push(`${nm} has no transport cost`);
    else if (!(c.calc.finalFX > 0)) slabWarns.push(`${nm} has no final price`);
    if (c.tl && c.pax > 0 && !(c.calc.surchargeTotal > 0)) slabWarns.push(`${nm} is a T/L slab but no tour leader cost is included`);
  });
  if (!cols.length) slabWarns.push("No slabs added");
  group("Every slab has paying pax, transport and a final price", slabWarns);

  // Cost lines
  const lineWarns = [];
  const lines = [["transport", transports, (t) => t.sector || t.vehicleType || "Transport"], ["local", localHandlers, (h) => h.sector || "Local handler"], ["extra", extras, (e) => e.description || "Extra service"]];
  lines.forEach(([kind, list, nameOf]) => list.forEach((l) => {
    const nm = nameOf(l);
    const apps = cols.filter((c) => lineCostFor(l, c.id, kind) !== null);
    const any = n(l.cost) > 0 || cols.some((c) => { const v = l.cells && l.cells[c.id]; return v && v !== NOT_APPLIED && n(v) > 0; });
    if (!any) lineWarns.push(`${nm} has no cost`);
    else if (!apps.length) lineWarns.push(`${nm} is not applied to any slab`);
    else if (apps.length < cols.length && kind !== "transport") lineWarns.push(`${nm} is left out of ${cols.filter((c) => !apps.includes(c)).map((c) => c.label || "a slab").join(", ")}. Intended?`);
  }));
  group(lines.some(([, l]) => l.length) ? "Every cost line has a figure and is applied to a slab" : "", lineWarns);

  // Foreign currency
  const fxLines = [...transports, ...localHandlers, ...extras].filter((l) => hasFx(l));
  const fxWarns = fxLines.filter((l) => !(n(l.fx.roe) > 0)).map((l) => `${l.sector || l.description || "A cost line"} is quoted in ${l.fx.cur} but has no ROE`);
  group(fxLines.length ? "ROE is set on every foreign-currency line" : "", fxWarns);

  // Itinerary
  const dayWarns = [];
  days.forEach((d, i) => {
    const hotel = String(d.hotel || "").trim();
    const isLast = i === days.length - 1;
    const named = hotel && !/^departure$/i.test(hotel);
    if (named && !(n(d.hotelNetPP) > 0)) dayWarns.push(`${d.day || "Day " + (i + 1)}: ${hotel} has no net rate`);
    else if (named && !(n(d.singleSupp) > 0)) dayWarns.push(`${d.day || "Day " + (i + 1)}: ${hotel} has no single supplement`);
    else if (!named && !isLast && !(n(d.hotelNetPP) > 0)) dayWarns.push(`${d.day || "Day " + (i + 1)} has no hotel`);
  });
  group(days.length ? "Hotel rate and single supplement filled for every night" : "", dayWarns);

  // Monuments
  if (monuments.length && !monuments.some((m) => m.include) && !(n(monExtra) > 0)) out.push({ ok: false, text: `${monuments.length} monument${monuments.length > 1 ? "s are" : " is"} listed but none is included in the price` });

  // Settings and sanity
  const sane = [];
  if (!(n(roe) > 0)) sane.push("ROE is not set");
  const grp = cols.filter((c) => !c.tl && c.pax > 0 && c.calc.finalFX > 0).sort((a, b) => a.pax - b.pax);
  for (let i = 1; i < grp.length; i++) if (grp[i].calc.finalFX > grp[i - 1].calc.finalFX) { sane.push(`${grp[i].label} costs more per pax than the smaller ${grp[i - 1].label}`); break; }
  group(grp.length > 1 ? "Prices fall as group size grows" : "", sane);
  return out;
}
