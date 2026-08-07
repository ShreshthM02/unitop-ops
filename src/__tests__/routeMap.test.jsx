import { describe, it, expect } from 'vitest';
import { buildRouteMapSVG, buildSectorTableHTML, computeBBox, formatDayLabel, partitionGateways, gatewayNoteHTML, buildMapDataFromResolvedDays } from '../lib/routeMap.js';

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
    // Both ends must be real stops -- a single flight leg with nothing else
    // would make its endpoints arrival/departure context, not tour geography.
    const svg = buildRouteMapSVG({
      stops,
      sectors: [
        { from:'Bodhgaya', to:'Lumbini', mode:'flight' },
        { from:'Lumbini', to:'Kushinagar', distance:'185 km' },
        { from:'Kushinagar', to:'Bodhgaya', distance:'365 km' },
      ],
    });
    expect(svg).toContain('stroke-dasharray');
  });

  it('skips a sector naming a stop that is not on the map, rather than throwing', () => {
    const svg = buildRouteMapSVG({ stops, sectors: [{ from:'Bodhgaya', to:'Atlantis' }] });
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('Atlantis');
  });

  it('marks overnight stops differently from pass-through stops', () => {
    const svg = buildRouteMapSVG({ stops, sectors });
    // Overnight stops carrying a day label render as a filled capsule;
    // pass-through stops stay a plain outlined dot.
    expect(svg).toContain('<rect');
    expect(svg).toContain('<circle');
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

describe('day labels on the map', () => {
  it('collapses consecutive days into a range, so a three-night stop is not shown as one day', () => {
    expect(formatDayLabel([1,2,3])).toBe('1\u20133');
    expect(formatDayLabel([5])).toBe('5');
  });
  it('lists separate blocks when a place is returned to later in the tour', () => {
    expect(formatDayLabel([1,2,3,8])).toBe('1\u20133, 8');
  });
  it('is unfazed by unsorted, duplicated or empty input', () => {
    expect(formatDayLabel([3,1,2,2])).toBe('1\u20133');
    expect(formatDayLabel([])).toBe('');
    expect(formatDayLabel(undefined)).toBe('');
  });
});

describe('country labelling follows scale, and never names the home country', () => {
  const stops = [
    { name:'Bodhgaya', lon:84.99, lat:24.70, country:'India' },
    { name:'Varanasi', lon:82.97, lat:25.32, country:'India' },
    { name:'Lumbini', lon:83.28, lat:27.47, country:'Nepal' },
  ];
  it('suppresses the country holding most of the stops -- labelling it tells the reader nothing', () => {
    const svg = buildRouteMapSVG({ stops, sectors: [], countries: [{ name:'India', lon:83.5, lat:25.5 }] });
    expect(svg).not.toContain('>INDIA<');
  });
  it('still names a country the itinerary crosses into, which is real information', () => {
    const svg = buildRouteMapSVG({ stops, sectors: [], countries: [{ name:'Nepal', lon:83.6, lat:27.2 }] });
    expect(svg).toContain('>NEPAL<');
  });
});

describe('sector table is generated from the same data as the map', () => {
  it('lists every sector with its distance and time', () => {
    const html = buildSectorTableHTML(sectors);
    expect(html).toContain('Bodhgaya – Kushinagar');
    expect(html).toContain('365 km · 9 hrs');
  });

  it('carries NO total row -- the stats strip is the single source for distance', () => {
    // The table total and the stats figure disagreed in real output (1,217 vs
    // 1,105), which leaves the reader with two numbers for one fact. The
    // table lists sectors; the stats strip owns the total.
    const html = buildSectorTableHTML(sectors);
    expect(html.toLowerCase()).not.toContain('total');
    expect(html).toContain('365 km · 9 hrs');
  });

  it('lists every day, including days with no road leg', () => {
    const html = buildSectorTableHTML(
      [{ from:'Bodhgaya', to:'Rajgir', distance:'70 km', time:'2 hrs', day:3 }],
      undefined,
      [{ title:'Arrival at Bodhgaya' }, { title:'Bodhgaya sightseeing' }, { title:'Rajgir' }],
    );
    // A table headed "Day" that silently skips days 1 and 2 reads as a
    // document with holes in it.
    expect(html).toContain('>01<');
    expect(html).toContain('>02<');
    expect(html).toContain('Arrival at Bodhgaya');
  });

  it('groups a break journey under one day number rather than as unrelated rows', () => {
    const html = buildSectorTableHTML([
      { from:'Bodhgaya', to:'Vaishali', distance:'150 km', time:'4 hrs', day:4 },
      { from:'Vaishali', to:'Kushinagar', distance:'215 km', time:'5 hrs', day:4 },
      { from:'Kushinagar', to:'Lumbini', distance:'185 km', time:'5 hrs', day:5 },
    ]);
    // Day numbers are zero-padded now that the table lists every day.
    expect((html.match(/>04</g) || []).length).toBe(1);
    expect(html).toContain('Bodhgaya – Vaishali');
    expect(html).toContain('Vaishali – Kushinagar');
  });

  it('renders nothing at all when there are no sectors', () => {
    expect(buildSectorTableHTML([])).toBe('');
  });
});

describe('gateways are decided by ROLE, not distance', () => {
  const intl = [
    { name:'Bangkok',  lon:100.50, lat:13.75 },
    { name:'Bodhgaya', lon:84.99,  lat:24.70, days:[1,2,3] },
    { name:'Varanasi', lon:82.97,  lat:25.32, days:[7,8,9] },
  ];
  const intlSecs = [
    { from:'Bangkok',  to:'Bodhgaya', mode:'flight', flightNo:'TG-327', day:1 },
    { from:'Bodhgaya', to:'Varanasi', distance:'255 km' },
    { from:'Varanasi', to:'Bangkok',  mode:'flight', flightNo:'IX-345', day:9 },
  ];

  it('treats the city flown in from and back to as context, not a stop', () => {
    const { ground, gateways } = partitionGateways(intl, intlSecs);
    expect(ground.map(s => s.name)).toEqual(['Bodhgaya', 'Varanasi']);
    expect(gateways.map(g => g.kind)).toEqual(['arrival', 'departure']);
  });

  it('keeps a domestic flight between two visited places ON the map', () => {
    // Delhi-Leh is part of the service and both ends are real destinations,
    // so neither may be demoted to context however far apart they are.
    const stops = [
      { name:'Delhi', lon:77.2, lat:28.6, days:[1,7] },
      { name:'Leh',   lon:77.6, lat:34.2, days:[2,3,4] },
      { name:'Agra',  lon:78.0, lat:27.2, days:[5,6] },
    ];
    const secs = [
      { from:'Delhi', to:'Leh',   mode:'flight', flightNo:'AI-445' },
      { from:'Leh',   to:'Agra',  mode:'flight' },
      { from:'Agra',  to:'Delhi', distance:'230 km' },
    ];
    const { ground, gateways } = partitionGateways(stops, secs);
    expect(gateways).toEqual([]);
    expect(ground).toHaveLength(3);
  });

  it('uses nights as the deciding signal, so a tour starting in Delhi keeps Delhi', () => {
    // Delhi sits at both ends here, exactly like Bangkok -- but the group
    // sleeps there, which makes it part of the tour.
    const stops = [{ name:'Delhi', lon:77.2, lat:28.6, days:[1] }, { name:'Leh', lon:77.6, lat:34.2, days:[2,3] }];
    const secs = [{ from:'Delhi', to:'Leh', mode:'flight' }, { from:'Leh', to:'Delhi', mode:'flight' }];
    expect(partitionGateways(stops, secs).gateways).toEqual([]);
  });

  it('does not demote a place the group drives in from -- that is still touring', () => {
    const stops = [{ name:'Kathmandu', lon:85.3, lat:27.7 }, { name:'Pokhara', lon:83.9, lat:28.2, days:[2] }];
    const secs = [{ from:'Kathmandu', to:'Pokhara', distance:'200 km' }];
    expect(partitionGateways(stops, secs).gateways).toEqual([]);
  });

  it('draws no gateway geography at all -- the note carries it instead', () => {
    const svg = buildRouteMapSVG({ stops: intl, sectors: intlSecs });
    expect(svg).not.toContain('Bangkok');
    expect(svg).not.toContain('<polygon');
  });

  it('states arrival and departure as a line of text, with flight and day', () => {
    const { gateways } = partitionGateways(intl, intlSecs);
    const note = gatewayNoteHTML(gateways);
    expect(note).toContain('Arrival');
    expect(note).toContain('Bangkok');
    expect(note).toContain('TG-327');
    expect(note).toContain('Departure');
    expect(note).toContain('IX-345');
  });

  it('still states the leg when no flight number is known -- an enquiry often has only "Hong Kong - Delhi"', () => {
    const stops = [{ name:'Hong Kong', lon:114.2, lat:22.3 }, { name:'Delhi', lon:77.2, lat:28.6, days:[1] }];
    const secs = [{ from:'Hong Kong', to:'Delhi', mode:'flight', day:1 }];
    const note = gatewayNoteHTML(partitionGateways(stops, secs).gateways);
    expect(note).toContain('Hong Kong');
    expect(note).toContain('Delhi');
    expect(note).toContain('Day 1');
  });

  it('renders nothing when there are no gateways', () => {
    expect(gatewayNoteHTML([])).toBe('');
  });
});

describe('a loop tour must not lose the place it starts and ends at', () => {
  it('keeps Bodhgaya when the tour begins and ends there', () => {
    // Structurally identical to a Bangkok gateway -- appears only at both
    // ends -- so nights are what separate them.
    const stops = [
      { name:'Bodhgaya', lon:84.99, lat:24.70, days:[1,2,9] },
      { name:'Lumbini',  lon:83.28, lat:27.47, days:[4,5] },
    ];
    const secs = [
      { from:'Bodhgaya', to:'Lumbini',  mode:'flight' },
      { from:'Lumbini',  to:'Bodhgaya', distance:'400 km' },
    ];
    expect(partitionGateways(stops, secs).gateways).toEqual([]);
  });

  it('makes no demotion at all when no night data exists to judge by', () => {
    // Dropping a real destination is far worse than drawing an origin, so
    // absent data means everything stays on the map.
    const stops = [{ name:'A', lon:80, lat:25 }, { name:'B', lon:82, lat:26 }];
    const secs = [{ from:'A', to:'B', mode:'flight' }, { from:'B', to:'A', mode:'flight' }];
    expect(partitionGateways(stops, secs).gateways).toEqual([]);
  });
});

describe('buildMapDataFromResolvedDays: the itinerary\u2019s own places become map data', () => {
  const place = (name, lat, lon, country) => ({ name, lat, lon, country });

  it('one stop per distinct place, with every day it covers', () => {
    const days = [
      { place: place('Bodhgaya', 24.7, 85.0, 'India'), items: [] },
      { place: place('Bodhgaya', 24.7, 85.0, 'India'), items: [] },
      { place: place('Varanasi', 25.3, 83.0, 'India'), items: [] },
    ];
    const { stops } = buildMapDataFromResolvedDays(days);
    expect(stops.map(s => s.name)).toEqual(['Bodhgaya', 'Varanasi']);
    expect(stops[0].days).toEqual([1, 2]);
    expect(stops[1].days).toEqual([3]);
  });

  it('adds a return visit to the same stop\u2019s day list rather than duplicating it', () => {
    const days = [
      { place: place('Bodhgaya', 24.7, 85.0), items: [] },
      { place: place('Lumbini', 27.5, 83.3), items: [] },
      { place: place('Bodhgaya', 24.7, 85.0), items: [] },
    ];
    const { stops } = buildMapDataFromResolvedDays(days);
    expect(stops).toHaveLength(2);
    expect(stops.find(s => s.name === 'Bodhgaya').days).toEqual([1, 3]);
  });

  it('emits a sector for every day the place changes', () => {
    const days = [
      { place: place('Bodhgaya', 24.7, 85.0), items: [] },
      { place: place('Varanasi', 25.3, 83.0), items: [{ id:'r', type:'route', text:'Bodhgaya - Varanasi', distance:'255 km', time:'6 hrs' }] },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors).toEqual([{ from:'Bodhgaya', to:'Varanasi', day:2, mode:'road', distance:'255 km', time:'6 hrs' }]);
  });

  it('marks a sector as a flight when the day carries a transport item', () => {
    const days = [
      { place: place('Bangkok', 13.75, 100.5), items: [] },
      { place: place('Bodhgaya', 24.7, 85.0), items: [{ id:'t', type:'transport', text:'TG-327' }] },
    ];
    expect(buildMapDataFromResolvedDays(days).sectors[0].mode).toBe('flight');
  });

  it('skips a day with no resolved place, without breaking the chain around it', () => {
    const days = [
      { place: place('Bodhgaya', 24.7, 85.0), items: [] },
      { place: null, items: [] },
      { place: place('Varanasi', 25.3, 83.0), items: [] },
    ];
    const { stops, sectors } = buildMapDataFromResolvedDays(days);
    expect(stops.map(s => s.name)).toEqual(['Bodhgaya', 'Varanasi']);
    // No day 2 place, so there is nothing to draw a sector to/from -- an
    // unresolved day breaks the chain rather than silently joining across it.
    expect(sectors).toEqual([]);
  });

  it('produces no sectors when consecutive days share the same place', () => {
    const days = [{ place: place('Bodhgaya', 24.7, 85.0), items: [] }, { place: place('Bodhgaya', 24.7, 85.0), items: [] }];
    expect(buildMapDataFromResolvedDays(days).sectors).toEqual([]);
  });

  it('handles no days and no places without throwing', () => {
    expect(buildMapDataFromResolvedDays([])).toEqual({ stops: [], sectors: [] });
    expect(buildMapDataFromResolvedDays([{ items: [] }, { place: null, items: [] }])).toEqual({ stops: [], sectors: [] });
    expect(buildMapDataFromResolvedDays(undefined)).toEqual({ stops: [], sectors: [] });
  });

  it('feeds straight into the real map builders without adaptation', () => {
    const days = [
      { place: place('Bodhgaya', 24.696, 84.991, 'India'), items: [] },
      { place: place('Varanasi', 25.318, 82.974, 'India'), items: [{ id:'r', type:'route', text:'x', distance:'255 km', time:'6 hrs' }] },
    ];
    const { stops, sectors } = buildMapDataFromResolvedDays(days);
    const svg = buildRouteMapSVG({ stops, sectors });
    expect(svg).toContain('Bodhgaya');
    expect(svg).toContain('Varanasi');
    const table = buildSectorTableHTML(sectors, undefined, days.map(d => ({ title: d.place && d.place.name })));
    expect(table).toContain('255 km');
  });
});
