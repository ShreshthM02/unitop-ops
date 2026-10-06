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
import { BROCHURE_FONT_FACES } from "./brochureFonts.js";
import { normalizePhotoList } from "./photoLibrary.js";

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

// Libre Caslon Text for display and body, Public Sans for the smallest
// micro-labels -- replacing Cormorant Garamond + Work Sans, which read as
// too delicate/dainty at body size, per direct feedback that every pairing
// tried so far felt stale. Libre Caslon Text carries real historical
// weight without tipping into a decorative, invitation-card register --
// sturdier strokes than Cormorant Garamond, built specifically for text
// setting rather than display-only use. Public Sans is the U.S. federal
// government's own typeface (designed for exactly this kind of clean,
// confident, unfussy labelling work) -- distinct from both Work Sans
// (the previous brochure choice) and Inter (Brief/Detailed's own plain
// documents, unchanged by this).
const DISPLAY = `'Libre Caslon Text', Georgia, serif`;
const BODY = `'Libre Caslon Text', Georgia, serif`;
const LABEL = `'Public Sans', -apple-system, Arial, sans-serif`;

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MEAL_LABEL = { B: "Breakfast", L: "Lunch", D: "Dinner" };

export const brochureCSS = (theme = BROCHURE_THEME) => `
  /* Self-hosted, not @import -- confirmed the more complete fix for the
     bug the original comment here described (pagination measuring
     against fallback-font metrics because createMeasurementContext only
     ever receives what this function returns). An @import still requires
     a real network fetch to complete before the font is actually
     available, which is a genuine, if usually brief, timing gap between
     "CSS parsed" and "font ready" -- an embedded font has no such gap at
     all, since the font's own bytes are already part of the document.
     This also removes the same dependency from the final printed
     document itself: a brochure PDF no longer depends on
     fonts.googleapis.com being reachable at the moment it's generated,
     which was a real point of failure (a slow network, a corporate
     firewall, Google Fonts itself being briefly unavailable) outside
     this app's own control. Real font files (Public Sans, Libre Caslon
     Text), same official SIL Open Font License Google Fonts itself uses
     -- see brochureFonts.js for sourcing detail. */
  ${BROCHURE_FONT_FACES}
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
  .bro-cover-logo { margin-bottom: 15mm; width: 57.29mm; margin-left: auto; margin-right: auto; position: relative; }
  .bro-cover-logo img { height: 22mm; width: 100%; display: block; }
  .bro-cover-logo-tag {
    position: absolute; left: 50%; top: 100%; transform: translateX(-50%);
    width: 110mm; margin-top: 0.3mm; font-family: ${LABEL}; font-style: italic;
    font-size: 7pt; letter-spacing: 0.15pt; color: ${BROCHURE_THEME.accent}; text-align: center;
    line-height: 1.25; white-space: normal;
  }
  .bro-cover-title {
    font-family: ${DISPLAY}; font-size: 27pt; line-height: 1.12;
    font-weight: 700; margin: 0; letter-spacing: -0.3px; color: ${theme.ink};
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

  /* DAY PHOTO STRIP. Up to three photographs per day, side by side between
     the day heading and the day's items. History of this decision: one
     inset per day was too small to read as a photograph; one dominant image
     per page forced a very wide crop that cut the top off temples; a
     floating right-hand column squeezed the text beside it into a narrow
     strip and made the items look cluttered. A full-width horizontal strip
     of equal tiles fixes all three: the photographs are big enough to be
     photographs, the crop is a gentle 3:2, and every item below gets the
     full text width.
     Tiles are always the SAME size -- one, two or three photos -- so the
     page rhythm holds whether a day has a lot of photography or a little.
     Each tile is a third of the row (minus the two 3mm gaps); fewer photos
     simply leave the right-hand end open rather than stretching. */
  .bro-day-strip { margin: 0 0 5.5mm; }
  .bro-day-strip-row { display: flex; gap: 3mm; }
  .bro-day-shot {
    margin: 0; flex: 0 0 calc((100% - 6mm) / 3); height: 40mm; overflow: hidden;
    border-radius: 1mm; background: ${theme.panel};
  }
  .bro-day-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bro-day-strip-cap {
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
  /* Structure, top to bottom:
       heading   rail (day number) | optional date + title
       strip     up to three photographs, full width
       items     every item the same way, on the heading's own column
       footer    meals + overnight
     The heading and strip are one atomic block; each item (and each chunk
     of a long note) is its own block, so a day can run across a page break
     between items -- see paginateBrochureDays for exactly where it may and
     may not break. Nothing floats any more: the old right-hand photo was a
     float, which is what made text wrap awkwardly beside it and made
     page-break behaviour hard to predict.
     One shared indent: the heading's divider rule and the items' rule sit
     on the same vertical line (16mm in), and item text starts 5mm after it,
     so the day reads as one column instead of two competing ones. */
  .bro-day-head { display: flex; gap: 4mm; align-items: stretch; margin-bottom: 4.5mm; }
  .bro-day-rail { flex: 0 0 12mm; text-align: right; padding-top: 0.5mm; }
  .bro-day-num {
    font-family: ${DISPLAY}; font-size: 27pt; font-weight: 700;
    color: ${theme.accent}; line-height: 0.9; letter-spacing: -1px;
  }
  .bro-day-word {
    font-family: ${LABEL}; font-size: 8pt; letter-spacing: 1.8px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 700; margin-top: 1.5mm;
  }
  .bro-day-main { flex: 1 1 auto; min-width: 0; min-height: 11mm; border-left: 0.5pt solid ${theme.rule}; padding-left: 5mm; }
  .bro-day-date {
    font-family: ${LABEL}; font-size: 8.5pt; letter-spacing: 1.4px; text-transform: uppercase;
    color: ${theme.soft}; font-weight: 600; line-height: 1.3; margin: 0.5mm 0 1.2mm;
  }
  .bro-day-title {
    font-family: ${DISPLAY}; font-size: 14.5pt; font-weight: 700;
    margin: 0; line-height: 1.25;
  }
  /* Each item block carries the shared indent directly -- deliberately NOT
     wrapped in one container, because every block is paginated on its own. */
  .bro-day-body { border-left: 0.5pt solid ${theme.rule}; margin-left: 16mm; padding-left: 5mm; }
  .bro-day-text { }

  /* The day's plan as a timeline. Markers give the eye a spine to run
     down, so a day reads as a sequence rather than a paragraph. Route
     legs, sightseeing, flights and notes all use this one treatment. */
  .bro-tl { list-style: none; margin: 0; padding: 0; }
  .bro-tl-item { position: relative; padding-left: 6.5mm; margin-bottom: 4mm; }
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
    margin-top: 1.5mm; padding-top: 3mm; border-top: 0.5pt solid ${theme.rule};
    clear: both; margin-bottom: 10mm;
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
// Returns { titleHTML, noteHTML } instead of one combined string --
// letting a pagination caller treat an item's title and its note as
// separate, independently-flowable pieces. Confirmed as necessary by
// rendering realistic reported content: a single oversized combined
// block (a photo plus a long note) could exceed whatever space remained
// on a page and defer everything after it, even when the title alone,
// or the title plus a partial note, would genuinely have fit. Splitting
// stays visually seamless -- the note fragment omits its own icon and
// carries no margin-bottom of its own (the title fragment keeps it when
// there is no note to follow; the note fragment carries it when there
// is), so the two still read as one continuous item, not two separate
// list entries.
function splitNoteIntoChunks(note) {
  if (!note) return [];
  const rawSentences = note.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [note];

  // Defensive secondary split: a single "sentence" with no internal
  // period (e.g. a long comma-separated list of clauses, or a note with
  // no terminal punctuation at all) would otherwise stay as one large,
  // indivisible chunk with nothing further to split on. Only activates
  // above a length where a sentence could plausibly not fit in the
  // remaining space on a page -- an ordinary sentence is left untouched.
  const sentences = rawSentences.flatMap(s => {
    if (s.length <= 220) return [s];
    const clauses = s.match(/[^,]+,(?:\s+|$)|[^,]+$/g);
    return clauses && clauses.length > 1 ? clauses : [s];
  });

  if (sentences.length <= 1) return [note];

  // Grouped a couple of sentences per chunk, not one sentence per chunk --
  // avoids turning a long note into an excessive number of tiny
  // pagination blocks, while still being small enough that keep-with-next
  // (title + first chunk only) stays cheap.
  // A lone final sentence is folded into the chunk before it instead of
  // standing as its own block: that is exactly the "one short line stranded
  // at the top of the next page" a reader notices, so a note can now only
  // ever break between pieces that are each at least two sentences long.
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const rest = sentences.length - i;
    const take = rest === 3 ? 3 : 2;
    const chunk = sentences.slice(i, i + take).join("").trim();
    if (chunk) chunks.push(chunk);
    if (take === 3) break;
  }
  return chunks.length ? chunks : [note];
}

function timelineItemParts(item) {
  if (!item) return { titleHTML: "", noteChunksHTML: [] };
  const text = (item.text || "").trim();
  const note = itemNoteForFlavor(item, "detailed").trim();
  const meta = item.type === "transport"
    ? [item.number && item.number.trim(), item.depTime && `Dep ${item.depTime}`, item.arrTime && `Arr ${item.arrTime}`].filter(Boolean).join(" · ")
    : [item.distance, item.time].filter(Boolean).join(" · ");
  const soft = item.type !== "sightseeing";
  const cls = `bro-tl-item${soft ? " bro-tl-item--soft" : ""}`;

  const iconName = item.type === "sightseeing" ? "pin"
    : item.type === "route" ? "route"
    : item.type === "transport" ? (item.mode === "train" ? "train" : "plane")
    : "pencil";
  const iconSVG = `<svg class="bro-tl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[iconName]}</svg>`;

  if (item.type === "description") {
    return { titleHTML: text ? `<li class="${cls}">${iconSVG}<p class="bro-tl-prose">${esc(text).replace(/\n/g, "<br/>")}</p></li>` : "", noteChunksHTML: [], hasNote: false };
  }
  if (!text && !meta) return { titleHTML: "", noteChunksHTML: [], hasNote: false };
  const titleHTML = `<li class="${cls}"${note ? ' style="margin-bottom:0"' : ""}>${iconSVG}
    <div class="bro-tl-name">${esc(text)}${meta ? ` <span class="bro-meta">— ${esc(meta)}</span>` : ""}</div>
  </li>`;
  const chunks = splitNoteIntoChunks(note);
  const noteChunksHTML = chunks.map((chunk, i) => {
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;
    // First chunk carries the gap after the title (matching .bro-tl-note's
    // own default margin-top); later chunks have none, so consecutive
    // chunks of the same note read as one continuous paragraph, not
    // several. Only the LAST chunk carries the item's own closing
    // margin-bottom, for the same reason -- earlier chunks must not leave
    // a visible gap before the next chunk of their own note.
    const style = `margin-top:${isFirst ? "1.2mm" : "0"}`;
    return `<li class="${cls} bro-tl-item--continuation"${isLast ? "" : ' style="margin-bottom:0"'}>
    <div class="bro-tl-note" style="${style}">${esc(chunk)}</div>
  </li>`;
  });
  return { titleHTML, noteChunksHTML, hasNote: chunks.length > 0 };
}

function timelineItemHTML(item) {
  const { titleHTML, noteChunksHTML } = timelineItemParts(item);
  // Thin wrapper for any caller still wanting one combined string.
  return titleHTML + noteChunksHTML.join("");
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

// "Tue, 14/10/2026" -- weekday, then dd/mm/yyyy. Parsed as a plain calendar
// date (never through the local timezone), so the weekday can't drift by a
// day depending on where the document is generated. Anything that isn't a
// real yyyy-mm-dd date returns "" and the day simply shows no date.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function formatDayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${WEEKDAYS[dt.getUTCDay()]}, ${m[3]}/${m[2]}/${m[1]}`;
}

// Block markers read by paginateBrochureDays, set as attributes on each
// block's outermost tag:
//   data-day-start      first block of a day
//   data-keep-with-next this block must share a page with the one after it
const block = (cls, inner, { keep = false, dayStart = false } = {}) =>
  `<div class="${cls}"${dayStart ? ' data-day-start="1"' : ""}${keep ? ' data-keep-with-next="1"' : ""}>${inner}</div>`;

export function brochureDayBlocks(day, index, image) {
  const items = day.items || [];
  const stay = stayOf(day);
  // Every item -- route legs included -- is an ordinary timeline item, in the
  // order the operator entered them. The overnight stay is the only thing
  // lifted out (into the footer).
  const timelineItems = items.filter(i => i.type !== "stay");

  const num = String(index + 1).padStart(2, "0");
  const meals = (day.meals || []).map(m => `<span class="bro-pill">${MEAL_LABEL[m] || esc(m)}</span>`).join("");
  const caption = (day.imageCaption || "").trim();
  const photos = normalizePhotoList(image);
  const dateText = formatDayDate(day.date);

  const strip = photos.length
    ? `<div class="bro-day-strip"><div class="bro-day-strip-row">${photos.map(u =>
        `<figure class="bro-day-shot"><img src="${esc(u)}" alt="" style="object-position:${esc(day.imageFocus || "center")}"/></figure>`).join("")}</div>${caption ? `<div class="bro-day-strip-cap">${esc(caption)}</div>` : ""}</div>`
    : "";
  const head = `<div class="bro-day-head">
    <div class="bro-day-rail">
      <div class="bro-day-num">${num}</div>
      <div class="bro-day-word">Day</div>
    </div>
    <div class="bro-day-main">
      ${dateText ? `<div class="bro-day-date">${esc(dateText)}</div>` : ""}
      ${day.title ? `<h3 class="bro-day-title">${esc(day.title)}</h3>` : ""}
    </div>
  </div>${strip}`;

  // Item blocks first, so we know what follows the heading.
  const itemBlocks = [];
  timelineItems.forEach(item => {
    const { titleHTML, noteChunksHTML, hasNote } = timelineItemParts(item);
    if (titleHTML) itemBlocks.push({ html: titleHTML, keep: hasNote });
    // Where a long note may and may not break (see splitNoteIntoChunks): a
    // two-chunk note stays whole; with three or more, the title stays with
    // the first chunk and the LAST TWO chunks stay together, so neither the
    // top nor the bottom of a split note is ever a single stranded piece.
    const m = noteChunksHTML.length;
    noteChunksHTML.forEach((chunkHTML, k) => {
      itemBlocks.push({ html: chunkHTML, keep: m === 2 ? k === 0 : (m >= 3 && k === m - 2) });
    });
  });

  const hasFooter = !!(meals || stay);
  // The footer (meals + overnight) is small. On its own at the top of a page
  // it reads as an error, so the last item always travels with it.
  if (hasFooter && itemBlocks.length) itemBlocks[itemBlocks.length - 1].keep = true;

  const blocks = [block("bro-day-top", head, { dayStart: true, keep: itemBlocks.length > 0 || hasFooter })];
  itemBlocks.forEach(b => blocks.push(block("bro-day-body", `<ul class="bro-tl">${b.html}</ul>`, { keep: b.keep })));
  if (hasFooter) {
    blocks.push(block("bro-day-body", `<div class="bro-day-foot">${meals}${stay ? `<span class="bro-stay">Overnight: <strong>${esc(stay)}</strong></span>` : ""}</div>`));
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

// Reduces a transport leg ("Flight 6E 204 Delhi - Varanasi (dep 06:40, arr 08:30)")
// to just its places. Flights and trains name their destinations in the leg
// text exactly as routes do, so they count the same way.
function legPlaceText(text) {
  return String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(dep|arr|departs?|arrives?)\b.*$/i, " ")
    .replace(/\b(by|via|on)\b.*$/i, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm|hrs?)?/gi, " ")
    .replace(/^\s*(flight|train|from)\s+/i, "")
    .replace(/\b[A-Z0-9]{2}\s?\d{2,4}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pulls distinct place names out of a day's route AND transport (flight /
// train) items. A route like "Bodhgaya - Rajgir - Nalanda - Bodhgaya"
// contributes three places, not four, because the return leg is the same town.
export function countDestinations(days, knownCountries = COUNTRY_WORDS) {
  const seen = new Set();
  (days || []).forEach(d => {
    (d.items || []).forEach(it => {
      // Routes and transport legs only. Stay items hold hotel names, not
      // places -- counting them turned "Hotel Oaks Bodhgaya" and "Lotus Nikko
      // Hotel" into destinations and inflated a real count of 8 to 14.
      if (it.type !== "route" && it.type !== "transport") return;
      const text = it.type === "transport" ? legPlaceText(it.text) : String(it.text || "");
      text
        .split(/[-–—\/,>]| to /i)
        .map(x => x.trim())
        // A bare airport code ("DEL") is not a place name.
        .filter(x => !/^[A-Z]{3}$/.test(x))
        .filter(x => x.length > 2 && !NON_DESTINATION.test(x) && !knownCountries.has(x.toLowerCase()))
        .map(x => x.toLowerCase().replace(/\s+/g, " "))
        .filter(x => !NOT_A_PLACE.has(x))
        .forEach(x => seen.add(x));
    });
  });
  return seen.size;
}

// Parses "100 km", "45km", "1,240 km" -> a plain number of km. Returns null
// (not 0) for anything that doesn't look like a distance, so a genuinely
// unset field stays unset rather than silently summing to 0.
function parseKm(text) {
  const m = String(text || "").match(/([\d,]+(?:\.\d+)?)\s*km/i);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

// Parses "3 hrs", "3.5 hrs", "45 min", "1 hr 30 min" -> total minutes.
// Same null-for-unset reasoning as parseKm.
function parseMinutes(text) {
  const s = String(text || "");
  let total = 0, matched = false;
  const hrMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i);
  if (hrMatch) { total += parseFloat(hrMatch[1]) * 60; matched = true; }
  const minMatch = s.match(/(\d+)\s*min/i);
  if (minMatch) { total += parseInt(minMatch[1], 10); matched = true; }
  return matched ? total : null;
}

// Derives as many glance-strip stats as genuinely possible from data the
// itinerary already holds. unesco and maxAltitude are deliberately absent
// -- no such data exists anywhere in this app (the gazetteer schema has no
// elevation field, and there is no UNESCO-site reference list), so they
// are left for an operator to fill in manually via Template Content
// rather than guessed at or silently omitted without explanation.
export function computeBrochureFacts(days) {
  const list = days || [];
  const facts = {};

  if (list.length) {
    facts.days = String(list.length);
    facts.nights = String(Math.max(0, list.length - 1));
  }

  let kmTotal = 0, kmSeen = false;
  let minTotal = 0, minSeen = false;
  let flights = 0, trains = 0;
  const hotelNames = new Set();

  list.forEach(d => {
    (d.items || []).forEach(it => {
      if (it.type === "route") {
        const km = it.distance != null ? parseKm(it.distance) : null;
        if (km != null) { kmTotal += km; kmSeen = true; }
        const mins = it.time != null ? parseMinutes(it.time) : null;
        if (mins != null) { minTotal += mins; minSeen = true; }
      } else if (it.type === "transport") {
        if (it.mode === "train") trains += 1; else flights += 1;
      } else if (it.type === "stay") {
        const name = (it.text || "").trim();
        if (name) hotelNames.add(name.toLowerCase());
      }
    });
  });

  if (kmSeen) facts.distance = `${Math.round(kmTotal).toLocaleString()} km`;
  if (minSeen) {
    const h = Math.floor(minTotal / 60), m = Math.round(minTotal % 60);
    facts.driveTime = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }
  if (flights > 0) facts.flights = String(flights);
  if (trains > 0) facts.trains = String(trains);
  if (hotelNames.size > 0) facts.hotels = String(hotelNames.size);

  return facts;
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
// How the day pages are filled -- the rules, in plain words:
//  1. Blocks are packed onto a page in order until the next one will not fit.
//  2. A block marked data-keep-with-next travels with the one after it, and
//     so on down a chain (heading + photo strip + first item; last item +
//     the day's footer). A chain is never split across pages.
//  3. WHOLE-DAY RULE: if a day fits on a fresh page but not in what is left of
//     this one, and what is left is under WHOLE_DAY_MIN_REMAINING of a page,
//     the day starts on the next page. Otherwise it flows on from here.
//  4. A chain taller than a page gets a page of its own.
// Plain strings without markers simply pack in order (rule 1).
export const WHOLE_DAY_MIN_REMAINING = 0.4;

export function paginateBrochureDays(dayHTMLs, { pageHeightPx = BROCHURE_CONTENT_HEIGHT_PX, contentWidthPx = BROCHURE_CONTENT_WIDTH_PX, firstPageReservePx = 0, reservePerPagePx = 0, bandPageCount = Infinity, wholeDayMinRemaining = WHOLE_DAY_MIN_REMAINING, measureFn } = {}) {
  const list = dayHTMLs || [];
  const n = list.length;
  const pages = [];
  let current = [];
  let used = 0;
  // A small safety margin against the page's own overflow:hidden, so a tiny
  // measurement discrepancy defers content to the next page rather than
  // clipping it.
  const SAFETY_MARGIN_PX = Math.round(pageHeightPx * 0.015);
  // Reserve band space only on pages that will actually carry one.
  const budgetFor = (pageIdx) => pageHeightPx - SAFETY_MARGIN_PX
    - (pageIdx < bandPageCount ? reservePerPagePx : 0)
    - (pageIdx === 0 ? firstPageReservePx : 0);
  const hasMarker = (b, name) => typeof b === "string" && new RegExp("^\\s*<[a-z][a-z0-9]*\\s[^>]*" + name + '="1"', "i").test(b);
  // measureFn returns each block's height INCLUDING its bottom margin.
  const heights = list.map((html, idx) => measureFn(html, contentWidthPx, idx));
  const dayEnd = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!hasMarker(list[i], "data-day-start")) continue;
    let e = i + 1;
    while (e < n && !hasMarker(list[e], "data-day-start")) e++;
    dayEnd[i] = e - 1;
  }
  const sum = (from, to) => { let t = 0; for (let k = from; k <= to; k++) t += heights[k]; return t; };
  const flush = () => { pages.push(current); current = []; used = 0; };

  let i = 0;
  while (i < n) {
    let e = i;
    while (e < n - 1 && hasMarker(list[e], "data-keep-with-next")) e++;
    const needed = sum(i, e);

    if (dayEnd[i] >= 0 && current.length > 0) {
      const dayH = sum(i, dayEnd[i]);
      const left = budgetFor(pages.length) - used;
      if (dayH > left && dayH <= budgetFor(pages.length + 1) && left < wholeDayMinRemaining * pageHeightPx) flush();
    }
    if (used + needed > budgetFor(pages.length) && current.length > 0) flush();
    for (let k = i; k <= e; k++) current.push(list[k]);
    used += needed;
    i = e + 1;
  }
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
