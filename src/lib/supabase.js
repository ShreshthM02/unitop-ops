import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Real Supabase client — used ONLY for Realtime (postgres_changes)
// subscriptions, since that's a WebSocket protocol the hand-rolled REST
// wrapper below can't do. All regular reads/writes still go through `_supa`;
// this is a pure addition, not a replacement of the existing data layer.
// Guarded: createClient() throws synchronously if the URL/key are missing,
// which would crash the whole app on load (including in test environments
// with no env vars configured) — the REST wrapper below never had this
// problem because it only touches the network lazily, on an actual request.
// realtimeClient is null when unconfigured; useRealtimeTable() no-ops in
// that case rather than throwing.
export const realtimeClient = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
if (!realtimeClient && typeof console !== "undefined") {
  console.warn("Supabase Realtime disabled: VITE_SUPABASE_URL/VITE_SUPABASE_KEY not set.");
}

export const _supa = (() => {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;

  const headers = (extra={}) => ({
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...extra
  });

  // Auth token storage
  let _session = null;

  const authHeaders = () => ({
    "apikey": key,
    // Was `_session?.access_token`, a field that never existed on the
    // stored session object (login() below stores `.token`/`.user` only)
    // -- meaning every request silently fell through to the plain anon
    // key regardless of login state, real bug, now fixed. `.jwt` is the
    // real signed token staff_login() issues (Phase 1 of the auth fix,
    // 2026-09) -- falls back to the anon key exactly as before until
    // that lands, so this alone changes no behavior; it just stops
    // silently discarding a real session the moment one exists.
    "Authorization": `Bearer ${_session?.jwt || key}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  });

  const from = (table) => {
    let _query = "";
    let _order = "";
    let _limit = "";
    let _filters = [];

    const builder = {
      select: (cols="*") => { _query = `?select=${cols}`; return builder; },
      eq: (col, val) => { _filters.push(`${col}=eq.${val}`); return builder; },
      // Range filters -- added for the itinerary map's gazetteer bounding-box
      // query (fetchGazetteerInBBox). Root cause of a real bug: that
      // function called .gte()/.lte() assuming the real supabase-js
      // client's interface, but this wrapper never implemented either,
      // so the call threw in production and was silently swallowed by
      // the caller's own try/catch, degrading to no passive towns at
      // all. Same PostgREST operator syntax eq() already uses.
      gte: (col, val) => { _filters.push(`${col}=gte.${val}`); return builder; },
      lte: (col, val) => { _filters.push(`${col}=lte.${val}`); return builder; },
      // Added for gazetteer lookups (place name search). PostgREST treats a
      // bare `*` in an ilike value as the SQL `%` wildcard, so callers pass
      // patterns like `*varanasi*` or `varanasi*` directly.
      ilike: (col, val) => { _filters.push(`${col}=ilike.${encodeURIComponent(val)}`); return builder; },
      // Raw PostgREST or() expression, e.g. "name.ilike.*a*,name.ilike.*b*".
      // Left unencoded like eq()/ilike()'s column names -- this wrapper has
      // never encoded filter syntax, only values, and encoding the commas
      // and parentheses PostgREST needs for or() would break the syntax.
      or: (expr) => { _filters.push(`or=(${expr})`); return builder; },
      order: (col, {ascending=true}={}) => { _order = `&order=${col}.${ascending?"asc":"desc"}`; return builder; },
      limit: (n) => { _limit = `&limit=${n}`; return builder; },
      insert: async (rows) => {
        const r = await fetch(`${url}/rest/v1/${table}`, {
          method:"POST", headers:authHeaders(),
          body: JSON.stringify(Array.isArray(rows)?rows:[rows])
        });
        const data = r.ok ? await r.json().catch(()=>[]) : null;
        return { data, error: r.ok ? null : { message: await r.text() } };
      },
      upsert: async (rows) => {
        const r = await fetch(`${url}/rest/v1/${table}`, {
          method:"POST",
          headers:{...authHeaders(), "Prefer":"resolution=merge-duplicates,return=representation"},
          body: JSON.stringify(Array.isArray(rows)?rows:[rows])
        });
        const data = r.ok ? await r.json().catch(()=>[]) : null;
        return { data, error: r.ok ? null : { message: await r.text() } };
      },
      update: async (row) => {
        const filterStr = _filters.length ? "?" + _filters.join("&") : "";
        const r = await fetch(`${url}/rest/v1/${table}${filterStr}`, {
          method:"PATCH", headers:authHeaders(), body:JSON.stringify(row)
        });
        const data = r.ok ? await r.json().catch(()=>[]) : null;
        return { data, error: r.ok ? null : { message: await r.text() } };
      },
      delete: async () => {
        const filterStr = _filters.length ? "?" + _filters.join("&") : "";
        const r = await fetch(`${url}/rest/v1/${table}${filterStr}`, {
          method:"DELETE", headers:authHeaders()
        });
        return { data: null, error: r.ok ? null : { message: await r.text() } };
      },
      then: async (resolve, reject) => {
        try {
          const filterStr = _filters.length ? "&" + _filters.join("&") : "";
          const qs = (_query||"?select=*") + filterStr + _order + _limit;
          const r = await fetch(`${url}/rest/v1/${table}${qs}`, { headers: authHeaders() });
          const data = r.ok ? await r.json() : null;
          const error = r.ok ? null : { message: await r.text() };
          resolve({ data, error });
        } catch(e) { resolve({ data: null, error: { message: e.message } }); }
      }
    };
    return builder;
  };

  const auth = {
    // Custom auth via Supabase RPC functions (no email required)
    login: async (username, password) => {
      try {
        const r = await fetch(`${url}/rest/v1/rpc/staff_login`, {
          method:"POST",
          headers:{ "apikey":key, "Content-Type":"application/json" },
          body: JSON.stringify({ p_username: username, p_password: password })
        });
        const data = await r.json();
        if (!data.success) return { user: null, error: data.error || "Invalid credentials" };
        // `token`: the existing custom session identifier -- still used
        // as-is by validate_session/logout/etc, which look it up against
        // staff.session_token directly; unrelated to the JWT work.
        // `jwt`: the real signed token (once staff_login issues one) that
        // authHeaders() above actually sends as the Bearer token for
        // every ordinary data request.
        _session = { token: data.token, jwt: data.jwt, user: data.user };
        localStorage.setItem("unitop_session", JSON.stringify(_session));
        // Real, definitive fix for item 2 (avatar upload RLS failure):
        // realtimeClient (the actual supabase-js client, used for
        // Storage uploads) was NEVER given this JWT anywhere -- it's a
        // completely separate client from the hand-rolled REST wrapper
        // above, which only ever attached the JWT to its OWN fetch
        // calls via authHeaders(). realtimeClient's own auth state
        // stayed at the plain anon key the whole time, for every
        // session, regardless of who was logged in -- confirmed
        // directly: staff-avatars' upload policy correctly requires
        // authenticated, and Storage was never actually being called as
        // anything but anon. Syncing it here so it's authenticated too.
        if (realtimeClient) realtimeClient.auth.setSession({ access_token: data.jwt, refresh_token: data.token }).catch(()=>{});
        return { user: data.user, error: null };
      } catch(e) { return { user: null, error: "Cannot reach server. Check internet connection." }; }
    },
    logout: async () => {
      try {
        if (_session?.token) {
          await fetch(`${url}/rest/v1/rpc/staff_logout`, {
            method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
            body: JSON.stringify({ p_token: _session.token })
          });
        }
      } catch(e) {}
      _session = null;
      localStorage.removeItem("unitop_session");
    },
    getSession: async () => {
      if (_session) return _session;
      try {
        const stored = localStorage.getItem("unitop_session");
        if (stored) { _session = JSON.parse(stored); return _session; }
      } catch(e) {}
      return null;
    },
    validateSession: async () => {
      const sess = await _supa.auth.getSession();
      if (!sess?.token) return null;
      try {
        const r = await fetch(`${url}/rest/v1/rpc/validate_session`, {
          method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
          body: JSON.stringify({ p_token: sess.token })
        });
        const data = await r.json();
        if (!data.valid) { _session = null; localStorage.removeItem("unitop_session"); return null; }
        // data.jwt is freshly reissued on every validate call (matching
        // the session's extended 12-hour window) -- without persisting
        // it here, a page reload would keep using whatever jwt was
        // stored at original login, possibly hours stale or expired,
        // even though the underlying session itself was just confirmed
        // valid and extended.
        _session.user = data.user;
        _session.jwt = data.jwt;
        localStorage.setItem("unitop_session", JSON.stringify(_session));
        // Same fix as login() above -- a session restored on page
        // refresh (not a fresh login) needs realtimeClient synced too,
        // otherwise every reload silently drops back to anon for
        // Storage uploads even though the rest of the app correctly
        // stays logged in.
        if (realtimeClient) realtimeClient.auth.setSession({ access_token: data.jwt, refresh_token: sess.token }).catch(()=>{});
        return data.user;
      } catch(e) { return sess?.user || null; }
    },
    createStaff: async (username, password, name, role, color) => {
      const sess = await _supa.auth.getSession();
      const r = await fetch(`${url}/rest/v1/rpc/create_staff`, {
        method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
        body: JSON.stringify({ p_token:sess?.token, p_username:username, p_password:password, p_name:name, p_role:role, p_color:color })
      });
      return await r.json();
    },
    changePassword: async (targetUserId, newPassword) => {
      const sess = await _supa.auth.getSession();
      const r = await fetch(`${url}/rest/v1/rpc/change_password`, {
        method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
        body: JSON.stringify({ p_token:sess?.token, p_target_user:targetUserId, p_new_password:newPassword })
      });
      return await r.json();
    },
    updatePermissions: async (targetUserId, permissions, role, name, active) => {
      const sess = await _supa.auth.getSession();
      const r = await fetch(`${url}/rest/v1/rpc/update_staff_permissions`, {
        method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
        body: JSON.stringify({ p_token:sess?.token, p_target_user:targetUserId, p_permissions:permissions, p_role:role, p_name:name, p_active:active })
      });
      return await r.json();
    },
    // Self-service update for the logged-in user's own display name and
    // avatar color -- deliberately separate from updatePermissions, which
    // is admin-only and requires a target user. On success, also updates
    // the cached session (both in memory and localStorage) so the change
    // is immediately reflected everywhere without needing a refresh, and
    // survives one.
    updateOwnProfile: async (name, color, avatarUrl) => {
      const sess = await _supa.auth.getSession();
      const r = await fetch(`${url}/rest/v1/rpc/update_own_profile`, {
        method:"POST", headers:{ "apikey":key, "Content-Type":"application/json" },
        body: JSON.stringify({ p_token:sess?.token, p_name:name, p_color:color, p_avatar_url:avatarUrl })
      });
      const data = await r.json();
      if (data?.success && data.user && _session) {
        _session.user = data.user;
        localStorage.setItem("unitop_session", JSON.stringify(_session));
      }
      return data;
    },
    getStaffList: async () => {
      // Was hardcoding `Authorization: Bearer ${key}` (the plain anon
      // key) directly -- the one hand-written fetch call in this whole
      // object that's a real table SELECT (every other call here is an
      // RPC to a SECURITY DEFINER function, which doesn't need a real
      // session header since it validates its own p_token internally).
      // Once Phase 2 correctly removed anon's row-level access to
      // staff, this call started failing for every user, every time,
      // regardless of session freshness -- authHeaders() is what
      // actually carries the real signed JWT when one exists.
      const r = await fetch(`${url}/rest/v1/staff?select=id,username,name,role,color,avatar,avatar_url,active,last_login,permissions&order=name.asc`, {
        headers: authHeaders(),
      });
      return r.ok ? await r.json() : [];
    },
  };

  // Calls a Postgres function via PostgREST's /rpc/ endpoint. Added for
  // search_gazetteer() -- see gazetteerQuery.js for why a plain column
  // filter cannot do what that function does (matching inside the
  // alt_names array, which PostgREST's own filter syntax has no operator
  // for).
  const rpc = async (fnName, params = {}) => {
    try {
      const r = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(params),
      });
      const data = r.ok ? await r.json() : null;
      return { data, error: r.ok ? null : { message: await r.text().catch(() => "") } };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  };

  return { from, auth, rpc };
})();

const db = _supa;
const supabase = _supa;

export { db, supabase };
