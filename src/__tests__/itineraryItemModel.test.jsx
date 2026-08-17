import { describe, it, expect } from 'vitest';
import {
  ITINERARY_ITEM_TYPES, addableItemTypes, newItineraryItem, NOTABLE_ITEM_TYPES,
  migrateItineraryDay, migrateItineraryDays, reorderItems, itineraryItemHTML,
  itemTextForFlavor, withItemTextForFlavor, itemNoteForFlavor, withItemNoteForFlavor, ICON_PATHS,
} from '../lib/utils.js';

describe('itinerary item model', () => {
  it('offers route, sightseeing, transport, stay and remarks -- description is no longer a selectable type', () => {
    // Description used to be its own type: a plain, unlabelled line that
    // was indistinguishable enough from an unlabelled Route line to get
    // picked by mistake for what was meant as a second movement (confirmed
    // against a real export where exactly that happened). It is now an
    // optional note attached to whichever item it is actually about
    // (itemNoteForFlavor), not a fifth kind of event in the day.
    const all = ['route', 'sightseeing', 'transport', 'stay', 'remarks'];
    expect(addableItemTypes().map(t => t.id)).toEqual(all);
  });

  it('gives every new item a unique id, so reordering and React keys stay stable', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newItineraryItem('route').id));
    expect(ids.size).toBe(50);
  });

  it('supports the exact day-1 sequence from a real report: route, sight, sight, route, flight, stay', () => {
    const day = { id: 1, dayLabel: 'DAY-1', items: [
      { id:'a', type:'route' }, { id:'b', type:'sightseeing' }, { id:'c', type:'sightseeing' },
      { id:'d', type:'route' }, { id:'e', type:'transport' }, { id:'f', type:'stay' },
    ]};
    expect(day.items.map(i => i.type)).toEqual(['route','sightseeing','sightseeing','route','transport','stay']);
    // and it survives migration untouched, because it is already converted
    expect(migrateItineraryDay(day)).toBe(day);
  });
});

describe('migration from the legacy fixed-field day', () => {
  it('converts route + distance + time into a single route item', () => {
    const out = migrateItineraryDay({ id:1, dayLabel:'DAY-1', route:'Delhi - Agra', distance:'210 km', time:'4 hrs', meals:['B'], description:'', hotel:'' });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ type:'route', text:'Delhi - Agra', distance:'210 km', time:'4 hrs' });
  });

  it('preserves order: route, then legacy description as remarks, then overnight stay', () => {
    // day.description was always free text for the whole day -- exactly
    // what a remarks item is now, so that is where it lands.
    const out = migrateItineraryDay({ id:1, route:'A - B', description:'Some detail', hotel:'Hotel X' });
    expect(out.items.map(i => i.type)).toEqual(['route', 'remarks', 'stay']);
    expect(out.items[1].text).toBe('Some detail');
    expect(out.items[2].text).toBe('Hotel X');
  });

  it('does not invent items for empty legacy fields -- which is what makes 1.10 free', () => {
    const out = migrateItineraryDay({ id:1, dayLabel:'DAY-2', route:'', distance:'', time:'', description:'', hotel:'', meals:['B','L'] });
    expect(out.items).toEqual([]);
    expect(out.meals).toEqual(['B','L']);
  });

  it('keeps a day that has distance/time but no route text -- real information, must not vanish', () => {
    const out = migrateItineraryDay({ id:1, route:'', distance:'90 km', time:'3 hrs' });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ type:'route', distance:'90 km', time:'3 hrs' });
  });

  it('drops the legacy fields so a migrated day has exactly one source of truth', () => {
    const out = migrateItineraryDay({ id:1, route:'A', distance:'1', time:'2', description:'d', hotel:'h', dayLabel:'DAY-1', title:'T', meals:['B'] });
    for (const k of ['route','distance','time','description','hotel']) {
      expect(out, `legacy field ${k} still present`).not.toHaveProperty(k);
    }
    expect(out).toMatchObject({ dayLabel:'DAY-1', title:'T', meals:['B'] });
  });

  it('is idempotent -- migrating an already-migrated day changes nothing', () => {
    const once = migrateItineraryDay({ id:1, route:'A - B', hotel:'H' });
    expect(migrateItineraryDay(once)).toBe(once);
  });

  it('migrates a whole list and tolerates empty/undefined input', () => {
    expect(migrateItineraryDays(undefined)).toEqual([]);
    expect(migrateItineraryDays([{ route:'A' }, { hotel:'H' }]).map(d => d.items.length)).toEqual([1, 1]);
  });
});

describe('reordering', () => {
  const list = [{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  it('moves an item down and up correctly', () => {
    expect(reorderItems(list, 0, 2).map(i=>i.id)).toEqual(['b','c','a','d']);
    expect(reorderItems(list, 3, 1).map(i=>i.id)).toEqual(['a','d','b','c']);
  });
  it('never mutates the original list', () => {
    reorderItems(list, 0, 3);
    expect(list.map(i=>i.id)).toEqual(['a','b','c','d']);
  });
  it('returns the list unchanged for no-op or out-of-range moves', () => {
    expect(reorderItems(list, 1, 1)).toBe(list);
    expect(reorderItems(list, -1, 2)).toBe(list);
    expect(reorderItems(list, 0, 99)).toBe(list);
  });
});

describe('item rendering for export', () => {
  it('renders each type distinctly', () => {
    expect(itineraryItemHTML({ type:'route', text:'Delhi - Agra', distance:'210 km', time:'4 hrs' })).toContain('210 km / 4 hrs');
    expect(itineraryItemHTML({ type:'sightseeing', text:'Taj Mahal' })).toContain('Taj Mahal');
    expect(itineraryItemHTML({ type:'transport', text:'6E 2134' })).toContain('6E 2134');
    expect(itineraryItemHTML({ type:'stay', text:'Hotel X' })).toContain('Hotel X');
    expect(itineraryItemHTML({ type:'remarks', text:'Line 1\nLine 2' })).toContain('white-space:pre-wrap');
  });

  it('never puts an emoji icon into the printed/exported HTML -- that is editor-only decoration', () => {
    // Regression: sightseeing/transport/stay used to hard-code an icon
    // (a location pin, a plane, a hotel) directly into this string, which
    // is what gets printed onto the letterhead. ITINERARY_ITEM_TYPES still
    // carries icons for the app's own Add Item menu; that is a different,
    // in-app-only usage and is untouched by this.
    const emoji = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;
    const html = ['route', 'sightseeing', 'transport', 'stay', 'remarks']
      .map(type => itineraryItemHTML({ type, text: 'X', distance: 'd', time: 't' }))
      .join('');
    expect(emoji.test(html)).toBe(false);
  });

  it('1.10: an item with no content renders nothing at all, not an empty row', () => {
    for (const type of ['route','sightseeing','transport','stay','description']) {
      expect(itineraryItemHTML({ type, text:'' }), type).toBe('');
    }
    expect(itineraryItemHTML(null)).toBe('');
  });

  it('renders a route that has only distance/time, since that is still real information', () => {
    expect(itineraryItemHTML({ type:'route', text:'', distance:'90 km', time:'3 hrs' })).toContain('90 km / 3 hrs');
  });
});

describe('legacy Detailed `transports` rows (follow-up: the item model removed the block without converting them)', () => {
  const row = { type:'Flight', number:'6E 2134', from:'DEL', to:'VNS', time:'09:45' };

  it('converts each transport row into a transport item', () => {
    const out = migrateItineraryDay({ id:1, transports:[row] });
    expect(out.items.map(i=>i.type)).toEqual(['transport']);
    expect(out.items[0].text).toBe('Flight 6E 2134 — DEL / VNS at 09:45');
  });

  it('places transports after movement and before the overnight stay', () => {
    const out = migrateItineraryDay({ id:1, route:'A - B', transports:[row], hotel:'Hotel X' });
    expect(out.items.map(i=>i.type)).toEqual(['route','transport','stay']);
  });

  it('drops the legacy key so the day keeps a single source of truth', () => {
    const out = migrateItineraryDay({ id:1, transports:[row] });
    expect(out).not.toHaveProperty('transports');
  });

  it('composes readable text from partial rows rather than emitting stray separators', () => {
    expect(migrateItineraryDay({ transports:[{ type:'Train', number:'', from:'Delhi', to:'Agra', time:'' }] }).items[0].text)
      .toBe('Train — Delhi / Agra');
    expect(migrateItineraryDay({ transports:[{ type:'', number:'AI 101', from:'', to:'', time:'18:00' }] }).items[0].text)
      .toBe('AI 101 at 18:00');
  });

  it('skips rows that carry no information at all', () => {
    const out = migrateItineraryDay({ id:1, transports:[{ type:'', number:'', from:'', to:'', time:'' }] });
    expect(out.items).toEqual([]);
  });

  it('also rescues a day that was already migrated but kept an orphaned transports array', () => {
    // Anyone who opened and saved a Detailed itinerary between the item model
    // shipping and this fix has exactly this shape on disk.
    const alreadyMigrated = { id:1, items:[
      { id:'a', type:'route', text:'A - B' },
      { id:'b', type:'stay', text:'Hotel X' },
    ], transports:[row] };
    const out = migrateItineraryDay(alreadyMigrated);
    expect(out.items.map(i=>i.type)).toEqual(['route','transport','stay']);
    expect(out).not.toHaveProperty('transports');
  });

  it('appends to the end when a migrated day has no trailing stay', () => {
    const out = migrateItineraryDay({ id:1, items:[{ id:'a', type:'route' }], transports:[row] });
    expect(out.items.map(i=>i.type)).toEqual(['route','transport']);
  });

  it('still short-circuits a migrated day with no legacy transports', () => {
    const day = { id:1, items:[{ id:'a', type:'route' }] };
    expect(migrateItineraryDay(day)).toBe(day);
    const emptyArr = { id:2, items:[], transports:[] };
    expect(migrateItineraryDay(emptyArr)).toBe(emptyArr);
  });
});

describe('item text is always shared across flavors -- only the attached NOTE forks', () => {
  it('every item type shares the same main text regardless of flavor', () => {
    for (const type of ['route', 'sightseeing', 'transport', 'stay', 'remarks']) {
      const item = { id:'x', type, text:'Shared content' };
      expect(itemTextForFlavor(item, 'brief')).toBe('Shared content');
      expect(itemTextForFlavor(item, 'detailed')).toBe('Shared content');
    }
  });

  it('writing text never touches the item\u2019s note, regardless of flavor', () => {
    const item = { id:'x', type:'sightseeing', text:'Taj Mahal', note:'Built 1653' };
    const updated = withItemTextForFlavor(item, 'detailed', 'Taj Mahal, Agra');
    expect(updated.text).toBe('Taj Mahal, Agra');
    expect(updated.note).toBe('Built 1653');
  });
});

describe('the attached NOTE on a notable item is independent per flavor (moved here from the old description-as-a-type design)', () => {
  it('Brief always reads/writes item.note, never detailedNote', () => {
    const item = { id:'d1', type:'sightseeing', text:'Taj Mahal', note:'Brief note', detailedNote:'Longer detailed note' };
    expect(itemNoteForFlavor(item, 'brief')).toBe('Brief note');
    const updated = withItemNoteForFlavor(item, 'brief', 'New brief note');
    expect(updated.note).toBe('New brief note');
    expect(updated.detailedNote).toBe('Longer detailed note'); // untouched
  });

  it('Detailed falls back to Brief\u2019s note until it has its own -- "detailed takes what brief offers"', () => {
    const item = { id:'d1', type:'stay', text:'Hotel X', note:'Brief note' };
    expect(itemNoteForFlavor(item, 'detailed')).toBe('Brief note');
  });

  it('once Detailed has its own note, it no longer reads Brief\u2019s -- "not vice versa"', () => {
    const item = { id:'d1', type:'route', text:'A - B', note:'Brief note', detailedNote:'Its own detailed note' };
    expect(itemNoteForFlavor(item, 'detailed')).toBe('Its own detailed note');
    const updated = withItemNoteForFlavor(item, 'detailed', 'Changed detailed note');
    expect(updated.detailedNote).toBe('Changed detailed note');
    expect(updated.note).toBe('Brief note'); // Brief's own note is never altered by Detailed edits
  });

  it('works the same way for every notable type -- route, sightseeing, transport, stay', () => {
    for (const type of ['route', 'sightseeing', 'transport', 'stay']) {
      const item = { id:'x', type, text:'X', note:'Brief note' };
      expect(itemNoteForFlavor(item, 'detailed')).toBe('Brief note');
      expect(NOTABLE_ITEM_TYPES.has(type)).toBe(true);
    }
  });

  it('remarks is not itself notable -- a note on a note would just be more of the same field', () => {
    expect(NOTABLE_ITEM_TYPES.has('remarks')).toBe(false);
  });
});

describe('transport items distinguish flight from train explicitly', () => {
  it('defaults new transport items to flight', () => {
    expect(newItineraryItem('transport').mode).toBe('flight');
  });

  it('the export uses a different icon for each mode -- flight and train no longer share one glyph', () => {
    const flight = itineraryItemHTML({ type:'transport', text:'6E 2134', mode:'flight' });
    const train = itineraryItemHTML({ type:'transport', text:'12345', mode:'train' });
    // The SVG path data itself differs between the two -- checked via a
    // distinguishing element each icon's path set alone contains.
    expect(flight).toContain('polygon');   // the plane glyph
    expect(train).toContain('<rect');      // the train glyph
    expect(flight).not.toContain('<rect');
    expect(train).not.toContain('polygon');
  });

  it('shows arrival and departure clock times when given, distinct from route\u2019s travel-time meta', () => {
    const html = itineraryItemHTML({ type:'transport', text:'6E 2134', mode:'flight', depTime:'14:30', arrTime:'16:10' });
    expect(html).toContain('Dep 14:30');
    expect(html).toContain('Arr 16:10');
  });

  it('renders fine with no times given at all', () => {
    expect(() => itineraryItemHTML({ type:'transport', text:'6E 2134', mode:'flight' })).not.toThrow();
  });

  it('an old item with no mode at all still renders (defaults to Flight in the export, not a crash)', () => {
    expect(() => itineraryItemHTML({ type:'transport', text:'Old data, no mode field' })).not.toThrow();
  });
});

describe('remarks item type', () => {
  it('has no icon in the editor -- the word "Remarks" is the label there', () => {
    expect(ITINERARY_ITEM_TYPES.find(t => t.id === 'remarks').icon).toBeNull();
  });

  it('renders in the export with a pencil icon, whitespace preserved for multi-line notes', () => {
    const html = itineraryItemHTML({ type:'remarks', text:'Line one\nLine two' });
    expect(html).toContain('<svg');
    expect(html).toContain('white-space:pre-wrap');
  });
});

describe('export marks: minimal monochrome icons, not emoji, and every structural type at equal visual weight', () => {
  it('route, sightseeing, transport and stay all render at the same font-size and without <strong> -- no type reads as more important than another', () => {
    const route = itineraryItemHTML({ type:'route', text:'A - B' });
    const sight = itineraryItemHTML({ type:'sightseeing', text:'Temple' });
    const transport = itineraryItemHTML({ type:'transport', text:'6E 2134' });
    const stay = itineraryItemHTML({ type:'stay', text:'Hotel X' });
    for (const html of [route, sight, transport, stay]) {
      expect(html).toContain('font-size:9.5pt');
      expect(html).not.toContain('<strong>');
    }
  });

  it('sightseeing, stay and transport each carry a distinguishing icon', () => {
    expect(itineraryItemHTML({ type:'sightseeing', text:'Temple' })).toContain('<svg');
    expect(itineraryItemHTML({ type:'stay', text:'Hotel X' })).toContain('<svg');
    expect(itineraryItemHTML({ type:'transport', text:'X', mode:'flight' })).toContain('<svg');
  });

  it('no emoji anywhere in any export line', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;
    const html = ['sightseeing','transport','stay','remarks'].map(type =>
      itineraryItemHTML({ type, text:'X', mode:'train' })).join('');
    expect(emoji.test(html)).toBe(false);
  });
});

describe('attached notes render as an indented sub-line under their parent item', () => {
  it('a note appears smaller and indented beneath the item it belongs to', () => {
    const html = itineraryItemHTML({ type:'sightseeing', text:'Mahabodhi Temple', note:'A UNESCO World Heritage Site.' });
    expect(html).toContain('Mahabodhi Temple');
    const noteIdx = html.indexOf('A UNESCO World Heritage Site.');
    expect(noteIdx).toBeGreaterThan(html.indexOf('Mahabodhi Temple'));
    expect(html).toContain('margin:1pt 0 3pt 14.5pt');
  });

  it('no note line at all when the item has none', () => {
    const html = itineraryItemHTML({ type:'sightseeing', text:'Temple' });
    expect(html).not.toContain('margin:1pt 0 3pt 14.5pt');
  });

  it('works on every notable type', () => {
    for (const type of ['route', 'sightseeing', 'transport', 'stay']) {
      const html = itineraryItemHTML({ type, text:'X', mode:'flight', note:'A note about this.' });
      expect(html).toContain('A note about this.');
    }
  });
});

describe('regression: a second movement can no longer be mistaken for a Description item, because Description no longer exists as a type', () => {
  it('addableItemTypes has no description entry to pick by mistake', () => {
    expect(addableItemTypes().map(t => t.id)).not.toContain('description');
  });

  it('a legacy saved item of type description migrates into remarks rather than rendering as an unhandled type', () => {
    const day = { id:1, items:[
      { id:'a', type:'route', text:'BKK-CCU-PAT-GAY' },
      { id:'b', type:'description', text:'this is also movement' },
    ]};
    const migrated = migrateItineraryDay(day);
    expect(migrated.items[1].type).toBe('remarks');
    expect(migrated.items[1].text).toBe('this is also movement');
  });
});

describe('icon redesign: bed replaces moon, a geometric flight silhouette replaces the paper-airplane dart', () => {
  it('the stay type now points at "bed", not "moon"', () => {
    expect(ITINERARY_ITEM_TYPES.find(t => t.id === 'stay').icon).toBe('bed');
  });

  it('there is no "moon" key left in the icon set at all', () => {
    expect(ICON_PATHS.moon).toBeUndefined();
    expect(ICON_PATHS.bed).toBeTruthy();
  });

  it('a stay item\u2019s export renders the bed icon\u2019s geometry, not the old moon path', () => {
    const html = itineraryItemHTML({ type: 'stay', text: 'Hotel X' });
    expect(html).toContain(ICON_PATHS.bed);
    expect(html).not.toContain('M20.5 13.7'); // the old crescent-moon path
  });

  it('the flight icon no longer uses the old dart/send-icon polygon', () => {
    const html = itineraryItemHTML({ type: 'transport', text: '6E 2134', mode: 'flight' });
    // Old shape's distinguishing polygon point set -- confirms it is gone,
    // not just that *a* polygon exists.
    expect(html).not.toContain('20 3 14 20 10.5 12.5 3 9 20 3');
    expect(html).toContain(ICON_PATHS.plane);
  });
});

describe('regression: Brief\u2019s icons reverted to the original muted grey per direct instruction; Detailed keeps the brand red', () => {
  // The red-for-every-icon change was itself a direct request, applied to
  // both flavors -- then reversed for Brief specifically, keeping Detailed
  // as it was. Every type needs checking in both directions since row()
  // and the remarks case both branch on flavor independently.
  const types = [
    { type: 'route', text: 'A - B', distance: '10 km' },
    { type: 'transport', text: '6E 2134', mode: 'flight' },
    { type: 'stay', text: 'Hotel X' },
    { type: 'remarks', text: 'A note.' },
  ];

  types.forEach(item => {
    it(`${item.type} icon: grey in Brief, red in Detailed`, () => {
      const brief = itineraryItemHTML(item, 'brief');
      const detailed = itineraryItemHTML(item, 'detailed');
      expect(brief).toContain('stroke="#6B7280"');
      expect(brief).not.toContain('stroke="#8B0000"');
      expect(detailed).toContain('stroke="#8B0000"');
      expect(detailed).not.toContain('stroke="#6B7280"');
    });
  });

  it('defaults to Brief\u2019s grey when no flavor is passed at all', () => {
    const html = itineraryItemHTML({ type: 'sightseeing', text: 'A Temple' });
    expect(html).toContain('stroke="#6B7280"');
  });
});

describe('regression: remarks icon is now an info glyph, not a pencil -- a remark is a note, not something being edited', () => {
  it('renders the info-style circle/stem/dot geometry, not the old pencil path', () => {
    const html = itineraryItemHTML({ type: 'remarks', text: 'A note.' });
    expect(html).not.toContain('M11 20H4V-7'); // old pencil shape, distinctive segment
    expect(html).toContain(ICON_PATHS.pencil);
  });

  it('the icon key is still called "pencil" internally -- only its geometry changed, not its identity elsewhere in the codebase', () => {
    expect(ICON_PATHS.pencil).toContain('circle');
    expect(ICON_PATHS.pencil).toContain('cx="12" cy="7.5"'); // the info dot
  });
});
