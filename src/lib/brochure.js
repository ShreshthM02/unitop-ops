// Brochure document class -- the client-facing Detailed Itinerary.
//
// This deliberately does NOT run on the letterhead engine. That engine is
// built around fixed header/footer furniture and an 8mm/14mm margin box, and
// every page it produces is a business document: address block, sections,
// signature. A brochure is the opposite shape -- full-bleed photography,
// coloured panels, a cover page with no letterhead at all -- so putting it
// through that engine would have meant fighting the margin box on every
// page and overriding the header/footer away. Two small purpose-built
// engines beat one general engine bent past its design.
//
// What IS shared: the measurement approach (real DOM heights measured in an
// isolated iframe carrying the real print CSS) and the fixed-height-page
// pagination model. Those were both learned the hard way on the letterhead
// side and there is no reason to relearn them here.
//
// Images arrive as data (URLs or data URIs) and are never fetched here. The
// destination-keyed photo library that supplies them is a separate piece of
// work; this module only has to render whatever it is handed, and render
// sensibly when handed nothing.

import { itineraryItemHTML } from "./utils.js";

export const BROCHURE_PAGE = { widthMm: 210, heightMm: 297 };

// Content height available on an interior page, in px at 96dpi. A brochure
// page has no header/footer furniture, only a modest bottom strip for the
// page number, so nearly the whole sheet is usable.
export const BROCHURE_CONTENT_HEIGHT_PX = Math.round((297 - 26) * (96 / 25.4));
export const BROCHURE_CONTENT_WIDTH_PX = Math.round((210 - 32) * (96 / 25.4));

export const BROCHURE_THEME = {
  ink: "#1A3A52",
  accent: "#C2703D",
  muted: "#6B7280",
  paper: "#FFFFFF",
  panel: "#FAF7F2",
};

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const brochureCSS = (theme = BROCHURE_THEME) => `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, Arial, sans-serif;
    color: ${theme.ink};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Full-bleed fixed page. Same fixed-height model as the letterhead
     engine -- page-break-after must live on this element, not a wrapper,
     or the height silently stops applying. */
  .bro-page {
    width: ${BROCHURE_PAGE.widthMm}mm;
    height: ${BROCHURE_PAGE.heightMm}mm;
    position: relative;
    overflow: hidden;
    background: ${theme.paper};
    display: flex;
    flex-direction: column;
  }
  .bro-page--notlast { page-break-after: always; }
  .bro-body { flex: 1 1 auto; padding: 16mm 16mm 0; }
  .bro-foot {
    flex: 0 0 auto; height: 10mm; padding: 0 16mm;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 7.5pt; color: ${theme.muted};
  }

  /* ── Cover ── */
  .bro-cover { padding: 0; }
  .bro-cover-hero { position: absolute; inset: 0; }
  .bro-cover-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bro-cover-veil {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(10,20,30,0.62) 0%, rgba(10,20,30,0.28) 42%, rgba(10,20,30,0.78) 100%);
  }
  /* No hero image: a flat panel rather than a broken frame, so a brochure
     with no photography yet still prints as a deliberate-looking document. */
  .bro-cover--plain { background: ${theme.ink}; }
  .bro-cover-inner {
    position: relative; height: 100%;
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 24mm 18mm;
    color: #fff;
  }
  .bro-cover-eyebrow {
    font-size: 9pt; letter-spacing: 3px; text-transform: uppercase;
    opacity: 0.85; margin-bottom: 6mm;
  }
  .bro-cover-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 34pt; line-height: 1.08; font-weight: 700; margin: 0 0 5mm;
  }
  .bro-cover-rule { width: 22mm; height: 2.5pt; background: ${theme.accent}; margin-bottom: 5mm; }
  .bro-cover-meta { font-size: 11pt; line-height: 1.6; opacity: 0.95; }
  .bro-cover-tagline { font-size: 10pt; line-height: 1.6; opacity: 0.9; margin-top: 5mm; max-width: 120mm; }

  /* ── Day cards ── */
  .bro-day { break-inside: avoid; margin-bottom: 9mm; }
  .bro-day-head { display: flex; align-items: baseline; gap: 4mm; margin-bottom: 3mm; }
  .bro-day-badge {
    flex: 0 0 auto; background: ${theme.accent}; color: #fff;
    font-size: 8.5pt; font-weight: 700; letter-spacing: 1px;
    padding: 1.6mm 3.4mm; border-radius: 2mm; text-transform: uppercase;
  }
  .bro-day-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 15pt; font-weight: 700; color: ${theme.ink}; margin: 0;
  }
  .bro-day-grid { display: flex; gap: 6mm; align-items: flex-start; }
  .bro-day-grid--flip { flex-direction: row-reverse; }
  .bro-day-figure { flex: 0 0 58mm; }
  .bro-day-figure img {
    width: 58mm; height: 42mm; object-fit: cover; display: block;
    border-radius: 2mm;
  }
  .bro-day-content { flex: 1 1 auto; min-width: 0; }
  .bro-day-meals { margin-top: 3mm; }
  .bro-meal {
    display: inline-block; background: ${theme.panel}; color: ${theme.ink};
    border: 0.6pt solid #E7DFD3; border-radius: 8pt;
    font-size: 7.5pt; padding: 1mm 2.6mm; margin-right: 1.6mm;
  }

  /* ── Route map page ── */
  .bro-map { text-align: center; }
  .bro-map img { max-width: 100%; max-height: 210mm; object-fit: contain; display: block; margin: 0 auto; }

  .bro-section-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 18pt; font-weight: 700; margin: 0 0 6mm; color: ${theme.ink};
  }

  /* ── Closing ── */
  .bro-closing { display: flex; height: 100%; align-items: center; justify-content: center; text-align: center; }
  .bro-closing-text {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 16pt; color: ${theme.accent}; letter-spacing: 1px; line-height: 1.6;
    max-width: 140mm;
  }
`;

// One day rendered as a card. Alternating image side gives the page rhythm
// without needing per-day configuration -- the sample brochure does the same
// thing by hand.
export function brochureDayHTML(day, index, image) {
  const label = esc(day.dayLabel || `DAY-${index + 1}`);
  const title = day.title ? `<h3 class="bro-day-title">${esc(day.title)}</h3>` : "";
  const items = (day.items || []).map(itineraryItemHTML).join("");
  const meals = (day.meals || []).map(m =>
    `<span class="bro-meal">${m === "B" ? "Breakfast" : m === "L" ? "Lunch" : "Dinner"}</span>`).join("");
  const flip = index % 2 === 1 ? " bro-day-grid--flip" : "";
  const figure = image
    ? `<div class="bro-day-figure"><img src="${esc(image)}" alt=""/></div>`
    : "";
  return `<div class="bro-day">
    <div class="bro-day-head"><span class="bro-day-badge">${label}</span>${title}</div>
    <div class="bro-day-grid${flip}">
      ${figure}
      <div class="bro-day-content">
        ${items}
        ${meals ? `<div class="bro-day-meals">${meals}</div>` : ""}
      </div>
    </div>
  </div>`;
}

export function brochureCoverHTML({ title, tagline, duration, route, heroImage, eyebrow }) {
  const hero = heroImage
    ? `<div class="bro-cover-hero"><img src="${esc(heroImage)}" alt=""/></div><div class="bro-cover-veil"></div>`
    : "";
  const meta = [duration, route].filter(Boolean).map(v => `<div>${esc(v)}</div>`).join("");
  return `<div class="bro-page bro-page--notlast bro-cover${heroImage ? "" : " bro-cover--plain"}">
    ${hero}
    <div class="bro-cover-inner">
      ${eyebrow ? `<div class="bro-cover-eyebrow">${esc(eyebrow)}</div>` : ""}
      <h1 class="bro-cover-title">${esc(title || "Itinerary")}</h1>
      <div class="bro-cover-rule"></div>
      <div class="bro-cover-meta">${meta}</div>
      ${tagline ? `<div class="bro-cover-tagline">${esc(tagline)}</div>` : ""}
    </div>
  </div>`;
}

// Flows day cards into fixed-height pages using measured heights, the same
// model the letterhead paginator uses. measureFn is injectable so tests can
// run without a DOM.
export function paginateBrochureDays(dayHTMLs, { pageHeightPx = BROCHURE_CONTENT_HEIGHT_PX, contentWidthPx = BROCHURE_CONTENT_WIDTH_PX, measureFn } = {}) {
  const pages = [];
  let current = [];
  let used = 0;
  (dayHTMLs || []).forEach(html => {
    const h = measureFn(html, contentWidthPx);
    // A card taller than a whole page still has to go somewhere -- give it
    // its own page rather than dropping it or looping forever.
    if (used + h > pageHeightPx && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(html);
    used += h;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}

// Assembles the whole brochure. Pages: cover, day pages, optional route map,
// optional closing. Returns a complete HTML document string.
export function buildBrochureDocument({
  cover = {},
  days = [],
  dayImages = {},
  routeMapImage = null,
  closingText = "",
  showPageNumbers = true,
  theme = BROCHURE_THEME,
  measureFn,
  footerLabel = "",
} = {}) {
  const dayHTMLs = days.map((d, i) => brochureDayHTML(d, i, dayImages[d.id] || dayImages[i] || null));
  const dayPages = measureFn
    ? paginateBrochureDays(dayHTMLs, { measureFn })
    // Without a measurer (no DOM), fall back to one day per page rather than
    // guessing at heights -- predictable and never overflows, which matters
    // more than density for a fallback path.
    : dayHTMLs.map(h => [h]);

  const bodies = [];
  dayPages.forEach(cards => bodies.push(`<div class="bro-body">${cards.join("")}</div>`));
  if (routeMapImage) {
    bodies.push(`<div class="bro-body bro-map"><h2 class="bro-section-title">Tour Route Map</h2><img src="${esc(routeMapImage)}" alt="Tour route map"/></div>`);
  }
  if (closingText) {
    bodies.push(`<div class="bro-body bro-closing"><div class="bro-closing-text">${esc(closingText)}</div></div>`);
  }

  const total = bodies.length + 1; // +1 for the cover
  const pagesHTML = bodies.map((body, i) => {
    const isLast = i === bodies.length - 1;
    const foot = showPageNumbers
      ? `<div class="bro-foot"><span>${esc(footerLabel)}</span><span>${i + 2} / ${total}</span></div>`
      : `<div class="bro-foot"></div>`;
    return `<div class="bro-page${isLast ? "" : " bro-page--notlast"}">${body}${foot}</div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>${esc(cover.title || "Itinerary")}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
    <style>${brochureCSS(theme)}</style>
  </head><body>${brochureCoverHTML(cover)}${pagesHTML}</body></html>`;
}

// Screen-only preview styling for the brochure, mirroring the letterhead
// preview but WITHOUT the margin padding -- a brochure is full-bleed, so
// padding the sheet would misrepresent exactly the thing the preview exists
// to show. Wrapped in @media screen so it can never reach print output.
export const BROCHURE_PREVIEW_CSS = `
@media screen {
  html, body { background: #525659 !important; margin: 0 !important; padding: 0 !important; }
  body { padding: 16px 0 !important; }
  .bro-page {
    margin: 0 auto 16px !important;
    box-shadow: 0 2px 12px rgba(0,0,0,0.45) !important;
  }
  .bro-page:last-child { margin-bottom: 0 !important; }
}
`;

export function withBrochurePreviewStyles(html) {
  if (!html) return html;
  const tag = `<style>${BROCHURE_PREVIEW_CSS}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${tag}</head>`) : tag + html;
}
