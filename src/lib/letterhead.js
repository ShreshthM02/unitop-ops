// Shared invoice/quotation letterhead building blocks.
//
// ARCHITECTURE (read this before touching print CSS in a document component):
//
// Header/footer repeat is achieved with position:fixed, NOT <thead>/<tfoot>.
// Chrome does NOT reliably repeat <thead>/<tfoot> on every printed page
// (known Chromium limitation). Chrome DOES reliably redraw position:fixed
// elements on every page.
//
// Layout model:
//   - position:fixed elements are positioned relative to the physical page
//     box (top:0 = top of physical page, before any @page margin).
//   - @page { margin } is guaranteed per-page by the CSS spec. Setting
//     margin-top/bottom to match the fixed element heights creates the
//     blank space that keeps body content from sliding under the header/footer.
//   - "Header/Footer on all pages" ON  → element is position:fixed (repeats).
//   - "Header/Footer on all pages" OFF → element is in normal body flow
//     (appears once, on the first/last page only). @page margin shrinks back
//     to the default side margin so subsequent pages have no wasted space.
//   - "Print on Letterhead" → no header/footer elements at all; blank space
//     is provided entirely by @page margins of exactly 60 mm top / 40 mm
//     bottom, which reserves the right amount of space on every physical
//     sheet for the pre-printed artwork.
//
// Use buildLetterheadDocument() to assemble a full print HTML string.
// Each document passes its own content blocks as bodyBlocks (plain HTML
// strings) and its own extra CSS as extraHeadCSS.

import { LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, BADGE_AWARD_B64 } from "./images.js";

// Measured heights (pt → mm: mm = pt × 25.4 / 72)
// Header: logo 88pt(≈31mm) + 3 addr lines(≈13mm) + rule+margins(≈5mm) + pad(≈1mm) = ~50mm
// Footer: top-pad(≈2mm) + rule+margin(≈3mm) + badge row 32pt(≈11mm) = ~16mm
const HEADER_H_MM  = 50;
const FOOTER_H_MM  = 18;
const GAP_MM       = 4;   // whitespace between fixed element and content area
const SIDE_MM      = 14;
const LH_TOP_MM    = 60;  // "Print on Letterhead" @page margin-top
const LH_BOTTOM_MM = 40;  // "Print on Letterhead" @page margin-bottom

export const PRINT_MARGIN = {
  top:    `${HEADER_H_MM + GAP_MM}mm`,
  right:  `${SIDE_MM}mm`,
  bottom: `${FOOTER_H_MM + GAP_MM}mm`,
  left:   `${SIDE_MM}mm`,
};

export const invoiceLetterheadCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

  .lh-fixed-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: ${HEADER_H_MM}mm;
    background: #fff;
    padding: 0 ${SIDE_MM}mm;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .lh-fixed-footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: ${FOOTER_H_MM}mm;
    background: #fff;
    padding: 0 ${SIDE_MM}mm;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .lh-header { text-align: center; padding-bottom: 3pt; }
  .lh-logo   { height: 88pt; width: auto; display: block; margin: 0 auto; }
  .lh-addr-block { color: #2a2a2a; font-family: 'Inter', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.3pt; line-height: 1.35; text-align: center; white-space: nowrap; }
  .lh-addr-block:first-of-type { margin-top: 1pt; }
  .lh-rule { height: 2pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin: 4pt 0 8pt; border-radius: 1pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  .lh-footer { padding-top: 6pt; }
  .lh-rule-footer { height: 1.5pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin-bottom: 6pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  .inv-title  { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 700; color: #1A3A52; text-align: center; margin-bottom: 10pt; letter-spacing: 1pt; text-transform: uppercase; }
  .inv-number { font-size: 11pt; font-weight: 700; color: #8B1A1A; }
  .parties       { display: flex; justify-content: space-between; margin-bottom: 10pt; gap: 14pt; }
  .party-block   { flex: 1; background: #f8f9fa; border: 1pt solid #e5e7eb; border-radius: 4pt; padding: 8pt 10pt; }
  .party-label   { font-size: 7.5pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1pt; margin-bottom: 4pt; }
  .party-name    { font-size: 10.5pt; font-weight: 700; color: #1A3A52; font-family: 'Playfair Display', serif; margin-bottom: 2pt; }
  .party-detail  { font-size: 8.5pt; color: #555; line-height: 1.45; }
  table.content-table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
  table.content-table thead tr th { background: #1A3A52; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 5pt 7pt; text-align: left; }
  table.content-table tbody tr td { padding: 4pt 7pt; border-bottom: 0.5pt solid #e5e7eb; font-size: 9.5pt; vertical-align: top; }
  table.content-table tbody tr:nth-child(even) td { background: #f9fafb; }
  td.amount      { text-align: right; font-weight: 600; color: #1A3A52; }
  .totals-block  { width: 240pt; margin-left: auto; margin-bottom: 6pt; }
  .total-row     { display: flex; justify-content: space-between; padding: 3pt 7pt; font-size: 9.5pt; border-bottom: 0.5pt solid #e5e7eb; }
  .total-row.grand { background: #1A3A52; color: #fff; font-weight: 700; font-size: 10.5pt; border-radius: 3pt; padding: 6pt 9pt; }
  .bank-box    { background: #f0f4f8; border: 1pt solid #d1d9e0; border-radius: 4pt; padding: 8pt 10pt; margin-bottom: 7pt; }
  .bank-title  { font-size: 8.5pt; font-weight: 700; color: #1A3A52; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; text-decoration: underline; }
  .bank-row    { display: flex; gap: 8pt; font-size: 9pt; margin-bottom: 2pt; }
  .bank-key    { font-weight: 600; color: #333; min-width: 110pt; }
  .bank-val    { color: #555; }
  .notes-box   { font-size: 8.5pt; color: #666; line-height: 1.5; border-left: 2pt solid #cb0f0f; padding-left: 7pt; margin-bottom: 7pt; }

  @media print {
    body { margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

export const invoiceLetterheadHTML = (printOnLetterhead = false) => {
  if (printOnLetterhead) return "";
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
  if (printOnLetterhead) return "";
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
}) {
  const effHeaderRepeat = printOnLetterhead || headerAllPages;
  const effFooterRepeat = printOnLetterhead || footerAllPages;

  // @page margins: reserve space for fixed elements on every page,
  // or fall back to side-margin default when element is flow-only.
  const marginTop    = printOnLetterhead ? `${LH_TOP_MM}mm`
    : (showHeader && effHeaderRepeat)    ? `${HEADER_H_MM + GAP_MM}mm`
    : `${SIDE_MM}mm`;
  const marginBottom = printOnLetterhead ? `${LH_BOTTOM_MM}mm`
    : (showFooter && effFooterRepeat)    ? `${FOOTER_H_MM + GAP_MM}mm`
    : `${SIDE_MM}mm`;

  // Fixed elements — only when repeating and not in letterhead mode
  const fixedHeader = (!printOnLetterhead && showHeader && effHeaderRepeat)
    ? `<div class="lh-fixed-header">${invoiceLetterheadHTML(false)}</div>` : "";
  const fixedFooter = (!printOnLetterhead && showFooter && effFooterRepeat)
    ? `<div class="lh-fixed-footer">${invoiceFooterHTML(false)}</div>` : "";

  // Flow elements — appear once at top/bottom of body
  const flowBlocks = [...bodyBlocks];
  if (!printOnLetterhead && showHeader && !effHeaderRepeat) flowBlocks.unshift(invoiceLetterheadHTML(false));
  if (!printOnLetterhead && showFooter && !effFooterRepeat) flowBlocks.push(invoiceFooterHTML(false));

  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>${invoiceLetterheadCSS}</style>
    <style>
      @page {
        size: A4;
        margin: ${marginTop} ${SIDE_MM}mm ${marginBottom} ${SIDE_MM}mm;
        ${showPageNum ? `@bottom-right{content:"Page "counter(page);font-size:7.5pt;color:#999;font-family:Inter,Arial,sans-serif;}` : ''}
      }
    </style>
    <style>${extraHeadCSS}</style>
  </head><body>
    ${fixedHeader}
    ${fixedFooter}
    <div class="lh-body">
      ${flowBlocks.join("\n")}
    </div>
  </body></html>`;
}
