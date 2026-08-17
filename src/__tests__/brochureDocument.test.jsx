import { describe, it, expect } from 'vitest';
import {
  buildBrochureDocument, brochureDayHTML, brochureCoverHTML,
  paginateBrochureDays, withBrochurePreviewStyles, BROCHURE_PREVIEW_CSS, brochureCSS,
  brochureGlanceHTML,
} from '../lib/brochure.js';
import { ICON_PATHS } from '../lib/utils.js';
import { LOGO_B64, LOGO_TRANSPARENT_B64 } from '../lib/images.js';

const day = (over = {}) => ({
  id: 'd1', dayLabel: 'DAY-1', title: 'Arrival at Bodhgaya', meals: ['B','D'],
  items: [
    { id:'a', type:'route', text:'Airport – Hotel', distance:'12 km', time:'30 min' },
    { id:'b', type:'sightseeing', text:'Mahabodhi Temple' },
    { id:'c', type:'stay', text:'Hotel Bodhgaya Regency' },
  ],
  ...over,
});

describe('brochure is its own document class, not the letterhead engine', () => {
  it('prints full-bleed: zero page margin and no letterhead header/footer furniture', () => {
    const css = brochureCSS();
    expect(css).toMatch(/@page \{ size: A4 portrait; margin: 0; \}/);
    expect(css).not.toContain('lh-header');
    expect(css).not.toContain('print-page-content');
  });

  it('uses the fixed-height page model, with page-break-after on the page element itself', () => {
    // Learned on the letterhead side: a break on a wrapper silently kills the height.
    const css = brochureCSS();
    expect(css).toMatch(/\.bro-page \{[^}]*height: 297mm/);
    expect(css).toMatch(/\.bro-page--notlast \{ page-break-after: always; \}/);
  });
});

describe('cover page', () => {
  it('renders title, duration, route and tagline on paper, with the photograph below', () => {
    const html = brochureCoverHTML({ title:'Footsteps of Buddha', duration:'9 Days / 8 Nights', route:'Bodhgaya – Varanasi', tagline:'A transformative journey.', heroImage:'https://x/hero.jpg' });
    expect(html).toContain('Footsteps of Buddha');
    expect(html).toContain('9 Days / 8 Nights');
    expect(html).toContain('Bodhgaya – Varanasi');
    expect(html).toContain('A transformative journey.');
    expect(html).toContain('https://x/hero.jpg');
    // Split panel, not full-bleed: type sits on paper and the photograph
    // gets its own band, so neither needs a scrim over the other.
    expect(html).toContain('bro-cover-top');
    expect(html).toContain('bro-cover-photo');
    expect(html).not.toContain('bro-cover-veil');
  });

  it('shows the logo as the hero when one is supplied', () => {
    const html = brochureCoverHTML({ title:'T', logo:'data:image/png;base64,AAA' });
    expect(html).toContain('bro-cover-logo');
    expect(html).toContain('data:image/png;base64,AAA');
  });

  it('regression: a logo nested inside cover.logo actually reaches the page through buildBrochureDocument, not just the isolated brochureCoverHTML call', () => {
    // Confirmed real bug: buildBrochureDocument had its OWN redundant
    // top-level `logo` parameter (defaulting to null), used nowhere except
    // one line that did `brochureCoverHTML({ ...cover, logo })` -- the
    // bare `logo` after the spread is buildBrochureDocument's own
    // (unset) top-level value, which silently overwrote whatever
    // cover.logo actually held. title/tagline/duration/route/heroImage all
    // flow through `cover` correctly; logo was the one field secretly
    // discarded on the only path a real caller actually uses. The test
    // above passed the whole time because it calls brochureCoverHTML
    // directly, bypassing the broken wrapper entirely.
    const html = buildBrochureDocument({
      cover: { title:'T', logo:'data:image/png;base64,REALLOGO' },
      days: [],
    });
    expect(html).toContain('data:image/png;base64,REALLOGO');
  });

  it('prints the company tagline beneath the logo, width-matched to it, only when a logo is present', () => {
    const withLogo = brochureCoverHTML({ title:'T', logo:'data:image/png;base64,AAA' });
    expect(withLogo).toContain('Your gateway to Incredible India, since 1999');
    expect(withLogo).toContain('bro-cover-logo-tag');
    // No logo, no tagline -- it is specifically the logo's caption, not a
    // standalone element that should appear regardless.
    const noLogo = brochureCoverHTML({ title:'T', brand:'Unitop Tours' });
    expect(noLogo).not.toContain('Your gateway to Incredible India');
  });

  it('falls back to the company name when no logo is available', () => {
    const html = brochureCoverHTML({ title:'T', brand:'Unitop Tours' });
    expect(html).toContain('Unitop Tours');
    expect(html).not.toContain('<img src="data:image/png');
  });

  it('falls back to a solid panel when there is no hero image, rather than a broken frame', () => {
    const html = brochureCoverHTML({ title:'No Photo Yet' });
    expect(html).toContain('bro-cover--plain');
    expect(html).not.toContain('<img');
    expect(html).toContain('No Photo Yet');
  });

  it('escapes user text so a stray angle bracket cannot break the document', () => {
    expect(brochureCoverHTML({ title:'A <script>alert(1)</script> tour' })).not.toContain('<script>');
  });
});

describe('day cards', () => {
  it('renders the day number, title, items and meals', () => {
    const html = brochureDayHTML(day(), 0, null);
    // The day is numbered from its position, as a large display numeral --
    // the stored dayLabel is an internal field, not client-facing copy.
    expect(html).toContain('01');
    expect(html).toContain('Arrival at Bodhgaya');
    expect(html).toContain('Airport – Hotel');
    expect(html).toContain('12 km · 30 min');
    expect(html).toContain('Mahabodhi Temple');
    expect(html).toContain('Breakfast');
    expect(html).toContain('Dinner');
  });

  it('carries no per-day inset at all -- imagery belongs to the page, not one day', () => {
    // A photo beside day 1 while days 2 and 3 had none read as "this day
    // matters more". Images now live only in the page-level band.
    expect(brochureDayHTML(day(), 0, 'https://x/1.jpg')).not.toContain('bro-day-figure');
    expect(brochureDayHTML(day(), 0, null)).not.toContain('bro-day-figure');
  });

  it('gives each page one dominant photo band rather than a stamp per day', () => {
    const html = buildBrochureDocument({
      cover:{ title:'T' }, days:[day(), day({ id:'d2' })], dayImages:{ d1:'https://x/band.jpg' },
    });
    expect(html).toContain('bro-band');
    expect(html).toContain('https://x/band.jpg');
    expect(html).not.toContain('bro-day-figure');
  });

  it('shows the overnight hotel in the day footer -- reversed from an earlier decision, per direct current instruction', () => {
    // This used to deliberately omit the hotel (hotels are frequently not
    // final at itinerary stage, and naming them here duplicates the
    // Quotation) -- that was a real, considered decision, documented right
    // here. It was overridden by a direct, explicit instruction after
    // reviewing a real exported brochure that showed no overnight
    // information anywhere at all. The stay item was always in the data;
    // only whether it printed has changed.
    const html = brochureDayHTML(day(), 0, null);
    expect(html).toContain('Hotel Bodhgaya Regency');
  });

  it('shows the stay even on a day with no meals at all -- the footer must not depend on meals existing', () => {
    const d = day({ meals: [], items: [{ id:'c', type:'stay', text:'Hotel Bodhgaya Regency' }] });
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Hotel Bodhgaya Regency');
  });

  it('a day with no stay item shows no stay line, no crash', () => {
    const d = day({ items: [{ id:'b', type:'sightseeing', text:'Mahabodhi Temple' }] });
    expect(() => brochureDayHTML(d, 0, null)).not.toThrow();
    const html = brochureDayHTML(d, 0, null);
    expect(html).not.toContain('bro-stay');
  });

  it('shows the one-line note that says what a place actually is', () => {
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath', note:'Where the Buddha gave his first sermon.' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Sarnath');
    expect(html).toContain('Where the Buddha gave his first sermon.');
  });

  it('regression: a multi-line note (bullet points on their own lines) must not collapse into one run-on paragraph', () => {
    // Confirmed from a real exported PDF: an operator-typed bullet list
    // with each point on its own line rendered as "\u25cf Point one. \u25cf
    // Point two. \u25cf Point three." all joined into a single paragraph,
    // because .bro-tl-note had no white-space treatment at all and the
    // note text was inserted with no newline-to-<br/> conversion either --
    // ordinary HTML whitespace collapsing swallowed every line break.
    const note = '\u25cf Paying homage to the Three Jewels.\n\u25cf Offering flowers to the Buddha.\n\u25cf Walking meditation and spiritual practice.';
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Mahabodhi Mahavihara', detailedNote: note }] };
    const html = brochureDayHTML(d, 0, null);
    // The newlines themselves must survive verbatim in the markup...
    expect(html).toContain(note);
    // ...and the stylesheet actually applied to .bro-tl-note must be what
    // makes the browser respect them, not just their presence in the HTML.
    expect(brochureCSS()).toMatch(/\.bro-tl-note\s*\{[^}]*white-space:\s*pre-wrap/);
  });

  it('regression: shows the DETAILED note when one has been written, not Brief\u2019s -- the brochure IS the Detailed document', () => {
    // Confirmed real bug: brochure.js read item.note directly, which is
    // Brief's own field, completely bypassing item.detailedNote. The
    // brochure -- the entire reason the per-flavor note split exists --
    // was silently showing whichever short line Brief had, or nothing, if
    // Brief's own note was left empty while Detailed's was carefully
    // written.
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath', note:'Brief\u2019s short line.', detailedNote:'A far richer, client-facing paragraph about Sarnath written specifically for the brochure.' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('A far richer, client-facing paragraph about Sarnath written specifically for the brochure.');
    expect(html).not.toContain('Brief\u2019s short line.');
  });

  it('regression: shows Detailed\u2019s note even when Brief\u2019s own note was left completely empty', () => {
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath', note:'', detailedNote:'Written only for the brochure, Brief never touched this item\u2019s note at all.' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Written only for the brochure, Brief never touched this item\u2019s note at all.');
  });

  it('regression: a flight\u2019s departure and arrival times must appear in the brochure, not just the plain letterhead documents', () => {
    // Found by rendering an actual day with a real transport item: the
    // brochure's meta line only ever read item.distance/item.time, which
    // are route's own fields -- a transport item uses depTime/arrTime
    // instead, and those never appeared anywhere in the brochure at all,
    // even though the same item correctly prints "(Dep 08:45 \u00b7 Arr
    // 10:55)" in the plain documents.
    const d = { id:'x', items:[{ id:'a', type:'transport', text:'Hanoi - Bodhgaya (VN9771)', mode:'flight', depTime:'08:45', arrTime:'10:55' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Dep 08:45');
    expect(html).toContain('Arr 10:55');
  });

  it('a transport item with no times at all still renders cleanly, no stray separator', () => {
    const d = { id:'x', items:[{ id:'a', type:'transport', text:'6E 2134', mode:'flight' }] };
    expect(() => brochureDayHTML(d, 0, null)).not.toThrow();
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('6E 2134');
    expect(html).not.toContain('Dep');
  });

  it('renders cleanly when a place has no note, so a hurried entry still looks right', () => {
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Sarnath');
    expect(html).not.toContain('bro-tl-note');
  });

  it('promotes the first route to a headline under the title, without repeating it in the timeline', () => {
    const html = brochureDayHTML(day(), 0, null);
    expect(html).toContain('bro-day-route');
    expect(html.match(/Airport – Hotel/g)).toHaveLength(1);
  });

  it('renders a day with no items at all without emitting empty rows', () => {
    const html = brochureDayHTML({ id:'d', items:[], meals:[] }, 1, null);
    expect(html).toContain('02');
    expect(html).not.toContain('bro-pill');
    expect(html).not.toContain('bro-tl-item');
  });
});

describe('pagination', () => {
  const measure = (html) => (html.includes('TALL') ? 900 : 300);

  it('flows several day cards onto one page while they fit', () => {
    const pages = paginateBrochureDays(['a','b','c'], { pageHeightPx: 1000, measureFn: measure });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(3);
  });

  it('starts a new page when the next card would not fit', () => {
    const pages = paginateBrochureDays(['a','b','c','d'], { pageHeightPx: 1000, measureFn: measure });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(3);
    expect(pages[1]).toEqual(['d']);
  });

  it('gives an over-tall card its own page rather than dropping it or looping', () => {
    const pages = paginateBrochureDays(['a','TALL','b'], { pageHeightPx: 500, measureFn: measure });
    expect(pages.flat()).toEqual(['a','TALL','b']);
    expect(pages.some(p => p.includes('TALL'))).toBe(true);
  });

  it('handles an empty itinerary', () => {
    expect(paginateBrochureDays([], { measureFn: measure })).toEqual([]);
  });
});

describe('regression: a day\u2019s own content now flows across a page break, instead of the whole day jumping to the next page when it does not fit', () => {
  // Confirmed real, reported problem: the day was previously one atomic
  // HTML string, so paginateBrochureDays could only ever move it wholesale
  // -- a day too tall for whatever space remained on a page always started
  // completely fresh on the next one, wasting the remainder of the current
  // page and costing pages unnecessarily. brochureDayHTML/brochureDayBlocks
  // were redesigned so the head (rail+title+routes) stays one atomic flex
  // row, but the photo and every item are now independent siblings that
  // can be packed onto different pages, exactly like the plain letterhead
  // documents already do for their own per-item blocks.
  const manyItemsDay = {
    id: 'd1',
    items: [
      { id:'a', type:'sightseeing', text:'MARKER_ONE' },
      { id:'b', type:'sightseeing', text:'MARKER_TWO' },
      { id:'c', type:'sightseeing', text:'MARKER_THREE' },
      { id:'d', type:'sightseeing', text:'MARKER_FOUR' },
    ],
  };

  it('splits a single day\u2019s items across two pages when they collectively do not fit on one', () => {
    // Each item block reports a large height; the page budget only fits
    // a couple of them plus the head before rolling over.
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 100;
      if (html.includes('bro-day-body')) return 400;
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [manyItemsDay],
      measureFn: measure,
    });
    // Scoped to bro-day-body chunks specifically -- MARKER_ONE also
    // legitimately appears on the earlier glance page (as the day's
    // fallback highlight text, since this day has no title), which is not
    // what this test is about.
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('bro-day-body'));
    const withMarkerOne = dayContentChunks.findIndex(p => p.includes('MARKER_ONE'));
    const withMarkerFour = dayContentChunks.findIndex(p => p.includes('MARKER_FOUR'));
    // The real proof: these two items from the SAME day land on DIFFERENT
    // page chunks, not both stuck together on whichever page the day
    // happened to fit on (or both bumped to a later page as one unit).
    expect(withMarkerOne).toBeGreaterThan(-1);
    expect(withMarkerFour).toBeGreaterThan(-1);
    expect(withMarkerOne).not.toBe(withMarkerFour);
  });

  it('a day that DOES fit on one page is never needlessly split -- confirms this is genuine flow, not fragmentation for its own sake', () => {
    const measure = () => 50; // everything trivially fits
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [manyItemsDay],
      measureFn: measure,
    });
    const pageChunks = html.split('class="bro-page');
    // Scoped to actual day-content blocks (bro-day-body), not just any
    // occurrence of the marker text -- the glance table legitimately
    // reuses a day's first sightseeing item as a fallback "highlight"
    // summary when the day has no title, which is a separate, earlier
    // page and correctly also contains the marker text without that
    // meaning the day's own content was split.
    const pagesWithDayContent = pageChunks.filter(p => p.includes('bro-day-body') && /MARKER_(ONE|TWO|THREE|FOUR)/.test(p));
    expect(pagesWithDayContent).toHaveLength(1);
  });
});

describe('whole document', () => {
  const base = {
    cover: { title:'Footsteps of Buddha', duration:'9 Days', heroImage:'hero.jpg' },
    days: [day(), day({ id:'d2', dayLabel:'DAY-2', title:'Bodhgaya' })],
    measureFn: () => 300,
  };

  it('assembles cover + day pages and numbers the pages', () => {
    const html = buildBrochureDocument({ ...base, footerLabel:'Unitop Tours' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Footsteps of Buddha');
    expect(html).toContain('Arrival at Bodhgaya');
    expect(html).toContain('Bodhgaya');
    expect(html).toContain('Unitop Tours');
    // Cover + glance + day page(s): numbering counts every sheet.
    expect(html).toMatch(/\d+ \/ \d+/);
  });

  it('1.14: includes the uploaded route map on its own page when supplied', () => {
    const html = buildBrochureDocument({ ...base, routeMapImage:'https://x/map.png' });
    expect(html).toContain('https://x/map.png');
    expect(html).toContain('Tour Route Map');
  });

  it('omits the route map page entirely when none is uploaded', () => {
    expect(buildBrochureDocument(base)).not.toContain('Tour Route Map');
  });

  it('adds a closing page only when there is closing text', () => {
    // Scoped to the body: the stylesheet always defines .bro-closing, so a
    // whole-document match would pass whether the page existed or not.
    const body = (html) => html.split('<body>')[1];
    expect(body(buildBrochureDocument({ ...base, closingText:'Tour ends.' }))).toContain('Tour ends.');
    expect(body(buildBrochureDocument(base))).not.toContain('bro-closing');
  });

  it('regression: the template\u2019s standing closing tagline shows unconditionally, matching Brief -- the brochure had no representation of it at all before', () => {
    // Confirmed real gap: Brief (and the plain Detailed document) always
    // show tmpl.closingTagline regardless of what an operator has typed
    // elsewhere. The brochure only ever had the per-instance closingText
    // field, which is optional and often empty -- so the standing tagline
    // that appears reliably in Brief simply never appeared in the
    // brochure at all.
    const html = buildBrochureDocument({ ...base, closingTagline: 'TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES' });
    expect(html.split('<body>')[1]).toContain('TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES');
  });

  it('the tagline shows even when closingText, remarksText and contact are all empty -- it must not depend on any of them', () => {
    const html = buildBrochureDocument({ ...base, closingTagline: 'STANDING TAGLINE' });
    expect(html.split('<body>')[1]).toContain('STANDING TAGLINE');
  });

  it('the tagline and the operator\u2019s own closing text can both appear together, tagline below', () => {
    const html = buildBrochureDocument({ ...base, closingText: 'Safe travels.', closingTagline: 'STANDING TAGLINE' });
    const body = html.split('<body>')[1];
    expect(body.indexOf('Safe travels.')).toBeGreaterThan(-1);
    expect(body.indexOf('STANDING TAGLINE')).toBeGreaterThan(body.indexOf('Safe travels.'));
  });

  it('marks every page but the last as page-break-after, so nothing prints blank at the end', () => {
    const body = buildBrochureDocument({ ...base, closingText:'End.' }).split('<body>')[1];
    const pages = body.split('class="bro-page').length - 1;
    const breaks = body.split('bro-page--notlast').length - 1;
    expect(pages).toBeGreaterThan(1);
    expect(breaks).toBe(pages - 1);
  });

  it('page band images are keyed by day id', () => {
    expect(buildBrochureDocument({ ...base, dayImages:{ d1:'by-id.jpg' } })).toContain('by-id.jpg');
  });

  it('falls back to one day per page when no measurer is available, rather than guessing heights', () => {
    const html = buildBrochureDocument({ cover:{ title:'X' }, days:[day(), day({ id:'d2' }), day({ id:'d3' })] });
    // cover + 3 day pages
    expect(html.split('class="bro-page').length - 1).toBe(4);
  });

  it('produces a valid document for an itinerary with no days at all', () => {
    const html = buildBrochureDocument({ cover:{ title:'Empty' } });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Empty');
  });
});

describe('preview styling', () => {
  it('does NOT pad the sheet -- a brochure is full-bleed, and padding would misrepresent it', () => {
    expect(BROCHURE_PREVIEW_CSS).not.toContain('padding: 8mm');
    expect(BROCHURE_PREVIEW_CSS).toContain('box-shadow');
  });

  it('is screen-only so it can never reach print output', () => {
    expect(BROCHURE_PREVIEW_CSS.trim().startsWith('@media screen')).toBe(true);
  });

  it('injects into the head and leaves the body intact', () => {
    const out = withBrochurePreviewStyles('<html><head></head><body><div class="bro-page">x</div></body></html>');
    expect(out.indexOf('@media screen')).toBeLessThan(out.indexOf('</head>'));
    expect(out).toContain('<div class="bro-page">x</div>');
  });

  it('is a no-op on empty input', () => {
    expect(withBrochurePreviewStyles('')).toBe('');
  });
});

describe('at-a-glance page: the whole tour absorbed before any detail', () => {
  const d = (id, title, items, meals) => ({ id, title, items, meals });
  const days = [
    d('d1', 'Arrival at Bodhgaya', [
      { id:'r', type:'route', text:'Gaya Airport – Bodhgaya', distance:'12 km', time:'30 min' },
      { id:'s', type:'stay', text:'Hotel Oaks' },
    ], ['D']),
    d('d2', 'Rajgir & Nalanda', [
      { id:'r2', type:'route', text:'Bodhgaya – Rajgir', distance:'70 km', time:'2 hrs' },
      { id:'s2', type:'stay', text:'Hotel Oaks' },
    ], ['B','L','D']),
  ];

  it('lists every day with its route and overnight in one table', () => {
    const html = brochureGlanceHTML(days, {});
    expect(html).toContain('Your Journey at a Glance');
    expect(html).toContain('Gaya Airport – Bodhgaya');
    expect(html).toContain('Bodhgaya – Rajgir');
    expect(html).toContain('Hotel Oaks');
    expect(html).toContain('01');
    expect(html).toContain('02');
  });

  it('falls back to the day title, then a sightseeing stop, when there is no route', () => {
    expect(brochureGlanceHTML([{ id:'x', title:'Free Day in Varanasi', items:[] }], {})).toContain('Free Day in Varanasi');
    expect(brochureGlanceHTML([{ id:'y', items:[{ id:'s', type:'sightseeing', text:'Dhamek Stupa' }] }], {})).toContain('Dhamek Stupa');
  });

  it('shows an em dash rather than a blank cell for a day with nothing recorded', () => {
    expect(brochureGlanceHTML([{ id:'z', items:[] }], {})).toContain('—');
  });

  it('renders the headline facts when supplied', () => {
    expect(brochureGlanceHTML(days, { days:'9', nights:'8', distance:'1,105 km' })).toContain('1,105 km');
  });

  it('derives the destination count from the itinerary rather than taking a typed number', () => {
    // A hand-typed "Sites Visited" could drift from the document it sits on.
    // A derived count cannot, and it excludes airports and departures.
    const html = brochureGlanceHTML(days, {});
    expect(html).toContain('Destinations');
    expect(html).toContain('bro-facts');
  });

  it('omits the strip when there is nothing at all to count or show', () => {
    expect(brochureGlanceHTML([{ id:'x', items:[] }], {})).not.toContain('bro-facts');
  });

  it('can be turned off for a document that does not want it', () => {
    const html = buildBrochureDocument({ cover:{ title:'X' }, days, showGlance:false });
    expect(html).not.toContain('Your Journey at a Glance');
  });
});

describe('pagination reserves room for the section heading on the first day page', () => {
  it('fits fewer days on the first page than on later ones', () => {
    const measure = () => 300;
    // 971px budget: 3 blocks fit normally, but only 2 once ~98px of heading
    // is reserved. Without the reserve the first page silently overflowed.
    const withReserve = paginateBrochureDays(['a','b','c','d','e','f'], { pageHeightPx: 971, firstPageReservePx: 98, measureFn: measure });
    expect(withReserve[0]).toHaveLength(2);
    expect(withReserve[1]).toHaveLength(3);
  });

  it('behaves as before when nothing is reserved', () => {
    const pages = paginateBrochureDays(['a','b','c','d'], { pageHeightPx: 971, measureFn: () => 300 });
    expect(pages[0]).toHaveLength(3);
  });
});

describe('supporting pages', () => {
  const base = { cover:{ title:'T' }, days:[{ id:'d1', items:[{ id:'a', type:'route', text:'A – B' }] }] };

  it('includes the hotels page only when hotels are supplied', () => {
    expect(buildBrochureDocument({ ...base, hotels:[{ place:'Bodhgaya', nights:'3', hotel:'Oaks' }] })).toContain("Where You'll Stay");
    expect(buildBrochureDocument(base)).not.toContain("Where You'll Stay");
  });

  it('includes the inclusions page only when there is something to list', () => {
    const html = buildBrochureDocument({ ...base, includes:['Hotels'], excludes:['Airfare'] });
    expect(html).toContain('Included');
    expect(html).toContain('Not Included');
    expect(buildBrochureDocument(base).split('<body>')[1]).not.toContain('bro-list');
  });

  it('renders a closing page with contact details when supplied', () => {
    const html = buildBrochureDocument({ ...base, closingText:'Safe travels.', contact:{ name:'Unitop', lines:['hello@x.com'] } });
    expect(html).toContain('Safe travels.');
    expect(html).toContain('hello@x.com');
  });
});

describe('remarksText folds into the last page above the closing line', () => {
  const days = [{ id:1, dayLabel:'Day 1', title:'Arrival', items:[{ id:'a', type:'sightseeing', text:'X' }] }];

  it('renders remarks before closingText, both on the last page', () => {
    const html = buildBrochureDocument({
      cover: { title:'T' }, days,
      remarksText: 'Please confirm the vegetarian meal request.',
      closingText: 'Tour ends as you leave footprints and take memories.',
    });
    const remarksIdx = html.indexOf('Please confirm the vegetarian meal request.');
    const closingIdx = html.indexOf('Tour ends as you leave footprints and take memories.');
    expect(remarksIdx).toBeGreaterThan(-1);
    expect(closingIdx).toBeGreaterThan(remarksIdx);
  });

  it('preserves multi-line remarks', () => {
    const html = buildBrochureDocument({ cover:{ title:'T' }, days, remarksText: 'Line one\nLine two' });
    expect(html).toContain('white-space:pre-wrap');
  });

  it('omits the signoff fold entirely when there is nothing to show', () => {
    const html = buildBrochureDocument({ cover:{ title:'T' }, days });
    expect(html).not.toContain('class="bro-signoff"');
  });

  it('still folds in when only remarks is given, with no closing text', () => {
    const html = buildBrochureDocument({ cover:{ title:'T' }, days, remarksText: 'Just a note.' });
    expect(html).toContain('Just a note.');
  });
});

describe('regression: brochureCSS must load its own fonts, not rely only on an external <link> tag', () => {
  it('includes an @import for the same fonts the document uses', () => {
    // Confirmed real cause of entire days landing alone on mostly-blank
    // pages: createMeasurementContext only ever receives what brochureCSS()
    // returns -- a <link> tag added separately in the final document's
    // <head> never reaches the measurement iframe, so pagination measured
    // every block with a browser-default fallback font instead of the
    // real Source Serif 4 / Playfair Display, and a fallback font with
    // different metrics produced systematically wrong height estimates.
    // The plain letterhead documents never had this problem because they
    // already load fonts this same way, inside their own shared CSS text.
    const css = brochureCSS();
    expect(css).toContain('@import');
    expect(css).toContain('fonts.googleapis.com');
    expect(css).toContain('Fraunces');
    expect(css).toContain('Karla');
  });

  it('the @import is the very first rule, as CSS requires for it to take effect at all', () => {
    const css = brochureCSS().trim();
    expect(css.indexOf('@import')).toBeLessThan(css.indexOf('@page'));
  });
});

describe('regression: real icons replace the generic bullet dots, per direct request to match Brief\u2019s icon system', () => {
  it('a sightseeing item gets the pin icon', () => {
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain(ICON_PATHS.pin);
  });

  it('a flight gets the plane icon, a train gets the train icon -- different glyphs, not one generic transport icon', () => {
    const flight = brochureDayHTML({ id:'x', items:[{ id:'a', type:'transport', text:'6E 2134', mode:'flight' }] }, 0, null);
    const train = brochureDayHTML({ id:'y', items:[{ id:'b', type:'transport', text:'12345', mode:'train' }] }, 0, null);
    expect(flight).toContain(ICON_PATHS.plane);
    expect(train).toContain(ICON_PATHS.train);
    expect(flight).not.toContain(ICON_PATHS.train);
    expect(train).not.toContain(ICON_PATHS.plane);
  });

  it('a remark gets the pencil icon', () => {
    const d = { id:'x', items:[{ id:'a', type:'remarks', text:'Meeting with Venerable Thich Minh Quang.' }] };
    expect(brochureDayHTML(d, 0, null)).toContain(ICON_PATHS.pencil);
  });

  it('the old ::before circle-bullet rule on .bro-tl-item is gone entirely', () => {
    expect(brochureCSS()).not.toContain('.bro-tl-item::before');
  });
});

describe('regression: the splash screen and every other app UI use kept the original opaque logo; only the brochure cover uses the transparent one', () => {
  it('LOGO_B64 and LOGO_TRANSPARENT_B64 are different image data -- the app-wide logo was NOT silently made transparent everywhere', () => {
    expect(LOGO_B64).not.toBe(LOGO_TRANSPARENT_B64);
  });

  it('LOGO_B64 is opaque (PNG color type 2 or 3, no alpha channel)', () => {
    const bytes = Buffer.from(LOGO_B64.split(',')[1], 'base64');
    const colorType = bytes[25];
    expect([2, 3]).toContain(colorType);
  });

  it('LOGO_TRANSPARENT_B64 genuinely has an alpha channel (PNG color type 6)', () => {
    const bytes = Buffer.from(LOGO_TRANSPARENT_B64.split(',')[1], 'base64');
    expect(bytes[25]).toBe(6);
  });
});

describe('regression: closing/remarks text must be left-aligned, not inherit centering from .bro-signoff', () => {
  it('.bro-signoff-text is explicitly left-aligned', () => {
    expect(brochureCSS()).toMatch(/\.bro-signoff-text\s*\{[^}]*text-align:\s*left/);
  });

  it('the tagline and divider rule stay centered -- only the text itself moved', () => {
    const css = brochureCSS();
    expect(css).toMatch(/\.bro-signoff-tagline\s*\{[^}]*text-align:\s*center/);
    expect(css).toMatch(/\.bro-signoff\s*\{[^}]*text-align:\s*center/); // parent still centers the rule/tagline by default
  });
});

describe('regression: every brochure icon uses the accent colour now, not just sightseeing\u2019s -- the soft/muted split is gone', () => {
  it('there is no separate soft-icon colour rule left in the stylesheet', () => {
    const css = brochureCSS();
    expect(css).not.toMatch(/bro-tl-item--soft \.bro-tl-icon/);
    expect(css).toMatch(/\.bro-tl-icon\s*\{[^}]*color:\s*#8B0000/);
  });
});

describe('regression: the tagline is now sans-serif, non-italic, and sized to fit within the logo\u2019s own width -- a tighter, single lockup rather than a separately-styled caption', () => {
  it('uses the sans-serif label font, not the italic serif display font', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo-tag\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/font-style:\s*normal/);
    expect(rule).not.toContain('italic');
  });

  it('sits close to the logo -- a small margin-top, not the earlier looser gap', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo-tag\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/margin-top:\s*1mm/);
  });
});
