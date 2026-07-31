import { describe, it, expect } from 'vitest';
import {
  ITINERARY_ITEM_TYPES, addableItemTypes, newItineraryItem,
  migrateItineraryDay, migrateItineraryDays, reorderItems, itineraryItemHTML,
} from '../lib/utils.js';

describe('itinerary item model', () => {
  it('offers the four requested types for Brief, plus Description only for Detailed', () => {
    const brief = addableItemTypes('brief').map(t => t.id);
    const detailed = addableItemTypes('detailed').map(t => t.id);
    expect(brief).toEqual(['route', 'sightseeing', 'transport', 'stay']);
    expect(detailed).toEqual(['route', 'sightseeing', 'transport', 'stay', 'description']);
  });

  it('gives every new item a unique id, so reordering and React keys stay stable', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newItineraryItem('route').id));
    expect(ids.size).toBe(50);
  });

  it('supports the exact day-1 sequence from the request: route, sight, sight, route, flight, stay', () => {
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

  it('preserves order: route, then description, then overnight stay', () => {
    const out = migrateItineraryDay({ id:1, route:'A - B', description:'Some detail', hotel:'Hotel X' });
    expect(out.items.map(i => i.type)).toEqual(['route', 'description', 'stay']);
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
    expect(itineraryItemHTML({ type:'description', text:'Line 1\nLine 2' })).toContain('white-space:pre-wrap');
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
