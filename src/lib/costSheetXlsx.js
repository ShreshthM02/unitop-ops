// Cost Sheet -> Excel workbook.
//
// A WORKING spreadsheet, not a printout: every price is a live formula that
// reads the yellow input cells, so a colleague can change a rate, a slab size
// or the ROE offline and watch the selling price recalculate.
//
// What this module guarantees (each point was a real weakness of the first
// version):
//   - Never shows #DIV/0!: every "divide by paying pax" is guarded, matching
//     the app (a slab with 0 pax prices at 0, it does not error).
//   - Formulas are the app's own arithmetic in the same order, so Excel and
//     the app agree to the rupee (see costSheetCalc.js). The "App @ export /
//     Check" columns prove it on opening and flag when the sheet has since
//     been edited.
//   - Tour Leader slabs are live too (inputs + formulas), including their
//     column in the transport matrix, instead of pasted numbers.
//   - Monument mode is a real input, not a value baked into formulas.
//   - Input cells have dropdowns / number validation, so a typo like "lumsum"
//     can't silently change the maths. Mode text is compared case- and
//     space-insensitively.
//   - Dates are real Excel dates; text and numbers are never mixed in a
//     calculation column.
//   - Formula cells are locked (sheet protected WITHOUT a password -- Review >
//     Unprotect Sheet turns it off), inputs are unlocked.
//   - Print-ready: landscape, fit to one page wide, repeated title rows,
//     footer with page numbers. Frozen title rows, sensible column widths,
//     named ranges for the settings, recalculates on open.

const NAVY = "FF0D1B2A", ACCENT = "FFC0392B", LIGHT = "FFF3F4F6", WHITE = "FFFFFFFF", GREY = "FF6B7280";
const ZEBRA = "FFFAFAFA", BORDER = "FFD1D5DB", INPUT_BG = "FFFFFDE7", TL_BROWN = "FF7D6608";
const GOOD = "FF047857", WARN_BG = "FFFEF3C7", BAD_BG = "FFFEE2E2";

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

export const TL_COST_KEYS = [
  ["hotel", "Hotel (PP)"], ["meals", "Extra Meals (PP)"], ["transport", "Transport (PP)"],
  ["monument", "Monument (PP)"], ["localHandler", "Local Handler (PP)"], ["extras", "Extras (PP)"],
];

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
  const sheet = wb.addWorksheet("Cost Sheet", { properties: { tabColor: { argb: NAVY } } });

  // ── helpers ─────────────────────────────────────────────────────────
  const navyBand = (r, text, span = 14) => {
    sheet.mergeCells(r, 1, r, span);
    const c = sheet.getCell(r, 1);
    c.value = text; c.font = { bold: true, size: 11, color: { argb: WHITE } }; c.fill = solid(NAVY);
    c.alignment = { vertical: "middle" };
    sheet.getRow(r).height = 20;
  };
  const label = (r, c, text) => { const cell = sheet.getCell(r, c); cell.value = text; cell.font = { bold: true, size: 9, color: { argb: GREY } }; };
  // Input cells: pale-yellow, unlocked; everything else is a locked formula.
  const inputCell = (r, c, val, fmt, validation) => {
    const cell = sheet.getCell(r, c);
    cell.value = val;
    cell.fill = solid(INPUT_BG);
    cell.protection = { locked: false };
    cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    if (fmt) cell.numFmt = fmt;
    if (validation) cell.dataValidation = validation;
    return cell;
  };
  const formulaCell = (r, c, formula, result, fmt, extraFont = {}) => {
    const cell = sheet.getCell(r, c);
    cell.value = { formula, result: Number.isFinite(result) ? result : 0 };
    if (fmt) cell.numFmt = fmt;
    cell.font = { size: 9, ...extraFont };
    return cell;
  };
  const sectionHeaders = (r, headers, startCol = 1) => headers.forEach((h, i) => {
    const c = sheet.getCell(r, startCol + i);
    c.value = h; c.font = { bold: true, size: 9, color: { argb: "FF374151" } }; c.fill = solid(LIGHT);
    c.border = { bottom: { style: "thin", color: { argb: BORDER } } };
    c.alignment = { vertical: "middle", wrapText: true };
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
  const names = []; // [name, address] pairs, added at the end

  // Text-safe, case/space-insensitive comparisons used inside formulas.
  const isPP = (ref) => `LOWER(TRIM(${ref}))="pp"`;
  const isPPrange = (rng) => `--(LOWER(TRIM(${rng}))="pp")`;
  const notPPrange = (rng) => `--(LOWER(TRIM(${rng}))<>"pp")`;
  const isYrange = (rng) => `--(UPPER(TRIM(${rng}))="Y")`;

  let row = 1;

  // ── Title band ──
  sheet.mergeCells(row, 1, row, 9);
  sheet.getCell(row, 1).value = "COST SHEET";
  sheet.getCell(row, 1).font = { bold: true, size: 18, color: { argb: WHITE } };
  sheet.getCell(row, 1).alignment = { vertical: "middle" };
  sheet.mergeCells(row, 10, row, 18);
  sheet.getCell(row, 10).value = `Version ${currentVersionLabel}  •  Saved ${savedTimestamp}`;
  sheet.getCell(row, 10).font = { italic: true, size: 10, color: { argb: WHITE } };
  sheet.getCell(row, 10).alignment = { vertical: "middle", horizontal: "right" };
  for (let c = 1; c <= 18; c++) sheet.getCell(row, c).fill = solid(NAVY);
  sheet.getRow(row).height = 30; row++;

  sheet.mergeCells(row, 1, row, 14);
  sheet.getCell(row, 1).value = `${query.groupName || query.clientName || ""}   •   ${query.destination || query.sector || ""}   •   Tour File: ${query.tourFileId || query.id}`;
  sheet.getCell(row, 1).font = { bold: true, size: 12 };
  const titleRows = row; row += 1;

  // Legend
  sheet.mergeCells(row, 1, row, 14);
  const legend = sheet.getCell(row, 1);
  legend.value = "Yellow cells are inputs — change them and every price recalculates. Everything else is a formula (the sheet is protected without a password: Review ▸ Unprotect Sheet if you need to restructure it).";
  legend.font = { italic: true, size: 9, color: { argb: GREY } };
  legend.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(row).height = 26;
  row += 2;

  label(row, 1, "Client / Foreign Agent"); label(row, 5, "Assigned Staff");
  row++;
  inputCell(row, 1, clientAgentName || ""); sheet.mergeCells(row, 1, row, 4);
  inputCell(row, 5, assignedStaffName || ""); sheet.mergeCells(row, 5, row, 8);
  row += 2;

  // ── Settings ──
  navyBand(row, "SETTINGS — edit these, every price below recalculates", 14); row++;
  label(row, 1, "GST %"); label(row, 3, "Markup %"); label(row, 5, "ROE"); label(row, 7, "Currency");
  row++;
  const gstCell = inputCell(row, 1, Number(gst) || 0, "0.0", numValidation(0)); gstCell.font = { bold: true, size: 13 };
  const markupCell = inputCell(row, 3, Number(markup) || 0, "0.0", numValidation(0)); markupCell.font = { bold: true, size: 13 };
  const roeCell = inputCell(row, 5, Number(roe) || 0, "0.0", numValidation(0)); roeCell.font = { bold: true, size: 13 };
  const currencyCell = inputCell(row, 7, currency || "US $"); currencyCell.font = { bold: true, size: 13 };
  const gstAddr = abs(row, 1), markupAddr = abs(row, 3), roeAddr = abs(row, 5);
  names.push(["GST_pct", gstAddr], ["Markup_pct", markupAddr], ["ROE", roeAddr], ["Currency", abs(row, 7)]);
  row += 2;

  // ── Day-wise Itinerary & Accommodation ──
  navyBand(row, "DAY-WISE ITINERARY & ACCOMMODATION", 11); row++;
  sectionHeaders(row, ["Day", "Date", "Movement", "Meal Plan", "Meal Cost", "Hotel", "Alt Hotel", "Plan", "Net PP", "Sngl Supp", "Notes"]);
  row++;
  const dayFirstRow = row;
  days.forEach((dd, i) => {
    inputCell(row, 1, dd.day);
    const dt = excelDate(dd.date);
    inputCell(row, 2, dt || formatDateSlash(dd.date) || "", dt ? "dd/mm/yyyy" : undefined);
    inputCell(row, 3, dd.movement || ""); inputCell(row, 4, dd.mealPlan || "");
    inputCell(row, 5, n(dd.mealCost) || 0, MONEY, numValidation(0)); inputCell(row, 6, dd.hotel || ""); inputCell(row, 7, dd.hotelAlt || ""); inputCell(row, 8, dd.hotelPlan || "");
    inputCell(row, 9, n(dd.hotelNetPP) || 0, MONEY, numValidation(0)); inputCell(row, 10, n(dd.singleSupp) || 0, MONEY, numValidation(0)); inputCell(row, 11, dd.notes || "");
    for (const c of [3, 6, 7, 11]) sheet.getCell(row, c).alignment = { wrapText: true, vertical: "top" };
    if (i % 2 === 1) for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) sheet.getCell(row, c).border = { bottom: { style: "hair", color: { argb: BORDER } }, top: { style: "hair", color: { argb: BORDER } } };
    row++;
  });
  const dayLastRow = Math.max(dayFirstRow, row - 1);
  sheet.mergeCells(row, 1, row, 3); sheet.getCell(row, 1).value = "TOTALS"; sheet.getCell(row, 1).font = { bold: true };
  formulaCell(row, 5, `SUM(E${dayFirstRow}:E${dayLastRow})`, Math.round(totMeal), MONEY, { bold: true });
  formulaCell(row, 9, `SUM(I${dayFirstRow}:I${dayLastRow})`, Math.round(totHotel), MONEY, { bold: true });
  formulaCell(row, 10, `SUM(J${dayFirstRow}:J${dayLastRow})`, Math.round(daySS), MONEY, { bold: true });
  const mealTotalAddr = abs(row, 5), hotelTotalAddr = abs(row, 9), daySSTotalAddr = abs(row, 10);
  for (let c = 1; c <= 11; c++) sheet.getCell(row, c).border = { top: { style: "thin", color: { argb: BORDER } } };
  row += 3;

  // ── Cost Line Items ──
  navyBand(row, "COST LINE ITEMS", 14); row++;

  label(row, 1, "Tour Leader / Facilitator Cost — Mode (pp / lumpsum)"); label(row, 4, "Amount");
  row++;
  inputCell(row, 1, tlMode || "lumpsum", undefined, MODE_PP); inputCell(row, 4, n(tlCost) || 0, MONEY, numValidation(0));
  const tlModeAddr = abs(row, 1), tlCostAddr = abs(row, 4);
  row += 2;

  label(row, 1, "Misc Cost — Mode (pp / lumpsum)"); label(row, 4, "Amount");
  row++;
  inputCell(row, 1, miscMode || "pp", undefined, MODE_PP); inputCell(row, 4, n(miscCost) || 0, MONEY, numValidation(0));
  const miscModeAddr = abs(row, 1), miscCostAddr = abs(row, 4);
  row += 2;

  // Monuments
  label(row, 1, "Monuments"); row++;
  sectionHeaders(row, ["Monument", "Fee", "Include (Y/N)"]);
  row++;
  const monFirstRow = row;
  const monRowCount = Math.max(monuments.length + 3, 4);
  for (let i = 0; i < monRowCount; i++) {
    const m = monuments[i];
    inputCell(row, 1, m?.name || ""); inputCell(row, 2, m ? (m.fee ? n(m.fee) : 0) : 0, MONEY, numValidation(0)); inputCell(row, 3, m ? (m.include ? "Y" : "N") : "N", undefined, YES_NO);
    row++;
  }
  const monLastRow = row - 1;
  label(row, 1, "Extra Monument Cost (not tied to a specific monument)");
  inputCell(row, 4, n(monExtra) || 0, MONEY, numValidation(0));
  const monExtraAddr = abs(row, 4);
  row++;
  label(row, 1, "Monument Mode — pp / lumpsum");
  inputCell(row, 4, monMode || "pp", undefined, MODE_PP);
  const monModeAddr = abs(row, 4);
  row++;
  label(row, 1, "Monument Total");
  formulaCell(row, 4, `SUMPRODUCT(${isYrange(`C${monFirstRow}:C${monLastRow}`)},B${monFirstRow}:B${monLastRow})+${monExtraAddr}`, Math.round(monTotal), MONEY, { bold: true });
  const monTotalAddr = abs(row, 4);
  row += 2;

  // Local Handler(s)
  label(row, 1, "Local Handler(s)"); row++;
  sectionHeaders(row, ["Sector", "Cost", "Mode (pp / lumpsum)", "Single Supp"]);
  row++;
  const lhFirstRow = row;
  const lhRowCount = Math.max(localHandlers.length + 3, 4);
  for (let i = 0; i < lhRowCount; i++) {
    const h = localHandlers[i];
    inputCell(row, 1, h?.sector || ""); inputCell(row, 2, h ? n(h.cost) || 0 : 0, MONEY, numValidation(0));
    inputCell(row, 3, h?.mode || "pp", undefined, MODE_PP); inputCell(row, 4, h ? n(h.singleSupp) || 0 : 0, MONEY, numValidation(0));
    row++;
  }
  const lhLastRow = row - 1;
  label(row, 1, "Local Handler Single Supp Total");
  formulaCell(row, 4, `SUM(D${lhFirstRow}:D${lhLastRow})`, Math.round(handlerSS), MONEY, { bold: true });
  const handlerSSAddr = abs(row, 4);
  row += 2;

  // Extra Services
  label(row, 1, "Extra Services"); row++;
  sectionHeaders(row, ["Description", "Cost", "Mode (PP / Lumpsum / Per Vehicle / Per Group)"]);
  row++;
  const exFirstRow = row;
  const exRowCount = Math.max(extras.length + 3, 4);
  for (let i = 0; i < exRowCount; i++) {
    const e = extras[i];
    inputCell(row, 1, e?.description || ""); inputCell(row, 2, e ? n(e.cost) || 0 : 0, MONEY, numValidation(0)); inputCell(row, 3, e?.mode || "PP", undefined, MODE_EXTRA);
    row++;
  }
  const exLastRow = row - 1;
  row++;

  // Transportation matrix: one column per group slab, then one per T/L slab
  label(row, 1, "Transportation — mark Y under each slab this line applies to"); row++;
  const matrixSlabs = [...slabs.map((s) => ({ s })), ...tlSlabs.map((s) => ({ s, tl: true }))];
  sectionHeaders(row, ["Sector / Description", "Cost", ...matrixSlabs.map((m) => m.s.label)]);
  matrixSlabs.forEach((m, i) => { if (m.tl) { const c = sheet.getCell(row, 3 + i); c.font = { bold: true, size: 9, color: { argb: TL_BROWN } }; } });
  row++;
  const tptFirstRow = row;
  const tptRowCount = Math.max(transports.length + 3, 4);
  for (let i = 0; i < tptRowCount; i++) {
    const t = transports[i];
    inputCell(row, 1, t?.sector || t?.vehicleType || ""); inputCell(row, 2, t ? n(t.cost) || 0 : 0, MONEY, numValidation(0));
    matrixSlabs.forEach((m, si) => { inputCell(row, 3 + si, t && (t.slabs || []).includes(m.s.id) ? "Y" : "", undefined, YES_NO); });
    row++;
  }
  const tptLastRow = row - 1;
  const matrixCol = (s) => 3 + matrixSlabs.findIndex((m) => m.s === s);
  row += 2;

  // Tour Leader slab inputs (live)
  const tlInputRows = [];
  if (tlSlabs.length) {
    label(row, 1, "Tour Leader slabs — the T/L doesn't pay: their costs are spread across this slab's paying guests. Per-pax costs; Y = include in the T/L surcharge."); row++;
    const hdr = ["T/L Slab Name", "Vehicle", "Paying Pax", ...TL_COST_KEYS.map(([, l]) => l), ...TL_COST_KEYS.map(([, l]) => `Incl. ${l.replace(" (PP)", "")}`)];
    sectionHeaders(row, hdr);
    for (let c = 1; c <= hdr.length; c++) sheet.getCell(row, c).fill = solid("FFFEF3C7");
    row++;
    tlSlabs.forEach((tl) => {
      inputCell(row, 1, tl.label).font = { bold: true, color: { argb: TL_BROWN } };
      inputCell(row, 2, tl.vehicle === "Others" ? tl.vehicleOther : tl.vehicle || "");
      inputCell(row, 3, n(tl.pax) || 0, "0", numValidation(0));
      TL_COST_KEYS.forEach(([k], i) => {
        inputCell(row, 4 + i, n((tl.costs || {})[k]) || 0, MONEY, numValidation(0));
        inputCell(row, 10 + i, (tl.includes || {})[k] ? "Y" : "N", undefined, YES_NO);
      });
      tlInputRows.push(row);
      row++;
    });
    row += 2;
  }

  // ── Final Price Summary ──
  navyBand(row, "FINAL PRICE SUMMARY", 14); row++;
  label(row, 1, "Accommodation (PP)"); formulaCell(row + 1, 1, hotelTotalAddr, Math.round(totHotel), MONEY, { bold: true, size: 13 });
  label(row, 4, "Extra Meals (PP)"); formulaCell(row + 1, 4, mealTotalAddr, Math.round(totMeal), MONEY, { bold: true, size: 13 });
  label(row, 7, "Single Supplement (total)"); formulaCell(row + 1, 7, `${daySSTotalAddr}+${handlerSSAddr}`, Math.round(totSS), MONEY, { bold: true, size: 13, color: { argb: ACCENT } });
  const ssTotalAddr = abs(row + 1, 7);
  row += 3;

  const slabHeaders = ["Slab", "Vehicle", "FOC (paying pax)", "Transport", "Tour Facil", "Misc", "Mon.", "Local Hdlr", "Extras", "Sub-total", "GST", "After Tax", "Markup", `Final Price (${currency || "—"})`, `SS (${currency || "—"})`, "Final @ app export", "Matches app?"];
  slabHeaders.forEach((h, i) => {
    const c = sheet.getCell(row, i + 1); c.value = h; c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = solid(i >= 15 ? "FF6B7280" : NAVY); c.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.getRow(row).height = 30;
  row++;

  // Shared per-row cost formulas. `div` is the cell holding paying pax / FOC.
  const costFormulas = (div, tptCol) => {
    const tptF = `IF(${div}>0,SUMPRODUCT(${isYrange(`${colLetter(tptCol)}${tptFirstRow}:${colLetter(tptCol)}${tptLastRow}`)},$B$${tptFirstRow}:$B$${tptLastRow})/${div},0)`;
    const tlF = `IF(${isPP(tlModeAddr)},${tlCostAddr},IF(${div}>0,${tlCostAddr}/${div},0))`;
    const miscF = `IF(${isPP(miscModeAddr)},${miscCostAddr},IF(${div}>0,${miscCostAddr}/${div},0))`;
    const monF = `IF(${isPP(monModeAddr)},${monTotalAddr},IF(${div}>0,${monTotalAddr}/${div},0))`;
    const lhRange = `$C$${lhFirstRow}:$C$${lhLastRow}`, lhCost = `$B$${lhFirstRow}:$B$${lhLastRow}`;
    const lhF = `SUMPRODUCT(${isPPrange(lhRange)},${lhCost})+IF(${div}>0,SUMPRODUCT(${notPPrange(lhRange)},${lhCost})/${div},0)`;
    const exRange = `$C$${exFirstRow}:$C$${exLastRow}`, exCost = `$B$${exFirstRow}:$B$${exLastRow}`;
    const exF = `SUMPRODUCT(--(UPPER(TRIM(${exRange}))="PP"),${exCost})+IF(${div}>0,SUMPRODUCT(--(UPPER(TRIM(${exRange}))<>"PP"),${exCost})/${div},0)`;
    return { tptF, tlF, miscF, monF, lhF, exF };
  };
  const roeOk = `${roeAddr}>0`;
  const finalOf = (afterTax, markupAmt) => `IF(${roeOk},CEILING((${afterTax}+${markupAmt})/${roeAddr},1),0)`;
  const ssOf = `IF(${roeOk},CEILING((${ssTotalAddr}+${ssTotalAddr}*${gstAddr}/100)*(1+${markupAddr}/100)/${roeAddr},1),0)`;

  const slabFirstRow = row;
  slabs.forEach((s, si) => {
    const c0 = calcSlab(s);
    inputCell(row, 1, s.label); inputCell(row, 2, s.vehicle === "Others" ? s.vehicleOther : s.vehicle || "");
    const focCell = inputCell(row, 3, Number(s.foc) || 0, "0", numValidation(0)); focCell.font = { bold: true };
    const foc = addr(row, 3);
    const f = costFormulas(foc, matrixCol(s));
    formulaCell(row, 4, f.tptF, c0.tptPP, MONEY);
    formulaCell(row, 5, f.tlF, c0.tlPP, MONEY);
    formulaCell(row, 6, f.miscF, c0.miscPP, MONEY);
    formulaCell(row, 7, f.monF, c0.monPP, MONEY);
    formulaCell(row, 8, f.lhF, c0.localPP, MONEY);
    formulaCell(row, 9, f.exF, c0.extrasPP, MONEY);
    const sub = addr(row, 10);
    formulaCell(row, 10, `${hotelTotalAddr}+${mealTotalAddr}+${addr(row, 4)}+${addr(row, 5)}+${addr(row, 6)}+${addr(row, 7)}+${addr(row, 8)}+${addr(row, 9)}`, c0.sub, MONEY);
    formulaCell(row, 11, `ROUND(${sub}*${gstAddr}/100,0)`, c0.tax, MONEY);
    formulaCell(row, 12, `${sub}+${addr(row, 11)}`, c0.afterTax, MONEY);
    formulaCell(row, 13, `ROUND(${addr(row, 12)}*${markupAddr}/100,0)`, c0.markupAmt, MONEY);
    formulaCell(row, 14, finalOf(addr(row, 12), addr(row, 13)), c0.finalFX, MONEY, { bold: true, color: { argb: ACCENT }, size: 11 });
    formulaCell(row, 15, ssOf, c0.ssFX, MONEY);
    const appFinal = sheet.getCell(row, 16); appFinal.value = c0.finalFX; appFinal.numFmt = MONEY; appFinal.font = { size: 9, color: { argb: GREY } };
    const chk = sheet.getCell(row, 17);
    chk.value = { formula: `IF(ABS(${addr(row, 14)}-${addr(row, 16)})<0.5,"✔ yes","edited")`, result: "✔ yes" };
    chk.font = { size: 9, color: { argb: GOOD } };
    if (si % 2 === 1) for (let c = 4; c <= 15; c++) sheet.getCell(row, c).fill = solid(ZEBRA);
    row++;
  });
  const slabLastRow = row - 1;

  // Tour Leader slabs: a live summary row per T/L slab
  let tlFirstSummaryRow = null, tlLastSummaryRow = null;
  if (tlSlabs.length) {
    row += 1;
    navyBand(row, "TOUR LEADER SLABS", 16); row++;
    const tlHeaders = ["T/L Slab", "Vehicle", "Paying Pax", "Transport", "Tour Facil", "T/L Surcharge", "Misc", "Mon.", "Local Hdlr", "Extras", "Sub-total", "GST", "After Tax", "Markup", `Final Price (${currency || "—"})`, `SS (${currency || "—"})`, "Final @ app export", "Matches app?"];
    tlHeaders.forEach((h, i) => {
      const c = sheet.getCell(row, i + 1); c.value = h; c.font = { bold: true, size: 10, color: { argb: WHITE } };
      c.fill = solid(i >= 16 ? "FF6B7280" : TL_BROWN); c.alignment = { vertical: "middle", wrapText: true };
    });
    sheet.getRow(row).height = 30;
    row++;
    tlFirstSummaryRow = row;
    tlSlabs.forEach((tl, ti) => {
      const c = calcTlSlab(tl);
      const inRow = tlInputRows[ti];
      const pax = abs(inRow, 3);
      // label / vehicle / pax mirror the input block so they're edited in one place
      const lab = sheet.getCell(row, 1); lab.value = { formula: `A${inRow}`, result: tl.label }; lab.font = { bold: true, color: { argb: TL_BROWN }, size: 9 };
      const veh = sheet.getCell(row, 2); veh.value = { formula: `IF(B${inRow}="","",B${inRow})`, result: (tl.vehicle === "Others" ? tl.vehicleOther : tl.vehicle) || "" }; veh.font = { size: 9 };
      const px = sheet.getCell(row, 3); px.value = { formula: `C${inRow}`, result: n(tl.pax) }; px.font = { size: 9 };
      const f = costFormulas(pax, matrixCol(tl));
      formulaCell(row, 4, f.tptF, c.tptPP, MONEY);
      formulaCell(row, 5, f.tlF, c.tlPP, MONEY);
      const incl = TL_COST_KEYS.map(([, ], i) => `IF(UPPER(TRIM(${abs(inRow, 10 + i)}))="Y",${abs(inRow, 4 + i)},0)`).join("+");
      formulaCell(row, 6, `IF(${pax}>0,(${incl})/${pax},0)`, c.surchargePP, MONEY, { bold: true, color: { argb: TL_BROWN } });
      formulaCell(row, 7, f.miscF, c.miscPP, MONEY);
      formulaCell(row, 8, f.monF, c.monPP, MONEY);
      formulaCell(row, 9, f.lhF, c.localPP, MONEY);
      formulaCell(row, 10, f.exF, c.extrasPP, MONEY);
      const sub = addr(row, 11);
      formulaCell(row, 11, `${hotelTotalAddr}+${mealTotalAddr}+${addr(row, 4)}+${addr(row, 5)}+${addr(row, 6)}+${addr(row, 7)}+${addr(row, 8)}+${addr(row, 9)}+${addr(row, 10)}`, c.sub, MONEY);
      formulaCell(row, 12, `ROUND(${sub}*${gstAddr}/100,0)`, c.tax, MONEY);
      formulaCell(row, 13, `${sub}+${addr(row, 12)}`, c.afterTax, MONEY);
      formulaCell(row, 14, `ROUND(${addr(row, 13)}*${markupAddr}/100,0)`, c.markupAmt, MONEY);
      formulaCell(row, 15, finalOf(addr(row, 13), addr(row, 14)), c.finalFX, MONEY, { bold: true, color: { argb: TL_BROWN }, size: 11 });
      formulaCell(row, 16, ssOf, c.ssFX, MONEY);
      const appFinal = sheet.getCell(row, 17); appFinal.value = c.finalFX; appFinal.numFmt = MONEY; appFinal.font = { size: 9, color: { argb: GREY } };
      const chk = sheet.getCell(row, 18);
      chk.value = { formula: `IF(ABS(${addr(row, 15)}-${addr(row, 17)})<0.5,"✔ yes","edited")`, result: "✔ yes" };
      chk.font = { size: 9, color: { argb: GOOD } };
      for (let cc = 1; cc <= 16; cc++) sheet.getCell(row, cc).fill = solid(ti % 2 === 0 ? "FFFFFBEB" : "FFFEF3C7");
      row++;
    });
    tlLastSummaryRow = row - 1;
  }

  // ── Conditional formatting ──
  const redFill = { type: "pattern", pattern: "solid", bgColor: { argb: BAD_BG } };
  sheet.addConditionalFormatting({
    ref: `C${slabFirstRow}:C${slabLastRow}`,
    rules: [{ type: "cellIs", operator: "lessThanOrEqual", formulae: [0], style: { fill: redFill, font: { color: { argb: "FFB91C1C" }, bold: true } } }],
  });
  if (tlInputRows.length) {
    sheet.addConditionalFormatting({
      ref: `C${tlInputRows[0]}:C${tlInputRows[tlInputRows.length - 1]}`,
      rules: [{ type: "cellIs", operator: "lessThanOrEqual", formulae: [0], style: { fill: redFill, font: { color: { argb: "FFB91C1C" }, bold: true } } }],
    });
  }
  const warn = { type: "pattern", pattern: "solid", bgColor: { argb: WARN_BG } };
  sheet.addConditionalFormatting({ ref: `Q${slabFirstRow}:Q${slabLastRow}`, rules: [{ type: "cellIs", operator: "equal", formulae: ['"edited"'], style: { fill: warn, font: { color: { argb: "FF92400E" } } } }] });
  if (tlFirstSummaryRow) sheet.addConditionalFormatting({ ref: `R${tlFirstSummaryRow}:R${tlLastSummaryRow}`, rules: [{ type: "cellIs", operator: "equal", formulae: ['"edited"'], style: { fill: warn, font: { color: { argb: "FF92400E" } } } }] });

  // ── Named ranges for the settings & key totals ──
  names.push(["Hotel_total_PP", hotelTotalAddr], ["Meal_total_PP", mealTotalAddr], ["Single_supp_total", ssTotalAddr], ["Monument_total", monTotalAddr]);
  names.forEach(([nm, a]) => { try { wb.definedNames.add(`'Cost Sheet'!${a}`, nm); } catch (e) { /* a name clash must never block the export */ } });

  // ── Layout: widths, freeze, view, print ──
  const widths = [26, 15, 26, 14, 14, 20, 15, 11, 13, 13, 22, 11, 12, 16, 13, 14, 12, 12];
  sheet.columns.forEach((col, i) => { col.width = widths[i] || 12; });
  sheet.views = [{ state: "frozen", ySplit: titleRows, showGridLines: false, zoomScale: 90 }];
  sheet.pageSetup = {
    paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    printTitlesRow: `1:${titleRows}`, horizontalCentered: true,
  };
  sheet.headerFooter = {
    oddFooter: `&L&8Unitop Ops — Cost Sheet ${query.tourFileId || query.id || ""} v${currentVersionLabel}&R&8Page &P of &N`,
  };

  // Lock the formulas (inputs were unlocked above). No password.
  await sheet.protect("", {
    selectLockedCells: true, selectUnlockedCells: true, formatCells: true, formatColumns: true, formatRows: true,
    insertRows: true, insertColumns: false, deleteRows: false, deleteColumns: false, sort: false, autoFilter: false,
  });

  return wb;
}
