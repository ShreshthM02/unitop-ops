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
//   create or replace function search_gazetteer(term text, lim int default 60)
//   returns setof gazetteer
//   language sql stable
//   as $$
//     select g.* from gazetteer g
//     where g.name ilike '%' || term || '%'
//        or g.ascii_name ilike '%' || term || '%'
//        or exists (
//          select 1 from unnest(g.alt_names) a where a ilike '%' || term || '%'
//        )
//     order by g.population desc nulls last
//     limit lim;
//   $$;
//
// WHY THIS EXISTS. A name typed by an operator does not have to match
// GeoNames' own canonical `name` column -- Kushinagar's canonical GeoNames
// entry is recorded under an older name, with "Kushinagar" appearing only
// in its alternate names. The `.or()` filter this module used before only
// ever matched the `name` column: it could rank an alt-name match once
// fetched (placeResolver.js does that correctly), but it could never FETCH
// that row from the million-row table in the first place, because
// PostgREST's plain filter syntax has no operator for "does any element of
// this array match this pattern". A SQL function is what actually reaches
// inside the array. Where the function has not been created yet (a fresh
// database before this migration is run), both exported functions fall
// back to the previous name-only query rather than returning nothing.
async function viaRpc(db, term) {
  const { data, error } = await db.rpc("search_gazetteer", { term, lim: 60 });
  if (error || !data) return null;
  return data.map(mapRow);
}

async function viaNameFilter(db, query, { limit = 60 } = {}) {
  const raw = normalizePlaceName(query);
  if (!raw) return [];
  const canon = canonicalName(query);
  const terms = [...new Set([raw, canon])];
  const orExpr = terms.map(t => `name.ilike.*${t}*`).join(",");
  try {
    const { data, error } = await db.from("gazetteer").select(COLUMNS)
      .or(orExpr).order("population", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data.map(mapRow);
  } catch (e) {
    return [];
  }
}

// Candidates for resolvePlace(): searches name, ascii_name and alt_names.
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

