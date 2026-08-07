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

// Candidates for resolvePlace(): searches both the raw text and its known
// canonical spelling ("Benares" -> also searches "varanasi"), so an aliased
// name reaches the database query, not just the in-memory alias table.
export async function fetchPlaceCandidates(db, query, { limit = 60 } = {}) {
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

// Typeahead for the picker's search box: prefix match, which is what the
// gazetteer_name_idx (lower(name)) is built to serve quickly at this scale.
export async function searchGazetteerDb(db, term, { limit = 15, country = null } = {}) {
  const q = normalizePlaceName(term);
  if (q.length < 2) return [];
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
