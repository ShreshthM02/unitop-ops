import { describe, it, expect } from 'vitest';
import { fetchPlaceCandidates, searchGazetteerDb } from '../lib/gazetteerQuery.js';

// A fake db with working search_gazetteer() and search_gazetteer_alt_names()
// RPCs -- the normal case once the SQL migration has been run. `fast` is
// what search_gazetteer (name/ascii_name, indexed) returns; `slow` is what
// search_gazetteer_alt_names (the alt_names fallback) returns.
function fakeDbWithRpc({ fast = [], slow = [] } = {}) {
  const rpcCalls = [];
  return {
    rpcCalls,
    from: () => { throw new Error('should not fall back to from() when rpc succeeds'); },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: fn === 'search_gazetteer_alt_names' ? slow : fast, error: null };
    },
  };
}

// A fake db with NEITHER RPC yet (fresh database, before the migration in
// gazetteerQuery.js's header has been run) -- rpc() comes back as an error,
// exactly like PostgREST does for an unknown function.
function fakeDbNoRpc(rows) {
  const calls = [];
  return {
    calls,
    rpc: async () => ({ data: null, error: { message: 'function does not exist' } }),
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

const rajgir = { name: 'Rājgīr', ascii_name: 'Rajgir', alt_names: ['Rajagriha', 'Rajgriha'], lat: 25.03, lon: 85.42, country: 'India', admin1: 'Bihar', population: 41587 };
const kushinagar = { name: 'Kasia', ascii_name: 'Kasia', alt_names: ['Kushinagar', 'Kushinara'], lat: 26.74, lon: 83.89, country: 'India', admin1: 'Uttar Pradesh', population: 22000 };

describe('fetchPlaceCandidates: fast search first, alt_names only as a fallback', () => {
  it('a name/ascii_name match returns from the fast search alone -- the slow function is never called', async () => {
    // Proven against a real EXPLAIN ANALYZE: OR-ing the alt_names unnest
    // check into one query forced a 10.6s sequential scan on every search,
    // Rajgir included, even though its own ascii_name matches trivially.
    // The fast path must never pay that cost for the common case.
    const db = fakeDbWithRpc({ fast: [rajgir] });
    const out = await fetchPlaceCandidates(db, 'Rajgir');
    expect(db.rpcCalls.map(c => c.fn)).toEqual(['search_gazetteer']);
    expect(out[0]).toMatchObject({ name: 'Rājgīr', population: 41587 });
  });

  it('falls back to the slow alt_names search only when the fast search finds nothing', async () => {
    // Kushinagar's GeoNames entry is canonically "Kasia" -- name and
    // ascii_name both fail, so this is exactly the case the slow fallback
    // exists for.
    const db = fakeDbWithRpc({ fast: [], slow: [kushinagar] });
    const out = await fetchPlaceCandidates(db, 'Kushinagar');
    expect(db.rpcCalls.map(c => c.fn)).toEqual(['search_gazetteer', 'search_gazetteer_alt_names']);
    expect(out[0]).toMatchObject({ name: 'Kasia', alt: ['Kushinagar', 'Kushinara'] });
  });

  it('a genuine no-match still returns empty after trying both, not an error', async () => {
    const db = fakeDbWithRpc({ fast: [], slow: [] });
    expect(await fetchPlaceCandidates(db, 'Atlantis')).toEqual([]);
    expect(db.rpcCalls.map(c => c.fn)).toEqual(['search_gazetteer', 'search_gazetteer_alt_names']);
  });

  it('degrades to just the fast (empty) result if the slow function is not yet installed', async () => {
    const db = {
      rpcCalls: [],
      rpc: async function (fn, params) {
        this.rpcCalls.push(fn);
        if (fn === 'search_gazetteer_alt_names') return { data: null, error: { message: 'does not exist' } };
        return { data: [], error: null };
      },
    };
    expect(await fetchPlaceCandidates(db, 'Somewhere')).toEqual([]);
  });

  it('falls back to the name-only filter when neither RPC is yet installed', async () => {
    const db = fakeDbNoRpc([{ name: 'Varanasi', lat: 25.3, lon: 83.0, country: 'India', admin1: 'UP', population: 1200000, alt_names: ['Benares'] }]);
    const out = await fetchPlaceCandidates(db, 'Benares');
    const rec = db.calls[0];
    const orFilter = rec.filters.find(f => f[0] === 'or');
    expect(orFilter[1]).toContain('varanasi'); // canonical alias still reaches the fallback query
    expect(out[0]).toMatchObject({ name: 'Varanasi' });
  });

  it('the client-side fallback also checks ascii_name, not just name -- GeoNames often records the canonical name with diacritics', async () => {
    const db = fakeDbNoRpc([]);
    await fetchPlaceCandidates(db, 'Rajgir');
    const orFilter = db.calls[0].filters.find(f => f[0] === 'or');
    expect(orFilter[1]).toContain('ascii_name.ilike.*rajgir*');
  });

  it('returns nothing for an empty query rather than issuing a wasted request', async () => {
    const db = fakeDbWithRpc({ fast: [] });
    expect(await fetchPlaceCandidates(db, '')).toEqual([]);
    expect(db.rpcCalls.length).toBe(0);
  });

  it('falls back rather than throwing when rpc() itself is missing on the db object', async () => {
    const db = fakeDbNoRpc([{ name: 'Bodhgaya', lat: 24.7, lon: 85.0, country: 'India', admin1: 'Bihar', population: 38000 }]);
    delete db.rpc;
    const out = await fetchPlaceCandidates(db, 'Bodhgaya');
    expect(out[0]).toMatchObject({ name: 'Bodhgaya' });
  });

  it('survives the db call throwing outright', async () => {
    const db = { from: () => { throw new Error('network down'); }, rpc: () => { throw new Error('network down'); } };
    expect(await fetchPlaceCandidates(db, 'Bodhgaya')).toEqual([]);
  });
});

describe('searchGazetteerDb: typeahead', () => {
  it('does not query until the term is at least two characters', async () => {
    const db = fakeDbWithRpc({ fast: [] });
    expect(await searchGazetteerDb(db, 'a')).toEqual([]);
    expect(db.rpcCalls.length).toBe(0);
  });

  it('uses the fast RPC and filters by country client-side when one is given', async () => {
    const db = fakeDbWithRpc({ fast: [
      { name: 'Lumbini', alt_names: [], lat: 27.47, lon: 83.28, country: 'Nepal', admin1: 'Lumbini', population: 8000 },
      { name: 'Lumbini Town', alt_names: [], lat: 20.0, lon: 78.0, country: 'India', admin1: 'X', population: 100 },
    ] });
    const out = await searchGazetteerDb(db, 'lum', { country: 'Nepal' });
    expect(out).toHaveLength(1);
    expect(out[0].country).toBe('Nepal');
  });

  it('falls back to the slow search too, same as fetchPlaceCandidates', async () => {
    const db = fakeDbWithRpc({ fast: [], slow: [kushinagar] });
    const out = await searchGazetteerDb(db, 'kushinagar');
    expect(out[0]).toMatchObject({ name: 'Kasia' });
  });

  it('falls back to a prefix ilike on name when neither RPC is available', async () => {
    const db = fakeDbNoRpc([]);
    await searchGazetteerDb(db, 'vara');
    const ilike = db.calls[0].filters.find(f => f[0] === 'ilike');
    expect(ilike[1]).toBe('name');
    expect(ilike[2]).toBe('vara*');
  });

  it('scopes the client-side fallback path to a country too', async () => {
    const db = fakeDbNoRpc([]);
    await searchGazetteerDb(db, 'lum', { country: 'Nepal' });
    expect(db.calls[0].filters.find(f => f[0] === 'eq')).toEqual(['eq', 'country', 'Nepal']);
  });
});
