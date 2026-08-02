import { describe, it, expect } from 'vitest';
import { buildRouteMapSVG, buildSectorTableHTML, computeBBox } from '../lib/routeMap.js';

const stops = [
  { name:'Bodhgaya', lon:84.991, lat:24.696, dayLabel:'1' },
  { name:'Kushinagar', lon:83.888, lat:26.741, dayLabel:'4' },
  { name:'Lumbini', lon:83.276, lat:27.469, dayLabel:'5', overnight:false },
];
const sectors = [
  { from:'Bodhgaya', to:'Kushinagar', distance:'365 km', time:'9 hrs' },
  { from:'Kushinagar', to:'Lumbini', distance:'185 km', time:'5 hrs' },
];

describe('route map is generated from data, not drawn by hand', () => {
  it('plots every stop with its real name and day number', () => {
    const svg = buildRouteMapSVG({ stops, sectors });
    for (const s of stops) expect(svg).toContain(s.name);
    expect(svg).toContain('>1<');
    expect(svg).toContain('>4<');
  });

  it('draws a leg for every sector', () => {
    const svg = buildRouteMapSVG({ stops, sectors });
    expect((svg.match(/<path d="M[\d.]+,[\d.]+ Q/g) || []).length).toBe(2);
  });

  it('distinguishes flight sectors from road sectors', () => {
    const svg = buildRouteMapSVG({ stops, sectors: [{ from:'Bodhgaya', to:'Lumbini', mode:'flight' }] });
    expect(svg).toContain('stroke-dasharray');
  });

  it('skips a sector naming a stop that is not on the map, rather than throwing', () => {
    const svg = buildRouteMapSVG({ stops, sectors: [{ from:'Bodhgaya', to:'Atlantis' }] });
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('Atlantis');
  });

  it('marks overnight stops differently from pass-through stops', () => {
    const svg = buildRouteMapSVG({ stops, sectors });
    // Overnight stops get a halo; pass-through ones do not.
    expect((svg.match(/opacity="0\.16"/g) || []).length).toBe(2);
  });

  it('returns nothing for an itinerary with no stops, rather than an empty frame', () => {
    expect(buildRouteMapSVG({ stops: [], sectors: [] })).toBe('');
  });

  it('escapes place names so odd characters cannot break the drawing', () => {
    const svg = buildRouteMapSVG({ stops: [{ name:'A <b> B', lon:80, lat:25 }], sectors: [] });
    expect(svg).not.toContain('<b>');
  });

  it('bounds the view around the stops with padding', () => {
    const [minLon, minLat, maxLon, maxLat] = computeBBox(stops);
    expect(minLon).toBeLessThan(83.276);
    expect(maxLat).toBeGreaterThan(27.469);
  });
});

describe('sector table is generated from the same data as the map', () => {
  it('lists every sector with its distance and time', () => {
    const html = buildSectorTableHTML(sectors);
    expect(html).toContain('Bodhgaya – Kushinagar');
    expect(html).toContain('365 km · 9 hrs');
  });

  it('totals the road distance so the figure cannot drift from the sectors', () => {
    expect(buildSectorTableHTML(sectors)).toContain('550 km');
  });

  it('omits the total when no distance is parseable, instead of showing zero', () => {
    expect(buildSectorTableHTML([{ from:'A', to:'B' }])).not.toContain('Total road distance');
  });

  it('renders nothing at all when there are no sectors', () => {
    expect(buildSectorTableHTML([])).toBe('');
  });
});
