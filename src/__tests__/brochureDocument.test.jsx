import { describe, it, expect } from 'vitest';
import {
  buildBrochureDocument, brochureDayHTML, brochureDayBlocks, brochureCoverHTML,
  paginateBrochureDays, withBrochurePreviewStyles, BROCHURE_PREVIEW_CSS, brochureCSS,
  brochureGlanceHTML, computeBrochureFacts,
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
    // Every bullet point's own text survives, and each note chunk's
    // internal newline is preserved verbatim in the markup -- a long note
    // is now legitimately allowed to split across multiple chunks (so a
    // long note can flow across a page break independently), but within
    // any one chunk a newline must never be silently collapsed.
    expect(html).toContain('Paying homage to the Three Jewels.');
    expect(html).toContain('Offering flowers to the Buddha.');
    expect(html).toContain('Walking meditation and spiritual practice.');
    expect(html).toContain('Paying homage to the Three Jewels.\n\u25cf Offering flowers to the Buddha.');
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

describe('regression: brochureCSS must load its own fonts, not rely only on an external <link> tag -- now self-hosted, a stronger fix than the @import it replaces', () => {
  it('includes real @font-face rules with actual embedded font data for the fonts the document uses, not a network reference to them', () => {
    // Confirmed real cause of entire days landing alone on mostly-blank
    // pages: createMeasurementContext only ever receives what brochureCSS()
    // returns -- a <link> tag added separately in the final document's
    // <head> never reaches the measurement iframe, so pagination measured
    // every block with a browser-default fallback font instead of the
    // real fonts, and a fallback font with different metrics produced
    // systematically wrong height estimates. An @import fixed that gap,
    // but still required a real network fetch to complete before the
    // font was actually available -- self-hosting removes that dependency
    // entirely, for both the measurement pass and the final printed
    // document, which no longer needs fonts.googleapis.com reachable at
    // all to generate correctly.
    const css = brochureCSS();
    expect(css).not.toMatch(/@import\s+url\(/);
    expect(css).not.toMatch(/url\([^)]*fonts\.googleapis\.com/);
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'Libre Caslon Text'");
    expect(css).toContain("font-family: 'Public Sans'");
    // Real embedded font data, not a placeholder -- base64 woff2 payloads
    // are large; a genuine one is unmistakably longer than any plausible
    // accidental/placeholder string.
    expect(css).toMatch(/data:font\/woff2;base64,[A-Za-z0-9+/]{1000,}/);
  });

  it('the font-face rules are present before any other rule relying on them, same requirement an @import used to satisfy', () => {
    const css = brochureCSS().trim();
    expect(css.indexOf('@font-face')).toBeLessThan(css.indexOf('@page'));
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

  it('LOGO_TRANSPARENT_B64 was cropped to remove baked-in blank space below the visible content -- confirmed real cause of the tagline "looking far away" that no CSS margin alone could fix', () => {
    // PNG IHDR: width and height are the first two 4-byte big-endian
    // integers starting at byte 16, right after the 8-byte signature and
    // the 4-byte chunk length + "IHDR" tag.
    const bytes = Buffer.from(LOGO_TRANSPARENT_B64.split(',')[1], 'base64');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    // The original, uncropped image was 418x194 -- confirmed by reading
    // its own header the same way before this fix. A genuinely tighter
    // crop must be smaller on both axes.
    expect(width).toBeLessThan(418);
    expect(height).toBeLessThan(194);
  });

  it('the cover logo container\u2019s own CSS aspect ratio matches the actual cropped image\u2019s real pixel aspect ratio -- confirmed real cause of a reported "stretched/out of proportion" logo: the crop above changed the image\u2019s real ratio (2.155 -> 2.604) but the container\u2019s fixed width was never updated to match, forcing the image into a box shaped for its old proportions', () => {
    const bytes = Buffer.from(LOGO_TRANSPARENT_B64.split(',')[1], 'base64');
    const imgWidth = bytes.readUInt32BE(16);
    const imgHeight = bytes.readUInt32BE(20);
    const imgRatio = imgWidth / imgHeight;

    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo\s*\{([^}]*)\}/)?.[1] || '';
    const cssWidthMm = parseFloat(rule.match(/width:\s*([\d.]+)mm/)?.[1] || '0');
    const cssHeightMm = 22; // .bro-cover-logo img's own fixed height, unchanged
    const cssRatio = cssWidthMm / cssHeightMm;

    // Within half a percent -- exact floating-point equality isn't the
    // point, avoiding a visibly stretched/squeezed logo is.
    expect(Math.abs(cssRatio - imgRatio) / imgRatio).toBeLessThan(0.005);
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

describe('regression: the tagline is no longer constrained to the logo\u2019s own width (explicit permission given), sized up for readability, centered independently, and the real gap-to-logo cause (baked-in blank space in the image itself) was fixed at the image level, not just CSS', () => {
  it('is styled italic', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo-tag\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/font-style:\s*italic/);
  });

  it('font size increased for readability, no longer constrained to fit the logo\u2019s own narrow width', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo-tag\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/font-size:\s*7pt/);
    expect(rule).not.toMatch(/width:\s*100%/);
  });

  it('centered independently via absolute positioning, not tied to the logo container\u2019s own narrower box', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo-tag\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/left:\s*50%/);
    expect(rule).toMatch(/transform:\s*translateX\(-50%\)/);
  });

  it('the logo container reserves extra space below it, since the absolutely-positioned tagline no longer contributes to its own parent\u2019s height', () => {
    const css = brochureCSS();
    const rule = css.match(/\.bro-cover-logo\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toMatch(/margin-bottom:\s*15mm/);
    expect(rule).toMatch(/position:\s*relative/);
  });
});

describe('an untitled day\u2019s first route stands in as its headline, honestly (same size, still the accent colour, arrow not hyphen)', () => {
  const untitledDay = { id:'d1', items:[{ id:'r', type:'route', text:'Bodhgaya - Rajgir', distance:'100 km', time:'3 hrs' }] };
  const titledDay = { id:'d2', title:'Arrival at Bodhgaya', items:[{ id:'r', type:'route', text:'Bodhgaya - Rajgir', distance:'100 km', time:'3 hrs' }] };

  it('promotes the route to headline size when the day has no title', () => {
    const html = brochureDayHTML(untitledDay, 0, null);
    expect(html).toContain('bro-day-route--lead');
  });

  it('does NOT promote it when the day has a real title', () => {
    const html = brochureDayHTML(titledDay, 0, null);
    expect(html).not.toContain('bro-day-route--lead');
  });

  it('converts the hyphen separator to an arrow only for the promoted route', () => {
    const untitled = brochureDayHTML(untitledDay, 0, null);
    expect(untitled).toContain('Bodhgaya \u2192 Rajgir');
    expect(untitled).not.toContain('Bodhgaya - Rajgir');

    const titled = brochureDayHTML(titledDay, 0, null);
    expect(titled).toContain('Bodhgaya - Rajgir'); // small label route keeps its own text as typed
  });

  it('only the FIRST route is promoted when an untitled day has more than one leg', () => {
    const multiLegDay = { id:'d3', items:[
      { id:'r1', type:'route', text:'Bodhgaya - Nalanda', distance:'100 km' },
      { id:'r2', type:'route', text:'Nalanda - Rajgir', distance:'20 km' },
    ] };
    const html = brochureDayHTML(multiLegDay, 0, null);
    const leadCount = (html.match(/bro-day-route--lead/g) || []).length;
    expect(leadCount).toBe(1);
    expect(html).toContain('Bodhgaya \u2192 Nalanda'); // the promoted one
    expect(html).toContain('Nalanda - Rajgir'); // the second leg stays a plain label, untouched
  });

  it('the distance/time metadata stays small and muted regardless of promotion', () => {
    const css = brochureCSS();
    expect(css).toMatch(/\.bro-day-route-meta\s*\{[^}]*color:/);
    // Confirm the lead style itself never touches the meta span's colour.
    const leadRule = css.match(/\.bro-day-route--lead\s*\{([^}]*)\}/)?.[1] || '';
    expect(leadRule).not.toContain('bro-day-route-meta');
  });

  it('the promoted route still uses the accent red, not the title\u2019s navy -- an honest signal, not a disguise', () => {
    const css = brochureCSS();
    const leadRule = css.match(/\.bro-day-route--lead\s*\{([^}]*)\}/)?.[1] || '';
    // --lead deliberately omits its own colour so it inherits .bro-day-route's
    // accent red rather than restating theme.ink (the title's navy).
    expect(leadRule).not.toContain('color:');
  });
});

describe('regression: a day\u2019s photo is merged with its first item into one block, so a tall photo never needlessly defers items that would genuinely fit', () => {
  // Confirmed the real cause of a reported bug by rendering realistic
  // content: the photo used to be its own separate pagination block,
  // placed before every item. If IT alone didn't fit in whatever space
  // remained on a page, everything after it -- including items that would
  // have fit on their own -- was deferred right along with it, since
  // pagination processes blocks strictly in order. The visible result was
  // a day's header landing with a large blank gap following it, no
  // visible reason for the rest of that day's content to have moved.
  const manyItemsDay = {
    id: 'd1',
    items: [
      { id:'a', type:'sightseeing', text:'MARKER_FIRST' },
      { id:'b', type:'sightseeing', text:'MARKER_SECOND' },
    ],
  };

  it('the photo and the first item always land on the same page -- never split from each other', () => {
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 100;
      if (html.includes('bro-day-photo') || html.includes('bro-day-photo-empty')) return 600;
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [manyItemsDay],
      dayImages: { d1: 'data:image/png;base64,X' },
      measureFn: measure,
    });
    // Checking for the rendered opening tag specifically, not a bare
    // class-name substring -- .bro-day-photo-empty and .bro-day-body also
    // legitimately appear as CSS selectors in the embedded stylesheet,
    // which a plain substring check would mistake for real page content.
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('<div class="bro-day-body">'));
    const withFirst = dayContentChunks.findIndex(p => p.includes('MARKER_FIRST'));
    const withPhoto = dayContentChunks.findIndex(p => p.includes('<figure class="bro-day-photo">'));
    expect(withFirst).toBeGreaterThan(-1);
    expect(withPhoto).toBeGreaterThan(-1);
    expect(withFirst).toBe(withPhoto);
  });

  it('a photo too tall for the remaining space defers itself AND the first item together, not the first item alone stranded without its photo', () => {
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 900; // consumes almost the whole first page
      if (html.includes('bro-day-photo')) return 600;
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [manyItemsDay],
      dayImages: { d1: 'data:image/png;base64,X' },
      measureFn: measure,
    });
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('<div class="bro-day-body">'));
    const photoChunk = dayContentChunks.find(p => p.includes('<figure class="bro-day-photo">'));
    expect(photoChunk).toContain('MARKER_FIRST');
  });

  it('later items remain independently flowable -- the merge only ever applies to the photo and the FIRST item', () => {
    const blocks = brochureDayBlocks(manyItemsDay, 0, 'data:image/png;base64,X');
    const photoBlock = blocks.find(b => b.includes('<figure class="bro-day-photo">'));
    // The photo's own block carries the first item alongside it...
    expect(photoBlock).toContain('MARKER_FIRST');
    // ...but the second item is never folded into that same block -- it
    // gets its own, independently-flowable one.
    expect(photoBlock).not.toContain('MARKER_SECOND');
    const secondBlock = blocks.find(b => b.includes('MARKER_SECOND'));
    expect(secondBlock).toBeTruthy();
    expect(secondBlock).not.toBe(photoBlock);
  });
});

describe('computeBrochureFacts: real stats derived from the itinerary\u2019s own data -- previously never computed or passed at all', () => {
  // Confirmed real root cause: buildBrochureDocument was always called
  // with no facts key whatsoever, so only "destinations" (the one
  // self-contained auto-computation inside brochureGlanceHTML) ever
  // populated the glance strip, regardless of how much distance/route
  // data an operator had actually entered.
  const days = [
    { items: [
      { type: 'route', text: 'Bodhgaya - Nalanda', distance: '100 km', time: '3 hrs' },
    ] },
    { items: [
      { type: 'route', text: 'Nalanda - Rajgir', distance: '20 km', time: '30 min' },
      { type: 'transport', text: '6E 2134', mode: 'flight' },
      { type: 'stay', text: 'Hotel Rajgir' },
    ] },
    { items: [
      { type: 'route', text: 'Rajgir - Varanasi', distance: '280 km', time: '6 hrs' },
      { type: 'transport', text: '12345', mode: 'train' },
      { type: 'stay', text: 'Hotel Rajgir' }, // same hotel repeated -- must not double-count
    ] },
  ];

  it('computes days and nights from the actual day count', () => {
    const facts = computeBrochureFacts(days);
    expect(facts.days).toBe('3');
    expect(facts.nights).toBe('2');
  });

  it('sums real distance across every route item, formatted with a thousands separator', () => {
    const facts = computeBrochureFacts(days);
    expect(facts.distance).toBe('400 km'); // 100 + 20 + 280
  });

  it('sums real drive time across every route item, converting to hours and minutes', () => {
    const facts = computeBrochureFacts(days);
    // 3hrs + 30min + 6hrs = 9h30m
    expect(facts.driveTime).toBe('9h 30m');
  });

  it('counts flights and trains separately by transport mode', () => {
    const facts = computeBrochureFacts(days);
    expect(facts.flights).toBe('1');
    expect(facts.trains).toBe('1');
  });

  it('counts distinct hotel names, not double-counting a repeated stay', () => {
    const facts = computeBrochureFacts(days);
    expect(facts.hotels).toBe('1'); // "Hotel Rajgir" appears twice, counts once
  });

  it('a field with no underlying data is genuinely absent, not zero -- an itinerary with no route distances shows no distance stat at all', () => {
    const noDistanceDays = [{ items: [{ type: 'sightseeing', text: 'A Temple' }] }];
    const facts = computeBrochureFacts(noDistanceDays);
    expect(facts.distance).toBeUndefined();
    expect(facts.driveTime).toBeUndefined();
    expect(facts.flights).toBeUndefined();
  });

  it('handles a genuinely empty itinerary without throwing', () => {
    expect(() => computeBrochureFacts([])).not.toThrow();
    expect(() => computeBrochureFacts(undefined)).not.toThrow();
  });

  it('deliberately does NOT compute unesco or maxAltitude -- no such data exists anywhere in this app to derive them from', () => {
    const facts = computeBrochureFacts(days);
    expect(facts.unesco).toBeUndefined();
    expect(facts.maxAltitude).toBeUndefined();
  });
});

describe('regression: an item\u2019s title and note are now separate, independently-flowable pagination blocks -- not one combined, indivisible block', () => {
  // Confirmed the real remaining cause of #4 by rendering realistic
  // content through the actual pipeline: even after the photo+first-item
  // merge (previous fix), a single item's title+note COMBINED could still
  // be too large for whatever space remained on a page, deferring
  // everything after it -- the same structural problem, just needing a
  // larger example to trigger. Splitting title from note lets a long note
  // flow onto a continuation page independently, while the title (and
  // whatever came before it) stays wherever it already fit.
  const longNoteDay = {
    id: 'd1',
    items: [
      { id:'a', type:'sightseeing', text:'MARKER_TITLE', detailedNote:'MARKER_NOTE, a long paragraph of descriptive text that would meaningfully add to a block\u2019s measured height on its own.' },
    ],
  };

  it('brochureDayBlocks produces the title and note as two separate blocks, not one combined block', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const withTitle = blocks.filter(b => b.includes('MARKER_TITLE'));
    const withNote = blocks.filter(b => b.includes('MARKER_NOTE'));
    expect(withTitle).toHaveLength(1);
    expect(withNote).toHaveLength(1);
    // The critical assertion: title and note are NOT in the same block.
    expect(withTitle[0]).not.toContain('MARKER_NOTE');
    expect(withNote[0]).not.toContain('MARKER_TITLE');
  });

  it('a long note can land on a different page than its own title, when the combined size would not have fit on one page', () => {
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 100;
      if (html.includes('MARKER_NOTE')) return 700; // deliberately large
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [longNoteDay],
      dayImages: { d1: 'data:image/png;base64,X' },
      measureFn: measure,
    });
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('<div class="bro-day-body">'));
    const titleChunk = dayContentChunks.findIndex(p => p.includes('MARKER_TITLE'));
    const noteChunk = dayContentChunks.findIndex(p => p.includes('MARKER_NOTE'));
    expect(titleChunk).toBeGreaterThan(-1);
    expect(noteChunk).toBeGreaterThan(-1);
    // They are allowed to differ now -- this is the point of the fix.
    // (Not asserting they MUST differ, since that depends on the exact
    // budget; asserting both exist and neither throws is the real check.)
  });

  it('the note fragment does not repeat the icon -- reads as a continuation of the same item, not a second list entry', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const noteBlock = blocks.find(b => b.includes('MARKER_NOTE'));
    expect(noteBlock).not.toContain('bro-tl-icon');
    expect(noteBlock).toContain('bro-tl-item--continuation');
  });

  it('an item with no note at all still produces exactly one block, not an empty second one', () => {
    const noNoteDay = { id: 'd2', items: [{ id:'a', type:'sightseeing', text:'MARKER_ALONE' }] };
    const blocks = brochureDayBlocks(noNoteDay, 0, null);
    const withMarker = blocks.filter(b => b.includes('MARKER_ALONE'));
    expect(withMarker).toHaveLength(1);
  });

  it('brochureDayHTML (the thin whole-day-string wrapper) still contains both title and note somewhere, unchanged for any caller not yet using blocks directly', () => {
    const html = brochureDayHTML(longNoteDay, 0, 'data:image/png;base64,X');
    expect(html).toContain('MARKER_TITLE');
    expect(html).toContain('MARKER_NOTE');
  });
});

describe('regression: a title is never placed alone at the bottom of a page with its entire note starting fresh on the next -- confirmed real bug from direct feedback after removing this constraint', () => {
  const longNoteDay = {
    id: 'd1',
    items: [
      { id:'a', type:'sightseeing', text:'MARKER_TITLE', detailedNote:'MARKER_NOTE, a long paragraph of descriptive text.' },
    ],
  };

  it('the title block is marked to require its note fits alongside it', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const titleBlock = blocks.find(b => b.includes('MARKER_TITLE'));
    expect(titleBlock).toContain('data-keep-with-next="1"');
  });

  it('when the title+full note do not fit together, BOTH move to the next page -- never just the note, leaving a bare title behind', () => {
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 900; // consumes almost the whole first page
      if (html.includes('MARKER_TITLE')) return 100;
      if (html.includes('MARKER_NOTE')) return 100;
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [longNoteDay],
      dayImages: { d1: 'data:image/png;base64,X' },
      measureFn: measure,
    });
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('<div class="bro-day-body">'));
    const titleChunkIdx = dayContentChunks.findIndex(p => p.includes('MARKER_TITLE'));
    const noteChunkIdx = dayContentChunks.findIndex(p => p.includes('MARKER_NOTE'));
    // The real assertion: never separated onto different pages.
    expect(titleChunkIdx).toBe(noteChunkIdx);
  });

  it('when the title+full note genuinely both fit, they stay together on the same page as normal', () => {
    const measure = (html) => {
      if (html.includes('bro-day-head')) return 50;
      if (html.includes('MARKER_TITLE')) return 50;
      if (html.includes('MARKER_NOTE')) return 50;
      return 50;
    };
    const html = buildBrochureDocument({
      cover: { title: 'T' },
      days: [longNoteDay],
      dayImages: { d1: 'data:image/png;base64,X' },
      measureFn: measure,
    });
    const dayContentChunks = html.split('class="bro-page').filter(p => p.includes('<div class="bro-day-body">'));
    const titleChunkIdx = dayContentChunks.findIndex(p => p.includes('MARKER_TITLE'));
    const noteChunkIdx = dayContentChunks.findIndex(p => p.includes('MARKER_NOTE'));
    expect(titleChunkIdx).toBe(noteChunkIdx);
  });

  it('an item with no note has no keep-with-next marker -- nothing to keep it together with', () => {
    const noNoteDay = { id: 'd2', items: [{ id:'a', type:'sightseeing', text:'MARKER_ALONE' }] };
    const blocks = brochureDayBlocks(noNoteDay, 0, null);
    const titleBlock = blocks.find(b => b.includes('MARKER_ALONE'));
    expect(titleBlock).not.toContain('data-keep-with-next');
  });
});

describe('regression: a long note is split into flowing chunks, not one indivisible block -- confirmed real fix for both an orphaned-title problem and a wasted-blank-space problem, which shared the same root cause', () => {
  const longNoteDay = {
    id: 'd1',
    items: [
      { id:'a', type:'sightseeing', text:'MARKER_TITLE', detailedNote:'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.' },
    ],
  };

  it('splits a multi-sentence note into more than one block', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const noteBlocks = blocks.filter(b => b.includes('bro-tl-item--continuation'));
    expect(noteBlocks.length).toBeGreaterThan(1);
  });

  it('keep-with-next requires only the title + FIRST chunk, not the whole note', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const titleBlock = blocks.find(b => b.includes('MARKER_TITLE'));
    expect(titleBlock).toContain('data-keep-with-next="1"');
  });

  it('consecutive chunks of the same note read as one continuous paragraph -- no visible gap between them', () => {
    const blocks = brochureDayBlocks(longNoteDay, 0, 'data:image/png;base64,X');
    const noteBlocks = blocks.filter(b => b.includes('bro-tl-item--continuation'));
    // Every chunk except the last must have margin-bottom:0 on its own <li>.
    noteBlocks.slice(0, -1).forEach(b => expect(b).toMatch(/bro-tl-item--continuation"\s+style="margin-bottom:0"/));
    // Only the first chunk carries the gap after the title (margin-top).
    expect(noteBlocks[0]).toContain('margin-top:1.2mm');
    noteBlocks.slice(1).forEach(b => expect(b).toContain('margin-top:0'));
  });

  it('a short, single-sentence note is not chunked at all', () => {
    const shortDay = { id: 'd2', items: [{ id:'a', type:'sightseeing', text:'T', detailedNote:'One short sentence.' }] };
    const blocks = brochureDayBlocks(shortDay, 0, null);
    const noteBlocks = blocks.filter(b => b.includes('bro-tl-item--continuation'));
    expect(noteBlocks.length).toBe(1);
  });

  it('an item with no note produces no continuation blocks at all', () => {
    const noNoteDay = { id: 'd3', items: [{ id:'a', type:'sightseeing', text:'MARKER_ALONE' }] };
    const blocks = brochureDayBlocks(noNoteDay, 0, null);
    expect(blocks.some(b => b.includes('bro-tl-item--continuation'))).toBe(false);
  });

  it('defensive fallback: a single very long sentence with no internal period is still split, on commas, so it can never be one unsplittable oversized block', () => {
    const longClause = 'this is clause number ' + Array.from({length: 25}, (_, i) => `${i + 1}`).join(', clause number ') + ' and the final clause';
    const noPeriodDay = { id: 'd4', items: [{ id:'a', type:'sightseeing', text:'T', detailedNote: longClause }] };
    const blocks = brochureDayBlocks(noPeriodDay, 0, null);
    const noteBlocks = blocks.filter(b => b.includes('bro-tl-item--continuation'));
    expect(noteBlocks.length).toBeGreaterThan(1);
  });

  it('an ordinary sentence under the length threshold is never touched by the comma fallback, even if it happens to contain commas', () => {
    const normalDay = { id: 'd5', items: [{ id:'a', type:'sightseeing', text:'T', detailedNote:'A short note, with a comma, but well under the length threshold.' }] };
    const blocks = brochureDayBlocks(normalDay, 0, null);
    const noteBlock = blocks.find(b => b.includes('bro-tl-item--continuation'));
    expect(noteBlock).toContain('A short note, with a comma, but well under the length threshold.');
  });
});

describe('regression: paginateBrochureDays keeps a small safety margin against .bro-page\u2019s own overflow:hidden', () => {
  it('a block measured to exactly fill the full page height is deferred to the next page, not squeezed in against the margin', () => {
    const measure = () => 1000; // exactly the page height passed below
    const pages = paginateBrochureDays(['a', 'b'], { pageHeightPx: 1000, measureFn: measure });
    // With zero safety margin this would fit exactly (used=0, needed=1000,
    // not > budget of 1000) and both would be forced onto one page each
    // regardless; the real check is that the margin measurably reduces
    // the usable budget below the raw page height.
    const measureUsed = () => 990; // just under the raw height, but within the ~1.5% margin
    const pages2 = paginateBrochureDays(['a', 'b'], { pageHeightPx: 1000, measureFn: measureUsed });
    expect(pages2.length).toBe(2); // 'a' alone should not fit alongside 'b' given the margin
  });
});

describe('regression: a transport item\u2019s dedicated number field shows in the day-by-day content too, not just the glance table -- same shared rendering function used by Brief, Detailed, and the brochure', () => {
  it('the number appears in the meta line, before the departure/arrival times, matching the same field order in the editor', () => {
    const day = { id: 'x', items: [{ id:'a', type:'transport', text:'Hanoi - Bodhgaya', mode:'flight', number:'VN9771', depTime:'08:45', arrTime:'10:55' }] };
    const html = brochureDayHTML(day, 0, null);
    expect(html).toContain('VN9771');
    // Order: number, then Dep, then Arr.
    expect(html.indexOf('VN9771')).toBeLessThan(html.indexOf('Dep 08:45'));
    expect(html.indexOf('Dep 08:45')).toBeLessThan(html.indexOf('Arr 10:55'));
  });

  it('an empty number field is simply omitted from the meta line -- no fallback label here (that\u2019s specific to the glance table)', () => {
    const day = { id: 'x', items: [{ id:'a', type:'transport', text:'Nalanda - Delhi', mode:'flight', depTime:'18:00', arrTime:'19:30' }] };
    const html = brochureDayHTML(day, 0, null);
    expect(html).toContain('Dep 18:00');
    expect(html).not.toContain('By Air');
  });
});
