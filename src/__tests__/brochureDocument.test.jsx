import { describe, it, expect } from 'vitest';
import {
  buildBrochureDocument, brochureDayHTML, brochureCoverHTML,
  paginateBrochureDays, withBrochurePreviewStyles, BROCHURE_PREVIEW_CSS, brochureCSS,
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
  it('renders title, duration, route and tagline over a hero image', () => {
    const html = brochureCoverHTML({ title:'Footsteps of Buddha', duration:'9 Days / 8 Nights', route:'Bodhgaya – Varanasi', tagline:'A transformative journey.', heroImage:'https://x/hero.jpg' });
    expect(html).toContain('Footsteps of Buddha');
    expect(html).toContain('9 Days / 8 Nights');
    expect(html).toContain('Bodhgaya – Varanasi');
    expect(html).toContain('A transformative journey.');
    expect(html).toContain('https://x/hero.jpg');
    expect(html).toContain('bro-cover-veil');
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
  it('renders the day label, title, items and meals', () => {
    const html = brochureDayHTML(day(), 0, null);
    expect(html).toContain('DAY-1');
    expect(html).toContain('Arrival at Bodhgaya');
    expect(html).toContain('Airport – Hotel');
    expect(html).toContain('12 km / 30 min');
    expect(html).toContain('Mahabodhi Temple');
    expect(html).toContain('Breakfast');
    expect(html).toContain('Dinner');
  });

  it('includes an image when one is supplied and omits the figure entirely when not', () => {
    expect(brochureDayHTML(day(), 0, 'https://x/1.jpg')).toContain('https://x/1.jpg');
    expect(brochureDayHTML(day(), 0, null)).not.toContain('bro-day-figure');
  });

  it('alternates the image side to give the page rhythm without per-day config', () => {
    expect(brochureDayHTML(day(), 0, 'i.jpg')).not.toContain('bro-day-grid--flip');
    expect(brochureDayHTML(day(), 1, 'i.jpg')).toContain('bro-day-grid--flip');
  });

  it('renders a day with no items at all without emitting empty rows', () => {
    const html = brochureDayHTML({ dayLabel:'DAY-2', items:[], meals:[] }, 1, null);
    expect(html).toContain('DAY-2');
    expect(html).not.toContain('bro-meal');
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
    expect(html).toContain('DAY-1');
    expect(html).toContain('DAY-2');
    expect(html).toContain('Unitop Tours');
    expect(html).toMatch(/2 \/ 2/);
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

  it('per-day images can be keyed by day id or by index', () => {
    expect(buildBrochureDocument({ ...base, dayImages:{ d2:'by-id.jpg' } })).toContain('by-id.jpg');
    expect(buildBrochureDocument({ ...base, dayImages:{ 0:'by-index.jpg' } })).toContain('by-index.jpg');
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
