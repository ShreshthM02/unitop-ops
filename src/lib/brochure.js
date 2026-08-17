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

import { itemNoteForFlavor, ICON_PATHS } from "./utils.js";

export const BROCHURE_PAGE = { widthMm: 210, heightMm: 297 };
export const BROCHURE_CONTENT_HEIGHT_PX = Math.round((297 - 40) * (96 / 25.4));
export const BROCHURE_CONTENT_WIDTH_PX = Math.round((210 - 40) * (96 / 25.4));

// Brand, not invention. The earlier cream-and-saffron palette was chosen for
// the Buddhist circuit and quietly built a second identity: ten sectors would
// have meant ten palettes and no recognisable Unitop. These are the company's
// own colours -- the navy already used across every letterhead document, and
// the lotus red sampled from the logo itself (#8B0000). The photographs carry
// all the variation a sector needs; the container stays constant.
export const BROCHURE_THEME = {
  paper: "#FCFAF6",   // warm off-white: pure white reads cheap in print and tires the eye
  ink: "#1A3A52",     // the letterhead navy, so the brochure matches its siblings
  accent: "#8B0000",  // lotus red, from the logo
  soft: "#6E7681",    // muted grey-blue for labels and secondary text
  body: "#33414E",    // place notes: near-ink, because a note nobody can read comfortably is a note nobody reads
  rule: "#E2DED5",    // hairline rules that sit on warm paper
  panel: "#F2EEE6",   // quiet fill for pills
};

// Real fonts load in the browser; the fallbacks preserve the character (an
// elegant transitional serif, a neutral humanist sans) when they don't.
// ONE superfamily for everything textual, varying only size and weight.
// Playfair was tried and rejected: it is a high-contrast Didone whose DNA is
// Fraunces for display, Karla for everything else -- replacing an earlier
// Source Serif 4 + Inter pairing on direct request after reviewing real
// exported documents. Fraunces has warmth and character without tipping
// into the high-contrast drama of something like Playfair Display, which
// reads closer to fashion branding than travel; Karla is a quiet,
// consistent humanist sans that carries both body prose and the smallest
// micro-labels without needing a third typeface in the mix. Same
// contemporary-with-no-period-accent requirement as before still holds --
// this is a container serving every sector, not only heritage/pilgrimage
// content, so nothing here should read as narrowly themed to one kind of
// trip.
const DISPLAY = `'Fraunces', Georgia, serif`;
const BODY = `'Karla', -apple-system, Arial, sans-serif`;
const LABEL = `'Karla', -apple-system, Arial, sans-serif`;

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MEAL_LABEL = { B: "Breakfast", L: "Lunch", D: "Dinner" };

export const brochureCSS = (theme = BROCHURE_THEME) => `
  /* @import, not just the <link> tag in the final document's <head> --
     that link is added separately, outside this returned string, and
     createMeasurementContext only ever receives what this function
     returns. Without the fonts loading INSIDE the measurement iframe too,
     pagination measured every block using a browser-default fallback
     font instead of the real Source Serif 4 / Playfair Display, and a
     fallback font with different metrics produced systematically wrong
     height estimates -- confirmed as the explanation for entire days
     landing alone on mostly-blank pages regardless of how little content
     they actually held. The plain letterhead documents never had this
     problem because they load their fonts this same way already, inside
     their own shared CSS text. Keeping the outer <link> tag too, for the
     real render -- redundant with this, but harmless; browsers dedupe an
     identical font request. */
  @import url('https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600;700&family=Fraunces:ital,wght@0,600;0,700;1,500&display=swap');
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
  .bro-body { flex: 1 1 auto; padding: 18mm 15mm 0; }
  .bro-foot {
    flex: 0 0 auto; height: 14mm; padding: 0 20mm 5mm;
    display: flex; align-items: flex-end;
    font-family: ${LABEL};
    font-size: 8pt; letter-spacing: 0.6px; color: ${theme.soft};
  }
  .bro-foot-rule { border-top: 0.5pt solid ${theme.rule}; padding-top: 2.5mm; width: 100%; display: flex; justify-content: space-between; }

  /* ── Cover ───────────────────────────────────────────────────────
     NOT full-bleed. A photograph behind the type means the type needs a
     scrim to stay legible, and a scrim over a photograph muddies both --
     you end up with a darkened picture and greyed text, which is why the
     first version read as heavy. Splitting the sheet instead gives each
     element clean air: the identity block sits on paper where it can
     breathe, and the photograph gets to be a photograph at full strength
     rather than a background. Same reasoning as a book jacket. */
  .bro-cover { padding: 0; background: ${theme.paper}; }
  .bro-cover-top {
    flex: 0 0 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 14mm 18mm 10mm;
  }
  /* 47.4mm = 22mm (this logo's fixed render height) * (418/194), the real
     PNG's own pixel aspect ratio -- confirmed by decoding its PNG header
     directly. The earlier approach (display:inline-block, letting the
     wrapper shrink-wrap to the image's width) looked correct on paper but
     is a real CSS trap: inline-block sizes to whichever CHILD is widest,
     not specifically the image, and the tagline text at 7.5pt turned out
     to be close enough to the image's own width that the wrapper sized
     to the TEXT instead, breaking the width match this was supposed to
     guarantee. Confirmed by actually rendering it. If the logo image ever
     changes, recalculate this from its real pixel dimensions rather than
     assume the ratio still holds. */
  .bro-cover-logo { margin-bottom: 11mm; width: 47.4mm; margin-left: auto; margin-right: auto; }
  .bro-cover-logo img { height: 22mm; width: 100%; display: block; }
  .bro-cover-logo-tag {
    width: 100%; margin-top: 1mm; font-family: ${LABEL}; font-style: normal;
    font-size: 5.5pt; letter-spacing: 0.15pt; color: ${BROCHURE_THEME.accent}; text-align: center;
    line-height: 1.25; white-space: normal;
  }
  .bro-cover-title {
    font-family: ${DISPLAY}; font-size: 36pt; line-height: 1.06;
    font-weight: 700; margin: 0; letter-spacing: -0.4px; color: ${theme.ink};
  }
  .bro-cover-rule { width: 24mm; height: 1.6pt; background: ${theme.accent}; margin: 6mm auto; }
  /* The duration as a solid badge rather than a line of letterspaced type.
     One saturated element gives the cover a focal point -- without it the
     page was an even field of dark text on cream, which is what "dry" was
     describing. */
  .bro-cover-duration {
    display: inline-block;
    font-family: ${LABEL};
    font-size: 8.5pt; letter-spacing: 2.4px; text-transform: uppercase;
    font-weight: 700; color: #fff; background: ${theme.accent};
    padding: 2mm 5mm; border-radius: 1mm; margin-bottom: 6mm;
  }
  .bro-cover-client {
    font-family: ${LABEL}; font-size: 8.5pt; letter-spacing: 2.2px;
    text-transform: uppercase; color: ${theme.soft}; font-weight: 600;
    margin-top: 4mm;
  }
  .bro-cover-routewrap {
    background: ${theme.panel}; border-radius: 1.5mm;
    border: 0.5pt solid ${theme.rule};
    padding: 4mm 6mm; margin-top: 1mm;
  }
  .bro-cover-route {
    font-size: 10pt; line-height: 1.75; color: ${theme.ink};
    max-width: 132mm; opacity: 0.88;
  }
  .bro-cover-tagline {
    font-family: ${DISPLAY}; font-style: italic; font-size: 12pt;
    line-height: 1.65; color: ${theme.soft}; margin-top: 7mm; max-width: 126mm;
  }
  .bro-cover-photo { flex: 1 1 auto; position: relative; overflow: hidden; border-top: 3pt solid ${theme.accent}; }
  .bro-cover-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bro-cover--plain .bro-cover-photo { background: ${theme.panel}; }

  /* PHOTO SIZING. The first version used 46x34mm insets, one per day. Below
     roughly 60mm wide an image stops reading as a photograph and becomes
     decoration, and nine identical stamps meant none of them carried any
     weight. The rule now is ONE dominant image per page, not one per day:
     a full-width band above the day blocks. Fewer, larger, and it needs
     less library coverage rather than more. */
  /* ONE PHOTO PER DAY, fixed 4:3, in a right-hand column. The page-level
     band was rejected for a concrete reason: a full-width strip forces a
     very wide crop, and most monument photography is portrait or square, so
     it cut the top off temples. A 4:3 column accepts ordinary photographs
     with a survivable crop, and object-position lets a photo be nudged when
     the automatic centre crop lands badly. Fixed size regardless of how long
     a day's text runs, so the column edge stays true down the page and the
     document reads as set rather than assembled. */
  .bro-day-photo { float: right; width: 52mm; margin: 0 0 4mm 6mm; }
  .bro-day-photo img {
    width: 52mm; height: 39mm; object-fit: cover; display: block;
    border-radius: 1mm; background: ${theme.panel};
  }
  .bro-day-photo-empty { width: 52mm; height: 39mm; border-radius: 1mm; background: ${theme.panel}; }
  .bro-day-photo figcaption {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 0.4px;
    color: ${theme.soft}; margin-top: 1.8mm; line-height: 1.35;
  }

  .bro-band { margin: 0 0 7mm; }
  .bro-band img { width: 100%; height: 40mm; object-fit: cover; display: block; border-radius: 1mm; }
  .bro-band-cap {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 1.2px; text-transform: uppercase;
    color: ${theme.soft}; margin-top: 2mm;
  }

  .bro-map-fig { margin-bottom: 7mm; }
  .bro-map-fig img, .bro-map-fig svg { width: 100%; height: auto; display: block; }

  /* ── Section headings ────────────────────────────────────────────── */
  .bro-eyebrow {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 2.6px; text-transform: uppercase;
    color: ${theme.accent}; font-weight: 700; margin-bottom: 3mm;
  }
  .bro-h {
    font-family: ${DISPLAY}; font-size: 22pt; font-weight: 700;
    margin: 0 0 7mm; letter-spacing: -0.3px; line-height: 1.15;
  }

  /* ── At a glance ─────────────────────────────────────────────────── */
  .bro-glance { width: 100%; border-collapse: collapse; }
  .bro-glance th {
    font-family: ${LABEL};
    text-align: left; font-size: 8pt; letter-spacing: 1.6px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; padding: 0 3mm 3mm 0;
    border-bottom: 1pt solid ${theme.ink};
  }
  .bro-glance td {
    padding: 3.4mm 3mm 3.4mm 0; font-size: 10pt; vertical-align: top;
    border-bottom: 0.5pt solid ${theme.rule}; line-height: 1.45;
  }
  .bro-glance .g-day {
    width: 14mm; font-family: ${DISPLAY}; font-size: 12pt;
    font-weight: 700; color: ${theme.accent};
  }
  .bro-glance .g-route { font-weight: 600; }
  .bro-glance .g-stay { width: 44mm; color: ${theme.soft}; font-size: 9.5pt; }
  .bro-meta { font-family: ${LABEL}; font-size: 8.5pt; color: ${theme.soft}; font-weight: 500; }

  .bro-facts { display: flex; margin-top: 11mm; border-top: 1pt solid ${theme.ink}; padding-top: 6mm; }
  .bro-fact { flex: 1; }
  .bro-fact-n {
    font-family: ${DISPLAY}; font-size: 21pt; font-weight: 700;
    color: ${theme.accent}; line-height: 1;
  }
  .bro-fact-l {
    font-family: ${LABEL};
    font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase;
    color: ${theme.soft}; margin-top: 2mm; font-weight: 600;
  }

  /* ── Day block ───────────────────────────────────────────────────── */
  /* Redesigned so a day can flow across a page break instead of being
     forced to move wholesale when it does not fit -- confirmed as a real,
     reported problem: an atomic per-day block meant a day too tall for
     the remaining page space always jumped entirely to the next page,
     leaving the remainder of the current one blank and costing pages
     unnecessarily. The header (rail + title + routes) stays one atomic
     flex row -- it is short and belongs together -- but the photo and
     every timeline item are now independent siblings, each indented to
     align under the header's content column (21mm = the rail's 15mm +
     the content column's 6mm padding) rather than flex children of it.
     This is deliberate: flex containers trap floats inside themselves, so
     keeping the photo as a flex child would have stopped its float from
     reaching later item blocks once pagination made them siblings instead
     of nested content. As plain floated/margin-indented siblings, the
     photo's float continues naturally across as many item blocks as fit
     on the page it started on, and later items past a page break simply
     render at full width once the float's height is behind them, exactly
     like ordinary text flowing past an image. */
  .bro-day-head { display: flex; gap: 6mm; clear: both; }
  .bro-day-rail { flex: 0 0 15mm; text-align: right; padding-top: 1mm; }
  .bro-day-num {
    font-family: ${DISPLAY}; font-size: 27pt; font-weight: 700;
    color: ${theme.accent}; line-height: 0.9; letter-spacing: -1px;
  }
  .bro-day-word {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; margin-top: 1.5mm;
  }
  .bro-day-main { flex: 1 1 auto; min-width: 0; border-left: 0.5pt solid ${theme.rule}; padding-left: 6mm; }
  .bro-day-title {
    font-family: ${DISPLAY}; font-size: 14.5pt; font-weight: 700;
    margin: 0 0 2.5mm; line-height: 1.25;
  }
  .bro-day-routes { margin-bottom: 5mm; }
  .bro-day-route-meta { color: ${theme.soft}; font-weight: 500; }
  .bro-day-route {
    font-family: ${LABEL};
    font-size: 8.5pt; letter-spacing: 0.9px; color: ${theme.accent};
    font-weight: 600; margin-bottom: 1.6mm; text-transform: uppercase; line-height: 1.4;
  }
  /* Each item/photo block carries its own indent directly -- deliberately
     NOT wrapped in a shared container with its own clearfix, which would
     clear the float after every single block and defeat the point of it
     persisting across several of them. */
  .bro-day-body { border-left: 0.5pt solid ${theme.rule}; margin-left: 15mm; padding-left: 6mm; margin-bottom: 1mm; }
  .bro-day-text { }

  /* The day's plan as a timeline. Markers give the eye a spine to run
     down, so a day reads as a sequence rather than a paragraph. */
  .bro-tl { list-style: none; margin: 0; padding: 0; }
  .bro-tl-item { position: relative; padding-left: 6.5mm; margin-bottom: 3.2mm; }
  .bro-tl-icon {
    position: absolute; left: 0; top: 1.8mm; width: 4mm; height: 4mm;
  }
  .bro-tl-icon { color: ${theme.accent}; }
  .bro-tl-name { font-size: 10.5pt; font-weight: 600; line-height: 1.5; }
  /* The one line about a place -- what turns a list of names into
     something a client actually learns from. */
  .bro-tl-note { font-size: 10pt; line-height: 1.6; color: ${theme.body}; margin-top: 1.2mm; white-space: pre-wrap; }
  .bro-tl-prose { font-size: 10.5pt; line-height: 1.65; margin: 0; }

  .bro-day-foot {
    display: flex; align-items: center; gap: 2.5mm; flex-wrap: wrap;
    margin-top: 4.5mm; padding-top: 3mm; border-top: 0.5pt solid ${theme.rule};
    clear: both; margin-bottom: 11mm;
  }
  .bro-pill {
    font-family: ${LABEL};
    font-size: 8pt; letter-spacing: 0.6px; text-transform: uppercase;
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

  /* Optional free-text notes, the document's only flexible block. Anything
     operational a particular tour needs -- a contact, a caution, a reminder
     -- is typed here rather than hard-coded as a section, which is what
     stops this document quietly re-becoming the Tour Briefing Sheet. */
  .bro-notes { margin-top: 9mm; padding-top: 6mm; border-top: 1pt solid ${theme.ink}; }
  .bro-notes-h {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 2.6px;
    text-transform: uppercase; color: ${theme.accent}; font-weight: 700; margin-bottom: 4mm;
  }
  .bro-notes-body { font-size: 10.5pt; line-height: 1.65; white-space: pre-wrap; }

  .bro-signoff { margin-top: 10mm; padding-top: 6mm; text-align: center; }
  .bro-signoff-rule { width: 16mm; height: 1.4pt; background: ${theme.accent}; margin: 0 auto 5mm; }
  .bro-signoff-text {
    font-family: ${DISPLAY}; font-style: italic; font-size: 12.5pt;
    line-height: 1.5; color: ${theme.ink}; margin-bottom: 5mm; text-align: left;
  }
  .bro-signoff-tagline {
    text-align: center; font-family: ${LABEL}; font-weight: 700;
    font-size: 8.5pt; letter-spacing: 1.5pt; text-transform: uppercase;
    color: ${theme.accent}; margin: 4mm 0 5mm;
  }
  .bro-signoff-contact { font-size: 7.5pt; line-height: 1.6; color: ${theme.soft}; }
  .bro-signoff-contact strong { color: ${theme.ink}; font-weight: 600; display: block; margin-bottom: 1.5mm; font-size: 8.5pt; }

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
  // The brochure IS the Detailed document -- flavor is not a parameter
  // here, it is always "detailed". Reading item.note directly (Brief's own
  // field) instead of itemNoteForFlavor(item, "detailed") meant the
  // brochure never showed a note written specifically for it: an operator
  // could write a short Brief-facing line and a longer, richer
  // Detailed-facing one exactly as the picker intends, and the brochure
  // would silently print the short Brief one anyway, or nothing at all if
  // Brief's note was left empty while Detailed's was carefully written.
  // This defeated the entire reason the per-flavor split exists, for the
  // one document that is most the point of having it.
  const note = itemNoteForFlavor(item, "detailed").trim();
  // Route items carry distance/time; transport items carry depTime/arrTime
  // instead -- two different item types' own fields, not one field the
  // other happens to also use. The brochure's meta line only ever read
  // distance/time, so a flight or train's departure and arrival times
  // never appeared anywhere in the brochure at all, even though the exact
  // same item correctly shows "(Dep 08:45 · Arr 10:55)" in the plain
  // letterhead documents.
  const meta = item.type === "transport"
    ? [item.depTime && `Dep ${item.depTime}`, item.arrTime && `Arr ${item.arrTime}`].filter(Boolean).join(" · ")
    : [item.distance, item.time].filter(Boolean).join(" · ");
  const soft = item.type !== "sightseeing";
  const cls = `bro-tl-item${soft ? " bro-tl-item--soft" : ""}`;

  // Same icon selection as the plain letterhead documents: pin for
  // sightseeing, the transport item's own mode (not a generic transport
  // glyph -- flight and train need to read as different at a glance),
  // pencil for a remark. Route and stay never reach this function (routes
  // are promoted to their own headline line above the day title; stay is
  // deliberately left out of the client-facing brochure entirely -- see
  // the note on that below), so this only ever needs to cover the types
  // that actually arrive here.
  const iconName = item.type === "sightseeing" ? "pin"
    : item.type === "transport" ? (item.mode === "train" ? "train" : "plane")
    : "pencil";
  const iconSVG = `<svg class="bro-tl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[iconName]}</svg>`;

  if (item.type === "description") {
    return text ? `<li class="${cls}">${iconSVG}<p class="bro-tl-prose">${esc(text).replace(/\n/g, "<br/>")}</p></li>` : "";
  }
  if (!text && !meta) return "";
  return `<li class="${cls}">${iconSVG}
    <div class="bro-tl-name">${esc(text)}${meta ? ` <span class="bro-meta">— ${esc(meta)}</span>` : ""}</div>
    ${note ? `<div class="bro-tl-note">${esc(note)}</div>` : ""}
  </li>`;
}

// The overnight stay is lifted OUT of the timeline into the day's footer:
// "where am I sleeping" is looked up directly, not read down to.
const stayOf = (day) => ((day.items || []).find(i => i.type === "stay" && (i.text || "").trim()) || {}).text || "";

// EVERY route item becomes a headline movement line under the title, stacked
// in order. A single day often has more than one leg -- Gaya to Vaishali,
// then Vaishali to Kushinagar -- and promoting only the first while burying
// the rest in the timeline misrepresents the day's shape.
const routesOf = (day) => (day.items || []).filter(i => i.type === "route" && ((i.text || "").trim() || i.distance || i.time));
const leadRouteOf = (day) => routesOf(day)[0] || null;

export function brochureDayBlocks(day, index, image) {
  const items = day.items || [];
  const routes = routesOf(day);
  const stay = stayOf(day);
  const timelineItems = items.filter(i => !routes.includes(i) && i.type !== "stay");

  const num = String(index + 1).padStart(2, "0");
  const routeLines = routes.map(r => {
    const meta = [r.distance, r.time].filter(Boolean).join(" · ");
    return `<div class="bro-day-route">${esc((r.text || "").trim())}${meta ? `<span class="bro-day-route-meta"> — ${esc(meta)}</span>` : ""}</div>`;
  }).join("");
  const meals = (day.meals || []).map(m => `<span class="bro-pill">${MEAL_LABEL[m] || esc(m)}</span>`).join("");
  const caption = (day.imageCaption || "").trim();

  const head = `<div class="bro-day-head">
    <div class="bro-day-rail">
      <div class="bro-day-num">${num}</div>
      <div class="bro-day-word">Day</div>
    </div>
    <div class="bro-day-main">
      ${day.title ? `<h3 class="bro-day-title">${esc(day.title)}</h3>` : ""}
      ${routeLines ? `<div class="bro-day-routes">${routeLines}</div>` : ""}
    </div>
  </div>`;

  const blocks = [head];

  // Every day carries its own photograph at the same size, which is what
  // removes the earlier unfairness: no day is visibly favoured because they
  // are all treated identically. A day with no photograph available shows a
  // quiet empty frame rather than collapsing the column, so the grid holds.
  // Floated, not flexed, and NOT wrapped together with the head above --
  // this is what lets its float keep influencing the item blocks that
  // follow, even once those are independent pagination units that can land
  // on a later page than this one.
  blocks.push(`<div class="bro-day-body"><figure class="bro-day-photo">
      ${image ? `<img src="${esc(image)}" alt="" style="object-position:${esc(day.imageFocus || "center")}"/>` : `<div class="bro-day-photo-empty"></div>`}
      ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
    </figure></div>`);

  timelineItems.forEach(item => {
    const html = timelineItemHTML(item);
    if (html) blocks.push(`<div class="bro-day-body"><ul class="bro-tl">${html}</ul></div>`);
  });

  if (meals || stay) {
    blocks.push(`<div class="bro-day-body"><div class="bro-day-foot">${meals}${stay ? `<span class="bro-stay">Overnight: <strong>${esc(stay)}</strong></span>` : ""}</div></div>`);
  }

  return blocks;
}

// Thin wrapper for any caller that still wants one whole-day string (not
// yet updated to work with independently-paginated blocks) -- identical
// output to the old monolithic function, just built from the same blocks
// brochureDayBlocks now produces.
export function brochureDayHTML(day, index, image) {
  return brochureDayBlocks(day, index, image).join("");
}

export function brochureCoverHTML({ title, tagline, duration, route, heroImage, brand, logo, clientName } = {}) {
  return `<div class="bro-page bro-page--notlast bro-cover${heroImage ? "" : " bro-cover--plain"}">
    <div class="bro-cover-top">
      ${logo
        ? `<div class="bro-cover-logo"><img src="${esc(logo)}" alt=""/>
            <div class="bro-cover-logo-tag">Your gateway to Incredible India, since 1999</div>
          </div>`
        : `<div class="bro-cover-logo" style="font-size:9pt;letter-spacing:3px;text-transform:uppercase;color:${BROCHURE_THEME.soft}">${esc(brand || "Unitop Tours & Travel (P) Ltd.")}</div>`}
      <h1 class="bro-cover-title">${esc(title || "Itinerary")}</h1>
      ${clientName ? `<div class="bro-cover-client">${esc(clientName)}</div>` : ""}
      <div class="bro-cover-rule"></div>
      ${duration ? `<div class="bro-cover-duration">${esc(duration)}</div>` : ""}
      ${route ? `<div class="bro-cover-routewrap"><div class="bro-cover-route">${esc(route)}</div></div>` : ""}
      ${tagline ? `<div class="bro-cover-tagline">${esc(tagline)}</div>` : ""}
    </div>
    <div class="bro-cover-photo">${heroImage ? `<img src="${esc(heroImage)}" alt=""/>` : ""}</div>
  </div>`;
}

// A whole tour absorbed in ten seconds, before any detail.
// Selectable stats for the glance strip. The editor offers these; whichever
// are filled in appear, up to four.
// Words that describe a movement rather than a place. Counting "Departure"
// or "Gaya Airport" as destinations inflates the figure and looks careless to
// anyone who reads the itinerary alongside it.
const COUNTRY_WORDS = new Set([
  "india", "nepal", "bhutan", "bangladesh", "sri lanka", "myanmar", "burma",
  "pakistan", "thailand", "china", "tibet", "maldives", "singapore", "malaysia",
]);

const NON_DESTINATION = /\b(arrival|arrive|departure|depart|airport|onward|transfer|check[- ]?in|check[- ]?out|leisure|free day|en ?route|hotel|resort|similar)\b/i;
// Country and region names ride along in route text ("Kushinagar – Lumbini,
// Nepal") but are not themselves destinations on the tour.
const NOT_A_PLACE = new Set(["nepal","india","bhutan","bangladesh","sri lanka","thailand","myanmar"]);

// Pulls distinct place names out of a day's route and stay items. A route
// like "Bodhgaya - Rajgir - Nalanda - Bodhgaya" contributes three places, not
// four, because the return leg is the same town.
export function countDestinations(days, knownCountries = COUNTRY_WORDS) {
  const seen = new Set();
  (days || []).forEach(d => {
    (d.items || []).forEach(it => {
      // ROUTE ITEMS ONLY. Stay items hold hotel names, not places -- counting
      // them turned "Hotel Oaks Bodhgaya" and "Lotus Nikko Hotel" into
      // destinations and inflated a real count of 8 to 14.
      if (it.type !== "route") return;
      String(it.text || "")
        .split(/[-\u2013\u2014\/,]| to /i)
        .map(x => x.trim())
        // A country named after a town ("Lumbini, Nepal") is context, not a
        // separate destination.
        .filter(x => x.length > 2 && !NON_DESTINATION.test(x) && !knownCountries.has(x.toLowerCase()))
        .map(x => x.toLowerCase().replace(/\s+/g, " "))
        .filter(x => !NOT_A_PLACE.has(x))
        .forEach(x => seen.add(x));
    });
  });
  return seen.size;
}

export const STAT_FIELDS = [
  { key: "days",         label: "Days" },
  { key: "nights",       label: "Nights" },
  { key: "destinations", label: "Destinations" },
  { key: "distance",     label: "Road Distance" },
  { key: "driveTime",    label: "Total Drive Time" },
  { key: "flights",      label: "Flights" },
  { key: "trains",       label: "Train Journeys" },
  { key: "hotels",       label: "Hotels" },
  { key: "states",       label: "States Covered" },
  { key: "countries",    label: "Countries" },
  { key: "unesco",       label: "UNESCO Sites" },
  { key: "maxAltitude",  label: "Highest Point" },
  { key: "pax",          label: "Group Size" },
];

export function brochureGlanceHTML(days, facts = {}, mapHTML = "", sectorTableHTML = "", gatewayNoteHTML = "") {
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

  // Four slots, chosen from these. Anything not supplied is simply omitted,
  // so a beach itinerary can show Nights and Destinations while a circuit
  // tour shows Sites Visited and Road Distance -- same template, different
  // facts, no layout change.
  const auto = { ...facts };
  if (auto.destinations == null) {
    const n = countDestinations(days);
    if (n > 0) auto.destinations = String(n);
  }
  const cells = STAT_FIELDS
    .map(f => auto[f.key] && { n: auto[f.key], l: f.label })
    .filter(Boolean)
    .slice(0, 4)
    .map(f => `<div class="bro-fact"><div class="bro-fact-n">${esc(f.n)}</div><div class="bro-fact-l">${esc(f.l)}</div></div>`).join("");

  // Map and table on ONE page: the map gives geography, the table gives
  // sequence. Where the map is present the table drops its route column --
  // the map already shows the sectors, and saying it twice wastes the space
  // the map needs.
  if (mapHTML) {
    // One table, not two. The earlier pair (day/overnight beside
    // sector/distance) split the reader's attention across two grids saying
    // related things. Merged into a single sector table, with the stats
    // strip carrying the headline numbers -- the overnight column is gone
    // entirely, because the hotel is often not final at itinerary stage and
    // the map already marks where the nights fall.
    return `<div class="bro-body">
      <div class="bro-eyebrow">Overview</div>
      <h2 class="bro-h">Your Journey at a Glance</h2>
      <div class="bro-map-fig">${mapHTML}</div>
      ${sectorTableHTML}
      ${gatewayNoteHTML}
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
// reservePerPagePx accounts for the photo band that sits above the day
// blocks on every day page. The band is assigned AFTER pagination, so
// without reserving for it here the page is budgeted as though it were
// text-only and overflows by the height of the image -- which is exactly
// what happened once the per-day insets were removed and the band arrived.
// Reserved on every day page rather than only those that end up with a
// photo: slightly conservative, but a page can never overflow, and
// conservative beats clever for something a client receives.
// measureFn must return each block's height INCLUDING its bottom margin.
// getBoundingClientRect excludes margins, and with an 11mm gap between day
// blocks three "fitting" blocks overflowed by 33mm -- enough to push the page
// footer outside the clipped area, which is how footers vanished from real
// output while every block individually looked contained.
export function paginateBrochureDays(dayHTMLs, { pageHeightPx = BROCHURE_CONTENT_HEIGHT_PX, contentWidthPx = BROCHURE_CONTENT_WIDTH_PX, firstPageReservePx = 0, reservePerPagePx = 0, bandPageCount = Infinity, measureFn } = {}) {
  const pages = [];
  let current = [];
  let used = 0;
  // Reserve band space only on pages that will actually carry one. Bands are
  // assigned in order and run out when the photographs do, so reserving on
  // every page starved the tail -- which showed up as a final page holding
  // one short day and reading as padding.
  const budget = () => pageHeightPx
    - (pages.length < bandPageCount ? reservePerPagePx : 0)
    - (pages.length === 0 ? firstPageReservePx : 0);
  (dayHTMLs || []).forEach((html, index) => {
    const h = measureFn(html, contentWidthPx, index);
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
  gatewayNote = "",
  remarksText = "",
  closingText = "",
  closingTagline = "",
  contact = null,
  notes = "",
  notesHeading = "Notes",
  // Checkbox in the editor, on by default: whether an at-a-glance page is
  // worth a sheet is a judgement about the particular tour, so it belongs to
  // whoever is making the document rather than to a length threshold.
  showGlance = true,
  showPageNumbers = true,
  fontFaceCSS = "",
  theme = BROCHURE_THEME,
  measureFn,
  // Default follows the template convention "{itinerary name} - Unitop Tours
  // & Travel Pvt. Ltd."; overridable per document from the template editor.
  footerLabel = "",
  companyName = "Unitop Tours & Travel Pvt. Ltd.",
} = {}) {
  const dayBlockGroups = days.map((d, i) => brochureDayBlocks(d, i, dayImages[d.id] || dayImages[i] || null));
  const allBlocks = dayBlockGroups.flat();
  const dayPages = measureFn
    // ~26mm of heading sits above the first day block. Packing at BLOCK
    // granularity (head/photo/each item/footer independently) rather than
    // one string per day is what actually lets a day flow across a page
    // break -- confirmed as a real, reported problem: packing whole days
    // meant one too tall for the remaining space always jumped entirely
    // to the next page, wasting whatever room was left on the current one
    // and costing pages unnecessarily.
    ? paginateBrochureDays(allBlocks, {
        measureFn,
        firstPageReservePx: 98,
        // ~40mm band + caption + margin, reserved when any photography
        // exists. Sized deliberately: a taller band pushed a ninth day onto
        // a page of its own, and a page holding one short day plus the
        // sign-off reads as padding.
        // No page-level band any more: each day carries its own photograph,
        // so the height is already inside the measured day block.
        reservePerPagePx: 0,
      })
    // No measurer (no DOM): whole days, two per page, is a predictable
    // fallback that never overflows -- block-level packing needs real
    // measured heights to be safe at all, so this deliberately stays at
    // day granularity rather than guessing at the finer blocks.
    : dayBlockGroups.reduce((acc, blocks, i) => {
        const html = blocks.join("");
        if (i % 2 === 0) acc.push([html]); else acc[acc.length - 1].push(html);
        return acc;
      }, []);

  const bodies = [];
  if (showGlance && days.length) bodies.push(brochureGlanceHTML(days, facts, mapHTML, sectorTableHTML, gatewayNote));
  // Pick one image per page from the days it holds, and render it as a band
  // above them. Pages beyond the available images simply have none, which
  // looks deliberate rather than short.
  dayPages.forEach((cards, i) => bodies.push(
    `<div class="bro-body">${i === 0 ? `<div class="bro-eyebrow">Day by Day</div><h2 class="bro-h">The Itinerary</h2>` : ""}${cards.join("")}</div>`
  ));
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
  if (notes && notes.trim() && bodies.length) {
    const last = bodies.length - 1;
    bodies[last] = bodies[last].replace(/<\/div>\s*$/, `
      <div class="bro-notes">
        <div class="bro-notes-h">${esc(notesHeading || "Notes")}</div>
        <div class="bro-notes-body">${esc(notes.trim())}</div>
      </div></div>`);
  }

  // Closing folded into the foot of the final page rather than given a
  // sheet of its own. One sentence and an address do not justify a page in a
  // six-page document, and a near-empty last page reads as padding.
  // Remarks sits above the closing line, on the same fold -- a short
  // operational note (a special request, a payment reminder) that belongs
  // at the end of the document but is not itself the sign-off.
  //
  // closingTagline is the template's own standing default (e.g. "TOUR ENDS
  // AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES"), rendered unconditionally --
  // not gated on remarksText/closingText being set, the same way the plain
  // letterhead documents always show it regardless of what else an
  // operator has typed. This was missing from the brochure entirely: Brief
  // (and the plain Detailed document) always show the template's own
  // sign-off; the brochure had no representation of it at all, only the
  // per-instance closingText field, which is optional and often empty.
  if ((remarksText || closingText || closingTagline || contact) && bodies.length) {
    const last = bodies.length - 1;
    bodies[last] = bodies[last].replace(/<\/div>\s*$/, `
      <div class="bro-signoff">
        <div class="bro-signoff-rule"></div>
        ${remarksText ? `<div class="bro-signoff-text" style="white-space:pre-wrap"><strong>Notes</strong><br/>${esc(remarksText)}</div>` : ""}
        ${closingText ? `<div class="bro-signoff-text">${esc(closingText)}</div>` : ""}
        ${closingTagline ? `<div class="bro-signoff-tagline">${esc(closingTagline)}</div>` : ""}
        ${contact ? `<div class="bro-signoff-contact"><strong>${esc(contact.name || "")}</strong>${(contact.lines || []).map(l => `<div>${esc(l)}</div>`).join("")}</div>` : ""}
      </div></div>`);
  }

  const total = bodies.length + 1;
  const pagesHTML = bodies.map((body, i) => {
    const isLast = i === bodies.length - 1;
    const foot = showPageNumbers
      ? `<div class="bro-foot"><div class="bro-foot-rule"><span>${esc(footerLabel || [cover.title, companyName].filter(Boolean).join(" · "))}</span><span>${i + 2} / ${total}</span></div></div>`
      : `<div class="bro-foot"></div>`;
    return `<div class="bro-page${isLast ? "" : " bro-page--notlast"}">${body}${foot}</div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>${esc(cover.title || "Itinerary")}</title>
    <link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600;700&family=Fraunces:ital,wght@0,600;0,700;1,500&display=swap" rel="stylesheet">
    <style>${fontFaceCSS}${brochureCSS(theme)}</style>
  </head><body>${brochureCoverHTML(cover)}${pagesHTML}</body></html>`;
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
