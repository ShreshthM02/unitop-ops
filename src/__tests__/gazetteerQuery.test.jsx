import { describe, it, expect } from 'vitest';
import { fetchPlaceCandidates, searchGazetteerDb, saveCustomPlace, listCustomPlaces, updateCustomPlace, deleteCustomPlace } from '../lib/gazetteerQuery.js';

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

// A fake db that additionally tracks custom_places reads/writes, layered on
// top of the gazetteer fakes above.
function fakeDbWithCustom({ fast = [], slow = [], custom = [] } = {}) {
  const rpcCalls = [];
  const customInserts = [];
  let customQueried = false;
  return {
    rpcCalls, customInserts,
    get customQueried() { return customQueried; },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: fn === 'search_gazetteer_alt_names' ? slow : fast, error: null };
    },
    from: (table) => {
      if (table === 'custom_places') {
        const builder = {
          select: () => builder,
          ilike: (col, val) => { customQueried = true; return builder; },
          eq: () => builder,
          limit: (n) => ({ then: (res) => res({ data: custom, error: null }) }),
          insert: async (row) => { customInserts.push(row); return { error: null }; },
        };
        return builder;
      }
      throw new Error('unexpected table: ' + table);
    },
  };
}

describe('custom_places: what a manually-placed coordinate teaches the app for next time', () => {
  it('saveCustomPlace writes name/lat/lon/country/admin1', async () => {
    const db = fakeDbWithCustom();
    const { error } = await saveCustomPlace(db, { name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India', admin1: 'Bihar' });
    expect(error).toBeNull();
    expect(db.customInserts[0]).toMatchObject({ name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India', admin1: 'Bihar' });
  });

  it('refuses to save an invalid place rather than writing garbage', async () => {
    const db = fakeDbWithCustom();
    expect((await saveCustomPlace(db, { name: '', lat: 25.1, lon: 84.2 })).error).toBeTruthy();
    expect((await saveCustomPlace(db, { name: 'X', lat: 'not a number', lon: 84.2 })).error).toBeTruthy();
    expect((await saveCustomPlace(db, null)).error).toBeTruthy();
    expect(db.customInserts.length).toBe(0);
  });

  it('a place with no country/admin1 still saves -- those are optional context, not required', async () => {
    const db = fakeDbWithCustom();
    const { error } = await saveCustomPlace(db, { name: 'X', lat: 1, lon: 2 });
    expect(error).toBeNull();
  });

  it('fetchPlaceCandidates checks custom_places only after both gazetteer searches find nothing', async () => {
    const db = fakeDbWithCustom({ fast: [], slow: [], custom: [{ name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India', admin1: 'Bihar' }] });
    const out = await fetchPlaceCandidates(db, 'A Hamlet');
    expect(db.rpcCalls.map(c => c.fn)).toEqual(['search_gazetteer', 'search_gazetteer_alt_names']);
    expect(db.customQueried).toBe(true);
    expect(out[0]).toMatchObject({ name: 'A Hamlet', source: 'custom' });
  });

  it('does NOT check custom_places when the fast gazetteer search already found something', async () => {
    // A real GeoNames match should never be shadowed by an unnecessary
    // extra query, let alone by a hand-entered one if both somehow exist.
    const db = fakeDbWithCustom({ fast: [rajgir], custom: [{ name: 'Should not appear', lat: 0, lon: 0 }] });
    const out = await fetchPlaceCandidates(db, 'Rajgir');
    expect(db.customQueried).toBe(false);
    expect(out[0].name).toBe('Rājgīr');
  });

  it('searchGazetteerDb (the typeahead) falls back to custom_places the same way', async () => {
    const db = fakeDbWithCustom({ fast: [], slow: [], custom: [{ name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India' }] });
    const out = await searchGazetteerDb(db, 'hamlet');
    expect(out[0]).toMatchObject({ name: 'A Hamlet', source: 'custom' });
  });

  it('a genuine no-match anywhere still returns empty, not an error', async () => {
    const db = fakeDbWithCustom({ fast: [], slow: [], custom: [] });
    expect(await fetchPlaceCandidates(db, 'Nowhere At All')).toEqual([]);
  });
});

describe('custom_places admin CRUD: list, update, delete', () => {
  function fakeAdminDb({ rows = [], updateResult = { error: null }, deleteResult = { error: null } } = {}) {
    const calls = { update: [], delete: [], select: [] };
    return {
      calls,
      from: (table) => {
        const rec = { table, filters: [] };
        const builder = {
          select: (cols) => { calls.select.push({ table, cols }); return builder; },
          eq: (col, val) => { rec.filters.push([col, val]); return builder; },
          order: () => ({ then: (res) => res({ data: rows, error: null }) }),
          update: async (patch) => { calls.update.push({ table, filters: rec.filters, patch }); return updateResult; },
          delete: async () => { calls.delete.push({ table, filters: rec.filters }); return deleteResult; },
        };
        return builder;
      },
    };
  }

  it('listCustomPlaces returns every saved place, newest first', async () => {
    const db = fakeAdminDb({ rows: [{ id: 1, name: 'A Hamlet', lat: 25.1, lon: 84.2, country: 'India' }] });
    const { places, error } = await listCustomPlaces(db);
    expect(error).toBeNull();
    expect(places[0]).toMatchObject({ name: 'A Hamlet', source: 'custom' });
  });

  it('listCustomPlaces reports a load failure rather than silently returning empty', async () => {
    const db = { from: () => ({ select: () => ({ order: () => ({ then: (res) => res({ data: null, error: { message: 'timeout' } }) }) }) }) };
    const { places, error } = await listCustomPlaces(db);
    expect(places).toEqual([]);
    expect(error).toContain('timeout');
  });

  it('updateCustomPlace edits name and coordinates together', async () => {
    const db = fakeAdminDb();
    const { error } = await updateCustomPlace(db, 7, { name: 'Renamed', lat: 25.2, lon: 84.3 });
    expect(error).toBeNull();
    expect(db.calls.update[0].filters).toEqual([['id', 7]]);
    expect(db.calls.update[0].patch).toMatchObject({ name: 'Renamed', lat: 25.2, lon: 84.3 });
  });

  it('refuses to clear the name to empty', async () => {
    const db = fakeAdminDb();
    const { error } = await updateCustomPlace(db, 7, { name: '   ' });
    expect(error).toMatch(/name is required/i);
    expect(db.calls.update).toEqual([]);
  });

  it('refuses a lat with no matching lon -- a coordinate is a pair, not two independent fields', async () => {
    const db = fakeAdminDb();
    const { error } = await updateCustomPlace(db, 7, { lat: 25.2 });
    expect(error).toMatch(/both be given/i);
    expect(db.calls.update).toEqual([]);
  });

  it('refuses an out-of-range coordinate pair', async () => {
    const db = fakeAdminDb();
    const { error } = await updateCustomPlace(db, 7, { lat: 999, lon: 84.3 });
    expect(error).toMatch(/in range/i);
  });

  it('a country/admin1-only edit needs no coordinate at all', async () => {
    const db = fakeAdminDb();
    const { error } = await updateCustomPlace(db, 7, { country: 'India', admin1: 'Bihar' });
    expect(error).toBeNull();
    expect(db.calls.update[0].patch).toEqual({ country: 'India', admin1: 'Bihar' });
  });

  it('surfaces an update failure from the database', async () => {
    const db = fakeAdminDb({ updateResult: { error: { message: 'row not found' } } });
    const { error } = await updateCustomPlace(db, 7, { name: 'X' });
    expect(error).toContain('row not found');
  });

  it('deleteCustomPlace removes the row by id', async () => {
    const db = fakeAdminDb();
    const { error } = await deleteCustomPlace(db, 7);
    expect(error).toBeNull();
    expect(db.calls.delete[0].filters).toEqual([['id', 7]]);
  });

  it('surfaces a delete failure rather than reporting silent success', async () => {
    const db = fakeAdminDb({ deleteResult: { error: { message: 'permission denied' } } });
    const { error } = await deleteCustomPlace(db, 7);
    expect(error).toContain('permission denied');
  });
});
