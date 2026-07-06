// Shared invoice/quotation letterhead building blocks.
//
// ARCHITECTURE (read this before touching print CSS in a document component):
// Every letterhead document is a single <table class="lh-doc"> with a real
// <thead>/<tbody>/<tfoot>. Browsers natively repeat <thead> and <tfoot> on
// every printed page when a table's rows spill across pages, and they apply
// the containing box's per-page margins (@page) correctly on every page —
// unlike a plain block's own padding, which only ever appears once, at the
// very top and very bottom of the whole flow. That mismatch was the root
// cause of headers vanishing on page 2, footers overlapping content, and
// content bleeding past the print margins on multi-page documents.
//   - Physical page margins come from a real `@page { margin }` rule, so
//     every printed page gets the same margin, not just page 1.
//   - "Header/Footer on all pages" ON  -> header/footer content goes in
//     <thead>/<tfoot>, which repeats on every page automatically.
//   - "Header/Footer on all pages" OFF -> header/footer content becomes an
//     ordinary first/last row in <tbody>, so it appears exactly once.
//   - "Print on Letterhead" -> header/footer render as blank space of the
//     same height (the physical pre-printed paper already has the artwork),
//     and — since every physical sheet in the printer needs that blank
//     space reserved — it always repeats on every page and overrides the
//     other two toggles.
//
// Use `buildLetterheadDocument()` below to assemble a full print HTML
// string; don't hand-roll the <table>/<thead>/<tfoot> wrapper per document.
// Each document still owns its own content-specific CSS and content blocks,
// passed in as plain HTML strings — one string per array entry in
// `bodyBlocks`, since each entry becomes its own table row, which is what
// gives the browser a place to break the page.

import { LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, BADGE_AWARD_B64 } from "./images.js";

// Physical print margins. Kept as one source of truth so the @page rule,
// the header/footer's own spacing, and any doc-specific math all agree.
export const PRINT_MARGIN = { top: "8mm", right: "14mm", bottom: "8mm", left: "14mm" };

export const invoiceLetterheadCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

    /* ── Document shell ─────────────────────────────────────────────────── */
    .lh-doc { width: 100%; border-collapse: collapse; }
    .lh-doc > tbody > tr > td { padding: 0; }

    /* ── Header (logo + 3 address lines + top gradient rule) ─────────────── */
    .lh-header { text-align: center; padding-bottom: 3pt; }
    .lh-logo { height: 88pt; width: auto; display: block; margin: 0 auto; }
    .lh-addr-block { color: #2a2a2a; font-family: 'Inter', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.3pt; line-height: 1.35; margin-bottom: 0; text-align: center; white-space: nowrap; }
    .lh-addr-block:first-of-type { margin-top: 1pt; }
    .lh-rule { height: 2pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin: 4pt 0 8pt; border-radius: 1pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .lh-header--blank { height: 84pt; }

    /* ── Footer (bottom gradient rule + 4 badges) ─────────────────────────── */
    .lh-footer { padding-top: 6pt; }
    .lh-rule-footer { height: 1.5pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin-bottom: 6pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .lh-footer--blank { height: 40pt; }

    /* ── Shared document content styles (unchanged from before) ──────────── */
    .inv-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 700; color: #1A3A52; text-align: center; margin-bottom: 10pt; letter-spacing: 1pt; text-transform: uppercase; }
    .inv-number { font-size: 11pt; font-weight: 700; color: #8B1A1A; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 10pt; gap: 14pt; }
    .party-block { flex: 1; background: #f8f9fa; border: 1pt solid #e5e7eb; border-radius: 4pt; padding: 8pt 10pt; }
    .party-label { font-size: 7.5pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1pt; margin-bottom: 4pt; }
    .party-name { font-size: 10.5pt; font-weight: 700; color: #1A3A52; font-family: 'Playfair Display', serif; margin-bottom: 2pt; }
    .party-detail { font-size: 8.5pt; color: #555; line-height: 1.45; }
    table.content-table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
    table.content-table thead tr th { background: #1A3A52; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 5pt 7pt; text-align: left; }
    table.content-table tbody tr td { padding: 4pt 7pt; border-bottom: 0.5pt solid #e5e7eb; font-size: 9.5pt; vertical-align: top; }
    table.content-table tbody tr:nth-child(even) td { background: #f9fafb; }
    td.amount { text-align: right; font-weight: 600; color: #1A3A52; }
    .totals-block { width: 240pt; margin-left: auto; margin-bottom: 6pt; }
    .total-row { display: flex; justify-content: space-between; padding: 3pt 7pt; font-size: 9.5pt; border-bottom: 0.5pt solid #e5e7eb; }
    .total-row.grand { background: #1A3A52; color: #fff; font-weight: 700; font-size: 10.5pt; border-radius: 3pt; padding: 6pt 9pt; }
    .bank-box { background: #f0f4f8; border: 1pt solid #d1d9e0; border-radius: 4pt; padding: 8pt 10pt; margin-bottom: 7pt; }
    .bank-title { font-size: 8.5pt; font-weight: 700; color: #1A3A52; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; text-decoration: underline; }
    .bank-row { display: flex; gap: 8pt; font-size: 9pt; margin-bottom: 2pt; }
    .bank-key { font-weight: 600; color: #333; min-width: 110pt; }
    .bank-val { color: #555; }
    .notes-box { font-size: 8.5pt; color: #666; line-height: 1.5; border-left: 2pt solid #cb0f0f; padding-left: 7pt; margin-bottom: 7pt; }

    @media print {
      body { margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  `;

// Header content only (no page-position logic needed any more — repetition
// is handled by whether the caller places this in <thead> or a <tbody> row).
// printOnLetterhead: render a same-height blank instead of the artwork,
// since the physical pre-printed paper already carries it.
export const invoiceLetterheadHTML = (printOnLetterhead = false) => {
  if (printOnLetterhead) return `<div class="lh-header lh-header--blank"></div>`;
  return `
  <div class="lh-header">
    <img src="${LOGO_B64}" class="lh-logo" alt="Unitop Tours"/>
    <div class="lh-addr-block">Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058</div>
    <div class="lh-addr-block">Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018</div>
    <div class="lh-addr-block">Website:&nbsp;www.unitoptours.com &nbsp;|&nbsp; E-Mail: unitoptours@gmail.com &nbsp;|&nbsp; Telephone:&nbsp;+91&#8209;124&#8209;4476571</div>
    <div class="lh-rule"></div>
  </div>
`;};

export const invoiceFooterHTML = (printOnLetterhead = false) => {
  if (printOnLetterhead) return `<div class="lh-footer lh-footer--blank"></div>`;
  return `
<div class="lh-footer">
  <div class="lh-rule-footer"></div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <tr>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_MOT_B64}" alt="MOT" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_INDIA_B64}" alt="Incredible India" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_IATO_B64}" alt="IATO" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;">
        <img src="${BADGE_AWARD_B64}" alt="Award" style="height:28pt;width:auto;max-width:100%;display:block;margin:0 auto 1.5pt;"/>
        <div style="font-size:5pt;font-weight:700;color:#1A3A52;text-transform:uppercase;letter-spacing:0.3pt;">National Tourism Award</div>
        <div style="font-size:4.5pt;color:#888;">2013&#8209;14 &nbsp;|&nbsp; 2016&#8209;17 &nbsp;|&nbsp; 2018&#8209;19</div>
        <div style="font-size:4pt;color:#666;">Ministry of Tourism, Govt. of India</div>
      </td>
    </tr>
  </table>
</div>
`;};

// ─── CANONICAL DOCUMENT ASSEMBLY ────────────────────────────────────────────
// Every letterhead document (Quotation, Proforma, and any future document —
// Tax Invoice, Payment Receipt, itinerary builders, etc.) should call this
// instead of hand-rolling its own <table>/<thead>/<tfoot>/@page wrapper.
//
// Params:
//   title            <title> tag text
//   extraHeadCSS     document-specific CSS (e.g. Quotation's h2/ol styles)
//   bodyBlocks       array of HTML strings; each becomes its own <tr><td>,
//                    which is what gives the browser a place to break pages
//   headerAllPages   repeat header on every printed page
//   footerAllPages   repeat footer on every printed page
//   showHeader       whether the header appears at all (default true)
//   showFooter       whether the footer appears at all (default true)
//   printOnLetterhead  blank header/footer space for physical letterhead
//                      paper; overrides + disables the two "all pages" flags
//   showPageNum      adds a running "Page N" via @page bottom-right
export function buildLetterheadDocument({
  title,
  extraHeadCSS = "",
  bodyBlocks,
  headerAllPages = false,
  footerAllPages = false,
  showHeader = true,
  showFooter = true,
  printOnLetterhead = false,
  showPageNum = false,
  orientation = "portrait",
}) {
  const effHeaderRepeat = printOnLetterhead || headerAllPages;
  const effFooterRepeat = printOnLetterhead || footerAllPages;

  const headerInner = showHeader ? invoiceLetterheadHTML(printOnLetterhead) : "";
  const footerInner = showFooter ? invoiceFooterHTML(printOnLetterhead) : "";

  const theadBlock = headerInner && effHeaderRepeat
    ? `<thead><tr><td>${headerInner}</td></tr></thead>` : "";
  const tfootBlock = footerInner && effFooterRepeat
    ? `<tfoot><tr><td>${footerInner}</td></tr></tfoot>` : "";

  const rows = [...bodyBlocks];
  if (headerInner && !effHeaderRepeat) rows.unshift(headerInner);
  if (footerInner && !effFooterRepeat) rows.push(footerInner);
  const tbodyRows = rows.map(b => `<tr><td>${b}</td></tr>`).join("");

  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>${invoiceLetterheadCSS}</style>
    <style>@page{size:A4${orientation === "landscape" ? " landscape" : ""};margin:${PRINT_MARGIN.top} ${PRINT_MARGIN.right} ${PRINT_MARGIN.bottom} ${PRINT_MARGIN.left};${showPageNum ? '@bottom-right{content:"Page "counter(page);font-size:7.5pt;color:#999;font-family:Inter,Arial,sans-serif;}' : ''}}</style>
    <style>${extraHeadCSS}</style>
  </head><body>
    <table class="lh-doc">
      ${theadBlock}
      <tbody>${tbodyRows}</tbody>
      ${tfootBlock}
    </table>
  </body></html>`;
}
