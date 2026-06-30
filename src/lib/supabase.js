const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

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
    "Authorization": `Bearer ${_session?.access_token || key}`,
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
        _session = { token: data.token, user: data.user };
        localStorage.setItem("unitop_session", JSON.stringify(_session));
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
        _session.user = data.user;
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
    getStaffList: async () => {
      const r = await fetch(`${url}/rest/v1/staff?select=id,username,name,role,color,active,last_login,permissions&order=name.asc`, {
        headers:{ "apikey":key, "Authorization":`Bearer ${key}` }
      });
      return r.ok ? await r.json() : [];
    },
  };

  return { from, auth };
})();

const db = _supa;
const supabase = _supa;

export { db, supabase };
