// Cost Sheet -> Excel workbook.
//
// A WORKING spreadsheet, not a printout. Design rules (each one answers a
// real complaint about the first versions):
//
//   1. ONE tab, laid out top to bottom in numbered steps: settings, shared
//      costs, the price table, then the lists behind the prices (Itinerary,
//      Transport, Monuments, Local Handlers, Extra Services). Every list has
//      its own block of 60-80 ready rows, so lists never run into each other
//      and there is no "slot limit" to think about. A "Jump to" row stays
//      frozen at the top, so any block is one click away.
//   2. Slabs are ONE table (Step 3). A group slab and a Tour Leader slab are
//      the same kind of row: name, vehicle, paying pax -- and, for a Tour
//      Leader slab, the escort's own cost. To add a slab, type in the next
//      empty row. 30 rows are ready; empty rows stay invisible.
//   3. Transport lines say which slabs they apply to in plain words:
//      "All", or slab names separated by commas. No matrix of Y/N columns
//      to keep in sync, and a new slab picks up "All" lines automatically.
//   4. Everything you may type in is yellow and unlocked; everything else is
//      a locked formula (the sheet is protected WITHOUT a password -- Review
//      > Unprotect Sheet turns it off), so a stray click can't break a price.
//   5. The maths is the app's own, in the same order (see costSheetCalc.js),
//      never shows #DIV/0!, and the grey "App check" columns show on opening
//      that the sheet agrees with the app to the rupee.

const NAVY = "FF0D1B2A", ACCENT = "FFC0392B", LIGHT = "FFF3F4F6", WHITE = "FFFFFFFF", GREY = "FF6B7280";
const BORDER = "FFD1D5DB", INPUT_BG = "FFFFFDE7", TL_BROWN = "FF7D6608", TL_TINT = "FFFDE68A";
const GOOD = "FF047857", WARN_BG = "FFFEF3C7", BAD_BG = "FFFEE2E2", STEP_BLUE = "FF1D4ED8";

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const colLetter = (c) => { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const addr = (r, c) => `${colLetter(c)}${r}`;
const abs = (r, c) => `$${colLetter(c)}$${r}`;
const n = (v) => parseFloat(v) || 0;

// "2026-07-24" -> a real Excel date; anything else -> null (caller keeps its text).
export function excelDate(iso) {
  const m = typeof iso === "string" && iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export const SLAB_ROWS = 30; // ready-to-use slab rows
const LIST_ROWS = 60; // ready-to-use rows in every list block (at least)

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
  wb.calcProperties = { fullCalcOnLoad: true }; // always recalculate when opened
  const sh = wb.addWorksheet("Cost Sheet", { properties: { tabColor: { argb: NAVY } } });
  const NCOLS = 19;

  // ── helpers ─────────────────────────────────────────────────────────
  const band = (r, text, fill = NAVY) => {
    sh.mergeCells(r, 1, r, NCOLS);
    const c = sh.getCell(r, 1);
    c.value = text; c.font = { bold: true, size: 11, color: { argb: WHITE } };
    for (let i = 1; i <= NCOLS; i++) sh.getCell(r, i).fill = solid(fill);
    c.alignment = { vertical: "middle" };
    sh.getRow(r).height = 20;
  };
  const note = (r, text, height = 28) => {
    sh.mergeCells(r, 1, r, NCOLS);
    const c = sh.getCell(r, 1); c.value = text;
    c.font = { italic: true, size: 9, color: { argb: GREY } }; c.alignment = { wrapText: true, vertical: "top" };
    sh.getRow(r).height = height;
  };
  const label = (r, c, text) => { const cell = sh.getCell(r, c); cell.value = text; cell.font = { bold: true, size: 9, color: { argb: GREY } }; cell.alignment = { wrapText: true, vertical: "bottom" }; };
  const styleInput = (cell, fmt) => {
    cell.fill = solid(INPUT_BG);
    cell.protection = { locked: false };
    cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    if (fmt) cell.numFmt = fmt;
  };
  // An input across columns c1..c2 (merged when wider than one column).
  const inputCell = (r, c, val, fmt, validation, c2 = c) => {
    const cell = sh.getCell(r, c);
    for (let i = c; i <= c2; i++) styleInput(sh.getCell(r, i), fmt);
    if (c2 > c) sh.mergeCells(r, c, r, c2);
    cell.value = val === undefined ? null : val;
    if (validation) cell.dataValidation = validation;
    return cell;
  };
  const formulaCell = (r, c, formula, result, fmt, extraFont = {}) => {
    const cell = sh.getCell(r, c);
    cell.value = { formula, result: typeof result === "string" ? result : (Number.isFinite(result) ? result : 0) };
    if (fmt) cell.numFmt = fmt;
    cell.font = { size: 10, ...extraFont };
    return cell;
  };
  // Header cells for a list: spans = [[c1, c2, text], ...]
  const headerSpans = (r, spans, fill = LIGHT, fontColor = "FF374151") => spans.forEach(([c1, c2, text]) => {
    for (let i = c1; i <= c2; i++) {
      const c = sh.getCell(r, i); c.fill = solid(fill); c.border = { bottom: { style: "thin", color: { argb: BORDER } } };
    }
    if (c2 > c1) sh.mergeCells(r, c1, r, c2);
    const c = sh.getCell(r, c1);
    c.value = text; c.font = { bold: true, size: 9, color: { argb: fontColor } }; c.alignment = { vertical: "middle", wrapText: true };
  });
  const listValidation = (items) => ({
    type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`],
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Pick from the list", error: `Choose one of: ${items.join(", ")}`,
  });
  const numValidation = (min = 0) => ({
    type: "decimal", operator: "greaterThanOrEqual", formulae: [min], allowBlank: true,
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Number needed", error: `Enter a number (${min} or more).`,
  });
  const MODE_PP = listValidation(["pp", "lumpsum"]);
  const MODE_EXTRA = listValidation(["PP", "Lumpsum", "Per Vehicle", "Per Group"]);
  const YES_NO = listValidation(["Y", "N"]);
  const MONEY = "#,##0";
  const names = [];
  const isPP = (ref) => `LOWER(TRIM(${ref}))="pp"`;
  const colRange = (col, a, b) => `$${col}$${a}:$${col}$${b}`;
  const rowsFor = (len) => Math.max(LIST_ROWS, len + 20);

  // ═══ Unique, comma-free slab names (Transport lines match on them) ═══
  const usedNames = new Set();
  const uniqueName = (raw, fallback) => {
    const base = String(raw || "").replace(/,/g, " ").trim() || fallback;
    let nm = base, i = 2;
    while (usedNames.has(nm.toLowerCase())) nm = `${base} (${i++})`;
    usedNames.add(nm.toLowerCase());
    return nm;
  };
  const slabEntries = [
    ...slabs.map((s, i) => ({ src: s, tl: false, name: uniqueName(s.label, `Slab ${i + 1}`) })),
    ...tlSlabs.map((s, i) => ({ src: s, tl: true, name: uniqueName(s.label, `T/L ${i + 1}`) })),
  ].slice(0, SLAB_ROWS);
  const nameById = new Map(slabEntries.map((e) => [e.src.id, e.name]));

  // ═══ Row geometry: every block's position is fixed before any formula is written ═══
  const STEP1 = 6, STEP2 = 10, TOTALS_LBL = 14, STEP3 = 18;
  const SLAB_HDR = 20, SLAB_FIRST = 21, SLAB_LAST = SLAB_FIRST + SLAB_ROWS - 1;
  const DETAILS = SLAB_LAST + 3;
  // Each block: band, note, totals/label row, header, rows, then 3 spare lines.
  let cursor = DETAILS + 2;
  const block = (rows) => { const b = { band: cursor, note: cursor + 1, tot: cursor + 2, hdr: cursor + 3, first: cursor + 4, rows, last: cursor + 3 + rows }; cursor = b.last + 4; return b; };
  const ITIN = block(Math.max(80, days.length + 20));
  const TPT = block(Math.max(80, transports.length + 20));
  const MON = block(rowsFor(monuments.length));
  const LH = block(rowsFor(localHandlers.length));
  const EXS = block(rowsFor(extras.length));
  const LASTROW = EXS.last;

  // ═══════════════ Title, group line, frozen "Jump to" row ═══════════════
  sh.mergeCells(1, 1, 1, 13);
  const t = sh.getCell(1, 1); t.value = "COST SHEET"; t.font = { bold: true, size: 16, color: { argb: WHITE } }; t.alignment = { vertical: "middle" };
  sh.mergeCells(1, 14, 1, NCOLS);
  const ver = sh.getCell(1, 14); ver.value = `Version ${currentVersionLabel}  •  Saved ${savedTimestamp}`;
  ver.font = { italic: true, size: 10, color: { argb: WHITE } }; ver.alignment = { vertical: "middle", horizontal: "right" };
  for (let i = 1; i <= NCOLS; i++) sh.getCell(1, i).fill = solid(NAVY);
  sh.getRow(1).height = 28;
  note(2, "How to use: yellow cells are the only ones you type in. Steps 1–2: settings. Step 3: the price table — add a slab by typing in the next empty row. " +
    "Further down (Step 4) are the lists behind the prices — Itinerary, Transport, Monuments, Local Handlers, Extra Services — each with its own block of ready rows. Every price recalculates as you type. Use the Jump-to links in row 4.", 30);
  sh.mergeCells(3, 1, 3, 12);
  sh.getCell(3, 1).value = `${query.groupName || query.clientName || ""}   •   ${query.destination || query.sector || ""}   •   Tour File: ${query.tourFileId || query.id}`;
  sh.getCell(3, 1).font = { bold: true, size: 12 };

  const link = (c1, c2, text, targetRow) => {
    for (let i = c1; i <= c2; i++) { const c = sh.getCell(4, i); c.fill = solid("FFE8EEF8"); c.border = { bottom: { style: "thin", color: { argb: BORDER } } }; }
    if (c2 > c1) sh.mergeCells(4, c1, 4, c2);
    const c = sh.getCell(4, c1);
    c.value = { text, hyperlink: `#'Cost Sheet'!A${targetRow}` };
    c.font = { bold: true, size: 9, color: { argb: STEP_BLUE }, underline: true }; c.alignment = { horizontal: "center", vertical: "middle" };
  };
  link(1, 1, "▲ Settings (top)", STEP1);
  link(2, 2, "Slabs & prices", STEP3);
  link(3, 4, "Itinerary", ITIN.band); link(5, 6, "Transport", TPT.band); link(7, 8, "Monuments", MON.band);
  link(9, 10, "Local Handlers", LH.band); link(11, 12, "Extra Services", EXS.band);
  sh.getRow(4).height = 20;

  // ═══════════════ STEP 1 / STEP 2 ═══════════════
  band(STEP1, "STEP 1 — SETTINGS");
  label(STEP1 + 1, 1, "GST %"); label(STEP1 + 1, 2, "Markup %"); label(STEP1 + 1, 3, "ROE"); label(STEP1 + 1, 4, "Currency");
  label(STEP1 + 1, 6, "Client / Foreign Agent"); label(STEP1 + 1, 11, "Assigned Staff");
  const V1 = STEP1 + 2;
  const gstCell = inputCell(V1, 1, Number(gst) || 0, "0.0", numValidation(0));
  const markupCell = inputCell(V1, 2, Number(markup) || 0, "0.0", numValidation(0));
  const roeCell = inputCell(V1, 3, Number(roe) || 0, "0.0", numValidation(0));
  const currencyCell = inputCell(V1, 4, currency || "US $");
  for (const c of [gstCell, markupCell, roeCell, currencyCell]) c.font = { bold: true, size: 13 };
  inputCell(V1, 6, clientAgentName || "", undefined, undefined, 9);
  inputCell(V1, 11, assignedStaffName || "", undefined, undefined, 14);
  const gstAddr = abs(V1, 1), markupAddr = abs(V1, 2), roeAddr = abs(V1, 3);
  names.push(["GST_pct", gstAddr], ["Markup_pct", markupAddr], ["ROE", roeAddr], ["Currency", abs(V1, 4)]);
  sh.getRow(V1).height = 22;

  band(STEP2, "STEP 2 — COSTS THAT APPLY TO EVERY SLAB   (pp = per person, lumpsum = one total shared by the paying pax)");
  label(STEP2 + 1, 1, "Tour Facilitator — pp or lumpsum"); label(STEP2 + 1, 2, "Amount");
  label(STEP2 + 1, 4, "Misc — pp or lumpsum"); label(STEP2 + 1, 5, "Amount");
  label(STEP2 + 1, 7, "Monuments — pp or lumpsum"); label(STEP2 + 1, 8, "Extra monument cost");
  sh.getRow(STEP2 + 1).height = 28;
  const V2 = STEP2 + 2;
  inputCell(V2, 1, tlMode || "lumpsum", undefined, MODE_PP); inputCell(V2, 2, n(tlCost) || null, MONEY, numValidation(0));
  inputCell(V2, 4, miscMode || "pp", undefined, MODE_PP); inputCell(V2, 5, n(miscCost) || null, MONEY, numValidation(0));
  inputCell(V2, 7, monMode || "pp", undefined, MODE_PP); inputCell(V2, 8, n(monExtra) || null, MONEY, numValidation(0));
  const tlModeAddr = abs(V2, 1), tlCostAddr = abs(V2, 2), miscModeAddr = abs(V2, 4), miscCostAddr = abs(V2, 5), monModeAddr = abs(V2, 7), monExtraAddr = abs(V2, 8);

  label(TOTALS_LBL - 1, 1, "Pulled from the lists below — don't type here");
  sh.getCell(TOTALS_LBL - 1, 1).alignment = { wrapText: false };
  label(TOTALS_LBL, 1, "Accommodation (PP)"); label(TOTALS_LBL, 4, "Extra Meals (PP)"); label(TOTALS_LBL, 7, "Monuments (total)"); label(TOTALS_LBL, 10, "Single Supplement (total)");
  sh.getRow(TOTALS_LBL).height = 28;
  const TV = TOTALS_LBL + 1;
  // Totals sit at the TOP of each list block, so a list can be as long as it likes.
  const mealTotalRef = `$G$${ITIN.tot}`, hotelTotalRef = `$M$${ITIN.tot}`, daySSRef = `$N$${ITIN.tot}`, handlerSSRef = `$D$${LH.tot}`;
  formulaCell(TV, 1, hotelTotalRef, Math.round(totHotel), MONEY, { bold: true, size: 13 });
  formulaCell(TV, 4, mealTotalRef, Math.round(totMeal), MONEY, { bold: true, size: 13 });
  const monTotalFormula = `SUMPRODUCT(--(UPPER(TRIM(${colRange("C", MON.first, MON.last)}))="Y"),${colRange("B", MON.first, MON.last)})+N(${monExtraAddr})`;
  formulaCell(TV, 7, monTotalFormula, Math.round(monTotal), MONEY, { bold: true, size: 13 });
  formulaCell(TV, 10, `${daySSRef}+${handlerSSRef}`, Math.round(totSS), MONEY, { bold: true, size: 13, color: { argb: ACCENT } });
  const hotelAddr = abs(TV, 1), mealAddr = abs(TV, 4), monTotalAddr = abs(TV, 7), ssTotalAddr = abs(TV, 10);
  names.push(["Hotel_total_PP", hotelAddr], ["Meal_total_PP", mealAddr], ["Monument_total", monTotalAddr], ["Single_supp_total", ssTotalAddr]);
  sh.getRow(TV).height = 22;

  // ═══════════════ STEP 3: the price table ═══════════════
  band(STEP3, "STEP 3 — SLABS & PRICES      ◄ to add a slab, type in the next empty row (30 rows ready)");
  note(STEP3 + 1, "Fill Name, Vehicle and Paying pax. For a TOUR LEADER slab also type the Tour Leader's own cost (the total for the escort) in the last yellow column — it is spread across the paying pax and the row turns amber. " +
    "Which transport lines count for a slab is set under 'Transport' further down, by slab name.");
  const slabHeaders = ["Slab name", "Vehicle", "Paying pax", "Tour Leader's own cost (total) — T/L slabs only",
    "Transport", "Tour Facil", "Misc", "Monuments", "Local Hdlr", "Extras", "T/L surcharge", "Sub-total", "GST", "After Tax", "Markup",
    `Final Price (${currency || "—"})`, `Single Supp (${currency || "—"})`, "App price at export", "Matches app?"];
  headerSpans(SLAB_HDR, slabHeaders.map((h, i) => [i + 1, i + 1, h]), NAVY, WHITE);
  for (const c of [1, 2, 3, 4]) sh.getCell(SLAB_HDR, c).fill = solid(STEP_BLUE);
  for (const c of [18, 19]) sh.getCell(SLAB_HDR, c).fill = solid(GREY);
  sh.getRow(SLAB_HDR).height = 44;

  const T = { b: colRange("B", TPT.first, TPT.last), c: colRange("C", TPT.first, TPT.last) };
  const L = { b: colRange("B", LH.first, LH.last), c: colRange("C", LH.first, LH.last) };
  const X = { b: colRange("B", EXS.first, EXS.last), c: colRange("C", EXS.first, EXS.last) };
  const roeOk = `${roeAddr}>0`;

  for (let i = 0; i < SLAB_ROWS; i++) {
    const row = SLAB_FIRST + i;
    const e = slabEntries[i] || null;
    const tlEntry = e && e.tl;
    const c0 = e ? (e.tl ? calcTlSlab(e.src) : calcSlab(e.src)) : { tptPP: 0, tlPP: 0, miscPP: 0, monPP: 0, localPP: 0, extrasPP: 0, surchargePP: 0, sub: 0, tax: 0, afterTax: 0, markupAmt: 0, finalFX: 0, ssFX: 0 };
    const pax = e ? (e.tl ? n(e.src.pax) : Number(e.src.foc) || 0) : null;
    const vehicle = e ? (e.src.vehicle === "Others" ? e.src.vehicleOther : e.src.vehicle) || "" : "";
    const tlOwn = tlEntry ? Object.entries(e.src.costs || {}).reduce((a, [k, v]) => a + ((e.src.includes || {})[k] ? n(v) : 0), 0) : null;

    const nm = inputCell(row, 1, e ? e.name : "", undefined, {
      type: "custom", allowBlank: true,
      formulae: [`AND(ISERROR(FIND(",",$A${row})),COUNTIF($A$${SLAB_FIRST}:$A$${SLAB_LAST},$A${row})=1)`],
      showErrorMessage: true, errorStyle: "stop", errorTitle: "Slab name",
      error: "Each slab needs its own name, and it can't contain a comma (Transport lines match on names).",
    });
    nm.font = { bold: true, color: { argb: tlEntry ? TL_BROWN : "FF111827" } };
    inputCell(row, 2, vehicle);
    inputCell(row, 3, pax, "0", numValidation(0)).font = { bold: true };
    inputCell(row, 4, tlOwn, MONEY, numValidation(0));

    const P = `$C${row}`;
    const tptF = `IF(${P}>0,SUMPRODUCT(--(((TRIM(${T.c})="All")+ISNUMBER(SEARCH(","&TRIM($A${row})&",",","&SUBSTITUTE(${T.c},", ",",")&",")))>0),${T.b})/${P},0)`;
    const tlF = `IF(${isPP(tlModeAddr)},N(${tlCostAddr}),IF(${P}>0,N(${tlCostAddr})/${P},0))`;
    const miscF = `IF(${isPP(miscModeAddr)},N(${miscCostAddr}),IF(${P}>0,N(${miscCostAddr})/${P},0))`;
    const monF = `IF(${isPP(monModeAddr)},${monTotalAddr},IF(${P}>0,${monTotalAddr}/${P},0))`;
    const lhF = `SUMPRODUCT(--(LOWER(TRIM(${L.c}))="pp"),${L.b})+IF(${P}>0,SUMPRODUCT(--(LOWER(TRIM(${L.c}))<>"pp"),${L.b})/${P},0)`;
    const exF = `SUMPRODUCT(--(UPPER(TRIM(${X.c}))="PP"),${X.b})+IF(${P}>0,SUMPRODUCT(--(UPPER(TRIM(${X.c}))<>"PP"),${X.b})/${P},0)`;
    formulaCell(row, 5, tptF, c0.tptPP, MONEY);
    formulaCell(row, 6, tlF, c0.tlPP, MONEY);
    formulaCell(row, 7, miscF, c0.miscPP, MONEY);
    formulaCell(row, 8, monF, c0.monPP, MONEY);
    formulaCell(row, 9, lhF, c0.localPP, MONEY);
    formulaCell(row, 10, exF, c0.extrasPP, MONEY);
    formulaCell(row, 11, `IF(${P}>0,N($D${row})/${P},0)`, tlEntry ? c0.surchargePP : 0, MONEY, { bold: true, color: { argb: TL_BROWN } });
    const sub = addr(row, 12);
    formulaCell(row, 12, `${hotelAddr}+${mealAddr}+SUM(${addr(row, 5)}:${addr(row, 11)})`, c0.sub, MONEY);
    formulaCell(row, 13, `ROUND(${sub}*${gstAddr}/100,0)`, c0.tax, MONEY);
    formulaCell(row, 14, `${sub}+${addr(row, 13)}`, c0.afterTax, MONEY);
    formulaCell(row, 15, `ROUND(${addr(row, 14)}*${markupAddr}/100,0)`, c0.markupAmt, MONEY);
    formulaCell(row, 16, `IF(${roeOk},CEILING((${addr(row, 14)}+${addr(row, 15)})/${roeAddr},1),0)`, c0.finalFX, MONEY, { bold: true, size: 11, color: { argb: ACCENT } });
    formulaCell(row, 17, `IF(${roeOk},CEILING((${ssTotalAddr}+${ssTotalAddr}*${gstAddr}/100)*(1+${markupAddr}/100)/${roeAddr},1),0)`, c0.ssFX, MONEY);
    if (e) {
      const app = sh.getCell(row, 18); app.value = c0.finalFX; app.numFmt = MONEY; app.font = { size: 9, color: { argb: GREY } };
      const chk = sh.getCell(row, 19);
      chk.value = { formula: `IF(ABS(${addr(row, 16)}-${addr(row, 18)})<0.5,"✔ yes","edited")`, result: "✔ yes" };
      chk.font = { size: 9, color: { argb: GOOD } };
    }
  }

  // Conditional formatting: invisible empty rows, red zero-pax, amber T/L rows, "edited" flag.
  const redFill = { type: "pattern", pattern: "solid", bgColor: { argb: BAD_BG } };
  sh.addConditionalFormatting({ ref: `C${SLAB_FIRST}:C${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`AND(ISNUMBER(C${SLAB_FIRST}),C${SLAB_FIRST}<=0)`], style: { fill: redFill, font: { color: { argb: "FFB91C1C" }, bold: true } } }] });
  sh.addConditionalFormatting({ ref: `E${SLAB_FIRST}:S${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`$C${SLAB_FIRST}=""`], style: { font: { color: { argb: "FFFFFFFF" } } } }] });
  sh.addConditionalFormatting({ ref: `A${SLAB_FIRST}:D${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`N($D${SLAB_FIRST})>0`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: TL_TINT } } } }] });
  sh.addConditionalFormatting({ ref: `S${SLAB_FIRST}:S${SLAB_LAST}`, rules: [{ type: "cellIs", operator: "equal", formulae: ['"edited"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: WARN_BG } }, font: { color: { argb: "FF92400E" } } } }] });

  // ═══════════════ STEP 4: the lists behind the prices ═══════════════
  band(DETAILS, "STEP 4 — THE LISTS BEHIND THE PRICES   (each block below has its own ready rows; totals above each list feed the prices)");
  const listBand = (b, text, noteText) => { band(b.band, text, STEP_BLUE); note(b.note, noteText, 28); };

  // Itinerary
  listBand(ITIN, "ITINERARY & ACCOMMODATION", "One row per day. Net PP is the hotel cost per person for that night; Sngl Supp is the single-room supplement. Type in the next empty row to add a day — the totals update everywhere.");
  sh.getCell(ITIN.tot, 1).value = "TOTALS"; sh.getCell(ITIN.tot, 1).font = { bold: true };
  label(ITIN.tot, 5, "Meal cost total →"); label(ITIN.tot, 11, "Hotel Net PP →"); label(ITIN.tot, 12, "");
  sh.getCell(ITIN.tot, 5).alignment = { horizontal: "right" }; sh.getCell(ITIN.tot, 11).alignment = { horizontal: "right", wrapText: false };
  formulaCell(ITIN.tot, 7, `SUM(G${ITIN.first}:G${ITIN.last})`, Math.round(totMeal), MONEY, { bold: true, size: 12 });
  formulaCell(ITIN.tot, 13, `SUM(M${ITIN.first}:M${ITIN.last})`, Math.round(totHotel), MONEY, { bold: true, size: 12 });
  formulaCell(ITIN.tot, 14, `SUM(N${ITIN.first}:N${ITIN.last})`, Math.round(daySS), MONEY, { bold: true, size: 12 });
  headerSpans(ITIN.hdr, [[1, 1, "Day"], [2, 2, "Date"], [3, 4, "Movement"], [5, 6, "Meal Plan"], [7, 7, "Meal Cost"], [8, 9, "Hotel"], [10, 11, "Alt Hotel"], [12, 12, "Plan"], [13, 13, "Net PP"], [14, 14, "Sngl Supp"], [15, 19, "Notes"]]);
  for (let i = 0; i < ITIN.rows; i++) {
    const row = ITIN.first + i, dd = days[i];
    inputCell(row, 1, dd ? dd.day : null);
    const dt = dd ? excelDate(dd.date) : null;
    inputCell(row, 2, dd ? (dt || formatDateSlash(dd.date) || "") : null, "dd/mm/yyyy");
    inputCell(row, 3, dd ? dd.movement || "" : null, undefined, undefined, 4);
    inputCell(row, 5, dd ? dd.mealPlan || "" : null, undefined, undefined, 6);
    inputCell(row, 7, dd ? n(dd.mealCost) || null : null, MONEY, numValidation(0));
    inputCell(row, 8, dd ? dd.hotel || "" : null, undefined, undefined, 9);
    inputCell(row, 10, dd ? dd.hotelAlt || "" : null, undefined, undefined, 11);
    inputCell(row, 12, dd ? dd.hotelPlan || "" : null);
    inputCell(row, 13, dd ? n(dd.hotelNetPP) || null : null, MONEY, numValidation(0));
    inputCell(row, 14, dd ? n(dd.singleSupp) || null : null, MONEY, numValidation(0));
    inputCell(row, 15, dd ? dd.notes || "" : null, undefined, undefined, 19);
  }

  // Transport
  listBand(TPT, "TRANSPORT", "One row per transport cost. 'Applies to' says which slabs share it: type All, or slab names separated by commas, exactly as written in Step 3 (the dropdown lists them). " +
    "The cost is divided by each slab's paying pax. Leave 'Applies to' empty and the line is not used.");
  headerSpans(TPT.hdr, [[1, 1, "Sector / Description"], [2, 2, "Cost (total)"], [3, 6, "Applies to — All, or slab names separated by commas"], [7, 12, "Notes"]]);
  for (let i = 0; i < TPT.rows; i++) {
    const row = TPT.first + i, tr = transports[i];
    let applies = "";
    if (tr) {
      const ids = (tr.slabs || []).filter((id) => nameById.has(id));
      applies = ids.length && ids.length === slabEntries.length ? "All" : ids.map((id) => nameById.get(id)).join(", ");
    }
    inputCell(row, 1, tr ? tr.sector || tr.vehicleType || "" : null);
    inputCell(row, 2, tr ? n(tr.cost) || null : null, MONEY, numValidation(0));
    inputCell(row, 3, tr ? applies : null, undefined, {
      type: "list", allowBlank: true, formulae: [`$A$${SLAB_FIRST}:$A$${SLAB_LAST}`], showErrorMessage: false,
      showInputMessage: true, promptTitle: "Applies to", prompt: "Pick one slab, or type All, or several slab names separated by commas.",
    }, 6);
    inputCell(row, 7, tr ? tr.notes || "" : null, undefined, undefined, 12);
  }

  // Monuments
  listBand(MON, "MONUMENTS", "One row per monument. Put Y in 'Include' to count its fee in the price. The total used in prices (included fees + the extra monument cost from Step 2) is shown here and in Step 2.");
  label(MON.tot, 1, "Total used in prices →"); sh.getCell(MON.tot, 1).alignment = { horizontal: "right" };
  formulaCell(MON.tot, 2, monTotalAddr, Math.round(monTotal), MONEY, { bold: true });
  headerSpans(MON.hdr, [[1, 1, "Monument"], [2, 2, "Fee"], [3, 3, "Include (Y/N)"], [4, 8, "Notes"]]);
  for (let i = 0; i < MON.rows; i++) {
    const row = MON.first + i, m = monuments[i];
    inputCell(row, 1, m ? m.name || "" : null); inputCell(row, 2, m ? (m.fee ? n(m.fee) : null) : null, MONEY, numValidation(0));
    inputCell(row, 3, m ? (m.include ? "Y" : "N") : null, undefined, YES_NO); inputCell(row, 4, null, undefined, undefined, 8);
  }

  // Local Handlers
  listBand(LH, "LOCAL HANDLERS", "One row per sector / handler. pp = cost per person; lumpsum = one total divided by each slab's paying pax. Single Supp is added to the Single Supplement total.");
  label(LH.tot, 3, "Single Supp total →"); sh.getCell(LH.tot, 3).alignment = { horizontal: "right", wrapText: false };
  formulaCell(LH.tot, 4, `SUM(D${LH.first}:D${LH.last})`, Math.round(handlerSS), MONEY, { bold: true });
  headerSpans(LH.hdr, [[1, 1, "Sector"], [2, 2, "Cost"], [3, 3, "Mode (pp / lumpsum)"], [4, 4, "Single Supp"]]);
  for (let i = 0; i < LH.rows; i++) {
    const row = LH.first + i, h = localHandlers[i];
    inputCell(row, 1, h ? h.sector || "" : null); inputCell(row, 2, h ? n(h.cost) || null : null, MONEY, numValidation(0));
    inputCell(row, 3, h ? h.mode || "pp" : null, undefined, MODE_PP); inputCell(row, 4, h ? n(h.singleSupp) || null : null, MONEY, numValidation(0));
  }

  // Extra Services
  listBand(EXS, "EXTRA SERVICES", "One row per extra service. PP = per person. Lumpsum / Per Vehicle / Per Group = one total, divided by each slab's paying pax.");
  headerSpans(EXS.hdr, [[1, 1, "Description"], [2, 2, "Cost"], [3, 4, "Mode (PP / Lumpsum / Per Vehicle / Per Group)"]]);
  for (let i = 0; i < EXS.rows; i++) {
    const row = EXS.first + i, e = extras[i];
    inputCell(row, 1, e ? e.description || "" : null); inputCell(row, 2, e ? n(e.cost) || null : null, MONEY, numValidation(0));
    // Merged C:D, but the formulas read column C: the mode lives in the anchor cell.
    inputCell(row, 3, e ? e.mode || "PP" : null, undefined, MODE_EXTRA, 4);
  }

  // ── names, widths, freeze, print, protection ──
  names.forEach(([nm, a]) => { try { wb.definedNames.add(`'Cost Sheet'!${a}`, nm); } catch (e) { /* a name clash must never block the export */ } });
  const widths = [26, 16, 11, 20, 12, 12, 12, 12, 12, 12, 12, 13, 11, 12, 12, 14, 13, 12, 11];
  sh.columns.forEach((col, i) => { col.width = widths[i] || 12; });
  sh.views = [{ state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 90 }];
  sh.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    printTitlesRow: "1:4", horizontalCentered: true,
  };
  sh.headerFooter = { oddFooter: `&L&8Unitop Ops — Cost Sheet ${query.tourFileId || query.id || ""} v${currentVersionLabel}&R&8Page &P of &N` };
  // Start each list block on a new printed page.
  [DETAILS, TPT.band, MON.band, LH.band, EXS.band].forEach((r) => { try { sh.getRow(r - 1).addPageBreak(); } catch (e) { /* cosmetic only */ } });

  // Lock the formulas (inputs were unlocked above). No password.
  await sh.protect("", {
    // ExcelJS semantics: true = allowed on the protected sheet.
    selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: true, formatRows: true,
    insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false, sort: false, autoFilter: false,
  });

  return wb;
}
