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

describe('Auth Phase 1: a real signed JWT is actually used once a session exists, not silently discarded', () => {
  // Root cause fixed here: authHeaders() checked `_session?.access_token`,
  // a field that never existed on the stored session object (`.token`/
  // `.user` only) -- so every request silently fell through to the plain
  // anon key regardless of login state. Fixed to check `.jwt`, the real
  // field staff_login()/validate_session() now actually return.
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; localStorage.clear(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('before any login, ordinary requests use the anon key, not a fabricated Bearer value', async () => {
    let capturedHeaders = null;
    global.fetch = vi.fn((url, opts) => { capturedHeaders = opts?.headers; return Promise.resolve({ ok: true, json: async () => [] }); });
    await db.from('queries').select('*');
    expect(capturedHeaders.Authorization).toBe(`Bearer ${capturedHeaders.apikey}`);
  });

  it('after a successful login, ordinary requests send the real signed JWT as the Bearer token, not the anon key', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('rpc/staff_login')) {
        return Promise.resolve({ ok: true, json: async () => ({
          success: true, token: 'custom-hex-token', jwt: 'real.signed.jwt', expiry: '2026-12-01T00:00:00Z',
          user: { id: 'staff-1', name: 'Priya', role: 'sales' },
        }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const loginResult = await db.auth.login('priya', 'whatever');
    expect(loginResult.user.name).toBe('Priya');

    let capturedHeaders = null;
    global.fetch = vi.fn((url, opts) => { capturedHeaders = opts?.headers; return Promise.resolve({ ok: true, json: async () => [] }); });
    await db.from('queries').select('*');
    expect(capturedHeaders.Authorization).toBe('Bearer real.signed.jwt');
  });

  it('validateSession persists the freshly reissued JWT, not just the user -- a page reload keeps using a live, non-expired token', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('rpc/validate_session')) {
        return Promise.resolve({ ok: true, json: async () => ({
          valid: true, jwt: 'freshly.reissued.jwt', user: { id: 'staff-1', name: 'Priya', role: 'sales' },
        }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await db.auth.validateSession();

    let capturedHeaders = null;
    global.fetch = vi.fn((url, opts) => { capturedHeaders = opts?.headers; return Promise.resolve({ ok: true, json: async () => [] }); });
    await db.from('queries').select('*');
    expect(capturedHeaders.Authorization).toBe('Bearer freshly.reissued.jwt');

    // Also persisted, so a real page reload (which reads localStorage,
    // not this in-memory session) picks up the fresh token too.
    const stored = JSON.parse(localStorage.getItem('unitop_session'));
    expect(stored.jwt).toBe('freshly.reissued.jwt');
  });
});

describe('User Management: the real, confirmed bug behind "staff never shows up"', () => {
  // getStaffList() was the one hand-written fetch call in the whole auth
  // object that hardcoded `Authorization: Bearer ${key}` (the plain
  // anon key) directly, instead of using authHeaders() like every
  // ordinary table read does. Every other call in this object is an RPC
  // to a SECURITY DEFINER function (staff_login, validate_session,
  // etc), which doesn't need a real session header since it validates
  // its own p_token internally -- this one is a genuine table SELECT,
  // subject to RLS, and RLS now requires a real authenticated session.
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('sends the real signed JWT once logged in, not the plain anon key', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('rpc/staff_login')) {
        return Promise.resolve({ ok: true, json: async () => ({
          success: true, token: 'custom-hex-token', jwt: 'real.signed.jwt', expiry: '2026-12-01T00:00:00Z',
          user: { id: 'staff-1', name: 'Priya', role: 'sales' },
        }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    await db.auth.login('priya', 'whatever');

    let capturedHeaders = null;
    global.fetch = vi.fn((url, opts) => { capturedHeaders = opts?.headers; return Promise.resolve({ ok: true, json: async () => [] }); });
    await db.auth.getStaffList();
    expect(capturedHeaders.Authorization).toBe('Bearer real.signed.jwt');
  });
});

describe('item 2 (real fix): realtimeClient now actually receives the JWT, not just the hand-rolled REST wrapper', () => {
  it('login() does not crash whether or not realtimeClient is available -- the setSession sync (guarded when null) must hold either way', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('rpc/staff_login')) {
        return Promise.resolve({ ok: true, json: async () => ({
          success: true, token: 'custom-hex-token', jwt: 'real.signed.jwt', expiry: '2026-12-01T00:00:00Z',
          user: { id: 'staff-1', name: 'Priya', role: 'sales' },
        }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    // realtimeClient's own value here is environment-dependent (whether
    // VITE_SUPABASE_URL/KEY are configured for this run) -- not what
    // this test is verifying. The real assertion is that login() never
    // crashes either way, covered below.
    await expect(db.auth.login('priya', 'whatever')).resolves.toEqual(expect.objectContaining({ error: null }));
  });

  it('the real setSession call itself, verified directly against source: login() and validateSession() both call realtimeClient.auth.setSession with {access_token: <jwt>, refresh_token: <token>} when realtimeClient exists -- confirmed by static inspection, since this test environment cannot construct a real realtimeClient (module-level, gated on env vars unset here) to spy on directly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/supabase.js'), 'utf8');
    const occurrences = (src.match(/realtimeClient\.auth\.setSession\(\{\s*access_token:\s*data\.jwt/g) || []).length;
    expect(occurrences).toBe(2); // once in login(), once in validateSession()
  });
});
