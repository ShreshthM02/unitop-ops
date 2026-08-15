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

  it('marks a sector as a train when the transport item\u2019s own mode says so -- regression: this used to always show as flight regardless', () => {
    // Confirmed bug: mode was previously derived from whether ANY transport
    // item existed at all, never from that item's own mode field, so a
    // train-mode item on the map always rendered as a flight.
    const days = [
      { place: place('Delhi', 28.6, 77.2), items: [] },
      { place: place('Agra', 27.2, 78.0), items: [{ id:'t', type:'transport', text:'12345', mode:'train' }] },
    ];
    expect(buildMapDataFromResolvedDays(days).sectors[0].mode).toBe('train');
  });

  it('an old transport item with no mode field at all still defaults to flight, not a crash', () => {
    const days = [
      { place: place('Bangkok', 13.75, 100.5), items: [] },
      { place: place('Bodhgaya', 24.7, 85.0), items: [{ id:'t', type:'transport', text:'Old data' }] },
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

describe('multiple places per day: A -> B -> C within a single day', () => {
  const p = (name, lat, lon, extra = {}) => ({ name, lat, lon, ...extra });

  it('generates an intra-day sector for every consecutive pair of places', () => {
    const days = [{
      items: [],
      places: [p('Bodhgaya', 24.7, 85.0), p('Rajgir', 25.03, 85.42, { legMode: 'road' }), p('Nalanda', 25.14, 85.44, { legMode: 'road' })],
    }];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors).toEqual([
      { from: 'Bodhgaya', to: 'Rajgir', day: 1, mode: 'road', distance: '', time: '' },
      { from: 'Rajgir', to: 'Nalanda', day: 1, mode: 'road', distance: '', time: '' },
    ]);
  });

  it('tags every intra-day sector with the SAME day number -- this is what lets the sector table group them as one day', () => {
    const days = [{ items: [], places: [p('A', 1, 1), p('B', 2, 2, { legMode: 'road' }), p('C', 3, 3, { legMode: 'road' })] }];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors.every(s => s.day === 1)).toBe(true);
  });

  it('each leg carries its OWN explicit mode -- a day can mix road and flight legs', () => {
    const days = [{
      items: [],
      places: [p('Delhi', 28.6, 77.2), p('Agra', 27.2, 78.0, { legMode: 'road' }), p('Leh', 34.15, 77.58, { legMode: 'flight' })],
    }];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors[0].mode).toBe('road');
    expect(sectors[1].mode).toBe('flight');
  });

  it('falls back to the day-level transport-item inference when a leg has no explicit mode -- old-data compatible', () => {
    const days = [{
      items: [{ type: 'transport', text: '12345', mode: 'train' }],
      places: [p('A', 1, 1), p('B', 2, 2)], // no legMode set
    }];
    expect(buildMapDataFromResolvedDays(days).sectors[0].mode).toBe('train');
  });

  it('only the LAST place of a day is marked overnight -- earlier same-day stops are pass-through', () => {
    const days = [{ items: [], places: [p('Bodhgaya', 24.7, 85.0), p('Rajgir', 25.03, 85.42, { legMode: 'road' }), p('Nalanda', 25.14, 85.44, { legMode: 'road' })] }];
    const { stops } = buildMapDataFromResolvedDays(days);
    expect(stops.find(s => s.name === 'Bodhgaya').overnight).toBe(false);
    expect(stops.find(s => s.name === 'Rajgir').overnight).toBe(false);
    expect(stops.find(s => s.name === 'Nalanda').overnight).toBe(true);
  });

  it('a day trip that loops back to its own start still counts the day once, not twice, for that place', () => {
    // "Bodhgaya -> Rajgir -> Nalanda -> Bodhgaya" -- a same-day return.
    const days = [{
      items: [],
      places: [p('Bodhgaya', 24.7, 85.0), p('Rajgir', 25.03, 85.42, { legMode: 'road' }), p('Nalanda', 25.14, 85.44, { legMode: 'road' }), p('Bodhgaya', 24.7, 85.0, { legMode: 'road' })],
    }];
    const { stops, sectors } = buildMapDataFromResolvedDays(days);
    const bodhgaya = stops.find(s => s.name === 'Bodhgaya');
    expect(bodhgaya.days).toEqual([1]); // not [1, 1]
    expect(sectors).toHaveLength(3); // Bodhgaya-Rajgir, Rajgir-Nalanda, Nalanda-Bodhgaya
    // Returning to the start of the day still marks it overnight -- it IS
    // where the day actually ends.
    expect(bodhgaya.overnight).toBe(true);
  });

  it('the day AFTER a multi-stop day connects from that day\u2019s LAST place, not its first', () => {
    const days = [
      { items: [], places: [p('Bodhgaya', 24.7, 85.0), p('Rajgir', 25.03, 85.42, { legMode: 'road' }), p('Nalanda', 25.14, 85.44, { legMode: 'road' })] },
      { items: [{ type: 'transport', mode: 'flight' }], places: [p('Varanasi', 25.32, 82.97)] },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    const interDay = sectors.find(s => s.day === 2);
    expect(interDay).toMatchObject({ from: 'Nalanda', to: 'Varanasi' });
  });

  it('a day with an old-style singular place still works exactly as before -- no places array at all', () => {
    const days = [
      { items: [], place: p('Bodhgaya', 24.7, 85.0) },
      { items: [{ type: 'transport', mode: 'flight' }], place: p('Varanasi', 25.32, 82.97) },
    ];
    const { stops, sectors } = buildMapDataFromResolvedDays(days);
    expect(stops.map(s => s.name)).toEqual(['Bodhgaya', 'Varanasi']);
    expect(sectors[0]).toMatchObject({ from: 'Bodhgaya', to: 'Varanasi', mode: 'flight' });
    // Every single-place day trivially has that ONE place as its last --
    // so it is overnight, exactly the old implicit default behaviour.
    expect(stops[0].overnight).toBe(true);
    expect(stops[1].overnight).toBe(true);
  });

  it('a day mixing the old singular place with a later multi-place day still chains correctly', () => {
    const days = [
      { items: [], place: p('Delhi', 28.6, 77.2) },
      { items: [], places: [p('Delhi', 28.6, 77.2), p('Agra', 27.2, 78.0, { legMode: 'road' })] },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    // Same place both days -- no inter-day sector needed, only the
    // explicit intra-day Delhi->Agra leg on day 2.
    expect(sectors).toEqual([{ from: 'Delhi', to: 'Agra', day: 2, mode: 'road', distance: '', time: '' }]);
  });

  it('per-leg distance/time override the day-level route item when both are present', () => {
    const days = [{
      items: [{ type: 'route', text: 'x', distance: '999 km', time: '99 hrs' }],
      places: [p('A', 1, 1), p('B', 2, 2, { legMode: 'road', legDistance: '65 km', legTime: '1.5 hrs' })],
    }];
    expect(buildMapDataFromResolvedDays(days).sectors[0]).toMatchObject({ distance: '65 km', time: '1.5 hrs' });
  });

  it('handles an empty places array the same as no place at all', () => {
    const days = [{ items: [], places: [] }, { items: [], place: p('A', 1, 1) }];
    const { stops, sectors } = buildMapDataFromResolvedDays(days);
    expect(stops).toHaveLength(1);
    expect(sectors).toEqual([]);
  });
});

describe('regression: a day\u2019s fallback distance/time must not leak from one leg onto another', () => {
  const p = (name, lat, lon, extra = {}) => ({ name, lat, lon, ...extra });

  it('found by rendering an actual multi-stop itinerary: an inter-day leg with no explicit distance must NOT borrow a route item meant for a different, later leg the same day', () => {
    const days = [
      { items: [], places: [p('Bodhgaya', 24.7, 85.0), p('Nalanda', 25.14, 85.44, { legMode: 'road' })] },
      // Day 2: arrives from Nalanda (no explicit legDistance on Rajgir),
      // then has its OWN leg to Varanasi with an explicit 280km/6hrs. The
      // day's only route item ALSO says 280km/6hrs -- but that item
      // describes the Rajgir->Varanasi leg, not the Nalanda->Rajgir one.
      {
        items: [{ type: 'route', text: 'Rajgir - Varanasi', distance: '280 km', time: '6 hrs' }],
        places: [p('Rajgir', 25.03, 85.42), p('Varanasi', 25.32, 82.97, { legMode: 'road', legDistance: '280 km', legTime: '6 hrs' })],
      },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    const nalandaToRajgir = sectors.find(s => s.from === 'Nalanda' && s.to === 'Rajgir');
    const rajgirToVaranasi = sectors.find(s => s.from === 'Rajgir' && s.to === 'Varanasi');
    // The real bug: both of these showed "280 km / 6 hrs" before the fix,
    // because the fallback grabbed the day's one route item regardless of
    // which leg needed it.
    expect(nalandaToRajgir.distance).toBe('');
    expect(nalandaToRajgir.time).toBe('');
    expect(rajgirToVaranasi.distance).toBe('280 km');
    expect(rajgirToVaranasi.time).toBe('6 hrs');
  });

  it('the fallback still works exactly as before for a day with only one leg -- no ambiguity, no regression', () => {
    const days = [
      { items: [], place: p('Bodhgaya', 24.7, 85.0) },
      { items: [{ type: 'route', text: 'Bodhgaya - Varanasi', distance: '250 km', time: '5 hrs' }], place: p('Varanasi', 25.32, 82.97) },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors[0]).toMatchObject({ distance: '250 km', time: '5 hrs' });
  });

  it('a leg with its OWN explicit legDistance/legTime never uses the fallback at all, single-leg or not', () => {
    const days = [
      { items: [{ type: 'route', text: 'Wrong data', distance: '999 km', time: '99 hrs' }],
        place: p('A', 1, 1) },
      { items: [], place: p('B', 2, 2, { legDistance: '10 km', legTime: '20 min' }) },
    ];
    const { sectors } = buildMapDataFromResolvedDays(days);
    expect(sectors[0]).toMatchObject({ distance: '10 km', time: '20 min' });
  });
});
