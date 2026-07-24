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

    /* ── Paginated print pages (Phase: Letterhead Standardization,
       2026-07-24) ──────────────────────────────────────────────────────
       Confirmed working through 8 rounds of real Chrome print-to-PDF
       testing (see docs/DATA_OWNERSHIP.md or project memory for the full
       diagnostic history). Each printed page is its own div with an
       explicit height matching the real A4 portrait content area (297mm
       minus this file's own PRINT_MARGIN top+bottom), NOT a
       table/thead/tfoot -- that approach could repeat header/footer but
       never got the footer to the true bottom of a page whose content
       didn't fill it. Two things matter and were each independently
       proven necessary:
       (1) .print-page-content uses flex:1 1 auto, NOT
           justify-content:space-between on the container -- space-between
           with 3 flex children (header/content/footer) puts equal gaps
           BOTH above and below short content, creating an ugly gap
           between the header and the first line. flex:1 on the content
           block lets IT absorb all leftover space, so the header stays
           flush at top and only the footer gets pushed down.
       (2) page-break-after lives directly on .print-page itself, never
           split onto a separate outer wrapper div -- that split silently
           broke the height entirely (the div collapsed to fit only its
           content, and the footer got clipped or floated with no
           explanation from computed styles alone).
       This does NOT include the pagination (chunking content into pages)
       -- see paginateBodyBlocks() below, which must run in-browser
       against real rendered heights. */
    .print-page { height: 281mm; display: flex; flex-direction: column; }
    .print-page.print-page-notlast { page-break-after: always; }
    .print-page-header { flex: 0 0 auto; }
    .print-page-footer { flex: 0 0 auto; }
    .print-page-content { flex: 1 1 auto; overflow: hidden; }
    .print-page-content > * + * { margin-top: 0; }

    /* ── Shared document content styles (unchanged from before) ──────────── */
    .inv-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 700; color: #1A3A52; text-align: center; margin-bottom: 10pt; letter-spacing: 1pt; text-transform: uppercase; }
    /* section-title: used for in-document section headers (each Cost
       Sheet section like Transport, Local Handler, etc) -- deliberately
       separate from inv-title, which stays Playfair Display for the main
       document title only, and is also shared by other documents
       (GanttView, ItineraryBuilder) that should not be affected by this
       change. Inter, lighter weight, smaller -- reduces the heavy,
       decorative feel every section transition had when every header
       used the same bold serif treatment as the main title. */
    .section-title { font-family: 'Inter', Arial, sans-serif; font-size: 12pt; font-weight: 600; color: #1A3A52; text-align: center; margin-bottom: 8pt; letter-spacing: 0.3pt; text-transform: uppercase; }
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
    /* content-grid: CSS Grid replacement for content-table, introduced to
       sidestep a real, confirmed discrepancy between how a browser's
       normal screen rendering and its actual print/PDF rendering path
       handle table-layout:fixed -- generated HTML was verified correct
       (colgroup/th/td widths captured directly from the real output
       matched the intended percentages exactly), yet the printed PDF
       still showed the old, unbalanced proportions. Grid has its own,
       separate sizing algorithm with no table-layout-specific quirks to
       diverge between rendering contexts. Kept alongside content-table
       (not replacing it) until verified working across real exports. */
    .content-grid { display: grid; width: 100%; margin-bottom: 6pt; column-gap: 10pt; }
    .content-grid .grid-header { background: #1A3A52; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 5pt 7pt; }
    .content-grid .grid-cell { padding: 4pt 7pt; border-bottom: 0.5pt solid #e5e7eb; font-size: 9.5pt; break-inside: avoid; }
    .content-grid .grid-cell.zebra { background: #f9fafb; }
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

  // @page lives in its own dedicated style tag, placed LAST (after the
  // imported font and all other rules) so it can't be shadowed by any
  // cascade/specificity quirk in a specific browser's print engine --
  // this is the most broadly-compatible way to set page size/orientation
  // for window.print()-based PDF generation. True cross-browser
  // verification still needs a real browser (not available in this
  // sandbox); this is the most robust pattern available without one.
  const pageCSS = `@page { size: A4 ${orientation === "landscape" ? "landscape" : "portrait"}; margin: ${PRINT_MARGIN.top} ${PRINT_MARGIN.right} ${PRINT_MARGIN.bottom} ${PRINT_MARGIN.left}; }
    ${showPageNum ? '@page { @bottom-right { content: "Page " counter(page); font-size: 7.5pt; color: #999; font-family: Inter, Arial, sans-serif; } }' : ""}`;

  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>${invoiceLetterheadCSS}</style>
    <style>${extraHeadCSS}</style>
    <style>${pageCSS}</style>
  </head><body>
    <table class="lh-doc">
      ${theadBlock}
      <tbody>${tbodyRows}</tbody>
      ${tfootBlock}
    </table>
  </body></html>`;
}

// ─── PAGINATED PRINTING (Letterhead Standardization, 2026-07-24) ───────────
// Everything below is additive -- buildLetterheadDocument above is
// untouched and still used as-is by Cost Sheet and GanttView, which are
// explicitly out of scope for this initiative. The documents that DO use
// this (Quotation, Meal Plan, Pro Forma Invoice, Tax Invoice, Tour
// Briefing Sheet, and the future Brief Itinerary) switch to
// buildPaginatedLetterheadDocument instead.
//
// This exists because true "header/footer repeat AND the footer sits at
// the real bottom of a partially-filled last page" cannot be done with
// pure CSS against variable-length content -- it requires knowing how
// tall each page's content actually is, which requires real DOM
// measurement. See the .print-page CSS comment above for the two
// specific things that had to be true for the per-page box itself to
// work; this is the piece that decides what content goes on which page.

// A4 portrait content area, in mm, after PRINT_MARGIN's top+bottom.
// Recomputed from PRINT_MARGIN rather than hardcoded, so if that value
// ever changes this stays correct automatically.
const A4_HEIGHT_MM = 297;
function mmToNumber(s) { return parseFloat(s); }
export const PAGE_CONTENT_HEIGHT_MM = A4_HEIGHT_MM - mmToNumber(PRINT_MARGIN.top) - mmToNumber(PRINT_MARGIN.bottom);

// A4 portrait content area width, in mm, after PRINT_MARGIN's left+right.
const A4_WIDTH_MM = 210;
export const PAGE_CONTENT_WIDTH_MM = A4_WIDTH_MM - mmToNumber(PRINT_MARGIN.left) - mmToNumber(PRINT_MARGIN.right);

// Renders an HTML string into a hidden, correctly-widthed off-screen div
// and returns its real rendered height in px -- the only way to know how
// tall a block of arbitrary document content (tables, paragraphs, mixed)
// will actually be once laid out with real fonts. Requires a real
// browser DOM; throws with a clear message if called anywhere else
// (tests must inject their own measureFn instead of using this default).
function domMeasureHeightPx(html, containerWidthPx) {
  if (typeof document === "undefined") {
    throw new Error("domMeasureHeightPx requires a real browser DOM. Pass an explicit measureFn to paginateBodyBlocks when calling outside a browser (e.g. in tests).");
  }
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.left = "-99999px";
  el.style.top = "0";
  el.style.width = containerWidthPx + "px";
  document.body.appendChild(el);
  el.innerHTML = html;
  const h = el.offsetHeight;
  document.body.removeChild(el);
  return h;
}

// Greedily packs bodyBlocks (in order -- content is never reordered) into
// pages, each no taller than pageContentHeightPx. A single block taller
// than a whole page still gets its own page rather than looping forever;
// this is best-effort pagination, not a hard guarantee against overflow
// for pathological single blocks (e.g. one enormous table row).
//
// measureFn defaults to real DOM measurement (domMeasureHeightPx) but can
// be overridden -- this is what makes the packing algorithm itself
// testable under jsdom, which doesn't do real layout and would otherwise
// report 0 for every height.
export function paginateBodyBlocks(bodyBlocks, { pageContentHeightPx, containerWidthPx, measureFn = domMeasureHeightPx } = {}) {
  const heights = bodyBlocks.map(html => measureFn(html, containerWidthPx));
  const pages = [];
  let currentPage = [];
  let currentHeight = 0;

  bodyBlocks.forEach((html, i) => {
    const h = heights[i];
    if (currentHeight + h > pageContentHeightPx && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(html);
    currentHeight += h;
  });
  if (currentPage.length > 0) pages.push(currentPage);
  if (pages.length === 0) pages.push([]);
  return pages;
}

// mmToPx: converts a real physical mm measurement into the px value the
// current browser/DPI context would render it as, by measuring an actual
// element rather than assuming a fixed 96dpi (which print contexts don't
// reliably use). Falls back to the 96dpi approximation outside a browser.
function mmToPx(mm) {
  if (typeof document === "undefined") return mm * 96 / 25.4;
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  el.style.height = mm + "mm";
  document.body.appendChild(el);
  const px = el.offsetHeight;
  document.body.removeChild(el);
  return px;
}

// The full paginated document builder. Unlike buildLetterheadDocument,
// this is async and requires a real browser DOM -- it measures the
// header, footer, and every content block, then decides page breaks
// itself rather than leaving that to the browser's own table
// fragmentation (which is what buildLetterheadDocument still relies on,
// and which is exactly what can't get a footer to the true bottom of a
// short last page).
//
// Handles all three toggle states from the Letterhead Standardization
// spec:
//   (a) headerFooterAllPages=false, printOnLetterhead=false -> no
//       pagination needed at all; header once at the top, footer once
//       at the end of content, single flowing document (same as the
//       old default behavior).
//   (b) headerFooterAllPages=true -> real header/footer content repeats
//       on every paginated page, footer pinned to the true bottom of
//       even a short last page.
//   (c) printOnLetterhead=true -> headerFooterAllPages is ignored (the
//       caller should already have deselected it per the toggle
//       interaction rule); every page reserves a blank 6cm top / 4cm
//       bottom gap instead of real header/footer content, still
//       repeating on every page since physical letterhead paper is used
//       for every sheet printed.
export async function buildPaginatedLetterheadDocument({
  title,
  extraHeadCSS = "",
  bodyBlocks,
  headerFooterAllPages = false,
  showHeader = true,
  showFooter = true,
  printOnLetterhead = false,
  showPageNum = false,
}) {
  const repeating = printOnLetterhead || headerFooterAllPages;

  const headerInner = showHeader ? invoiceLetterheadHTML(printOnLetterhead) : "";
  const footerInner = showFooter ? invoiceFooterHTML(printOnLetterhead) : "";

  const pageCSS = `@page { size: A4 portrait; margin: ${PRINT_MARGIN.top} ${PRINT_MARGIN.right} ${PRINT_MARGIN.bottom} ${PRINT_MARGIN.left}; }
    ${showPageNum ? '@page { @bottom-right { content: "Page " counter(page); font-size: 7.5pt; color: #999; font-family: Inter, Arial, sans-serif; } }' : ""}`;
  const headBlock = `<style>${invoiceLetterheadCSS}</style><style>${extraHeadCSS}</style><style>${pageCSS}</style>`;

  // Rule (a): no repetition needed -- single flowing document, exactly
  // the old non-repeating behavior. No measurement, no pagination.
  if (!repeating) {
    const rows = [...bodyBlocks];
    if (headerInner) rows.unshift(headerInner);
    if (footerInner) rows.push(footerInner);
    return `<!DOCTYPE html><html><head><title>${title}</title>${headBlock}</head><body>
      ${rows.join("\n")}
    </body></html>`;
  }

  // Rules (b) and (c): real pagination. Measure header/footer height
  // (or use the fixed printOnLetterhead blank-space sizes, which are
  // already known constants -- 6cm/4cm -- rather than re-measuring an
  // empty div), then pack content into pages.
  const containerWidthPx = mmToPx(PAGE_CONTENT_WIDTH_MM);
  const pageContentHeightPx = mmToPx(PAGE_CONTENT_HEIGHT_MM);
  const headerHeightPx = printOnLetterhead ? mmToPx(60) : (headerInner ? domMeasureHeightPx(headerInner, containerWidthPx) : 0);
  const footerHeightPx = printOnLetterhead ? mmToPx(40) : (footerInner ? domMeasureHeightPx(footerInner, containerWidthPx) : 0);
  const availableContentHeightPx = pageContentHeightPx - headerHeightPx - footerHeightPx;

  const pages = paginateBodyBlocks(bodyBlocks, { pageContentHeightPx: availableContentHeightPx, containerWidthPx });

  const pageDivs = pages.map((pageBlocks, i) => {
    const isLast = i === pages.length - 1;
    return `<div class="print-page${isLast ? "" : " print-page-notlast"}">
      <div class="print-page-header">${headerInner}</div>
      <div class="print-page-content">${pageBlocks.join("\n")}</div>
      <div class="print-page-footer">${footerInner}</div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html><html><head><title>${title}</title>${headBlock}</head><body>
    ${pageDivs}
  </body></html>`;
}
