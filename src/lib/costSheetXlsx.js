import { lineCostFor, hasFx, NOT_APPLIED, ssBuild, TL_PARTS } from "./costSheetCalc.js";
// Cost Sheet -> Excel workbook.
//
// A WORKING spreadsheet that reads like the app and like the PDF. Two tabs:
//
//   "Cost Sheet"  Slab columns are frozen at the top. Below: settings, then the
//                 grid you type into (one row per cost, one column per slab,
//                 "same for all" in column C, x = leave a slab out), then the
//                 price per paying pax built up row by row to the final price,
//                 then live checks.
//   "Itinerary"   Day-wise hotels and meals, and the monuments list.
//
// Design rules:
//   1. The grid is the app's own Pricing Matrix. A cell holds a figure in the
//      row's own currency (rupees unless Currency/ROE are filled), or x. There
//      is no "Applies to" text to mistype.
//   2. Every price row is a short formula over the grid, in the app's own
//      order (see costSheetCalc.js). The grey "Matches app?" row shows on
//      opening that the sheet agrees with the app to the rupee.
//   3. Everything you may type in is yellow and unlocked; everything else is a
//      locked formula (protected WITHOUT a password). Amber = a figure typed
//      over the "same for all" value for one slab.
//   4. Never shows #DIV/0!: a slab with no paying pax stays blank.

const NAVY = "FF0D1B2A", ACCENT = "FFC0392B", LIGHT = "FFF3F4F6", WHITE = "FFFFFFFF", GREY = "FF6B7280";
const BORDER = "FFD1D5DB", INPUT_BG = "FFFFFDE7", TL_BROWN = "FF7D6608", TL_TINT = "FFFFF8E1";
const GOOD = "FF047857", WARN_BG = "FFFEF3C7", STEP_BLUE = "FF1D4ED8", SS_TINT = "FFF4F1FB", BAND = "FFE5E7EB";

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const colLetter = (c) => { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const addr = (r, c) => `${colLetter(c)}${r}`;
const n = (v) => parseFloat(v) || 0;

// "2026-07-24" -> a real Excel date; anything else -> null (caller keeps its text).
export function excelDate(iso) {
  const m = typeof iso === "string" && iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

const MAX_SLABS = 40;   // safety cap on exported slab columns
const SPARE = 3;        // spare input rows under every list
const SPARE_COLS = 3;   // spare slab columns, ready for a new slab

export async function buildCostSheetWorkbook(ExcelJS, d) {
  const {
    query = {}, currentVersionLabel, savedTimestamp, clientAgentName, assignedStaffName,
    gst, markup, roe, currency, tlMode, tlCost, miscMode, miscCost, monMode, monExtra,
    monuments = [], days = [], transports = [], localHandlers = [], extras = [], slabs = [], tlSlabs = [],
    totals, calcSlab, calcTlSlab, formatDateSlash = (x) => x,
  } = d;
  const { totMeal, totHotel, daySS, handlerSS, totSS, monTotal } = totals;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Unitop Ops";
  wb.created = new Date();
  wb.title = `Cost Sheet ${query.tourFileId || query.id || ""}`.trim();
  wb.subject = query.groupName || query.clientName || "";
  wb.calcProperties = { fullCalcOnLoad: true };
  const sh = wb.addWorksheet("Cost Sheet", { properties: { tabColor: { argb: NAVY } } });
  const it = wb.addWorksheet("Itinerary", { properties: { tabColor: { argb: STEP_BLUE } } });

  const MONEY = "#,##0";
  const names = [];
  const colRange = (col, a, b, sheet = "") => `${sheet}$${col}$${a}:$${col}$${b}`;

  // ── cell helpers (work on any sheet) ──
  const styleInput = (cell, fmt) => { cell.fill = solid(INPUT_BG); cell.protection = { locked: false }; cell.border = { bottom: { style: "hair", color: { argb: BORDER } } }; if (fmt) cell.numFmt = fmt; };
  const inputCell = (ws, r, c, val, fmt, validation, c2 = c) => {
    const cell = ws.getCell(r, c);
    for (let i = c; i <= c2; i++) styleInput(ws.getCell(r, i), fmt);
    if (c2 > c) ws.mergeCells(r, c, r, c2);
    cell.value = val === undefined ? null : val;
    if (validation) cell.dataValidation = validation;
    return cell;
  };
  const formulaCell = (ws, r, c, formula, result, fmt, font = {}) => {
    const cell = ws.getCell(r, c);
    cell.value = { formula, result: typeof result === "string" ? result : (Number.isFinite(result) ? result : 0) };
    if (fmt) cell.numFmt = fmt;
    cell.font = { size: 10, ...font };
    return cell;
  };
  const band = (ws, r, text, ncols, fill = NAVY) => {
    ws.mergeCells(r, 1, r, ncols);
    const c = ws.getCell(r, 1); c.value = text; c.font = { bold: true, size: 11, color: { argb: WHITE } }; c.alignment = { vertical: "middle" };
    for (let i = 1; i <= ncols; i++) ws.getCell(r, i).fill = solid(fill);
    ws.getRow(r).height = 20;
  };
  const note = (ws, r, text, ncols, height = 28) => {
    ws.mergeCells(r, 1, r, ncols);
    const c = ws.getCell(r, 1); c.value = text; c.font = { italic: true, size: 9, color: { argb: GREY } }; c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = height;
  };
  const label = (ws, r, c, text, opts = {}) => { const cell = ws.getCell(r, c); cell.value = text; cell.font = { bold: true, size: 9, color: { argb: GREY }, ...opts }; cell.alignment = { wrapText: true, vertical: "middle" }; };
  const head = (ws, r, c, text, fill = LIGHT, color = "FF374151") => { const cell = ws.getCell(r, c); cell.value = text; cell.fill = solid(fill); cell.font = { bold: true, size: 9, color: { argb: color } }; cell.alignment = { vertical: "middle", wrapText: true, horizontal: c > 5 ? "center" : "left" }; cell.border = { bottom: { style: "thin", color: { argb: BORDER } } }; };
  const listValidation = (items) => ({ type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`], showErrorMessage: true, errorStyle: "stop", errorTitle: "Pick from the list", error: `Choose one of: ${items.join(", ")}` });
  const numValidation = (min = 0) => ({ type: "decimal", operator: "greaterThanOrEqual", formulae: [min], allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: "Number needed", error: `Enter a number (${min} or more).` });
  const UNIT = listValidation(["pp", "group"]);
  const YES_NO = listValidation(["Y", "N"]);

  // ═══ Slab columns ═══
  const slabEntries = [
    ...slabs.map((s, i) => ({ src: s, tl: false, name: String(s.label || "").trim() || `Slab ${i + 1}` })),
    ...tlSlabs.map((s, i) => ({ src: s, tl: true, name: String(s.label || "").trim() || `T/L ${i + 1}` })),
  ].slice(0, MAX_SLABS);
  const NS = slabEntries.length + SPARE_COLS;
  const FC = 6, LC = FC + NS - 1, SSC = LC + 1, NCOLS = SSC;

  // ═══ Itinerary tab geometry ═══
  const IT_TOT = 3, IT_HDR = 4, IT_FIRST = 5, IT_ROWS = days.length + SPARE, IT_LAST = IT_FIRST + IT_ROWS - 1;
  const MON_BAND = IT_LAST + 3, MON_EXTRA = MON_BAND + 1, MON_TOT = MON_BAND + 2, MON_HDR = MON_BAND + 3, MON_FIRST = MON_BAND + 4, MON_ROWS = monuments.length + SPARE, MON_LAST = MON_FIRST + MON_ROWS - 1;

  // ═══ Cost Sheet tab geometry ═══
  const R = { name: 4, pax: 5, veh: 6, tlOwn: 7 };
  const SET = 9; // settings band
  const rGst = SET + 1, rMarkup = SET + 2, rRoe = SET + 3, rCur = SET + 4, rClient = SET + 5, rStaff = SET + 6;
  const QB = rStaff + 2; // grid band
  const QHDR = QB + 2;
  let cur = QHDR + 1;
  const group = (rows) => { const g = { band: cur, first: cur + 1, rows, last: cur + rows }; cur = g.last + 1; return g; };
  const TPT = group(transports.length + SPARE);
  const LH = group(localHandlers.length + SPARE);
  const EXS = group(extras.length + SPARE);
  const FIX = { band: cur, tf: cur + 1, misc: cur + 2, mon: cur + 3 }; cur = FIX.mon + 1;
  const TLB = { band: cur + 1, first: cur + 2, last: cur + 1 + TL_PARTS.length, total: cur + 2 + TL_PARTS.length }; cur = TLB.total;
  const PB = cur + 1; // price band
  const P = { hotels: PB + 1, meals: PB + 2, tpt: PB + 3, lh: PB + 4, ex: PB + 5, tf: PB + 6, misc: PB + 7, mon: PB + 8, tls: PB + 9, sub: PB + 10, gst: PB + 11, after: PB + 12, mk: PB + 13, sell: PB + 14, final: PB + 15, app: PB + 16, match: PB + 17 };
  const CB = P.match + 2; // checks band

  const gstA = `$C$${rGst}`, markupA = `$C$${rMarkup}`, roeA = `$C$${rRoe}`;
  names.push(["GST_pct", gstA], ["Markup_pct", markupA], ["ROE", roeA], ["Currency", `$C$${rCur}`]);
  const rate = (g) => `($E$${g.first}:$E$${g.last}+($E$${g.first}:$E$${g.last}=0))`;
  const unitPP = (g) => `--(LOWER(TRIM($B$${g.first}:$B$${g.last}))="pp")`;
  const unitGrp = (g) => `--(LOWER(TRIM($B$${g.first}:$B$${g.last}))<>"pp")`;

  // ═══════════ Title, frozen slab header ═══════════
  sh.mergeCells(1, 1, 1, 5);
  const t = sh.getCell(1, 1); t.value = "COST SHEET"; t.font = { bold: true, size: 16, color: { argb: WHITE } }; t.alignment = { vertical: "middle" };
  sh.mergeCells(1, 6, 1, NCOLS);
  const ver = sh.getCell(1, 6); ver.value = `${query.groupName || query.clientName || ""}  •  ${query.destination || query.sector || ""}  •  Tour File ${query.tourFileId || query.id}  •  Version ${currentVersionLabel}, saved ${savedTimestamp}`;
  ver.font = { italic: true, size: 10, color: { argb: WHITE } }; ver.alignment = { vertical: "middle", horizontal: "right" };
  for (let i = 1; i <= NCOLS; i++) sh.getCell(1, i).fill = solid(NAVY);
  sh.getRow(1).height = 26;
  note(sh, 2, "Yellow cells are the only ones you type in. Each column is a slab (add one in a spare column). Each row is a cost: type its figure once in 'Same for all', or type a different figure under one slab (turns amber), or x to leave that slab out. Prices and checks recalculate as you type.", NCOLS, 26);
  note(sh, 3, "", NCOLS, 4);

  label(sh, R.name, 1, "Slab name (shown in the quotation)", { size: 10 });
  label(sh, R.pax, 1, "Paying pax (costs are divided by this)", { size: 10 });
  label(sh, R.veh, 1, "Vehicle", { size: 10 });
  label(sh, R.tlOwn, 1, "Tour leader's own cost, total (see the T/L block below)", { size: 10 });
  for (let r = R.name; r <= R.tlOwn; r++) { sh.getCell(r, 1).fill = solid(LIGHT); for (let c = 2; c <= 5; c++) sh.getCell(r, c).fill = solid(LIGHT); }
  sh.getCell(R.name, 2).value = "Slabs →"; sh.getCell(R.name, 2).font = { bold: true, size: 9, color: { argb: GREY } };
  const calcOf = [];
  for (let i = 0; i < NS; i++) {
    const c = FC + i, e = slabEntries[i] || null;
    const tlE = e && e.tl;
    const pax = e ? (e.tl ? n(e.src.pax) : Number(e.src.foc) || 0) : null;
    const vehicle = e ? (e.src.vehicle === "Others" ? e.src.vehicleOther : e.src.vehicle) || "" : "";
    const tlOwn = tlE ? Object.entries(e.src.costs || {}).reduce((a, [k, v]) => a + ((e.src.includes || {})[k] ? n(v) : 0), 0) : null;
    const nm = inputCell(sh, R.name, c, e ? e.name : "", undefined);
    nm.font = { bold: true, color: { argb: tlE ? TL_BROWN : "FF111827" } }; nm.alignment = { horizontal: "center", wrapText: true };
    inputCell(sh, R.pax, c, pax, "0", numValidation(0)).font = { bold: true };
    inputCell(sh, R.veh, c, vehicle).alignment = { horizontal: "center", wrapText: true };
    inputCell(sh, R.tlOwn, c, tlOwn, MONEY, numValidation(0));
    calcOf.push(e ? (e.tl ? calcTlSlab(e.src) : calcSlab(e.src)) : null);
  }
  const ssH = sh.getCell(R.name, SSC); ssH.value = "Single supp."; ssH.font = { bold: true, size: 10 }; ssH.alignment = { horizontal: "center", wrapText: true };
  sh.getCell(R.pax, SSC).value = "per single room"; sh.getCell(R.pax, SSC).font = { size: 8, italic: true, color: { argb: GREY } }; sh.getCell(R.pax, SSC).alignment = { horizontal: "center" };
  sh.getCell(R.veh, SSC).value = "not divided by pax"; sh.getCell(R.veh, SSC).font = { size: 8, italic: true, color: { argb: GREY } }; sh.getCell(R.veh, SSC).alignment = { horizontal: "center" };
  for (let r = R.name; r <= R.tlOwn; r++) sh.getCell(r, SSC).fill = solid(SS_TINT);
  sh.getRow(R.name).height = 30; sh.getRow(R.veh).height = 24;

  // ═══════════ Settings ═══════════
  band(sh, SET, "SETTINGS", NCOLS);
  [[rGst, "GST %", Number(gst) || 0, "0.0"], [rMarkup, "Markup %", Number(markup) || 0, "0.0"], [rRoe, "ROE (₹ per 1 unit of the quote currency)", Number(roe) || 0, "0.0"]].forEach(([r, l, v, f]) => {
    label(sh, r, 1, l, { size: 10 });
    inputCell(sh, r, 3, v, f, numValidation(0)).font = { bold: true, size: 12 };
  });
  label(sh, rCur, 1, "Quote currency", { size: 10 }); inputCell(sh, rCur, 3, currency || "US $").font = { bold: true, size: 12 };
  label(sh, rClient, 1, "Client / Foreign agent", { size: 10 }); inputCell(sh, rClient, 3, clientAgentName || "", undefined, undefined, 8);
  label(sh, rStaff, 1, "Assigned staff", { size: 10 }); inputCell(sh, rStaff, 3, assignedStaffName || "", undefined, undefined, 8);

  // ═══════════ The grid you type into ═══════════
  band(sh, QB, "WHAT WAS QUOTED   (₹ unless a currency is chosen)", NCOLS);
  note(sh, QB + 1, "Unit: pp = per paying pax, group = one total divided by each slab's paying pax. Currency + ROE: only for a cost quoted in a foreign currency, then the figures on that row are in it and are converted at that ROE (₹ per 1 unit). Single supp. on a Local Handler row is that handler's single-room supplement.", NCOLS, 30);
  ["Cost", "Unit", "Same for all", "Currency", "ROE ₹"].forEach((h, i) => head(sh, QHDR, i + 1, h, NAVY, WHITE));
  for (let i = 0; i < NS; i++) head(sh, QHDR, FC + i, slabEntries[i] ? slabEntries[i].name : "", NAVY, WHITE);
  head(sh, QHDR, SSC, "Single supp. ₹", NAVY, WHITE);
  sh.getRow(QHDR).height = 22;
  for (let i = 0; i < NS; i++) { const cell = sh.getCell(QHDR, FC + i); cell.value = { formula: `IF(${addr(R.name, FC + i)}="","",${addr(R.name, FC + i)})`, result: slabEntries[i] ? slabEntries[i].name : "" }; cell.fill = solid(NAVY); cell.font = { bold: true, size: 9, color: { argb: WHITE } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; }

  const groupBand = (g, text) => { for (let c = 1; c <= NCOLS; c++) sh.getCell(g.band, c).fill = solid(BAND); const c0 = sh.getCell(g.band, 1); c0.value = text; c0.font = { bold: true, size: 10, color: { argb: "FF374151" } }; };
  const unitOf = (kind, l) => (kind === "transport" ? "group" : (kind === "local" ? l.mode === "pp" : l.mode === "PP") ? "pp" : "group");
  const writeLines = (g, list, kind, nameOf, withSS) => {
    for (let i = 0; i < g.rows; i++) {
      const r = g.first + i, l = list[i];
      inputCell(sh, r, 1, l ? nameOf(l) : null);
      inputCell(sh, r, 2, l ? unitOf(kind, l) : null, undefined, UNIT).alignment = { horizontal: "center" };
      inputCell(sh, r, 3, l ? (n(l.cost) || null) : null, MONEY, numValidation(0));
      inputCell(sh, r, 4, l && hasFx(l) ? l.fx.cur : null).alignment = { horizontal: "center" };
      inputCell(sh, r, 5, l && hasFx(l) ? (n(l.fx.roe) || null) : null, "0.00", numValidation(0));
      for (let k = 0; k < NS; k++) {
        const c = FC + k, e = slabEntries[k], cell = sh.getCell(r, c);
        styleInput(cell, MONEY); cell.alignment = { horizontal: "right" };
        const dflt = { formula: `IF($C${r}="","",$C${r})`, result: l && n(l.cost) ? n(l.cost) : "" };
        if (l && e) {
          if (lineCostFor(l, e.src.id, kind) === null) { cell.value = "x"; cell.alignment = { horizontal: "center" }; }
          else { const own = l.cells && l.cells[e.src.id]; cell.value = (own !== undefined && own !== null && String(own).trim() !== "" && own !== NOT_APPLIED) ? n(own) : dflt; }
        } else cell.value = dflt;
      }
      const ss = sh.getCell(r, SSC);
      if (withSS) { styleInput(ss, MONEY); ss.dataValidation = numValidation(0); ss.value = l ? (n(l.singleSupp) || null) : null; ss.fill = solid(INPUT_BG); }
      else ss.fill = solid(SS_TINT);
    }
  };
  groupBand(TPT, "TRANSPORT"); writeLines(TPT, transports, "transport", (t) => t.sector || t.vehicleType || "", false);
  groupBand(LH, "LOCAL HANDLER"); writeLines(LH, localHandlers, "local", (h) => h.sector || "", true);
  groupBand(EXS, "EXTRA SERVICES"); writeLines(EXS, extras, "extra", (e) => e.description || "", false);
  // costs that apply to every slab
  groupBand({ band: FIX.band }, "COSTS FOR EVERY SLAB");
  [[FIX.tf, "Tour Facilitator", tlMode || "lumpsum", n(tlCost) || null], [FIX.misc, "Miscellaneous", miscMode || "pp", n(miscCost) || null]].forEach(([r, l, mode, v]) => {
    label(sh, r, 1, l, { size: 10 }); inputCell(sh, r, 2, mode === "pp" ? "pp" : "group", undefined, UNIT).alignment = { horizontal: "center" }; inputCell(sh, r, 3, v, MONEY, numValidation(0));
  });
  label(sh, FIX.mon, 1, "Monuments (list on the Itinerary tab)", { size: 10 });
  inputCell(sh, FIX.mon, 2, monMode === "pp" ? "pp" : "group", undefined, UNIT).alignment = { horizontal: "center" };
  formulaCell(sh, FIX.mon, 3, `Itinerary!$B$${MON_TOT}`, Math.round(monTotal), MONEY, { bold: true });
  sh.getCell(FIX.mon, 3).protection = { locked: true };
  for (const r of [FIX.tf, FIX.misc, FIX.mon]) for (let c = 6; c <= SSC; c++) sh.getCell(r, c).fill = solid(c === SSC ? SS_TINT : WHITE);

  // ═══════════ Tour leader's own costs, split by part ═══════════
  // Only T/L slab columns use this. Type a figure for each part (or x / blank to
  // leave it out); the total feeds the frozen "own cost" row and the surcharge.
  groupBand(TLB, "TOUR LEADER'S OWN COSTS   (T/L slabs only; the total is spread over that slab's paying pax)");
  TL_PARTS.forEach(([key, lbl], i) => {
    const r = TLB.first + i;
    label(sh, r, 1, lbl, { size: 10 });
    for (let c = 2; c <= 5; c++) sh.getCell(r, c).fill = solid(WHITE);
    for (let k = 0; k < NS; k++) {
      const e = slabEntries[k], cell = sh.getCell(r, FC + k);
      styleInput(cell, MONEY); cell.alignment = { horizontal: "right" }; cell.dataValidation = numValidation(0);
      if (e && e.tl) {
        const v = n((e.src.costs || {})[key]);
        if (!(e.src.includes || {})[key] && v > 0) { cell.value = "x"; cell.alignment = { horizontal: "center" }; }
        else cell.value = v > 0 ? v : null;
      }
    }
    sh.getCell(r, SSC).fill = solid(SS_TINT);
  });
  label(sh, TLB.total, 1, "Tour leader's own cost, total", { size: 10, color: { argb: "FF111827" } });
  for (let c = 2; c <= 5; c++) sh.getCell(TLB.total, c).fill = solid(LIGHT);
  sh.getCell(TLB.total, 1).fill = solid(LIGHT);
  for (let k = 0; k < NS; k++) {
    const e = slabEntries[k], L = colLetter(FC + k);
    const tot = e && e.tl ? Object.entries(e.src.costs || {}).reduce((a, [kk, v]) => a + ((e.src.includes || {})[kk] ? n(v) : 0), 0) : 0;
    formulaCell(sh, TLB.total, FC + k, `SUM(${L}${TLB.first}:${L}${TLB.last})`, tot, MONEY, { bold: true });
    sh.getCell(TLB.total, FC + k).fill = solid(LIGHT);
    // the frozen header row now just shows that total
    formulaCell(sh, R.tlOwn, FC + k, `${L}${TLB.total}`, tot, MONEY, { bold: true });
    sh.getCell(R.tlOwn, FC + k).fill = solid(LIGHT); sh.getCell(R.tlOwn, FC + k).protection = { locked: true };
  }
  sh.getCell(TLB.total, SSC).fill = solid(SS_TINT);

  // ═══════════ Price per paying pax ═══════════
  band(sh, PB, "PRICE PER PAYING PAX (₹)   all formulas, built up exactly as in the app", NCOLS);
  const pl = (r, text, opts = {}) => { label(sh, r, 1, text, { size: 10, color: { argb: "FF111827" }, bold: !!opts.bold }); };
  pl(P.hotels, "Hotels"); pl(P.meals, "Extra meals"); pl(P.tpt, "Transport"); pl(P.lh, "Local handler"); pl(P.ex, "Extra services");
  pl(P.tf, "Tour Facilitator"); pl(P.misc, "Miscellaneous"); pl(P.mon, "Monuments"); pl(P.tls, "Tour leader surcharge");
  pl(P.sub, "Sub-total", { bold: true }); pl(P.gst, "GST"); pl(P.after, "After tax"); pl(P.mk, "Markup"); pl(P.sell, "Selling price (₹)", { bold: true });
  pl(P.final, "Final price per pax", { bold: true }); pl(P.app, "App figure at export"); pl(P.match, "Matches the app?");
  const ssBd = ssBuild(totSS, Number(gst) || 0, Number(markup) || 0, Number(roe) || 0);
  const guard = (pc, f) => `IF(${pc}>0,${f},"")`;
  for (let i = 0; i < NS; i++) {
    const c = FC + i, L = colLetter(c), pc = `${L}$${R.pax}`, c0 = calcOf[i], e = slabEntries[i];
    const v = (key) => (c0 ? c0[key] : "");
    const F = (row, formula, result, fmt = MONEY, font = {}) => formulaCell(sh, row, c, formula, result === "" || result === undefined ? "" : result, fmt, font);
    F(P.hotels, guard(pc, `Itinerary!$I$${IT_TOT}`), c0 ? totHotel : "");
    F(P.meals, guard(pc, `Itinerary!$E$${IT_TOT}`), c0 ? totMeal : "");
    F(P.tpt, guard(pc, `SUMPRODUCT(${L}$${TPT.first}:${L}$${TPT.last},${rate(TPT)})/${pc}`), v("tptPP"));
    F(P.lh, guard(pc, `SUMPRODUCT(${L}$${LH.first}:${L}$${LH.last},${rate(LH)},${unitPP(LH)})+SUMPRODUCT(${L}$${LH.first}:${L}$${LH.last},${rate(LH)},${unitGrp(LH)})/${pc}`), v("localPP"));
    F(P.ex, guard(pc, `SUMPRODUCT(${L}$${EXS.first}:${L}$${EXS.last},${rate(EXS)},${unitPP(EXS)})+SUMPRODUCT(${L}$${EXS.first}:${L}$${EXS.last},${rate(EXS)},${unitGrp(EXS)})/${pc}`), v("extrasPP"));
    F(P.tf, guard(pc, `IF(LOWER(TRIM($B$${FIX.tf}))="pp",N($C$${FIX.tf}),N($C$${FIX.tf})/${pc})`), v("tlPP"));
    F(P.misc, guard(pc, `IF(LOWER(TRIM($B$${FIX.misc}))="pp",N($C$${FIX.misc}),N($C$${FIX.misc})/${pc})`), v("miscPP"));
    F(P.mon, guard(pc, `IF(LOWER(TRIM($B$${FIX.mon}))="pp",N($C$${FIX.mon}),N($C$${FIX.mon})/${pc})`), v("monPP"));
    F(P.tls, guard(pc, `N(${L}$${R.tlOwn})/${pc}`), e && e.tl ? c0.surchargePP : (c0 ? 0 : ""));
    F(P.sub, guard(pc, `SUM(${L}${P.hotels}:${L}${P.tls})`), v("sub"), MONEY, { bold: true });
    F(P.gst, guard(pc, `ROUND(${L}${P.sub}*${gstA}/100,0)`), v("tax"));
    F(P.after, guard(pc, `${L}${P.sub}+${L}${P.gst}`), v("afterTax"));
    F(P.mk, guard(pc, `ROUND(${L}${P.after}*${markupA}/100,0)`), v("markupAmt"));
    F(P.sell, guard(pc, `${L}${P.after}+${L}${P.mk}`), v("sellingINR"), MONEY, { bold: true });
    F(P.final, `IF(AND(${pc}>0,${roeA}>0),CEILING(${L}${P.sell}/${roeA},1),"")`, v("finalFX"), MONEY, { bold: true, size: 12, color: { argb: ACCENT } });
    if (c0) {
      const app = sh.getCell(P.app, c); app.value = c0.finalFX; app.numFmt = MONEY; app.font = { size: 9, color: { argb: GREY } };
      const m = sh.getCell(P.match, c); m.value = { formula: `IF(ABS(${L}${P.final}-${L}${P.app})<0.5,"✔","edited")`, result: "✔" }; m.font = { size: 9, color: { argb: GOOD } }; m.alignment = { horizontal: "center" };
    }
  }
  // Single-supplement column
  {
    const L = colLetter(SSC), c = SSC;
    const F = (row, formula, result, font = {}) => formulaCell(sh, row, c, formula, result, MONEY, font);
    F(P.hotels, `Itinerary!$J$${IT_TOT}`, Math.round(daySS));
    F(P.lh, `SUMPRODUCT(${L}$${LH.first}:${L}$${LH.last},${rate(LH)})`, Math.round(handlerSS));
    F(P.sub, `${L}${P.hotels}+${L}${P.lh}`, ssBd.sub, { bold: true });
    F(P.gst, `ROUND(${L}${P.sub}*${gstA}/100,0)`, ssBd.tax);
    F(P.after, `${L}${P.sub}+${L}${P.gst}`, ssBd.afterTax);
    F(P.mk, `ROUND(${L}${P.after}*${markupA}/100,0)`, ssBd.markupAmt);
    F(P.sell, `${L}${P.after}+${L}${P.mk}`, ssBd.sellingINR, { bold: true });
    F(P.final, `IF(${roeA}>0,CEILING((${L}${P.sub}+${L}${P.sub}*${gstA}/100)*(1+${markupA}/100)/${roeA},1),"")`, ssBd.finalFX, { bold: true, size: 12, color: { argb: ACCENT } });
    const app = sh.getCell(P.app, c); app.value = ssBd.finalFX; app.numFmt = MONEY; app.font = { size: 9, color: { argb: GREY } };
    const m = sh.getCell(P.match, c); m.value = { formula: `IF(ABS(${L}${P.final}-${L}${P.app})<0.5,"✔","edited")`, result: "✔" }; m.font = { size: 9, color: { argb: GOOD } }; m.alignment = { horizontal: "center" };
  }
  for (const r of [P.sub, P.sell]) for (let c = 1; c <= NCOLS; c++) sh.getCell(r, c).fill = solid(LIGHT);
  for (let c = 1; c <= NCOLS; c++) { const cell = sh.getCell(P.final, c); cell.fill = solid("FFFDECEA"); }
  names.push(["Single_supp_final", `$${colLetter(SSC)}$${P.final}`]);

  // ═══════════ Checks (live) ═══════════
  band(sh, CB, "CHECKS   recalculated as you edit", NCOLS);
  const rg = (row) => `$${colLetter(FC)}$${row}:$${colLetter(LC)}$${row}`;
  const lineGroups = [TPT, LH, EXS];
  const fxMissing = lineGroups.map((g) => `SUMPRODUCT(($D$${g.first}:$D$${g.last}<>"")*($E$${g.first}:$E$${g.last}<=0))`).join("+");
  const xCount = lineGroups.map((g) => `COUNTIF($${colLetter(FC)}$${g.first}:$${colLetter(LC)}$${g.last},"x")`).join("+");
  const itH = `Itinerary!$F$${IT_FIRST}:$F$${IT_LAST}`, itN = `Itinerary!$I$${IT_FIRST}:$I$${IT_LAST}`, itS = `Itinerary!$J$${IT_FIRST}:$J$${IT_LAST}`;
  const monNames = `Itinerary!$A$${MON_FIRST}:$A$${MON_LAST}`, monInc = `Itinerary!$C$${MON_FIRST}:$C$${MON_LAST}`;
  const checks = [
    [`IF(SUMPRODUCT(((${rg(R.name)}<>"")+(${rg(R.pax)}>0)=1)*1)=0,"✔ Every slab has a name and paying pax","! A slab column has a name or paying pax, but not both")`, "✔ Every slab has a name and paying pax"],
    [`IF(SUMPRODUCT((${rg(R.pax)}>0)*(${rg(P.tpt)}=0))=0,"✔ Every slab has a transport cost","! A slab has no transport cost (check the x marks on the Transport rows)")`, "✔ Every slab has a transport cost"],
    [`IF(${roeA}>0,"✔ ROE is set","! ROE is not set")`, "✔ ROE is set"],
    [`IF((${fxMissing})=0,"✔ ROE is set on every foreign-currency row","! A row has a currency but no ROE (it is being counted as rupees)")`, "✔ ROE is set on every foreign-currency row"],
    [`IF(SUMPRODUCT((${itH}<>"")*(${itH}<>"Departure")*(${itN}<=0))+SUMPRODUCT((${itH}<>"")*(${itH}<>"Departure")*(${itN}>0)*(${itS}<=0))=0,"✔ Hotel rate and single supplement filled for every night","! A night has a hotel but no net rate or single supplement (Itinerary tab)")`, "✔ Hotel rate and single supplement filled for every night"],
    [`IF(AND(COUNTA(${monNames})>0,COUNTIF(${monInc},"Y")=0,N(Itinerary!$B$${MON_EXTRA})=0),"! Monuments are listed but none is included in the price","✔ Monuments checked")`, "✔ Monuments checked"],
    [`IF((${xCount})=0,"✔ No cost is left out of any slab","! "&(${xCount})&" cell(s) are left out with x. Intended?")`, "✔ No cost is left out of any slab"],
    [`IF(COUNTIF(${rg(P.match)},"edited")+COUNTIF($${colLetter(SSC)}$${P.match},"edited")=0,"✔ Prices match the app's figures at export","! A price differs from the app's figure at export (see 'Matches the app?')")`, "✔ Prices match the app's figures at export"],
  ];
  checks.forEach(([f, res], i) => {
    const r = CB + 1 + i;
    sh.mergeCells(r, 1, r, 8);
    const cell = sh.getCell(r, 1); cell.value = { formula: f, result: res }; cell.font = { size: 10 };
  });
  const CHK_FIRST = CB + 1, CHK_LAST = CB + checks.length;

  // ═══════════ Conditional formatting ═══════════
  const amber = { type: "pattern", pattern: "solid", bgColor: { argb: WARN_BG } };
  const gridFirst = TPT.first, gridLast = EXS.last;
  const gridRef = `${colLetter(FC)}${gridFirst}:${colLetter(LC)}${gridLast}`;
  const tl = colLetter(FC) + gridFirst;
  sh.addConditionalFormatting({ ref: gridRef, rules: [
    { type: "expression", formulae: [`${colLetter(FC)}$${R.pax}=""`], style: { font: { color: { argb: "FFD1D5DB" } } } },
    { type: "expression", formulae: [`AND(${tl}<>"",${tl}<>"x",NOT(ISFORMULA(${tl})))`], style: { fill: amber, font: { bold: true, color: { argb: "FF92400E" } } } },
    { type: "expression", formulae: [`${tl}="x"`], style: { font: { color: { argb: "FF9CA3AF" } } } },
  ] });
  sh.addConditionalFormatting({ ref: `${colLetter(FC)}${P.hotels}:${colLetter(LC)}${P.final}`, rules: [{ type: "expression", formulae: [`${colLetter(FC)}$${R.tlOwn}>0`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: TL_TINT } } } }] });
  sh.addConditionalFormatting({ ref: `${colLetter(FC)}${R.name}:${colLetter(LC)}${R.tlOwn}`, rules: [{ type: "expression", formulae: [`${colLetter(FC)}$${R.tlOwn}>0`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFDE68A" } } } }] });
  sh.addConditionalFormatting({ ref: `${colLetter(FC)}${P.match}:${colLetter(SSC)}${P.match}`, rules: [{ type: "cellIs", operator: "equal", formulae: ['"edited"'], style: { fill: amber, font: { color: { argb: "FF92400E" } } } }] });
  sh.addConditionalFormatting({ ref: `A${CHK_FIRST}:A${CHK_LAST}`, rules: [
    { type: "expression", formulae: [`LEFT($A${CHK_FIRST},1)="!"`], style: { fill: amber, font: { color: { argb: "FF92400E" }, bold: true } } },
    { type: "expression", formulae: [`LEFT($A${CHK_FIRST},1)="✔"`], style: { font: { color: { argb: GOOD } } } },
  ] });

  // ═══════════ Itinerary tab ═══════════
  const ITC = 11;
  band(it, 1, `ITINERARY & ACCOMMODATION   ·   ${query.tourFileId || query.id || ""}`, ITC);
  note(it, 2, "One row per day. Net PP is the hotel cost per person for that night; Single supp. is the single-room supplement. Type in the next empty row to add a day. Totals above the list feed the Cost Sheet tab.", ITC, 26);
  it.getCell(IT_TOT, 1).value = "TOTALS"; it.getCell(IT_TOT, 1).font = { bold: true };
  formulaCell(it, IT_TOT, 5, `SUM(E${IT_FIRST}:E${IT_LAST})`, Math.round(totMeal), MONEY, { bold: true, size: 11 });
  formulaCell(it, IT_TOT, 9, `SUM(I${IT_FIRST}:I${IT_LAST})`, Math.round(totHotel), MONEY, { bold: true, size: 11 });
  formulaCell(it, IT_TOT, 10, `SUM(J${IT_FIRST}:J${IT_LAST})`, Math.round(daySS), MONEY, { bold: true, size: 11 });
  ["Day", "Date", "Movement", "Meal plan", "Meal cost", "Hotel", "Alt hotel", "Plan", "Net PP", "Single supp.", "Notes"].forEach((h, i) => head(it, IT_HDR, i + 1, h, LIGHT));
  for (let i = 0; i < IT_ROWS; i++) {
    const r = IT_FIRST + i, dd = days[i];
    inputCell(it, r, 1, dd ? dd.day : null);
    const dt = dd ? excelDate(dd.date) : null;
    inputCell(it, r, 2, dd ? (dt || formatDateSlash(dd.date) || "") : null, "dd/mm/yyyy");
    inputCell(it, r, 3, dd ? dd.movement || "" : null);
    inputCell(it, r, 4, dd ? dd.mealPlan || "" : null);
    inputCell(it, r, 5, dd ? n(dd.mealCost) || null : null, MONEY, numValidation(0));
    inputCell(it, r, 6, dd ? dd.hotel || "" : null);
    inputCell(it, r, 7, dd ? dd.hotelAlt || "" : null);
    inputCell(it, r, 8, dd ? dd.hotelPlan || "" : null);
    inputCell(it, r, 9, dd ? n(dd.hotelNetPP) || null : null, MONEY, numValidation(0));
    inputCell(it, r, 10, dd ? n(dd.singleSupp) || null : null, MONEY, numValidation(0));
    inputCell(it, r, 11, dd ? dd.notes || "" : null);
  }
  band(it, MON_BAND, "MONUMENTS / ACTIVITIES", ITC, STEP_BLUE);
  label(it, MON_EXTRA, 1, "Extra monument cost (one amount, optional)", { size: 10 }); inputCell(it, MON_EXTRA, 2, n(monExtra) || null, MONEY, numValidation(0));
  label(it, MON_TOT, 1, "Total used in prices (included fees + extra)", { size: 10, color: { argb: "FF111827" } });
  formulaCell(it, MON_TOT, 2, `SUMPRODUCT(--(UPPER(TRIM(${colRange("C", MON_FIRST, MON_LAST)}))="Y"),${colRange("B", MON_FIRST, MON_LAST)})+N(B${MON_EXTRA})`, Math.round(monTotal), MONEY, { bold: true, size: 11 });
  ["Monument / activity", "Fee", "Include (Y/N)"].forEach((h, i) => head(it, MON_HDR, i + 1, h, LIGHT));
  for (let i = 0; i < MON_ROWS; i++) {
    const r = MON_FIRST + i, m = monuments[i];
    inputCell(it, r, 1, m ? m.name || "" : null);
    inputCell(it, r, 2, m ? (m.fee ? n(m.fee) : null) : null, MONEY, numValidation(0));
    inputCell(it, r, 3, m ? (m.include ? "Y" : "N") : null, undefined, YES_NO);
  }
  [30, 12, 34, 10, 11, 24, 20, 8, 11, 12, 30].forEach((w, i) => { it.getColumn(i + 1).width = w; });
  it.views = [{ state: "frozen", ySplit: IT_HDR, showGridLines: false }];

  // ── names, widths, freeze, print, protection ──
  names.forEach(([nm, a]) => { try { wb.definedNames.add(`'Cost Sheet'!${a}`, nm); } catch (e) { /* a name clash must never block the export */ } });
  sh.getColumn(1).width = 38; sh.getColumn(2).width = 8; sh.getColumn(3).width = 13; sh.getColumn(4).width = 9; sh.getColumn(5).width = 8;
  for (let c = FC; c <= LC; c++) sh.getColumn(c).width = 14;
  sh.getColumn(SSC).width = 14;
  sh.views = [{ state: "frozen", xSplit: 1, ySplit: R.tlOwn, showGridLines: false, zoomScale: 90 }];
  for (const [ws, rows] of [[sh, `1:${R.tlOwn}`], [it, `1:${IT_HDR}`]]) {
    ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 }, printTitlesRow: rows, horizontalCentered: true };
    ws.headerFooter = { oddFooter: `&L&8Unitop Ops — Cost Sheet ${query.tourFileId || query.id || ""} v${currentVersionLabel}&R&8Page &P of &N` };
  }
  const protection = { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: true, formatRows: true, insertRows: true, deleteRows: true, insertColumns: false, deleteColumns: false, sort: false, autoFilter: false };
  await sh.protect("", protection);
  await it.protect("", protection);
  return wb;
}
