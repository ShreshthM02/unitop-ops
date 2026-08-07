import { describe, it, expect, vi } from 'vitest';
import { fetchPlaceCandidates, searchGazetteerDb } from '../lib/gazetteerQuery.js';

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    from: (table) => {
      const rec = { table, filters: [], order: null, limitN: null };
      calls.push(rec);
      const builder = {
        select: (cols) => { rec.select = cols; return builder; },
        or: (expr) => { rec.filters.push(['or', expr]); return builder; },
        ilike: (col, val) => { rec.filters.push(['ilike', col, val]); return builder; },
        eq: (col, val) => { rec.filters.push(['eq', col, val]); return builder; },
        order: (col, opts) => { rec.order = [col, opts]; return builder; },
        limit: (n) => { rec.limitN = n; return { then: (res) => res({ data: rows, error: null }) }; },
      };
      return builder;
    },
  };
}

describe('fetchPlaceCandidates: candidates for resolvePlace(), not a full scan', () => {
  it('queries by both the raw term and its canonical alias', async () => {
    const db = fakeDb([{ name: 'Varanasi', lat: 25.3, lon: 83.0, country: 'India', admin1: 'UP', population: 1200000, alt_names: ['Benares'] }]);
    const out = await fetchPlaceCandidates(db, 'Benares');
    const rec = db.calls[0];
    const orFilter = rec.filters.find(f => f[0] === 'or');
    expect(orFilter[1]).toContain('varanasi'); // canonical alias reaches the query
    expect(out[0]).toMatchObject({ name: 'Varanasi', alt: ['Benares'] });
  });

  it('orders by population so the likeliest candidates come back first', async () => {
    const db = fakeDb([]);
    await fetchPlaceCandidates(db, 'Aurangabad');
    expect(db.calls[0].order).toEqual(['population', { ascending: false }]);
  });

  it('returns nothing for an empty query rather than issuing a wasted request', async () => {
    const db = fakeDb([]);
    expect(await fetchPlaceCandidates(db, '')).toEqual([]);
    expect(db.calls.length).toBe(0);
  });

  it('degrades to an empty list on a DB error, never throwing', async () => {
    const db = { from: () => ({ select:()=>({ or:()=>({ order:()=>({ limit:()=>({ then:(res)=>res({data:null,error:{message:'x'}}) }) }) }) }) }) };
    expect(await fetchPlaceCandidates(db, 'Bodhgaya')).toEqual([]);
  });

  it('survives the db call throwing outright', async () => {
    const db = { from: () => { throw new Error('network down'); } };
    expect(await fetchPlaceCandidates(db, 'Bodhgaya')).toEqual([]);
  });
});

describe('searchGazetteerDb: typeahead', () => {
  it('does not query until the term is at least two characters', async () => {
    const db = fakeDb([]);
    expect(await searchGazetteerDb(db, 'a')).toEqual([]);
    expect(db.calls.length).toBe(0);
  });

  it('uses a prefix ilike on name', async () => {
    const db = fakeDb([]);
    await searchGazetteerDb(db, 'vara');
    const ilike = db.calls[0].filters.find(f => f[0] === 'ilike');
    expect(ilike[1]).toBe('name');
    expect(ilike[2]).toBe('vara*');
  });

  it('scopes to a country when one is given', async () => {
    const db = fakeDb([]);
    await searchGazetteerDb(db, 'lum', { country: 'Nepal' });
    expect(db.calls[0].filters.find(f => f[0] === 'eq')).toEqual(['eq', 'country', 'Nepal']);
  });
});
