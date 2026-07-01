// Shared invoice/quotation letterhead building blocks.
//
// ARCHITECTURE (read this before touching print CSS in a document component):
// Chrome's print engine does NOT reliably repeat <thead>/<tfoot> across
// printed pages (a long-standing Chromium limitation) — an earlier version
// of this file relied on that and it silently failed in practice: headers
// only ever showed on page 1, footers only appeared once wherever content
// happened to end. What Chrome DOES reliably repeat on every printed page
// is a `position: fixed` element. So repetition here is built on that,
// combined with a real `@page { margin }` rule to reserve the matching
// blank space on every page (a `@page` margin is spec-guaranteed per-page,
// unlike a block's own padding/margin, which only ever applies once at the
// very start/end of a multi-page flow).
//   - Physical page margins come from `@page { margin }`, sized to exactly
//     match whichever header/footer mode is active, so reserved space and
//     drawn content always agree.
//   - "Header/Footer on all pages" ON  -> rendered as `position: fixed`,
//     which Chrome redraws identically on every physical page. The page's
//     top/bottom margin is set to the header/footer's real measured height
//     (+ a safety buffer) so body content never overlaps it.
//   - "Header/Footer on all pages" OFF -> rendered as an ordinary in-flow
//     block at the very start/end of the document, so it appears exactly
//     once — on page 1 for the header, on the last page for the footer.
//   - "Print on Letterhead" -> no header/footer artwork is drawn at all
//     (the physical pre-printed paper already has it); `@page` margin is
//     simply set to the exact blank space required (6cm top / 4cm bottom),
//     which — being a real page margin — is reserved on every physical
//     sheet automatically.
//
// Use `buildLetterheadDocument()` below to assemble a full print HTML
// string; don't hand-roll the header/footer/@page wrapper per document.
// Each document still owns its own content-specific CSS and content
// blocks, passed in as an array of HTML strings via `bodyBlocks`.

import { LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, BADGE_AWARD_B64 } from "./images.js";

// Physical print margins for the *non-repeating* case (safe minimum for
// virtually any office printer). Kept as one source of truth.
export const PRINT_MARGIN = { top: "8mm", right: "14mm", bottom: "8mm", left: "14mm" };

// Measured content heights (logo+3 address lines+rule ≈ 50mm; badge row+
// rule ≈ 19mm) plus a safety buffer, used as the @page margin when the
// header/footer repeat via position:fixed on every page — this must be
// generous enough that the fixed element's real rendered height never
// overlaps body content.
export const HEADER_RESERVE_MM = 64;
export const FOOTER_RESERVE_MM = 32;

// Exact spec for physical pre-printed letterhead paper.
export const LETTERHEAD_TOP_MM = 60;
export const LETTERHEAD_BOTTOM_MM = 40;

export const invoiceLetterheadCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }

    /* ── Header (logo + 3 address lines + top gradient rule) ─────────────── */
    .lh-header { text-align: center; padding-bottom: 10pt; }
    .lh-header--fixed { position: fixed; top: calc(${PRINT_MARGIN.top} - ${HEADER_RESERVE_MM}mm); left: 0; right: 0; padding-bottom: 0; }
    .lh-logo { height: 88pt; width: auto; display: block; margin: 0 auto; }
    .lh-addr-block { color: #2a2a2a; font-family: 'Inter', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.3pt; line-height: 1.35; margin-bottom: 0; text-align: center; white-space: nowrap; }
    .lh-addr-block:first-of-type { margin-top: 1pt; }
    .lh-rule { height: 2pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin: 4pt 0 8pt; border-radius: 1pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

    /* ── Footer (bottom gradient rule + 4 badges) ─────────────────────────── */
    .lh-footer { padding-top: 14pt; }
    .lh-footer--fixed { position: fixed; bottom: calc(${PRINT_MARGIN.bottom} - ${FOOTER_RESERVE_MM}mm); left: 0; right: 0; padding-top: 0; }
    .lh-rule-footer { height: 1.5pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin-bottom: 6pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

    /* ── Shared document content styles ───────────────────────────────────── */
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

// fixed=true  -> position:fixed wrapper, Chrome redraws it on every page.
// fixed=false -> ordinary in-flow block, appears once wherever the document
//                flow puts it (page 1 for a header used this way).
export const invoiceLetterheadHTML = (fixed = false) => `
  <div class="lh-header${fixed ? ' lh-header--fixed' : ''}">
    <img src="${LOGO_B64}" class="lh-logo" alt="Unitop Tours"/>
    <div class="lh-addr-block">Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058</div>
    <div class="lh-addr-block">Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018</div>
    <div class="lh-addr-block">Website:&nbsp;www.unitoptours.com &nbsp;|&nbsp; E-Mail: unitoptours@gmail.com &nbsp;|&nbsp; Telephone:&nbsp;+91&#8209;124&#8209;4476571</div>
    <div class="lh-rule"></div>
  </div>
`;

export const invoiceFooterHTML = (fixed = false) => `
<div class="lh-footer${fixed ? ' lh-footer--fixed' : ''}">
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
`;

// ─── CANONICAL DOCUMENT ASSEMBLY ────────────────────────────────────────────
// Every letterhead document (Quotation, Proforma, and any future document —
// Tax Invoice, Payment Receipt, itinerary builders, etc.) should call this
// instead of hand-rolling its own header/footer/@page wrapper.
//
// Params:
//   title            <title> tag text
//   extraHeadCSS     document-specific CSS (e.g. Quotation's h2/ol styles)
//   bodyBlocks       array of HTML strings making up the document content
//   headerAllPages   repeat header on every printed page (position:fixed)
//   footerAllPages   repeat footer on every printed page (position:fixed)
//   showHeader       whether the header appears at all (default true)
//   showFooter       whether the footer appears at all (default true)
//   printOnLetterhead  no artwork drawn; @page margin reserves exactly
//                      6cm top / 4cm bottom on every page for physical
//                      letterhead paper. Overrides the two "all pages" flags.
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
}) {
  const effHeaderRepeat = !printOnLetterhead && headerAllPages;
  const effFooterRepeat = !printOnLetterhead && footerAllPages;

  const headerHTML = (!printOnLetterhead && showHeader) ? invoiceLetterheadHTML(effHeaderRepeat) : "";
  const footerHTML = (!printOnLetterhead && showFooter) ? invoiceFooterHTML(effFooterRepeat) : "";

  const pageMarginTop = printOnLetterhead
    ? `${LETTERHEAD_TOP_MM}mm`
    : (effHeaderRepeat ? `${HEADER_RESERVE_MM}mm` : PRINT_MARGIN.top);
  const pageMarginBottom = printOnLetterhead
    ? `${LETTERHEAD_BOTTOM_MM}mm`
    : (effFooterRepeat ? `${FOOTER_RESERVE_MM}mm` : PRINT_MARGIN.bottom);

  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>${invoiceLetterheadCSS}</style>
    <style>@page{size:A4;margin:${pageMarginTop} ${PRINT_MARGIN.right} ${pageMarginBottom} ${PRINT_MARGIN.left};${showPageNum ? '@bottom-right{content:"Page "counter(page);font-size:7.5pt;color:#999;font-family:Inter,Arial,sans-serif;}' : ''}}</style>
    <style>${extraHeadCSS}</style>
  </head><body>
    ${headerHTML}
    <div class="lh-content">${bodyBlocks.join("")}</div>
    ${footerHTML}
  </body></html>`;
}
