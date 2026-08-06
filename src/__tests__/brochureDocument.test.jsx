import { describe, it, expect } from 'vitest';
import {
  buildBrochureDocument, brochureDayHTML, brochureCoverHTML,
  paginateBrochureDays, withBrochurePreviewStyles, BROCHURE_PREVIEW_CSS, brochureCSS,
  brochureGlanceHTML,
} from '../lib/brochure.js';

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

  it('keeps the overnight hotel out of the client brochure entirely, while the field stays in the data', () => {
    // Hotels are frequently not final at itinerary stage, and naming them
    // here duplicates the Quotation. The stay item is still stored and
    // editable; it just isn't printed on a client-facing page.
    const html = brochureDayHTML(day(), 0, null);
    expect(html).not.toContain('Hotel Bodhgaya Regency');
    expect(day().items.some(i => i.type === 'stay')).toBe(true);
  });

  it('shows the one-line note that says what a place actually is', () => {
    const d = { id:'x', items:[{ id:'a', type:'sightseeing', text:'Sarnath', note:'Where the Buddha gave his first sermon.' }] };
    const html = brochureDayHTML(d, 0, null);
    expect(html).toContain('Sarnath');
    expect(html).toContain('Where the Buddha gave his first sermon.');
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
