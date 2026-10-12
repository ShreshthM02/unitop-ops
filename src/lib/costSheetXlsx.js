// Cost Sheet -> Excel workbook.
//
// A WORKING spreadsheet, not a printout. Design rules (each one answers a
// real complaint about the first versions):
//
//   1. One tab per list. Itinerary, Transport, Monuments, Local Handlers and
//      Extra Services each get their own tab with 60 ready rows, so a list
//      never runs into the table below it and there is no "slot limit" to
//      think about. The main "Cost Sheet" tab holds only settings and the
//      price table.
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

export const SLAB_ROWS = 30; // ready-to-use slab rows on the main tab
const LIST_ROWS = 60; // ready-to-use rows on every list tab

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

  const main = wb.addWorksheet("Cost Sheet", { properties: { tabColor: { argb: NAVY } } });
  const itin = wb.addWorksheet("Itinerary", { properties: { tabColor: { argb: STEP_BLUE } } });
  const tpt = wb.addWorksheet("Transport", { properties: { tabColor: { argb: STEP_BLUE } } });
  const mon = wb.addWorksheet("Monuments", { properties: { tabColor: { argb: STEP_BLUE } } });
  const lh = wb.addWorksheet("Local Handlers", { properties: { tabColor: { argb: STEP_BLUE } } });
  const exs = wb.addWorksheet("Extra Services", { properties: { tabColor: { argb: STEP_BLUE } } });
  const allSheets = [main, itin, tpt, mon, lh, exs];

  // ── helpers (all take the sheet explicitly) ─────────────────────────
  const band = (sh, r, text, span) => {
    sh.mergeCells(r, 1, r, span);
    const c = sh.getCell(r, 1);
    c.value = text; c.font = { bold: true, size: 11, color: { argb: WHITE } }; c.fill = solid(NAVY);
    c.alignment = { vertical: "middle" };
    sh.getRow(r).height = 20;
  };
  const title = (sh, text, sub, span, rightText) => {
    const split = rightText ? Math.max(2, span - 5) : span;
    sh.mergeCells(1, 1, 1, split);
    const c = sh.getCell(1, 1); c.value = text; c.font = { bold: true, size: 16, color: { argb: WHITE } }; c.alignment = { vertical: "middle" };
    if (rightText) {
      sh.mergeCells(1, split + 1, 1, span);
      const r = sh.getCell(1, split + 1); r.value = rightText;
      r.font = { italic: true, size: 10, color: { argb: WHITE } }; r.alignment = { vertical: "middle", horizontal: "right" };
    }
    for (let i = 1; i <= span; i++) sh.getCell(1, i).fill = solid(NAVY);
    sh.getRow(1).height = 28;
    sh.mergeCells(2, 1, 2, span);
    const s = sh.getCell(2, 1); s.value = sub; s.font = { italic: true, size: 9, color: { argb: GREY } };
    s.alignment = { wrapText: true, vertical: "top" };
    sh.getRow(2).height = 30;
  };
  const label = (sh, r, c, text) => { const cell = sh.getCell(r, c); cell.value = text; cell.font = { bold: true, size: 9, color: { argb: GREY } }; cell.alignment = { wrapText: true, vertical: "bottom" }; };
  const inputCell = (sh, r, c, val, fmt, validation) => {
    const cell = sh.getCell(r, c);
    cell.value = val === undefined ? null : val;
    cell.fill = solid(INPUT_BG);
    cell.protection = { locked: false };
    cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    if (fmt) cell.numFmt = fmt;
    if (validation) cell.dataValidation = validation;
    return cell;
  };
  const formulaCell = (sh, r, c, formula, result, fmt, extraFont = {}) => {
    const cell = sh.getCell(r, c);
    cell.value = { formula, result: typeof result === "string" ? result : (Number.isFinite(result) ? result : 0) };
    if (fmt) cell.numFmt = fmt;
    cell.font = { size: 10, ...extraFont };
    return cell;
  };
  const headerRow = (sh, r, headers, fill = LIGHT, fontColor = "FF374151") => headers.forEach((h, i) => {
    const c = sh.getCell(r, 1 + i);
    c.value = h; c.font = { bold: true, size: 9, color: { argb: fontColor } }; c.fill = solid(fill);
    c.border = { bottom: { style: "thin", color: { argb: BORDER } } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  const listValidation = (items, prompt) => ({
    type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`],
    showErrorMessage: true, errorStyle: "stop", errorTitle: "Pick from the list", error: `Choose one of: ${items.join(", ")}`,
    ...(prompt ? { showInputMessage: true, promptTitle: prompt[0], prompt: prompt[1] } : {}),
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

  // ═══ Unique, comma-free slab names (the Transport tab matches on them) ═══
  const usedNames = new Set();
  const uniqueName = (raw, fallback) => {
    let base = String(raw || "").replace(/,/g, " ").trim() || fallback;
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

  // ═══ Row geometry of the list tabs ═══
  const ITIN_HDR = 6, ITIN_FIRST = 7, ITIN_ROWS = Math.max(LIST_ROWS, days.length + 20), ITIN_LAST = ITIN_FIRST + ITIN_ROWS - 1;
  const LIST_HDR = 4, LIST_FIRST = 5;
  const rowsFor = (len) => Math.max(LIST_ROWS, len + 20);
  const TPT_LAST = LIST_FIRST + rowsFor(transports.length) - 1;
  const MON_LAST = LIST_FIRST + rowsFor(monuments.length) - 1;
  const LH_LAST = LIST_FIRST + rowsFor(localHandlers.length) - 1;
  const EX_LAST = LIST_FIRST + rowsFor(extras.length) - 1;
  const rng = (sheetName, col, a, b) => `'${sheetName}'!$${col}$${a}:$${col}$${b}`;

  // ═══════════════════════ MAIN TAB: "Cost Sheet" ═══════════════════════
  title(main, "COST SHEET",
    "How to use: yellow cells are the only ones you type in. Step 1–2: settings. Step 3: the price table — add a slab by typing in the next empty row. " +
    "The lists behind the prices (Itinerary, Transport, Monuments, Local Handlers, Extra Services) are on the tabs at the bottom. Every price recalculates as you type.", 19,
    `Version ${currentVersionLabel}  •  Saved ${savedTimestamp}`);

  main.mergeCells(3, 1, 3, 12);
  main.getCell(3, 1).value = `${query.groupName || query.clientName || ""}   •   ${query.destination || query.sector || ""}   •   Tour File: ${query.tourFileId || query.id}`;
  main.getCell(3, 1).font = { bold: true, size: 12 };

  band(main, 5, "STEP 1 — SETTINGS", 19);
  label(main, 6, 1, "GST %"); label(main, 6, 2, "Markup %"); label(main, 6, 3, "ROE"); label(main, 6, 4, "Currency");
  label(main, 6, 6, "Client / Foreign Agent"); label(main, 6, 11, "Assigned Staff");
  const gstCell = inputCell(main, 7, 1, Number(gst) || 0, "0.0", numValidation(0));
  const markupCell = inputCell(main, 7, 2, Number(markup) || 0, "0.0", numValidation(0));
  const roeCell = inputCell(main, 7, 3, Number(roe) || 0, "0.0", numValidation(0));
  const currencyCell = inputCell(main, 7, 4, currency || "US $");
  for (const c of [gstCell, markupCell, roeCell, currencyCell]) c.font = { bold: true, size: 13 };
  inputCell(main, 7, 6, clientAgentName || ""); main.mergeCells(7, 6, 7, 9);
  inputCell(main, 7, 11, assignedStaffName || ""); main.mergeCells(7, 11, 7, 14);
  const gstAddr = abs(7, 1), markupAddr = abs(7, 2), roeAddr = abs(7, 3);
  names.push(["GST_pct", gstAddr], ["Markup_pct", markupAddr], ["ROE", roeAddr], ["Currency", abs(7, 4)]);
  main.getRow(7).height = 22;

  band(main, 9, "STEP 2 — COSTS THAT APPLY TO EVERY SLAB   (pp = per person, lumpsum = one total shared by the paying pax)", 19);
  label(main, 10, 1, "Tour Facilitator — pp or lumpsum"); label(main, 10, 2, "Amount");
  label(main, 10, 4, "Misc — pp or lumpsum"); label(main, 10, 5, "Amount");
  label(main, 10, 7, "Monuments — pp or lumpsum"); label(main, 10, 8, "Extra monument cost");
  main.getRow(10).height = 28;
  inputCell(main, 11, 1, tlMode || "lumpsum", undefined, MODE_PP); inputCell(main, 11, 2, n(tlCost) || null, MONEY, numValidation(0));
  inputCell(main, 11, 4, miscMode || "pp", undefined, MODE_PP); inputCell(main, 11, 5, n(miscCost) || null, MONEY, numValidation(0));
  inputCell(main, 11, 7, monMode || "pp", undefined, MODE_PP); inputCell(main, 11, 8, n(monExtra) || null, MONEY, numValidation(0));
  const tlModeAddr = abs(11, 1), tlCostAddr = abs(11, 2), miscModeAddr = abs(11, 4), miscCostAddr = abs(11, 5), monModeAddr = abs(11, 7), monExtraAddr = abs(11, 8);

  label(main, 13, 1, "Pulled from the other tabs — don't type here");
  label(main, 14, 1, "Accommodation (PP)"); label(main, 14, 4, "Extra Meals (PP)"); label(main, 14, 7, "Monuments (total)"); label(main, 14, 10, "Single Supplement (total)");
  main.getRow(14).height = 28;
  // Totals live at the TOP of their tabs, so lists can grow downward freely.
  const hotelTotalRef = `'Itinerary'!$I$4`, mealTotalRef = `'Itinerary'!$E$4`, daySSRef = `'Itinerary'!$J$4`;
  const handlerSSRef = `'Local Handlers'!$D$3`;
  formulaCell(main, 15, 1, hotelTotalRef, Math.round(totHotel), MONEY, { bold: true, size: 13 });
  formulaCell(main, 15, 4, mealTotalRef, Math.round(totMeal), MONEY, { bold: true, size: 13 });
  const monTotalFormula = `SUMPRODUCT(--(UPPER(TRIM(${rng("Monuments", "C", LIST_FIRST, MON_LAST)}))="Y"),${rng("Monuments", "B", LIST_FIRST, MON_LAST)})+N(${monExtraAddr})`;
  formulaCell(main, 15, 7, monTotalFormula, Math.round(monTotal), MONEY, { bold: true, size: 13 });
  formulaCell(main, 15, 10, `${daySSRef}+${handlerSSRef}`, Math.round(totSS), MONEY, { bold: true, size: 13, color: { argb: ACCENT } });
  const hotelAddr = abs(15, 1), mealAddr = abs(15, 4), monTotalAddr = abs(15, 7), ssTotalAddr = abs(15, 10);
  names.push(["Hotel_total_PP", hotelAddr], ["Meal_total_PP", mealAddr], ["Monument_total", monTotalAddr], ["Single_supp_total", ssTotalAddr]);
  main.getRow(15).height = 22;

  band(main, 17, "STEP 3 — SLABS & PRICES      ◄ to add a slab, type in the next empty row (30 rows ready)", 19);
  main.mergeCells(18, 1, 18, 19);
  main.getCell(18, 1).value = "Fill Name, Vehicle and Paying pax. For a TOUR LEADER slab also type the Tour Leader's own cost (the total for the escort) in the last yellow column — it is spread across the paying pax and the row turns amber. " +
    "Which transport lines count for a slab is set on the Transport tab, by slab name.";
  main.getCell(18, 1).font = { italic: true, size: 9, color: { argb: GREY } };
  main.getCell(18, 1).alignment = { wrapText: true, vertical: "top" };
  main.getRow(18).height = 28;

  const SLAB_HDR = 19, SLAB_FIRST = 20, SLAB_LAST = SLAB_FIRST + SLAB_ROWS - 1;
  const slabHeaders = ["Slab name", "Vehicle", "Paying pax", "Tour Leader's own cost (total) — T/L slabs only",
    "Transport", "Tour Facil", "Misc", "Monuments", "Local Hdlr", "Extras", "T/L surcharge", "Sub-total", "GST", "After Tax", "Markup",
    `Final Price (${currency || "—"})`, `Single Supp (${currency || "—"})`, "App price at export", "Matches app?"];
  headerRow(main, SLAB_HDR, slabHeaders, NAVY, WHITE);
  for (const c of [1, 2, 3, 4]) main.getCell(SLAB_HDR, c).fill = solid(STEP_BLUE);
  for (const c of [18, 19]) main.getCell(SLAB_HDR, c).fill = solid(GREY);
  main.getRow(SLAB_HDR).height = 44;

  const T = { b: rng("Transport", "B", LIST_FIRST, TPT_LAST), c: rng("Transport", "C", LIST_FIRST, TPT_LAST) };
  const L = { b: rng("Local Handlers", "B", LIST_FIRST, LH_LAST), c: rng("Local Handlers", "C", LIST_FIRST, LH_LAST) };
  const X = { b: rng("Extra Services", "B", LIST_FIRST, EX_LAST), c: rng("Extra Services", "C", LIST_FIRST, EX_LAST) };
  const roeOk = `${roeAddr}>0`;

  for (let i = 0; i < SLAB_ROWS; i++) {
    const row = SLAB_FIRST + i;
    const e = slabEntries[i] || null;
    const tlEntry = e && e.tl;
    const c0 = e ? (e.tl ? calcTlSlab(e.src) : calcSlab(e.src)) : { tptPP: 0, tlPP: 0, miscPP: 0, monPP: 0, localPP: 0, extrasPP: 0, surchargePP: 0, sub: 0, tax: 0, afterTax: 0, markupAmt: 0, finalFX: 0, ssFX: 0 };
    const pax = e ? (e.tl ? n(e.src.pax) : Number(e.src.foc) || 0) : null;
    const vehicle = e ? (e.src.vehicle === "Others" ? e.src.vehicleOther : e.src.vehicle) || "" : "";
    const tlOwn = tlEntry ? Object.entries(e.src.costs || {}).reduce((a, [k, v]) => a + ((e.src.includes || {})[k] ? n(v) : 0), 0) : null;

    const nm = inputCell(main, row, 1, e ? e.name : "", undefined, {
      type: "custom", allowBlank: true,
      formulae: [`AND(ISERROR(FIND(",",$A${row})),COUNTIF($A$${SLAB_FIRST}:$A$${SLAB_LAST},$A${row})=1)`],
      showErrorMessage: true, errorStyle: "stop", errorTitle: "Slab name",
      error: "Each slab needs its own name, and it can't contain a comma (the Transport tab matches on names).",
    });
    nm.font = { bold: true, color: { argb: tlEntry ? TL_BROWN : "FF111827" } };
    inputCell(main, row, 2, vehicle);
    inputCell(main, row, 3, pax, "0", numValidation(0)).font = { bold: true };
    inputCell(main, row, 4, tlOwn, MONEY, numValidation(0));

    const P = `$C${row}`;
    const tptF = `IF(${P}>0,SUMPRODUCT(--(((TRIM(${T.c})="All")+ISNUMBER(SEARCH(","&TRIM($A${row})&",",","&SUBSTITUTE(${T.c},", ",",")&",")))>0),${T.b})/${P},0)`;
    const tlF = `IF(${isPP(tlModeAddr)},N(${tlCostAddr}),IF(${P}>0,N(${tlCostAddr})/${P},0))`;
    const miscF = `IF(${isPP(miscModeAddr)},N(${miscCostAddr}),IF(${P}>0,N(${miscCostAddr})/${P},0))`;
    const monF = `IF(${isPP(monModeAddr)},${monTotalAddr},IF(${P}>0,${monTotalAddr}/${P},0))`;
    const lhF = `SUMPRODUCT(--(LOWER(TRIM(${L.c}))="pp"),${L.b})+IF(${P}>0,SUMPRODUCT(--(LOWER(TRIM(${L.c}))<>"pp"),${L.b})/${P},0)`;
    const exF = `SUMPRODUCT(--(UPPER(TRIM(${X.c}))="PP"),${X.b})+IF(${P}>0,SUMPRODUCT(--(UPPER(TRIM(${X.c}))<>"PP"),${X.b})/${P},0)`;
    formulaCell(main, row, 5, tptF, c0.tptPP, MONEY);
    formulaCell(main, row, 6, tlF, c0.tlPP, MONEY);
    formulaCell(main, row, 7, miscF, c0.miscPP, MONEY);
    formulaCell(main, row, 8, monF, c0.monPP, MONEY);
    formulaCell(main, row, 9, lhF, c0.localPP, MONEY);
    formulaCell(main, row, 10, exF, c0.extrasPP, MONEY);
    formulaCell(main, row, 11, `IF(${P}>0,N($D${row})/${P},0)`, tlEntry ? c0.surchargePP : 0, MONEY, { bold: true, color: { argb: TL_BROWN } });
    const sub = addr(row, 12);
    formulaCell(main, row, 12, `${hotelAddr}+${mealAddr}+SUM(${addr(row, 5)}:${addr(row, 11)})`, c0.sub, MONEY);
    formulaCell(main, row, 13, `ROUND(${sub}*${gstAddr}/100,0)`, c0.tax, MONEY);
    formulaCell(main, row, 14, `${sub}+${addr(row, 13)}`, c0.afterTax, MONEY);
    formulaCell(main, row, 15, `ROUND(${addr(row, 14)}*${markupAddr}/100,0)`, c0.markupAmt, MONEY);
    formulaCell(main, row, 16, `IF(${roeOk},CEILING((${addr(row, 14)}+${addr(row, 15)})/${roeAddr},1),0)`, c0.finalFX, MONEY, { bold: true, size: 11, color: { argb: ACCENT } });
    formulaCell(main, row, 17, `IF(${roeOk},CEILING((${ssTotalAddr}+${ssTotalAddr}*${gstAddr}/100)*(1+${markupAddr}/100)/${roeAddr},1),0)`, c0.ssFX, MONEY);
    if (e) {
      const app = main.getCell(row, 18); app.value = c0.finalFX; app.numFmt = MONEY; app.font = { size: 9, color: { argb: GREY } };
      const chk = main.getCell(row, 19);
      chk.value = { formula: `IF(ABS(${addr(row, 16)}-${addr(row, 18)})<0.5,"✔ yes","edited")`, result: "✔ yes" };
      chk.font = { size: 9, color: { argb: GOOD } };
    }
  }

  // Conditional formatting: invisible empty rows, red zero-pax, amber T/L rows, "edited" flag.
  const redFill = { type: "pattern", pattern: "solid", bgColor: { argb: BAD_BG } };
  main.addConditionalFormatting({ ref: `C${SLAB_FIRST}:C${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`AND(ISNUMBER(C${SLAB_FIRST}),C${SLAB_FIRST}<=0)`], style: { fill: redFill, font: { color: { argb: "FFB91C1C" }, bold: true } } }] });
  main.addConditionalFormatting({ ref: `E${SLAB_FIRST}:S${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`$C${SLAB_FIRST}=""`], style: { font: { color: { argb: "FFFFFFFF" } } } }] });
  main.addConditionalFormatting({ ref: `A${SLAB_FIRST}:D${SLAB_LAST}`, rules: [{ type: "expression", formulae: [`N($D${SLAB_FIRST})>0`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: TL_TINT } } } }] });
  main.addConditionalFormatting({ ref: `S${SLAB_FIRST}:S${SLAB_LAST}`, rules: [{ type: "cellIs", operator: "equal", formulae: ['"edited"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: WARN_BG } }, font: { color: { argb: "FF92400E" } } } }] });

  // ═══════════════════════ TAB: Itinerary ═══════════════════════
  title(itin, "ITINERARY & ACCOMMODATION",
    "One row per day. Net PP is the hotel cost per person for that night; Sngl Supp is the single-room supplement. Type in the next empty row to add a day — totals above update everywhere.", 11);
  label(itin, 3, 5, "Meal cost total"); label(itin, 3, 9, "Hotel Net PP total"); label(itin, 3, 10, "Single Supp total");
  itin.getCell(4, 1).value = "TOTALS"; itin.getCell(4, 1).font = { bold: true };
  formulaCell(itin, 4, 5, `SUM(E${ITIN_FIRST}:E${ITIN_LAST})`, Math.round(totMeal), MONEY, { bold: true, size: 12 });
  formulaCell(itin, 4, 9, `SUM(I${ITIN_FIRST}:I${ITIN_LAST})`, Math.round(totHotel), MONEY, { bold: true, size: 12 });
  formulaCell(itin, 4, 10, `SUM(J${ITIN_FIRST}:J${ITIN_LAST})`, Math.round(daySS), MONEY, { bold: true, size: 12 });
  headerRow(itin, ITIN_HDR, ["Day", "Date", "Movement", "Meal Plan", "Meal Cost", "Hotel", "Alt Hotel", "Plan", "Net PP", "Sngl Supp", "Notes"]);
  for (let i = 0; i < ITIN_ROWS; i++) {
    const row = ITIN_FIRST + i, dd = days[i];
    inputCell(itin, row, 1, dd ? dd.day : null);
    const dt = dd ? excelDate(dd.date) : null;
    inputCell(itin, row, 2, dd ? (dt || formatDateSlash(dd.date) || "") : null, "dd/mm/yyyy");
    inputCell(itin, row, 3, dd ? dd.movement || "" : null); inputCell(itin, row, 4, dd ? dd.mealPlan || "" : null);
    inputCell(itin, row, 5, dd ? n(dd.mealCost) || null : null, MONEY, numValidation(0));
    inputCell(itin, row, 6, dd ? dd.hotel || "" : null); inputCell(itin, row, 7, dd ? dd.hotelAlt || "" : null); inputCell(itin, row, 8, dd ? dd.hotelPlan || "" : null);
    inputCell(itin, row, 9, dd ? n(dd.hotelNetPP) || null : null, MONEY, numValidation(0));
    inputCell(itin, row, 10, dd ? n(dd.singleSupp) || null : null, MONEY, numValidation(0));
    inputCell(itin, row, 11, dd ? dd.notes || "" : null);
    if (dd) for (const c of [3, 6, 7, 11]) itin.getCell(row, c).alignment = { wrapText: true, vertical: "top" };
  }

  // ═══════════════════════ TAB: Transport ═══════════════════════
  title(tpt, "TRANSPORT",
    "One row per transport cost. 'Applies to' says which slabs share this cost: type All, or slab names separated by commas (exactly as written in Step 3 — the list on the right shows them). " +
    "The cost is divided by each slab's paying pax. Leave 'Applies to' empty and the line is not used.", 6);
  headerRow(tpt, LIST_HDR, ["Sector / Description", "Cost (total)", "Applies to — All, or slab names separated by commas", "Notes", "", "Slab names (copy from here)"]);
  tpt.getCell(LIST_HDR, 5).fill = { type: "pattern", pattern: "none" }; tpt.getCell(LIST_HDR, 5).border = {};
  const allIds = slabEntries.map((en) => en.src.id);
  const tptCount = rowsFor(transports.length);
  for (let i = 0; i < tptCount; i++) {
    const row = LIST_FIRST + i, t = transports[i];
    let applies = "";
    if (t) {
      const ids = (t.slabs || []).filter((id) => nameById.has(id));
      applies = ids.length && ids.length === allIds.length ? "All" : ids.map((id) => nameById.get(id)).join(", ");
    }
    inputCell(tpt, row, 1, t ? t.sector || t.vehicleType || "" : null);
    inputCell(tpt, row, 2, t ? n(t.cost) || null : null, MONEY, numValidation(0));
    inputCell(tpt, row, 3, t ? applies : null, undefined, {
      type: "list", allowBlank: true, formulae: [`$F$${LIST_FIRST}:$F$${LIST_FIRST + SLAB_ROWS}`], showErrorMessage: false,
      showInputMessage: true, promptTitle: "Applies to", prompt: "Pick one slab, or type All, or several slab names separated by commas.",
    });
    inputCell(tpt, row, 4, t ? t.notes || "" : null);
  }
  const listRef = tpt.getCell(LIST_FIRST, 6); // "All" first, then every slab name
  listRef.value = "All"; listRef.font = { bold: true, size: 10, color: { argb: GREY } };
  for (let i = 0; i < SLAB_ROWS; i++) {
    const src = `'Cost Sheet'!$A$${SLAB_FIRST + i}`;
    formulaCell(tpt, LIST_FIRST + 1 + i, 6, `IF(${src}="","",${src})`, slabEntries[i] ? slabEntries[i].name : "", undefined, { color: { argb: GREY } });
  }

  // ═══════════════════════ TAB: Monuments ═══════════════════════
  title(mon, "MONUMENTS",
    "One row per monument. Put Y in 'Include' to count its fee in the price. The total (included fees + the extra monument cost from Step 2) is on the Cost Sheet tab.", 4);
  headerRow(mon, LIST_HDR, ["Monument", "Fee", "Include (Y/N)", "Notes"]);
  mon.getCell(3, 1).value = "Total used in prices:"; mon.getCell(3, 1).font = { bold: true, size: 9, color: { argb: GREY } };
  formulaCell(mon, 3, 2, `'Cost Sheet'!${monTotalAddr}`, Math.round(monTotal), MONEY, { bold: true });
  for (let i = 0; i < rowsFor(monuments.length); i++) {
    const row = LIST_FIRST + i, m = monuments[i];
    inputCell(mon, row, 1, m ? m.name || "" : null); inputCell(mon, row, 2, m ? (m.fee ? n(m.fee) : null) : null, MONEY, numValidation(0));
    inputCell(mon, row, 3, m ? (m.include ? "Y" : "N") : null, undefined, YES_NO); inputCell(mon, row, 4, null);
  }

  // ═══════════════════════ TAB: Local Handlers ═══════════════════════
  title(lh, "LOCAL HANDLERS",
    "One row per sector / handler. pp = cost per person; lumpsum = one total divided by each slab's paying pax. Single Supp is added to the Single Supplement total.", 4);
  label(lh, 3, 3, "Single Supp total");
  headerRow(lh, LIST_HDR, ["Sector", "Cost", "Mode (pp / lumpsum)", "Single Supp"]);
  formulaCell(lh, 3, 4, `SUM(D${LIST_FIRST}:D${LH_LAST})`, Math.round(handlerSS), MONEY, { bold: true });
  for (let i = 0; i < rowsFor(localHandlers.length); i++) {
    const row = LIST_FIRST + i, h = localHandlers[i];
    inputCell(lh, row, 1, h ? h.sector || "" : null); inputCell(lh, row, 2, h ? n(h.cost) || null : null, MONEY, numValidation(0));
    inputCell(lh, row, 3, h ? h.mode || "pp" : null, undefined, MODE_PP); inputCell(lh, row, 4, h ? n(h.singleSupp) || null : null, MONEY, numValidation(0));
  }

  // ═══════════════════════ TAB: Extra Services ═══════════════════════
  title(exs, "EXTRA SERVICES",
    "One row per extra service. PP = per person. Lumpsum / Per Vehicle / Per Group = one total, divided by each slab's paying pax.", 3);
  headerRow(exs, LIST_HDR, ["Description", "Cost", "Mode (PP / Lumpsum / Per Vehicle / Per Group)"]);
  for (let i = 0; i < rowsFor(extras.length); i++) {
    const row = LIST_FIRST + i, e = extras[i];
    inputCell(exs, row, 1, e ? e.description || "" : null); inputCell(exs, row, 2, e ? n(e.cost) || null : null, MONEY, numValidation(0));
    inputCell(exs, row, 3, e ? e.mode || "PP" : null, undefined, MODE_EXTRA);
  }

  // ── names, widths, freeze, print, protection ──
  names.forEach(([nm, a]) => { try { wb.definedNames.add(`'Cost Sheet'!${a}`, nm); } catch (e) { /* a name clash must never block the export */ } });

  const setWidths = (sh, w) => sh.columns.forEach((col, i) => { col.width = w[i] || 12; });
  setWidths(main, [26, 16, 11, 20, 12, 12, 12, 12, 12, 12, 12, 13, 11, 12, 12, 14, 13, 12, 11]);
  setWidths(itin, [8, 12, 28, 12, 12, 24, 22, 10, 12, 12, 30]);
  setWidths(tpt, [34, 14, 42, 26, 3, 24]);
  setWidths(mon, [34, 14, 14, 30]);
  setWidths(lh, [30, 14, 20, 14]);
  setWidths(exs, [40, 14, 40]);

  main.views = [{ state: "frozen", ySplit: 3, showGridLines: false, zoomScale: 90 }];
  itin.views = [{ state: "frozen", ySplit: ITIN_HDR, showGridLines: false, zoomScale: 90 }];
  for (const sh of [tpt, mon, lh, exs]) sh.views = [{ state: "frozen", ySplit: LIST_HDR, showGridLines: false, zoomScale: 90 }];

  const footer = `&L&8Unitop Ops — Cost Sheet ${query.tourFileId || query.id || ""} v${currentVersionLabel}  •  &A&R&8Page &P of &N`;
  allSheets.forEach((sh, i) => {
    sh.pageSetup = {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
      printTitlesRow: i === 0 ? "1:3" : (sh === itin ? `1:${ITIN_HDR}` : `1:${LIST_HDR}`), horizontalCentered: true,
    };
    sh.headerFooter = { oddFooter: footer };
  });
  // Print only what has content (the ready-to-use blank rows stay off paper).
  const printTo = (sh, lastCol, firstRow, count, minRows = 3) => { sh.pageSetup.printArea = `$A$1:$${lastCol}$${firstRow + Math.max(count, minRows) + 1}`; };
  printTo(main, "S", SLAB_FIRST, slabEntries.length);
  printTo(itin, "K", ITIN_FIRST, days.length);
  printTo(tpt, "F", LIST_FIRST, Math.max(transports.length, SLAB_ROWS + 1)); // include the slab-name list
  printTo(mon, "D", LIST_FIRST, monuments.length);
  printTo(lh, "D", LIST_FIRST, localHandlers.length);
  printTo(exs, "C", LIST_FIRST, extras.length);

  // Lock the formulas (inputs were unlocked above). No password.
  for (const sh of allSheets) {
    await sh.protect("", {
      // ExcelJS semantics: true = allowed on the protected sheet.
      selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: true, formatRows: true,
      insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false, sort: false, autoFilter: false,
    });
  }

  return wb;
}
