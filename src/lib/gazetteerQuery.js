// DB-facing layer for the `gazetteer` table (1M+ GeoNames rows).
//
// placeResolver.js is deliberately pure -- it ranks a small array of
// candidates, it never talks to a database, and that is what makes it
// testable without one. This file is the seam between that pure logic and
// the real table: it fetches a SMALL, plausible candidate set (tens of
// rows, not a million) and hands it to placeResolver's existing, tested
// ranking. The two layers never merge, so the ranking logic stays testable
// with a hand-built fixture even though the real table is enormous.
import { normalizePlaceName, canonicalName } from "./placeResolver.js";

const COLUMNS = "name,ascii_name,alt_names,lat,lon,country,admin1,population";

function mapRow(r) {
  return {
    name: r.name, lat: r.lat, lon: r.lon,
    country: r.country, admin1: r.admin1,
    population: r.population || 0,
    alt: r.alt_names || [],
  };
}

// RUN ONCE IN THE SUPABASE SQL EDITOR, same as the gazetteer table itself:
//
//   create index if not exists gazetteer_ascii_trgm_idx
//     on gazetteer using gin (lower(ascii_name) gin_trgm_ops);
//
//   create or replace function search_gazetteer(term text, lim int default 60)
//   returns setof gazetteer
//   language sql stable
//   as $$
//     select g.* from gazetteer g
//     where g.name ilike '%' || term || '%'
//        or g.ascii_name ilike '%' || term || '%'
//     order by g.population desc nulls last
//     limit lim;
//   $$;
//
//   create or replace function search_gazetteer_alt_names(term text, lim int default 60)
//   returns setof gazetteer
//   language sql stable
//   as $$
//     select g.* from gazetteer g
//     where exists (
//       select 1 from unnest(g.alt_names) a where a ilike '%' || term || '%'
//     )
//     order by g.population desc nulls last
//     limit lim;
//   $$;
//
//   grant execute on function search_gazetteer(text, int) to anon, authenticated;
//   grant execute on function search_gazetteer_alt_names(text, int) to anon, authenticated;
//
// WHY TWO FUNCTIONS, NOT ONE. The original single function ORed all three
// checks (name, ascii_name, alt_names) together in one WHERE clause. Proven
// against a real EXPLAIN ANALYZE on the live table: that forced a full
// sequential scan across all 1,005,362 rows every single search, 10.6
// seconds, regardless of any index on name or ascii_name -- because the
// alt_names check is `exists (select 1 from unnest(...) where ...)`, a
// per-row correlated subquery no ordinary index can help with, and
// Postgres cannot use an index for part of an OR when another branch of
// that same OR requires a full scan anyway. The index was never the
// problem; the query shape was.
//
// Splitting into two functions lets the COMMON case -- a name or
// ascii_name match, which is the overwhelming majority of real searches,
// Rajgir's own ascii_name "Rajgir" included -- run fast and index-backed
// (search_gazetteer alone), while the RARE case (a town recorded only
// under an old or alternate name, like Kushinagar filed as Kasia) still
// works via the deliberately slower search_gazetteer_alt_names, called
// only as a fallback when the fast search finds nothing. Accepting slow
// for the rare path is fine; accepting slow for every search was not.
//
// Where neither function has been created yet (a fresh database before
// this migration is run), both exported functions below fall back to a
// plain client-side filter rather than returning nothing.
async function viaRpc(db, term) {
  const { data, error } = await db.rpc("search_gazetteer", { term, lim: 60 });
  if (error || !data) return null;
  if (data.length > 0) return data.map(mapRow);
  // Fast search found nothing -- try the slow, alt-names-only path before
  // giving up. A missing/ungranted function here degrades to null, which
  // callers already treat as "fall through to the plain filter", so this
  // stays safe even on a database that has search_gazetteer but not yet
  // search_gazetteer_alt_names.
  try {
    const alt = await db.rpc("search_gazetteer_alt_names", { term, lim: 60 });
    if (!alt.error && alt.data) return alt.data.map(mapRow);
  } catch (e) {
    // fall through to returning the (empty) fast result below
  }
  return [];
}

async function viaNameFilter(db, query, { limit = 60 } = {}) {
  const raw = normalizePlaceName(query);
  if (!raw) return [];
  const canon = canonicalName(query);
  const terms = [...new Set([raw, canon])];
  // Checks ascii_name as well as name. GeoNames' canonical `name` often
  // carries diacritics -- Rajgir's is recorded as "Rājgīr" -- and ILIKE
  // does not fold accents, so a plain-ASCII search term would never match
  // the accented column even though the exact same place has a clean
  // ascii_name entry ("Rajgir") sitting right next to it. This path only
  // runs at all when the RPCs above are unavailable, but it should still
  // find what it reasonably can while degraded.
  const orExpr = terms.flatMap(t => [`name.ilike.*${t}*`, `ascii_name.ilike.*${t}*`]).join(",");
  try {
    const { data, error } = await db.from("gazetteer").select(COLUMNS)
      .or(orExpr).order("population", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data.map(mapRow);
  } catch (e) {
    return [];
  }
}

// Candidates for resolvePlace(): searches name and ascii_name fast, falling
// back to alt_names only when those find nothing.
export async function fetchPlaceCandidates(db, query, { limit = 60 } = {}) {
  const raw = normalizePlaceName(query);
  if (!raw) return [];
  try {
    const rpcResult = await viaRpc(db, raw);
    if (rpcResult) return rpcResult.slice(0, limit);
  } catch (e) {
    // fall through to the name-only path below
  }
  return viaNameFilter(db, query, { limit });
}

// Typeahead for the picker's search box.
export async function searchGazetteerDb(db, term, { limit = 15, country = null } = {}) {
  const q = normalizePlaceName(term);
  if (q.length < 2) return [];
  try {
    const rpcResult = await viaRpc(db, q);
    if (rpcResult) {
      const filtered = country ? rpcResult.filter(r => r.country === country) : rpcResult;
      return filtered.slice(0, limit);
    }
  } catch (e) {
    // fall through
  }
  try {
    let builder = db.from("gazetteer").select(COLUMNS).ilike("name", `${q}*`);
    if (country) builder = builder.eq("country", country);
    const { data, error } = await builder.order("population", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data.map(mapRow);
  } catch (e) {
    return [];
  }
}
