// Brochure document class -- the client-facing Detailed Itinerary.
//
// This does NOT run on the letterhead engine. That engine is built around
// fixed header/footer furniture and an 8mm/14mm margin box, and everything
// it produces is a business document. A brochure is the opposite shape, so
// putting it through that engine would mean fighting the margin box on
// every page. Two purpose-built engines beat one bent past its design.
//
// ── DESIGN INTENT (rewritten 2026-08-01) ────────────────────────────────
// The first attempt was laid out the way a developer builds a page:
// defensible spacing, no point of view. It read as competent and
// forgettable. This one makes deliberate choices, and the governing one is
// that we are NOT imitating a scrapbook-style Canva brochure. Torn-paper
// edges and layered artwork are precisely what print CSS is worst at, so
// copying that style means losing on its own terms. What print CSS is
// genuinely excellent at is EDITORIAL layout -- the look of a good travel
// magazine. So:
//
//   * Warm cream stock, not office white. Paper you'd want to hold.
//   * One accent (burnt saffron), used sparingly and always meaningfully:
//     day numbers, rules, route lines. Never decoration for its own sake.
//   * A confident serif display against a quiet sans body.
//   * Generous whitespace. Restraint is what reads as expensive.
//   * Photographs in clean rectangles at one consistent size, so the page
//     rhythm holds whether a given day has a photo or not.
//
// Two structural decisions matter more than the styling, because they are
// what make it informative rather than merely pretty:
//
//   1. AN "AT A GLANCE" PAGE. A client absorbs the whole tour in ten
//      seconds -- day, route, overnight, one table -- before reading any
//      detail. No other page earns its space as cheaply.
//   2. PLACE NOTES. Every stop can carry one line saying what the place
//      actually is. "Sarnath" tells a client nothing; "where the Buddha
//      gave his first sermon" is the difference between a list of names and
//      an itinerary worth reading. Optional everywhere, so a hurried entry
//      still renders cleanly.

import { itineraryItemHTML } from "./utils.js";

export const BROCHURE_PAGE = { widthMm: 210, heightMm: 297 };
export const BROCHURE_CONTENT_HEIGHT_PX = Math.round((297 - 40) * (96 / 25.4));
export const BROCHURE_CONTENT_WIDTH_PX = Math.round((210 - 40) * (96 / 25.4));

export const BROCHURE_THEME = {
  paper: "#FDFBF6",   // warm cream, not office white
  ink: "#1B2B3A",     // deep charcoal-navy
  accent: "#B4622D",  // burnt saffron
  soft: "#8A8172",    // muted warm grey for secondary text
  rule: "#E4DCCD",    // hairline rules that sit on cream
  panel: "#F5EFE3",   // quiet fill for pills
};

// Real fonts load in the browser; the fallbacks preserve the character (an
// elegant transitional serif, a neutral humanist sans) when they don't.
const DISPLAY = `'Playfair Display', 'GFS Baskerville', 'Bitstream Charter', Georgia, serif`;
const BODY = `'Inter', Carlito, 'DejaVu Sans', -apple-system, Arial, sans-serif`;

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MEAL_LABEL = { B: "Breakfast", L: "Lunch", D: "Dinner" };

export const brochureCSS = (theme = BROCHURE_THEME) => `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${BODY};
    color: ${theme.ink};
    background: ${theme.paper};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Fixed-height page. page-break-after must sit on the SAME element that
     carries the height -- on a wrapper it silently stops applying. Learned
     the hard way on the letterhead engine; not relearning it here. */
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
  .bro-body { flex: 1 1 auto; padding: 20mm 20mm 0; }
  .bro-foot {
    flex: 0 0 auto; height: 14mm; padding: 0 20mm 5mm;
    display: flex; align-items: flex-end;
    font-size: 7pt; letter-spacing: 0.6px; color: ${theme.soft};
  }
  .bro-foot-rule { border-top: 0.5pt solid ${theme.rule}; padding-top: 2.5mm; width: 100%; display: flex; justify-content: space-between; }

  /* ── Cover ───────────────────────────────────────────────────────── */
  .bro-cover { padding: 0; }
  .bro-cover-hero { position: absolute; inset: 0; }
  .bro-cover-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bro-cover-veil {
    position: absolute; inset: 0;
    background: linear-gradient(175deg, rgba(12,22,32,0.55) 0%, rgba(12,22,32,0.16) 36%, rgba(12,22,32,0.88) 100%);
  }
  /* No hero: a deliberate ink field rather than a broken frame, so a
     brochure with no photography still looks intentional. */
  .bro-cover--plain { background: ${theme.ink}; }
  .bro-cover-inner {
    position: relative; height: 100%;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 22mm 20mm 20mm; color: #fff;
  }
  .bro-cover-brand {
    font-size: 8pt; letter-spacing: 3.4px; text-transform: uppercase;
    opacity: 0.85; font-weight: 600;
  }
  .bro-cover-title {
    font-family: ${DISPLAY};
    font-size: 40pt; line-height: 1.04; font-weight: 700;
    margin: 0 0 6mm; letter-spacing: -0.5px;
  }
  .bro-cover-rule { width: 26mm; height: 2pt; background: ${theme.accent}; margin-bottom: 6mm; }
  .bro-cover-duration {
    font-size: 10pt; letter-spacing: 3px; text-transform: uppercase;
    font-weight: 600; margin-bottom: 4mm; color: #F0D9C4;
  }
  .bro-cover-route { font-size: 10.5pt; line-height: 1.65; opacity: 0.93; max-width: 138mm; }
  .bro-cover-tagline {
    font-family: ${DISPLAY}; font-style: italic;
    font-size: 12pt; line-height: 1.6; opacity: 0.95;
    margin-top: 7mm; max-width: 128mm;
  }

  .bro-cover-logo { height: 13mm; margin-bottom: 5mm; }
  .bro-cover-logo img { height: 13mm; display: block; }

  /* PHOTO SIZING. The first version used 46x34mm insets, one per day. Below
     roughly 60mm wide an image stops reading as a photograph and becomes
     decoration, and nine identical stamps meant none of them carried any
     weight. The rule now is ONE dominant image per page, not one per day:
     a full-width band above the day blocks. Fewer, larger, and it needs
     less library coverage rather than more. */
  .bro-band { margin: 0 0 9mm; }
  .bro-band img { width: 100%; height: 52mm; object-fit: cover; display: block; border-radius: 1mm; }
  .bro-band-cap {
    font-size: 6.5pt; letter-spacing: 1.4px; text-transform: uppercase;
    color: ${theme.soft}; margin-top: 2mm;
  }

  /* One full-bleed plate at the midpoint. A document needs somewhere to
     breathe; this is the page that makes it feel like a brochure rather
     than a report. */
  .bro-plate { position: relative; padding: 0; }
  .bro-plate img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bro-plate-veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(12,22,32,0.15) 0%, rgba(12,22,32,0.72) 100%); }
  .bro-plate-cap {
    position: absolute; left: 20mm; right: 20mm; bottom: 22mm; color: #fff;
  }
  .bro-plate-name { font-family: ${DISPLAY}; font-size: 26pt; font-weight: 700; line-height: 1.1; }
  .bro-plate-sub { font-size: 9.5pt; letter-spacing: 2.4px; text-transform: uppercase; opacity: 0.85; margin-top: 3mm; }

  .bro-map-fig { margin-bottom: 7mm; }
  .bro-map-fig img, .bro-map-fig svg { width: 100%; display: block; }

  /* ── Section headings ────────────────────────────────────────────── */
  .bro-eyebrow {
    font-size: 7.5pt; letter-spacing: 3px; text-transform: uppercase;
    color: ${theme.accent}; font-weight: 700; margin-bottom: 3mm;
  }
  .bro-h {
    font-family: ${DISPLAY}; font-size: 22pt; font-weight: 700;
    margin: 0 0 7mm; letter-spacing: -0.3px; line-height: 1.15;
  }

  /* ── At a glance ─────────────────────────────────────────────────── */
  .bro-glance { width: 100%; border-collapse: collapse; }
  .bro-glance th {
    text-align: left; font-size: 7pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; padding: 0 3mm 2.5mm 0;
    border-bottom: 1pt solid ${theme.ink};
  }
  .bro-glance td {
    padding: 3.1mm 3mm 3.1mm 0; font-size: 9pt; vertical-align: top;
    border-bottom: 0.5pt solid ${theme.rule}; line-height: 1.45;
  }
  .bro-glance .g-day {
    width: 14mm; font-family: ${DISPLAY}; font-size: 12pt;
    font-weight: 700; color: ${theme.accent};
  }
  .bro-glance .g-route { font-weight: 600; }
  .bro-glance .g-stay { width: 44mm; color: ${theme.soft}; font-size: 8.5pt; }
  .bro-meta { font-size: 8pt; color: ${theme.soft}; font-weight: 500; }

  .bro-facts { display: flex; margin-top: 11mm; border-top: 1pt solid ${theme.ink}; padding-top: 6mm; }
  .bro-fact { flex: 1; }
  .bro-fact-n {
    font-family: ${DISPLAY}; font-size: 21pt; font-weight: 700;
    color: ${theme.accent}; line-height: 1;
  }
  .bro-fact-l {
    font-size: 7pt; letter-spacing: 1.6px; text-transform: uppercase;
    color: ${theme.soft}; margin-top: 2mm; font-weight: 600;
  }

  /* ── Day block ───────────────────────────────────────────────────── */
  .bro-day { display: flex; gap: 6mm; break-inside: avoid; margin-bottom: 11mm; }
  .bro-day-rail { flex: 0 0 15mm; text-align: right; padding-top: 1mm; }
  .bro-day-num {
    font-family: ${DISPLAY}; font-size: 27pt; font-weight: 700;
    color: ${theme.accent}; line-height: 0.9; letter-spacing: -1px;
  }
  .bro-day-word {
    font-size: 6.5pt; letter-spacing: 2.2px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; margin-top: 1.5mm;
  }
  .bro-day-main { flex: 1 1 auto; min-width: 0; border-left: 0.5pt solid ${theme.rule}; padding-left: 6mm; }
  .bro-day-title {
    font-family: ${DISPLAY}; font-size: 14.5pt; font-weight: 700;
    margin: 0 0 2.5mm; line-height: 1.25;
  }
  .bro-day-route {
    font-size: 8pt; letter-spacing: 0.4px; color: ${theme.accent};
    font-weight: 600; margin-bottom: 4.5mm; text-transform: uppercase;
  }
  .bro-day-cols { display: flex; gap: 6mm; align-items: flex-start; }
  .bro-day-text { flex: 1 1 auto; min-width: 0; }
  .bro-day-figure { flex: 0 0 46mm; }
  .bro-day-figure img {
    width: 46mm; height: 34mm; object-fit: cover; display: block;
    border-radius: 1mm;
  }
  .bro-day-caption {
    font-size: 6.5pt; color: ${theme.soft}; margin-top: 1.5mm;
    letter-spacing: 0.4px; text-transform: uppercase;
  }

  /* The day's plan as a timeline. Markers give the eye a spine to run
     down, so a day reads as a sequence rather than a paragraph. */
  .bro-tl { list-style: none; margin: 0; padding: 0; }
  .bro-tl-item { position: relative; padding-left: 5.5mm; margin-bottom: 3.2mm; }
  .bro-tl-item::before {
    content: ""; position: absolute; left: 0; top: 1.5mm;
    width: 1.8mm; height: 1.8mm; border-radius: 50%;
    background: ${theme.accent};
  }
  .bro-tl-item--soft::before { background: ${theme.paper}; border: 0.5pt solid ${theme.soft}; }
  .bro-tl-name { font-size: 9.5pt; font-weight: 600; line-height: 1.4; }
  /* The one line about a place -- what turns a list of names into
     something a client actually learns from. */
  .bro-tl-note { font-size: 8.5pt; line-height: 1.5; color: ${theme.soft}; margin-top: 0.8mm; }
  .bro-tl-prose { font-size: 9pt; line-height: 1.6; margin: 0; }

  .bro-day-foot {
    display: flex; align-items: center; gap: 2.5mm; flex-wrap: wrap;
    margin-top: 4.5mm; padding-top: 3mm; border-top: 0.5pt solid ${theme.rule};
  }
  .bro-pill {
    font-size: 7pt; letter-spacing: 0.8px; text-transform: uppercase;
    background: ${theme.panel}; color: ${theme.ink}; font-weight: 600;
    padding: 1.2mm 2.8mm; border-radius: 6pt;
  }
  .bro-stay { font-size: 8.5pt; color: ${theme.soft}; margin-left: auto; }
  .bro-stay strong { color: ${theme.ink}; font-weight: 600; }

  /* ── Info tables and lists ───────────────────────────────────────── */
  .bro-table { width: 100%; border-collapse: collapse; }
  .bro-table th {
    text-align: left; font-size: 7pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; padding: 0 3mm 2.5mm 0;
    border-bottom: 1pt solid ${theme.ink};
  }
  .bro-table td {
    padding: 3mm 3mm 3mm 0; font-size: 9pt; vertical-align: top;
    border-bottom: 0.5pt solid ${theme.rule};
  }
  .bro-cols2 { display: flex; gap: 12mm; }
  .bro-cols2 > div { flex: 1; }
  .bro-subh {
    font-size: 7pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; padding-bottom: 2.5mm;
    border-bottom: 1pt solid ${theme.ink}; margin-bottom: 4mm;
  }
  .bro-list { list-style: none; margin: 0; padding: 0; }
  .bro-list li {
    font-size: 8.5pt; line-height: 1.55; padding-left: 4mm;
    position: relative; margin-bottom: 2.4mm;
  }
  .bro-list li::before {
    content: ""; position: absolute; left: 0; top: 1.7mm;
    width: 1.4mm; height: 1.4mm; background: ${theme.accent}; border-radius: 50%;
  }
  .bro-list--x li::before { background: ${theme.paper}; border: 0.5pt solid ${theme.soft}; }

  /* ── Route map ───────────────────────────────────────────────────── */
  .bro-map img { max-width: 100%; max-height: 195mm; object-fit: contain; display: block; margin: 0 auto; }

  /* ── Closing ─────────────────────────────────────────────────────── */
  .bro-closing { display: flex; flex-direction: column; height: 100%; align-items: center; justify-content: center; text-align: center; }
  .bro-closing-mark { width: 18mm; height: 1.5pt; background: ${theme.accent}; margin-bottom: 9mm; }
  .bro-closing-text {
    font-family: ${DISPLAY}; font-style: italic; font-size: 17pt;
    line-height: 1.55; max-width: 132mm; margin-bottom: 11mm;
  }
  .bro-closing-contact { font-size: 8.5pt; line-height: 1.75; color: ${theme.soft}; }
  .bro-closing-contact strong { color: ${theme.ink}; font-weight: 600; display: block; margin-bottom: 2mm; font-size: 9.5pt; }
`;

// ── Item rendering ───────────────────────────────────────────────────
// Items may carry a `note`: one line explaining what the place is.
// Everything degrades to just the name when it's absent.
function timelineItemHTML(item) {
  if (!item) return "";
  const text = (item.text || "").trim();
  const note = (item.note || "").trim();
  const meta = [item.distance, item.time].filter(Boolean).join(" · ");
  const soft = item.type !== "sightseeing";
  const cls = `bro-tl-item${soft ? " bro-tl-item--soft" : ""}`;

  if (item.type === "description") {
    return text ? `<li class="${cls}"><p class="bro-tl-prose">${esc(text).replace(/\n/g, "<br/>")}</p></li>` : "";
  }
  if (!text && !meta) return "";
  return `<li class="${cls}">
    <div class="bro-tl-name">${esc(text)}${meta ? ` <span class="bro-meta">— ${esc(meta)}</span>` : ""}</div>
    ${note ? `<div class="bro-tl-note">${esc(note)}</div>` : ""}
  </li>`;
}

// The overnight stay is lifted OUT of the timeline into the day's footer:
// "where am I sleeping" is looked up directly, not read down to.
const stayOf = (day) => ((day.items || []).find(i => i.type === "stay" && (i.text || "").trim()) || {}).text || "";

// The first route item doubles as the day's headline movement, shown under
// the title. Keeping it out of the timeline avoids stating it twice.
const leadRouteOf = (day) => (day.items || []).find(i => i.type === "route" && ((i.text || "").trim() || i.distance || i.time)) || null;

export function brochureDayHTML(day, index, image) {
  const items = day.items || [];
  const lead = leadRouteOf(day);
  const stay = stayOf(day);
  const timeline = items.filter(i => i !== lead && i.type !== "stay").map(timelineItemHTML).join("");

  const num = String(index + 1).padStart(2, "0");
  const leadLine = lead
    ? [(lead.text || "").trim(), [lead.distance, lead.time].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  ")
    : "";
  const meals = (day.meals || []).map(m => `<span class="bro-pill">${MEAL_LABEL[m] || esc(m)}</span>`).join("");
  // Images moved to a page-level band (see .bro-band): one dominant image
  // per page reads far better than a stamp beside every day.
  const figure = image
    ? `<div class="bro-day-figure"><img src="${esc(image)}" alt=""/>${day.imageCaption ? `<div class="bro-day-caption">${esc(day.imageCaption)}</div>` : ""}</div>`
    : "";

  return `<div class="bro-day">
    <div class="bro-day-rail">
      <div class="bro-day-num">${num}</div>
      <div class="bro-day-word">Day</div>
    </div>
    <div class="bro-day-main">
      ${day.title ? `<h3 class="bro-day-title">${esc(day.title)}</h3>` : ""}
      ${leadLine ? `<div class="bro-day-route">${esc(leadLine)}</div>` : ""}
      <div class="bro-day-cols">
        <div class="bro-day-text">${timeline ? `<ul class="bro-tl">${timeline}</ul>` : ""}</div>
        ${figure}
      </div>
      ${(meals || stay) ? `<div class="bro-day-foot">${meals}${stay ? `<div class="bro-stay">Overnight · <strong>${esc(stay)}</strong></div>` : ""}</div>` : ""}
    </div>
  </div>`;
}

export function brochureCoverHTML({ title, tagline, duration, route, heroImage, brand, logo } = {}) {
  const hero = heroImage
    ? `<div class="bro-cover-hero"><img src="${esc(heroImage)}" alt=""/></div><div class="bro-cover-veil"></div>`
    : "";
  return `<div class="bro-page bro-page--notlast bro-cover${heroImage ? "" : " bro-cover--plain"}">
    ${hero}
    <div class="bro-cover-inner">
      ${logo ? `<div class="bro-cover-logo"><img src="${esc(logo)}" alt=""/></div>` : `<div class="bro-cover-brand">${esc(brand || "Unitop Tours & Travel (P) Ltd.")}</div>`}
      <div>
        <h1 class="bro-cover-title">${esc(title || "Itinerary")}</h1>
        <div class="bro-cover-rule"></div>
        ${duration ? `<div class="bro-cover-duration">${esc(duration)}</div>` : ""}
        ${route ? `<div class="bro-cover-route">${esc(route)}</div>` : ""}
        ${tagline ? `<div class="bro-cover-tagline">${esc(tagline)}</div>` : ""}
      </div>
    </div>
  </div>`;
}

// A whole tour absorbed in ten seconds, before any detail.
export function brochureGlanceHTML(days, facts = {}, mapHTML = "", sectorTableHTML = "") {
  const rows = (days || []).map((d, i) => {
    const lead = leadRouteOf(d);
    const headline = (lead && (lead.text || "").trim())
      || d.title
      || ((d.items || []).find(x => x.type === "sightseeing" && x.text) || {}).text
      || "—";
    const meta = lead ? [lead.distance, lead.time].filter(Boolean).join(" · ") : "";
    return `<tr>
      <td class="g-day">${String(i + 1).padStart(2, "0")}</td>
      <td><span class="g-route">${esc(headline)}</span>${meta ? `<div class="bro-meta">${esc(meta)}</div>` : ""}</td>
      <td class="g-stay">${esc(stayOf(d) || "—")}</td>
    </tr>`;
  }).join("");

  const cells = [
    facts.days && { n: facts.days, l: "Days" },
    facts.nights && { n: facts.nights, l: "Nights" },
    facts.sites && { n: facts.sites, l: "Sites Visited" },
    facts.distance && { n: facts.distance, l: "Road Distance" },
  ].filter(Boolean).map(f => `<div class="bro-fact"><div class="bro-fact-n">${esc(f.n)}</div><div class="bro-fact-l">${esc(f.l)}</div></div>`).join("");

  // Map and table on ONE page: the map gives geography, the table gives
  // sequence. Where the map is present the table drops its route column --
  // the map already shows the sectors, and saying it twice wastes the space
  // the map needs.
  if (mapHTML) {
    const compact = (days || []).map((d, i) => `<tr>
      <td class="g-day">${String(i + 1).padStart(2, "0")}</td>
      <td><span class="g-route">${esc(d.title || "")}</span></td>
      <td class="g-stay">${esc(stayOf(d) || "—")}</td>
    </tr>`).join("");
    return `<div class="bro-body">
      <div class="bro-eyebrow">Overview</div>
      <h2 class="bro-h">Your Journey at a Glance</h2>
      <div class="bro-map-fig">${mapHTML}</div>
      <div class="bro-cols2">
        <div><table class="bro-glance"><thead><tr><th>Day</th><th></th><th>Overnight</th></tr></thead><tbody>${compact}</tbody></table></div>
        <div>${sectorTableHTML}</div>
      </div>
      ${cells ? `<div class="bro-facts">${cells}</div>` : ""}
    </div>`;
  }

  return `<div class="bro-body">
    <div class="bro-eyebrow">Overview</div>
    <h2 class="bro-h">Your Journey at a Glance</h2>
    <table class="bro-glance">
      <thead><tr><th>Day</th><th>Route &amp; Highlights</th><th>Overnight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${cells ? `<div class="bro-facts">${cells}</div>` : ""}
  </div>`;
}

// firstPageReservePx accounts for the section heading that sits above the
// first day page ("Day by Day / The Itinerary"). Without it the first page
// is budgeted as though it were empty and quietly overflows by roughly the
// height of that heading -- found by measuring real output rather than by
// reading the code.
export function paginateBrochureDays(dayHTMLs, { pageHeightPx = BROCHURE_CONTENT_HEIGHT_PX, contentWidthPx = BROCHURE_CONTENT_WIDTH_PX, firstPageReservePx = 0, measureFn } = {}) {
  const pages = [];
  let current = [];
  let used = 0;
  const budget = () => pageHeightPx - (pages.length === 0 ? firstPageReservePx : 0);
  (dayHTMLs || []).forEach(html => {
    const h = measureFn(html, contentWidthPx);
    // A block taller than a page still has to go somewhere: give it its own
    // page rather than dropping it or looping forever.
    if (used + h > budget() && current.length > 0) { pages.push(current); current = []; used = 0; }
    current.push(html);
    used += h;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}

export function buildBrochureDocument({
  cover = {},
  days = [],
  dayImages = {},
  hotels = [],
  includes = [],
  excludes = [],
  facts = {},
  routeMapImage = null,
  mapHTML = "",
  sectorTableHTML = "",
  plate = null,
  logo = null,
  closingText = "",
  contact = null,
  showGlance = true,
  showPageNumbers = true,
  theme = BROCHURE_THEME,
  measureFn,
  footerLabel = "",
} = {}) {
  const dayHTMLs = days.map((d, i) => brochureDayHTML(d, i, dayImages[d.id] || dayImages[i] || null));
  const dayPages = measureFn
    // ~26mm of heading sits above the first day block.
    ? paginateBrochureDays(dayHTMLs, { measureFn, firstPageReservePx: 98 })
    // No measurer (no DOM): two per page is a predictable fallback that
    // never overflows. Not producing a broken file matters more than density.
    : dayHTMLs.reduce((acc, h, i) => { if (i % 2 === 0) acc.push([h]); else acc[acc.length - 1].push(h); return acc; }, []);

  const bodies = [];
  if (showGlance && days.length) bodies.push(brochureGlanceHTML(days, facts, mapHTML, sectorTableHTML));
  // Pick one image per page from the days it holds, and render it as a band
  // above them. Pages beyond the available images simply have none, which
  // looks deliberate rather than short.
  let cursor = 0;
  const pageImageFor = (pageIndex) => {
    const perPage = Math.max(1, Math.ceil(dayHTMLs.length / Math.max(1, dayPages.length)));
    const slice = days.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    for (const d of slice) {
      const img = dayImages[d.id];
      if (img) return { src: img, caption: d.title || "" };
    }
    return null;
  };
  dayPages.forEach((cards, i) => {
    const band = pageImageFor(i);
    bodies.push(`<div class="bro-body">${i === 0 ? `<div class="bro-eyebrow">Day by Day</div><h2 class="bro-h">The Itinerary</h2>` : ""}${
      band ? `<div class="bro-band"><img src="${esc(band.src)}" alt=""/>${band.caption ? `<div class="bro-band-cap">${esc(band.caption)}</div>` : ""}</div>` : ""
    }${cards.join("")}</div>`);
    // Full-bleed plate after the first day page, as a mid-document breath.
    if (plate && i === 0) {
      bodies.push({ __plate: true, src: plate.src, name: plate.name || "", sub: plate.sub || "" });
    }
  });
  if (hotels.length) {
    bodies.push(`<div class="bro-body">
      <div class="bro-eyebrow">Accommodation</div>
      <h2 class="bro-h">Where You'll Stay</h2>
      <table class="bro-table">
        <thead><tr><th>Destination</th><th>Nights</th><th>Hotel</th></tr></thead>
        <tbody>${hotels.map(h => `<tr><td>${esc(h.place)}</td><td>${esc(h.nights)}</td><td>${esc(h.hotel)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`);
  }
  if (routeMapImage) {
    bodies.push(`<div class="bro-body bro-map">
      <div class="bro-eyebrow">Getting Around</div>
      <h2 class="bro-h">Tour Route Map</h2>
      <img src="${esc(routeMapImage)}" alt="Tour route map"/>
    </div>`);
  }
  if (includes.length || excludes.length) {
    bodies.push(`<div class="bro-body">
      <div class="bro-eyebrow">The Detail</div>
      <h2 class="bro-h">What's Included</h2>
      <div class="bro-cols2">
        <div>${includes.length ? `<div class="bro-subh">Included</div><ul class="bro-list">${includes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
        <div>${excludes.length ? `<div class="bro-subh">Not Included</div><ul class="bro-list bro-list--x">${excludes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
      </div>
    </div>`);
  }
  if (closingText || contact) {
    bodies.push(`<div class="bro-body bro-closing">
      <div class="bro-closing-mark"></div>
      ${closingText ? `<div class="bro-closing-text">${esc(closingText)}</div>` : ""}
      ${contact ? `<div class="bro-closing-contact"><strong>${esc(contact.name || "")}</strong>${(contact.lines || []).map(l => `<div>${esc(l)}</div>`).join("")}</div>` : ""}
    </div>`);
  }

  const total = bodies.length + 1;
  const pagesHTML = bodies.map((body, i) => {
    const isLast = i === bodies.length - 1;
    if (body && body.__plate) {
      return `<div class="bro-page${isLast ? "" : " bro-page--notlast"} bro-plate">
        <img src="${esc(body.src)}" alt=""/><div class="bro-plate-veil"></div>
        <div class="bro-plate-cap"><div class="bro-plate-name">${esc(body.name)}</div>${body.sub ? `<div class="bro-plate-sub">${esc(body.sub)}</div>` : ""}</div>
      </div>`;
    }
    const foot = showPageNumbers
      ? `<div class="bro-foot"><div class="bro-foot-rule"><span>${esc(footerLabel)}</span><span>${i + 2} / ${total}</span></div></div>`
      : `<div class="bro-foot"></div>`;
    return `<div class="bro-page${isLast ? "" : " bro-page--notlast"}">${body}${foot}</div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>${esc(cover.title || "Itinerary")}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap" rel="stylesheet">
    <style>${brochureCSS(theme)}</style>
  </head><body>${brochureCoverHTML({ ...cover, logo })}${pagesHTML}</body></html>`;
}

// Screen-only preview styling. Deliberately does NOT pad the sheet -- a
// brochure is full-bleed, so padding would misrepresent the very thing the
// preview exists to show. @media screen so it can never reach print.
export const BROCHURE_PREVIEW_CSS = `
@media screen {
  html, body { background: #525659 !important; margin: 0 !important; padding: 0 !important; }
  body { padding: 16px 0 !important; }
  .bro-page { margin: 0 auto 16px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.45) !important; }
  .bro-page:last-child { margin-bottom: 0 !important; }
}
`;

export function withBrochurePreviewStyles(html) {
  if (!html) return html;
  const tag = `<style>${BROCHURE_PREVIEW_CSS}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${tag}</head>`) : tag + html;
}
