// A small, consistent "table to Excel" helper for the app's list-style exports
// (movement chart, ledgers, histories). One styled sheet: title band, optional
// info lines, a frozen header row with filters, wrapped text, landscape print.
// Numbers stay numbers (so people can sort and sum), dates stay real dates.
//
//   columns: [{ header, key, width?, type?: "text"|"number"|"money"|"date", align? }]
//   rows:    [{ [key]: value }]
//   totals:  optional { label, keys: [numeric keys to SUM] } -> live SUM formulas
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NAVY = "FF0D1B2A", LIGHT = "FFEEF1F5", GREY = "FF6B7280", BORDER = "FFD1D5DB";

export function safeSheetName(s) { return String(s || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet"; }

export function buildSimpleWorkbook(ExcelJS, { title, sheetName, info = [], columns, rows, totals }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Unitop Ops"; wb.created = new Date();
  const ws = wb.addWorksheet(safeSheetName(sheetName || title), { properties: { tabColor: { argb: NAVY } } });
  const n = columns.length;
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 16 }));

  ws.mergeCells(1, 1, 1, Math.max(n, 2));
  const t = ws.getCell(1, 1); t.value = title; t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } }; t.alignment = { vertical: "middle" };
  for (let c = 1; c <= n; c++) ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 26;

  let r = 2;
  info.filter(Boolean).forEach((line) => {
    ws.mergeCells(r, 1, r, Math.max(n, 2));
    const c = ws.getCell(r, 1); c.value = line; c.font = { size: 10, italic: true, color: { argb: GREY } };
    r++;
  });
  const HDR = r;
  columns.forEach((c, i) => {
    const cell = ws.getCell(HDR, i + 1);
    cell.value = c.header; cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    cell.alignment = { vertical: "middle", horizontal: c.type === "number" || c.type === "money" ? "right" : "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: NAVY } } };
  });
  ws.getRow(HDR).height = 22;

  rows.forEach((row, ri) => {
    const rr = HDR + 1 + ri;
    columns.forEach((c, i) => {
      const cell = ws.getCell(rr, i + 1);
      let v = row[c.key];
      if (v === undefined || v === null || v === "") v = null;
      if (c.type === "number" || c.type === "money") { const num = v === null ? null : Number(v); v = num !== null && Number.isFinite(num) ? num : v; cell.numFmt = c.type === "money" ? "#,##0.00" : "#,##0"; cell.alignment = { horizontal: "right", vertical: "top" }; }
      else if (c.type === "date" && v) { const d = v instanceof Date ? v : new Date(v); if (!isNaN(d)) { v = d; cell.numFmt = "dd/mm/yyyy"; } cell.alignment = { horizontal: "left", vertical: "top" }; }
      else cell.alignment = { horizontal: c.align || "left", vertical: "top", wrapText: true };
      cell.value = v;
      cell.font = { size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
    });
  });
  const last = HDR + rows.length;

  if (totals && rows.length) {
    const tr = last + 1;
    ws.getCell(tr, 1).value = totals.label || "Total"; ws.getCell(tr, 1).font = { bold: true, size: 10 };
    columns.forEach((c, i) => {
      if (!totals.keys.includes(c.key)) return;
      const L = colLetter(i + 1);
      const cell = ws.getCell(tr, i + 1);
      const sum = rows.reduce((a, x) => a + (Number(x[c.key]) || 0), 0);
      cell.value = { formula: `SUM(${L}${HDR + 1}:${L}${last})`, result: sum };
      cell.numFmt = c.type === "money" ? "#,##0.00" : "#,##0"; cell.font = { bold: true, size: 10 }; cell.alignment = { horizontal: "right" };
    });
    for (let c = 1; c <= n; c++) { ws.getCell(tr, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }; ws.getCell(tr, c).border = { top: { style: "thin", color: { argb: NAVY } } }; }
  }
  if (!rows.length) { ws.mergeCells(HDR + 1, 1, HDR + 1, Math.max(n, 2)); ws.getCell(HDR + 1, 1).value = "Nothing to show for this selection"; ws.getCell(HDR + 1, 1).font = { italic: true, color: { argb: GREY } }; }

  ws.autoFilter = { from: { row: HDR, column: 1 }, to: { row: HDR, column: n } };
  ws.views = [{ state: "frozen", ySplit: HDR, showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HDR}:${HDR}` };
  return wb;
}

function colLetter(c) { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }

// Builds and downloads the workbook in the browser.
export async function downloadSimpleXlsx(spec, filename) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildSimpleWorkbook(ExcelJS, spec);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
