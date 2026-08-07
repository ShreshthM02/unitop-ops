import { describe, it, expect } from 'vitest';
import { fetchPlaceCandidates, searchGazetteerDb } from '../lib/gazetteerQuery.js';

// A fake db with a working search_gazetteer() RPC -- the normal case once
// the SQL migration has been run.
function fakeDbWithRpc(rows) {
  const rpcCalls = [];
  return {
    rpcCalls,
    from: () => { throw new Error('should not fall back to from() when rpc succeeds'); },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: rows, error: null };
    },
  };
}

// A fake db with NO search_gazetteer() function yet (fresh database, before
// the migration in gazetteerQuery.js's header has been run) -- rpc() comes
// back as an error, exactly like PostgREST does for an unknown function.
function fakeDbNoRpc(rows) {
  const calls = [];
  return {
    calls,
    rpc: async () => ({ data: null, error: { message: 'function search_gazetteer does not exist' } }),
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

const kushinagar = { name: 'Kasia', ascii_name: 'Kasia', alt_names: ['Kushinagar', 'Kushinara'], lat: 26.74, lon: 83.89, country: 'India', admin1: 'Uttar Pradesh', population: 22000 };

describe('fetchPlaceCandidates: the RPC path reaches alt_names', () => {
  it('finds a town filed under its old canonical name via an alternate name', async () => {
    // This is the exact bug that was reported: Kushinagar's GeoNames entry
    // is canonically "Kasia", with "Kushinagar" only in alt_names. A plain
    // ilike on the name column can never fetch this row at all.
    const db = fakeDbWithRpc([kushinagar]);
    const out = await fetchPlaceCandidates(db, 'Kushinagar');
    expect(db.rpcCalls[0].fn).toBe('search_gazetteer');
    expect(db.rpcCalls[0].params.term).toBe('kushinagar');
    expect(out[0]).toMatchObject({ name: 'Kasia', alt: ['Kushinagar', 'Kushinara'] });
  });

  it('falls back to the name-only filter when the RPC is not yet installed', async () => {
    const db = fakeDbNoRpc([{ name: 'Varanasi', lat: 25.3, lon: 83.0, country: 'India', admin1: 'UP', population: 1200000, alt_names: ['Benares'] }]);
    const out = await fetchPlaceCandidates(db, 'Benares');
    const rec = db.calls[0];
    const orFilter = rec.filters.find(f => f[0] === 'or');
    expect(orFilter[1]).toContain('varanasi'); // canonical alias still reaches the fallback query
    expect(out[0]).toMatchObject({ name: 'Varanasi' });
  });

  it('returns nothing for an empty query rather than issuing a wasted request', async () => {
    const db = fakeDbWithRpc([]);
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
    const db = fakeDbWithRpc([]);
    expect(await searchGazetteerDb(db, 'a')).toEqual([]);
    expect(db.rpcCalls.length).toBe(0);
  });

  it('uses the RPC and filters by country client-side when one is given', async () => {
    const db = fakeDbWithRpc([
      { name: 'Lumbini', alt_names: [], lat: 27.47, lon: 83.28, country: 'Nepal', admin1: 'Lumbini', population: 8000 },
      { name: 'Lumbini Town', alt_names: [], lat: 20.0, lon: 78.0, country: 'India', admin1: 'X', population: 100 },
    ]);
    const out = await searchGazetteerDb(db, 'lum', { country: 'Nepal' });
    expect(out).toHaveLength(1);
    expect(out[0].country).toBe('Nepal');
  });

  it('falls back to a prefix ilike on name when the RPC is unavailable', async () => {
    const db = fakeDbNoRpc([]);
    await searchGazetteerDb(db, 'vara');
    const ilike = db.calls[0].filters.find(f => f[0] === 'ilike');
    expect(ilike[1]).toBe('name');
    expect(ilike[2]).toBe('vara*');
  });

  it('scopes the fallback path to a country too', async () => {
    const db = fakeDbNoRpc([]);
    await searchGazetteerDb(db, 'lum', { country: 'Nepal' });
    expect(db.calls[0].filters.find(f => f[0] === 'eq')).toEqual(['eq', 'country', 'Nepal']);
  });
});
