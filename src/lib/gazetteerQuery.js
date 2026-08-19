// DB-facing layer for the `gazetteer` table (1M+ GeoNames rows).
//
// placeResolver.js is deliberately pure -- it ranks a small array of
// candidates, it never talks to a database, and that is what makes it
// testable without one. This file is the seam between that pure logic and
// the real table: it fetches a SMALL, plausible candidate set (tens of
// rows, not a million) and hands it to placeResolver's existing, tested
// ranking. The two layers never merge, so the ranking logic stays testable
// with a hand-built fixture even though the real table is enormous.
import { normalizePlaceName, canonicalName, isValidCoordinate } from "./placeResolver.js";

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

const CUSTOM_COLUMNS = "id,name,lat,lon,country,admin1";

function mapCustomRow(r) {
  return { id: r.id, name: r.name, lat: r.lat, lon: r.lon, country: r.country, admin1: r.admin1, population: 0, alt: [], source: "custom" };
}

// RUN ONCE, alongside the search_gazetteer migration above:
//
//   create table if not exists custom_places (
//     id bigserial primary key,
//     name text not null,
//     lat double precision not null,
//     lon double precision not null,
//     country text,
//     admin1 text,
//     created_at timestamptz default now()
//   );
//   create index if not exists custom_places_name_trgm_idx
//     on custom_places using gin (name gin_trgm_ops);
//   alter table custom_places enable row level security;
//   create policy "custom_places read" on custom_places for select to anon using (true);
//   create policy "custom_places insert" on custom_places for insert to anon with check (true);
//
// WHY THIS EXISTS. Placing a coordinate by hand today only ever saves into
// that one day, in that one itinerary -- it never teaches the gazetteer
// anything, so the next person (or the same person, on a different tour)
// who types the same village name starts from zero again, every time.
// custom_places is a small, separate, app-owned table: never mixed into
// the imported GeoNames data, so what the business has added itself stays
// visibly distinct from what GeoNames shipped. It is checked as the LAST
// resort in both search functions below, after the fast and slow gazetteer
// paths -- a real GeoNames match should always win over a hand-entered one
// if both somehow exist, since the imported data is the more authoritative
// source for anywhere it actually covers.
//
// The insert policy is open to anon by design, matching how this app
// already writes everywhere else (see the standing note in
// supabase.js/authHeaders about the app never using authenticated writes).
// It is a small, purpose-built table rather than a write opened on
// `gazetteer` itself, which keeps a bad row easy to find and remove without
// touching the imported reference data at all.
export async function saveCustomPlace(db, place) {
  if (!place || !place.name || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) {
    return { error: "invalid place" };
  }
  try {
    const { error } = await db.from("custom_places").insert({
      name: place.name, lat: place.lat, lon: place.lon,
      country: place.country || null, admin1: place.admin1 || null,
    });
    return { error: error ? error.message || String(error) : null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// Every custom place ever saved -- the admin surface for reviewing what
// the resolver has learned. Regular search only ever asks for a handful of
// name-matched candidates; this is the one place that legitimately wants
// the whole table.
export async function listCustomPlaces(db) {
  try {
    const { data, error } = await db.from("custom_places").select("*").order("created_at", { ascending: false });
    if (error) return { places: [], error: error.message || String(error) };
    return { places: (data || []).map(mapCustomRow), error: null };
  } catch (e) {
    return { places: [], error: e.message || String(e) };
  }
}

export async function updateCustomPlace(db, id, patch) {
  if (patch && patch.name != null && !String(patch.name).trim()) {
    return { error: "A name is required." };
  }
  // A coordinate update is treated as a pair, not two independent fields --
  // a lat with no matching lon (or vice versa) is not a meaningful partial
  // update, so both are required together whenever either is touched.
  if (patch && (patch.lat != null || patch.lon != null)) {
    if (patch.lat == null || patch.lon == null || !isValidCoordinate(patch.lat, patch.lon)) {
      return { error: "Latitude and longitude must both be given, and in range." };
    }
  }
  const clean = {};
  if (patch.name != null) clean.name = String(patch.name).trim();
  if (patch.lat != null) clean.lat = Number(patch.lat);
  if (patch.lon != null) clean.lon = Number(patch.lon);
  if (patch.country != null) clean.country = patch.country || null;
  if (patch.admin1 != null) clean.admin1 = patch.admin1 || null;
  try {
    const { error } = await db.from("custom_places").eq("id", id).update(clean);
    if (error) return { error: error.message || String(error) };
    return { error: null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

export async function deleteCustomPlace(db, id) {
  try {
    const { error } = await db.from("custom_places").eq("id", id).delete();
    if (error) return { error: error.message || String(error) };
    return { error: null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

async function viaCustomPlaces(db, term, limit) {
  try {
    const { data, error } = await db.from("custom_places").select(CUSTOM_COLUMNS)
      .ilike("name", `*${term}*`).limit(limit);
    if (error || !data) return [];
    return data.map(mapCustomRow);
  } catch (e) {
    return [];
  }
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
// back to alt_names, then to anything the business has manually placed
// before, only when everything faster has found nothing.
export async function fetchPlaceCandidates(db, query, { limit = 60 } = {}) {
  const raw = normalizePlaceName(query);
  if (!raw) return [];
  const customPromise = viaCustomPlaces(db, raw, limit).catch(() => []);
  let gazetteerResult = [];
  try {
    const rpcResult = await viaRpc(db, raw);
    // rpcResult is null only when the RPC itself is unavailable (not yet
    // migrated); an empty array means it ran fine and genuinely found
    // nothing.
    if (rpcResult !== null) {
      gazetteerResult = rpcResult;
    } else {
      gazetteerResult = await viaNameFilter(db, query, { limit });
    }
  } catch (e) {
    // fall through with whatever gazetteerResult already holds (likely [])
  }
  const custom = await customPromise;
  return [...custom, ...gazetteerResult].slice(0, limit);
}

// Population-tiered importance ranking, matching the same 1-14 scale
// rankThresholdForSpan already expects (Natural Earth's own scalerank
// convention: lower number = more important, shown at wider zoom levels).
// GeoNames rows carry no scalerank of their own, so this derives an
// equivalent from population -- the same signal a real cartographic rank
// would be built from in the first place.
function populationToRank(pop) {
  const p = pop || 0;
  if (p > 1000000) return 1;
  if (p > 500000) return 3;
  if (p > 100000) return 5;
  if (p > 50000) return 7;
  if (p > 10000) return 9;
  if (p > 1000) return 11;
  return 13;
}

// Passive reference towns for the itinerary map's geographic backdrop --
// restores real infrastructure that existed before (confirmed: real
// land/border geodata with gazetteer-driven passive towns like Patna,
// Lucknow, Gorakhpur drawn under the route, reviewed and liked), but was
// only ever exercised in sample renders -- never actually queried from a
// live gazetteer in the deployed app. buildRouteMapSVG already supports a
// `gazetteer` param for exactly this; this is what populates it for real.
export async function fetchGazetteerInBBox(db, bbox, { limit = 200 } = {}) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  try {
    const { data, error } = await db.from("gazetteer").select(COLUMNS)
      .gte("lon", minLon).lte("lon", maxLon)
      .gte("lat", minLat).lte("lat", maxLat)
      .order("population", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map(r => ({ ...mapRow(r), rank: populationToRank(r.population) }));
  } catch (e) {
    return [];
  }
}
export async function searchGazetteerDb(db, term, { limit = 15, country = null } = {}) {
  const q = normalizePlaceName(term);
  if (q.length < 2) return [];
  const customPromise = viaCustomPlaces(db, q, limit).catch(() => []);
  let gazetteerResult = [];
  try {
    const rpcResult = await viaRpc(db, q);
    if (rpcResult !== null) {
      gazetteerResult = rpcResult;
    } else {
      const { data, error } = await (() => {
        let builder = db.from("gazetteer").select(COLUMNS).ilike("name", `${q}*`);
        if (country) builder = builder.eq("country", country);
        return builder.order("population", { ascending: false }).limit(limit);
      })();
      if (!error && data) gazetteerResult = data.map(mapRow);
    }
  } catch (e) {
    // fall through with whatever gazetteerResult already holds
  }
  let custom = await customPromise;
  if (country) {
    gazetteerResult = gazetteerResult.filter(r => r.country === country);
    custom = custom.filter(r => r.country === country);
  }
  return [...custom, ...gazetteerResult].slice(0, limit);
}
