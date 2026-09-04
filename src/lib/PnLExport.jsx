// P&L export document -- PDF, Word (.docx), and Excel (.xlsx with real
// formulas). Per direct instruction, pulls ONLY from the query's own
// incoming/outgoing payment records (via buildPnLSummary in utils.js),
// nothing else -- no tour value, no other table, so nothing else can
// jeopardize the numbers. Doesn't live in the document drawer -- it's
// a standalone export triggered from wherever the Payment Tracker's
// own P&L tab already shows this same data, since that's where it's
// actually needed.
//
// Imports go DIRECT to each source file, never through index.js -- this
// file is itself re-exported BY index.js, so importing from index.js
// would be a genuine circular dependency (confirmed by a real test
// failure during development: ExportMenu came back undefined under
// certain module-load orderings). Every other file inside src/lib/
// already follows this same direct-import rule for the same reason;
// only component files outside src/lib/ import via the index.js
// aggregator.
import { G } from "./constants.js";
import { ExportMenu } from "./ExportMenu.jsx";
import { buildPnLSummary, buildDownloadFilename, formatDateSlash } from "./utils.js";
import { buildPaginatedLetterheadDocument } from "./letterhead.js";
import { printHTML } from "./LetterheadControls.jsx";
import { buildDocxBlobFromBodyBlocks, downloadDocx } from "./wordFromBlocks.js";

function moneyFmt(n) {
  return "₹ " + Math.round(n || 0).toLocaleString("en-IN");
}

// Builds the shared HTML body -- used directly for PDF, and converted
// to a real .docx via wordFromBlocks.js for Word, so PDF and Word can
// never show different numbers or different content from each other.
function buildBodyHTML(query, pl) {
  const headerBlock = `
    <div style="margin-bottom:14pt;">
      <div style="font-size:11pt;font-weight:700;color:#1A3A52;">${query.groupName || query.clientName || "—"}</div>
      <div style="font-size:9.5pt;color:#555;margin-top:2pt;">${query.tourFileId ? "Tour File No. " + query.tourFileId : "Query ID " + query.id} · ${query.destination || query.sector || "—"} · ${query.travelDate ? formatDateSlash(query.travelDate) : "—"}</div>
    </div>`;

  const summaryBlock = `
    <div class="section-title" style="margin:14pt 0 6pt;font-weight:700;font-size:10pt;color:#1A3A52;text-transform:uppercase;letter-spacing:0.5px;">Financial Summary</div>
    <table class="content-table"><tbody>
      <tr><td style="font-weight:600;">Total Received</td><td style="text-align:right;color:#059669;font-weight:700;">${moneyFmt(pl.totalReceived)}</td></tr>
      <tr><td style="font-weight:600;">Total Expenditure</td><td style="text-align:right;color:#6B21A8;font-weight:700;">${moneyFmt(pl.totalExpenditure)}</td></tr>
    </tbody></table>`;

  const categoryRows = pl.sortedCategories.map(cat =>
    `<tr><td>${cat}</td><td style="text-align:right;">${moneyFmt(pl.byCategory[cat].total)}</td></tr>`
  ).join("");
  const categoryBlock = pl.sortedCategories.length ? `
    <div class="section-title" style="margin:16pt 0 6pt;font-weight:700;font-size:10pt;color:#1A3A52;text-transform:uppercase;letter-spacing:0.5px;">Expenditure by Category</div>
    <table class="content-table">
      <thead><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${categoryRows}
      <tr><td style="font-weight:700;border-top:1.5pt solid #1A3A52;">Total</td><td style="text-align:right;font-weight:700;border-top:1.5pt solid #1A3A52;">${moneyFmt(pl.totalExpenditure)}</td></tr>
      </tbody>
    </table>` : "";

  const ledgerRows = (pl.outgoing || []).map(o =>
    `<tr><td>${o.date ? formatDateSlash(o.date) : "—"}</td><td>${o.vendor || "—"}</td><td>${o.category || "Not Categorised"}</td><td>${o.mode || "—"}</td><td>${o.ref || "—"}</td><td style="text-align:right;">${moneyFmt(parseFloat(o.amount) || 0)}</td></tr>`
  ).join("");
  const ledgerBlock = (pl.outgoing || []).length ? `
    <div class="section-title" style="margin:16pt 0 6pt;font-weight:700;font-size:10pt;color:#1A3A52;text-transform:uppercase;letter-spacing:0.5px;">Detailed Payment Ledger</div>
    <table class="content-table">
      <thead><tr><th>Date</th><th>Paid To</th><th>Category</th><th>Mode</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${ledgerRows}</tbody>
    </table>` : `<div style="font-size:9.5pt;color:#888;margin-top:10pt;">No outgoing payments recorded yet.</div>`;

  const receivedRows = (pl.entries || []).map(e =>
    `<tr><td>${e.date ? formatDateSlash(e.date) : "—"}</td><td>${e.type || "—"}</td><td>${e.mode || "—"}</td><td>${e.ref || e.receipt || "—"}</td><td style="text-align:right;">${moneyFmt(entryAmountForDisplay(e))}</td></tr>`
  ).join("");
  const receivedBlock = (pl.entries || []).length ? `
    <div class="section-title" style="margin:16pt 0 6pt;font-weight:700;font-size:10pt;color:#1A3A52;text-transform:uppercase;letter-spacing:0.5px;">Received Payments</div>
    <table class="content-table">
      <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th>Reference</th><th style="text-align:right;">Amount (INR)</th></tr></thead>
      <tbody>${receivedRows}</tbody>
    </table>` : "";

  const profitColor = pl.netProfit >= 0 ? "#059669" : "#C0392B";
  const bottomLine = `
    <div style="margin-top:20pt;padding:12pt 14pt;background:#F8FAFC;border:1.5pt solid ${profitColor};border-radius:4pt;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11pt;font-weight:700;color:#1A3A52;">NET PROFIT</span>
        <span style="font-size:15pt;font-weight:700;color:${profitColor};">${moneyFmt(pl.netProfit)} &nbsp; (${pl.profitPercent.toFixed(1)}%)</span>
      </div>
    </div>`;

  return [headerBlock, summaryBlock, categoryBlock, ledgerBlock, receivedBlock, bottomLine].filter(Boolean).join("\n");
}

function entryAmountForDisplay(e) {
  // Shows what was actually received in INR -- same value buildPnLSummary
  // sums, so the ledger detail and the summary total never disagree.
  if (!e.inCurrency || e.inCurrency === "INR") return parseFloat(e.amount) || 0;
  return parseFloat(e.amountINR) || 0;
}

async function buildPrintHTML(query, pl, asBlocks) {
  const docArgs = {
    title: `P&L - Tour File No. ${query.tourFileId || query.id}`,
    bodyBlocks: [buildBodyHTML(query, pl)],
    extraHeadCSS: `.section-title{page-break-after:avoid;}`,
    headerFooterAllPages: true,
  };
  if (asBlocks) return docArgs;
  const html = await buildPaginatedLetterheadDocument(docArgs);
  return html;
}

async function exportPnLPDF(query, pl) {
  const html = await buildPrintHTML(query, pl, false);
  printHTML(html);
}

async function exportPnLDocx(query, pl, docSettings) {
  const args = await buildPrintHTML(query, pl, true);
  const blob = await buildDocxBlobFromBodyBlocks({ bodyBlocks: args.bodyBlocks });
  await downloadDocx(blob, args.title);
}

async function exportPnLExcel(query, pl) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("P&L");
  ws.columns = [{ width: 26 }, { width: 20 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 16 }];

  const title = `P&L - Tour File No. ${query.tourFileId || query.id}`;
  ws.mergeCells("A1:F1"); ws.getCell("A1").value = title; ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = query.groupName || query.clientName || "";
  ws.getCell("A3").value = `${query.destination || query.sector || ""} · ${query.travelDate ? formatDateSlash(query.travelDate) : ""}`;

  // Received Payments -- real rows first, so the summary formulas below
  // can SUM the actual cell range rather than a hardcoded number.
  let row = 5;
  ws.getCell(`A${row}`).value = "Received Payments"; ws.getCell(`A${row}`).font = { bold: true }; row++;
  const recHeaderRow = row;
  ["Date", "Type", "Mode", "Reference", "Amount (INR)"].forEach((h, i) => { ws.getCell(row, i + 1).value = h; ws.getCell(row, i + 1).font = { bold: true }; });
  row++;
  const recFirstDataRow = row;
  (pl.entries || []).forEach(e => {
    ws.getCell(row, 1).value = e.date || "";
    ws.getCell(row, 2).value = e.type || "";
    ws.getCell(row, 3).value = e.mode || "";
    ws.getCell(row, 4).value = e.ref || e.receipt || "";
    ws.getCell(row, 5).value = entryAmountForDisplay(e);
    row++;
  });
  const recLastDataRow = row - 1;
  const totalReceivedRow = row;
  ws.getCell(row, 4).value = "Total Received"; ws.getCell(row, 4).font = { bold: true };
  ws.getCell(row, 5).value = recLastDataRow >= recFirstDataRow ? { formula: `SUM(E${recFirstDataRow}:E${recLastDataRow})` } : 0;
  ws.getCell(row, 5).font = { bold: true };
  row += 2;

  // Detailed Ledger (outgoing) -- same real-formula treatment.
  ws.getCell(`A${row}`).value = "Detailed Payment Ledger"; ws.getCell(`A${row}`).font = { bold: true }; row++;
  ["Date", "Paid To", "Category", "Mode", "Reference", "Amount"].forEach((h, i) => { ws.getCell(row, i + 1).value = h; ws.getCell(row, i + 1).font = { bold: true }; });
  row++;
  const outFirstDataRow = row;
  (pl.outgoing || []).forEach(o => {
    ws.getCell(row, 1).value = o.date || "";
    ws.getCell(row, 2).value = o.vendor || "";
    ws.getCell(row, 3).value = o.category || "Not Categorised";
    ws.getCell(row, 4).value = o.mode || "";
    ws.getCell(row, 5).value = o.ref || "";
    ws.getCell(row, 6).value = parseFloat(o.amount) || 0;
    row++;
  });
  const outLastDataRow = row - 1;
  const totalExpenditureRow = row;
  ws.getCell(row, 5).value = "Total Expenditure"; ws.getCell(row, 5).font = { bold: true };
  ws.getCell(row, 6).value = outLastDataRow >= outFirstDataRow ? { formula: `SUM(F${outFirstDataRow}:F${outLastDataRow})` } : 0;
  ws.getCell(row, 6).font = { bold: true };
  row += 2;

  // Expenditure by Category -- SUMIF against the real ledger rows above,
  // not a precomputed value, so editing a ledger row updates this too.
  ws.getCell(`A${row}`).value = "Expenditure by Category"; ws.getCell(`A${row}`).font = { bold: true }; row++;
  ["Category", "Amount"].forEach((h, i) => { ws.getCell(row, i + 1).value = h; ws.getCell(row, i + 1).font = { bold: true }; });
  row++;
  pl.sortedCategories.forEach(cat => {
    ws.getCell(row, 1).value = cat;
    ws.getCell(row, 2).value = outLastDataRow >= outFirstDataRow
      ? { formula: `SUMIF(C${outFirstDataRow}:C${outLastDataRow},"${cat === "Not Categorised" ? "" : cat}",F${outFirstDataRow}:F${outLastDataRow})` }
      : 0;
    row++;
  });
  row += 1;

  // Bottom line -- real formulas referencing the two totals above, not
  // hardcoded netProfit/profitPercent -- this is what makes the .xlsx
  // a genuine working spreadsheet rather than a static export.
  ws.getCell(`A${row}`).value = "NET PROFIT"; ws.getCell(`A${row}`).font = { bold: true, size: 12 };
  ws.getCell(`B${row}`).value = { formula: `E${totalReceivedRow}-F${totalExpenditureRow}` };
  ws.getCell(`B${row}`).font = { bold: true, size: 12 };
  ws.getCell(`B${row}`).numFmt = "#,##0";
  row++;
  ws.getCell(`A${row}`).value = "Profit %";
  ws.getCell(`B${row}`).value = { formula: `IF(E${totalReceivedRow}=0,0,B${row - 1}/E${totalReceivedRow}*100)` };
  ws.getCell(`B${row}`).numFmt = "0.0\\%";

  const filename = buildDownloadFilename("P&L", "pnl", null, {}, null) + " - " + (query.tourFileId || query.id);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

// Drop-in export button for wherever the P&L data is already shown
// (the Payment Tracker's own P&L tab) -- deliberately not inside the
// document drawer, matching the request directly.
export function PnLExportButton({ query, payments }) {
  const pl = buildPnLSummary(payments);
  return (
    <ExportMenu G={G} label="Export P&L" openDirection="up" actions={[
      { id: "pdf", label: "PDF", icon: "📕", onSelect: () => exportPnLPDF(query, pl) },
      { id: "word", label: "Word", icon: "📄", onSelect: () => exportPnLDocx(query, pl) },
      { id: "excel", label: "Excel", icon: "📗", onSelect: () => exportPnLExcel(query, pl) },
    ]}/>
  );
}
