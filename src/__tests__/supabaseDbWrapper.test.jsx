import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../lib/supabase.js';

describe('db wrapper: gte()/lte() range filters -- root cause of a real bug where the map showed no passive towns', () => {
  // Confirmed real cause: fetchGazetteerInBBox (gazetteerQuery.js) called
  // db.from('gazetteer').gte(...).lte(...), assuming the real supabase-js
  // client's interface. This app's db is a hand-rolled REST wrapper that
  // never implemented either method -- the call threw "not a function" in
  // production, silently caught by fetchGazetteerInBBox's own try/catch,
  // degrading to an empty array. A previous test suite never caught this
  // because it mocked db itself (implementing gte/lte on the mock to test
  // fetchGazetteerInBBox's own logic), never exercising the real wrapper.
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('gte() and lte() exist as real methods on the query builder, not undefined', () => {
    const builder = db.from('gazetteer');
    expect(typeof builder.gte).toBe('function');
    expect(typeof builder.lte).toBe('function');
  });

  it('chaining gte()/lte() generates the correct PostgREST operator syntax in the request URL', async () => {
    let capturedUrl = null;
    global.fetch = vi.fn((url) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await db.from('gazetteer').select('name,lat,lon')
      .gte('lon', 83.0).lte('lon', 86.0)
      .gte('lat', 24.5).lte('lat', 26.0)
      .order('population', { ascending: false })
      .limit(200);

    expect(capturedUrl).toContain('lon=gte.83');
    expect(capturedUrl).toContain('lon=lte.86');
    expect(capturedUrl).toContain('lat=gte.24.5');
    expect(capturedUrl).toContain('lat=lte.26');
  });

  it('gte()/lte() compose correctly with eq() and other existing filters, same query', async () => {
    let capturedUrl = null;
    global.fetch = vi.fn((url) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await db.from('gazetteer').select('*').eq('country', 'IN').gte('population', 100000);

    expect(capturedUrl).toContain('country=eq.IN');
    expect(capturedUrl).toContain('population=gte.100000');
  });
});
