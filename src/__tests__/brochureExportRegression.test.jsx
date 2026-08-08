import { describe, it, expect } from 'vitest';
import { createMeasurementContext, domMeasureHeightPx } from '../lib/letterhead.js';
import {
  buildMapDataFromResolvedDays, partitionGateways, buildRouteMapSVG,
  buildSectorTableHTML, gatewayNoteHTML,
} from '../lib/routeMap.js';
import { buildBrochureDocument } from '../lib/brochure.js';
import { resolveDayImages } from '../lib/photoLibrary.js';
import * as Lib from '../lib/index.js';

// Regression test for "Brochure PDF export failed: <two letters> is not a
// function". This exact fix was diagnosed and delivered as a patch once
// already -- and somewhere in a large batch of patches being applied, it
// silently never landed: domMeasureHeightPx lost its export again, this
// test file did not exist in the repo, and the failure resurfaced under a
// new mangled name ("RI"). The first assertion below exists specifically
// so a missing export is caught by the test suite itself, not by a user
// hitting Export in production a second time.
describe('every name Itinerary.jsx pulls from Lib actually resolves', () => {
  it('domMeasureHeightPx in particular is a real export, not silently undefined', () => {
    // Destructuring a missing key does not throw -- `const { x } = Lib`
    // silently binds undefined, and nothing fails until something calls
    // x(). This assertion is the check that would have caught the earlier
    // patch not landing.
    expect(typeof Lib.domMeasureHeightPx).toBe('function');
  });
});

describe('brochure export: the real (unstubbed) measurement path', () => {
  const itinDays = [
    { id: 1, dayLabel: "Day 1", title: "", meals: ["L", "D"], place: null,
      items: [
        { id: 't1', type: 'transport', text: 'BKK-CCU-PAT-GAY' },
        { id: 's1', type: 'stay', text: 'THE IMPERIAL' },
      ] },
    { id: 2, dayLabel: "Day 2", title: "", meals: ["B", "L", "D"],
      place: { name: 'Kolkata', lat: 22.57, lon: 88.36, country: 'India', admin1: 'West Bengal' },
      items: [ { id: 'r1', type: 'route', text: 'City tour' } ] },
    { id: 3, dayLabel: "Day 3", title: "", meals: ["B", "L", "D"],
      place: { name: 'Patna', lat: 25.61, lon: 85.14, country: 'India', admin1: 'Bihar' },
      items: [ { id: 't2', type: 'transport', text: 'Flight to Patna' } ] },
  ];

  it('builds the full brochure document without throwing, using the real DOM measurer', () => {
    const ctx = createMeasurementContext('body{margin:0}');
    try {
      const { stops, sectors } = buildMapDataFromResolvedDays(itinDays);
      const { ground, gateways } = partitionGateways(stops, sectors);
      const mapHTML = ground.length ? buildRouteMapSVG({ stops: ground, sectors }) : "";
      const sectorTableHTML = stops.length
        ? buildSectorTableHTML(sectors, undefined, itinDays.map(d => ({ title: d.place ? d.place.name : d.title })))
        : "";
      const gatewayNote = gatewayNoteHTML(gateways);
      const dayImages = resolveDayImages(itinDays, [], {});

      expect(() => buildBrochureDocument({
        cover: { title: "Test Tour", tagline: "", duration: "3 Days / 2 Nights", route: "",
          heroImage: dayImages[itinDays[0].id] || null },
        days: itinDays,
        dayImages,
        mapHTML, sectorTableHTML, gatewayNote,
        routeMapImage: null,
        closingText: "Tour ends as you leave footprints and take memories.",
        footerLabel: "Test Tour",
        measureFn: (html, width) => domMeasureHeightPx(html, width, ctx.doc),
      })).not.toThrow();
    } finally {
      ctx.cleanup();
    }
  });

  it('a day with no resolved place and only a stay/transport item does not break pagination', () => {
    const day = { id: 1, dayLabel: "Day 1", title: "", meals: ["L", "D"], place: null,
      items: [
        { id: 't1', type: 'transport', text: 'BKK-CCU-PAT-GAY' },
        { id: 's1', type: 'stay', text: 'THE IMPERIAL' },
      ] };
    const ctx = createMeasurementContext('body{margin:0}');
    try {
      const dayImages = resolveDayImages([day], [], {});
      expect(() => buildBrochureDocument({
        cover: { title: "Test Tour", tagline: "", duration: "1 Days / 0 Nights", route: "", heroImage: null },
        days: [day],
        dayImages,
        mapHTML: "", sectorTableHTML: "", gatewayNote: "",
        routeMapImage: null,
        closingText: "Tour ends as you leave footprints and take memories.",
        footerLabel: "Test Tour",
        measureFn: (html, width) => domMeasureHeightPx(html, width, ctx.doc),
      })).not.toThrow();
    } finally {
      ctx.cleanup();
    }
  });
});
