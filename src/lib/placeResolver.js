// Resolving a typed place name to coordinates.
//
// GOVERNING PRINCIPLE, and it shapes every signature below: the user must
// never feel helpless. Even when this module is certain, it returns its
// alternatives and says why it chose what it chose, so the interface can
// always show the working and always accept a correction. Nothing here
// silently commits a decision the operator cannot see or change. A confident
// wrong pin that offers no way to argue with it is worse than an honest
// question -- the operator usually knows the right answer, and the software's
// job is to get out of the way, not to be clever at them.
//
// The gazetteer shape is deliberately plain so the source can change without
// touching this file. Natural Earth today, GeoNames (half a million Indian
// places, down to village level) once imported:
//   { name, lat, lon, country, admin1, population, alt: [other spellings] }

const DIACRITICS = /[\u0300-\u036f]/g;

export function normalizePlaceName(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[.'\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Indian place names carry a lot of spelling drift, and GeoNames' alternate
// names do not cover every form an agent might type. These are the ones that
// actually recur in this business.
export const NAME_ALIASES = {
  "benares": "varanasi", "kashi": "varanasi", "banaras": "varanasi",
  "bodh gaya": "bodhgaya", "buddha gaya": "bodhgaya",
  "shravasti": "sravasti", "sahet mahet": "sravasti",
  "rajagriha": "rajgir", "rajgriha": "rajgir",
  "prayagraj": "allahabad", "prayag": "allahabad",
  "calcutta": "kolkata", "bombay": "mumbai", "madras": "chennai",
  "bangalore": "bengaluru", "poona": "pune", "mysore": "mysuru",
  "trivandrum": "thiruvananthapuram", "cochin": "kochi",
  "gurgaon": "gurugram", "simla": "shimla", "pondicherry": "puducherry",
  "kathmandu valley": "kathmandu",
};

export function canonicalName(value) {
  const n = normalizePlaceName(value);
  return NAME_ALIASES[n] || n;
}

const R_KM = 6371;
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Cheap edit distance, capped -- we only care whether a name is a near miss,
// not exactly how far off it is.
export function editDistance(a, b, cap = 4) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

export const MATCH = { EXACT: "exact", ALIAS: "alias", PREFIX: "prefix", FUZZY: "fuzzy" };

function matchKind(queryCanon, entry) {
  const nameCanon = canonicalName(entry.name);
  if (nameCanon === queryCanon) return MATCH.EXACT;
  const alts = (entry.alt || []).map(canonicalName);
  if (alts.includes(queryCanon)) return MATCH.ALIAS;
  if (nameCanon.startsWith(queryCanon) && queryCanon.length >= 4) return MATCH.PREFIX;
  if (editDistance(nameCanon, queryCanon) <= (queryCanon.length > 7 ? 2 : 1)) return MATCH.FUZZY;
  return null;
}

const KIND_SCORE = { exact: 100, alias: 92, prefix: 70, fuzzy: 55 };

/**
 * Ranked candidates for a typed name.
 *
 * `context` is the coordinates of places already resolved in the SAME
 * itinerary, and it does most of the useful work: an itinerary that already
 * contains Bodhgaya and Varanasi makes "Aurangabad" overwhelmingly the Bihar
 * one rather than Maharashtra's. This is what keeps the interface from asking
 * questions the itinerary has already answered.
 */
export function rankCandidates(query, gazetteer, { context = [], limit = 8 } = {}) {
  const q = canonicalName(query);
  if (!q) return [];
  const out = [];
  (gazetteer || []).forEach(entry => {
    const kind = matchKind(q, entry);
    if (!kind) return;
    let score = KIND_SCORE[kind];

    // Bigger places are likelier to be meant, but only as a tie-breaker --
    // never enough to beat a better name match.
    const pop = Number(entry.population) || 0;
    if (pop > 0) score += Math.min(8, Math.log10(pop + 1) * 1.6);

    // Proximity to the rest of the itinerary.
    let nearestKm = null;
    if (context.length) {
      nearestKm = Math.min(...context.map(c => haversineKm(entry, c)));
      if (nearestKm < 150) score += 14;
      else if (nearestKm < 400) score += 9;
      else if (nearestKm < 900) score += 3;
      else if (nearestKm > 2000) score -= 8;
    }
    out.push({ ...entry, kind, score: Math.round(score * 10) / 10, nearestKm: nearestKm == null ? null : Math.round(nearestKm) });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Resolves a name, and ALWAYS reports enough for the interface to let the
 * user disagree: the chosen candidate, every alternative considered, and
 * whether the choice was close enough to be worth confirming.
 *
 * `status` is advisory, never a gate:
 *   resolved   -- one clear winner
 *   ambiguous  -- several plausible, ask
 *   weak       -- only a fuzzy match, show it but flag it
 *   unmatched  -- nothing found; the interface offers manual placement
 */
export function resolvePlace(query, gazetteer, options = {}) {
  const candidates = rankCandidates(query, gazetteer, options);
  if (!candidates.length) {
    return { status: "unmatched", match: null, candidates: [], needsConfirmation: true, reason: "No place of that name was found." };
  }
  const [best, second] = candidates;
  const margin = second ? best.score - second.score : Infinity;

  let status = "resolved";
  let reason = "";
  if (best.kind === MATCH.FUZZY) {
    status = "weak";
    reason = `Closest spelling match to "${query}".`;
  } else if (second && margin < 8) {
    status = "ambiguous";
    reason = `Also matches ${second.name}${second.admin1 ? `, ${second.admin1}` : ""}.`;
  } else if (best.nearestKm != null && best.nearestKm > 1500) {
    // Plausible by name but a long way from everything else in the tour --
    // worth a glance rather than a silent accept.
    status = "ambiguous";
    reason = `${best.nearestKm} km from the rest of the itinerary.`;
  } else {
    reason = best.kind === MATCH.EXACT ? "Exact name match." : "Matched a known alternative spelling.";
  }

  return {
    status,
    match: best,
    candidates,
    // Even a clean resolve stays confirmable -- the interface should show
    // what was chosen and allow a change, not just when it is unsure.
    needsConfirmation: status !== "resolved",
    reason,
  };
}

// Free-text search for the picker, so someone who knows the answer can go
// and find it instead of arguing with a ranked guess.
export function searchGazetteer(query, gazetteer, { limit = 20, country = null } = {}) {
  const q = normalizePlaceName(query);
  if (q.length < 2) return [];
  const out = [];
  (gazetteer || []).forEach(entry => {
    if (country && entry.country !== country) return;
    const n = normalizePlaceName(entry.name);
    const hit = n.startsWith(q) ? 3 : n.includes(q) ? 2
      : (entry.alt || []).some(a => normalizePlaceName(a).includes(q)) ? 1 : 0;
    if (!hit) return;
    out.push({ ...entry, hit, population: Number(entry.population) || 0 });
  });
  return out
    .sort((a, b) => b.hit - a.hit || b.population - a.population)
    .slice(0, limit);
}

// A coordinate the user placed or typed themselves. Always available, and
// always wins -- this is the escape hatch that guarantees nobody is ever
// stuck with a match they know is wrong.
// Real-world coordinates rarely arrive as a bare "25.3762" -- copying one
// off a phone's GPS app, Google Maps' own "25.3762° N" display, or a GPX
// file commonly includes a degree symbol and a cardinal direction letter,
// none of which Number() can parse (Number("25.3762° N") is NaN). This is
// the confirmed real cause of "Use these" appearing to do nothing: the
// button was correctly disabled because the coordinate genuinely could not
// be parsed, just with no indication that WAS the problem.
export function parseCoordinateInput(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  const m = s.match(/^(-?\d+\.?\d*)\s*°?\s*([NSEWnsew])?$/);
  if (!m) return Number(s);
  const value = Number(m[1]);
  const dir = m[2] ? m[2].toUpperCase() : null;
  return (dir === "S" || dir === "W") ? -Math.abs(value) : value;
}

export function manualPlace(name, lat, lon, extra = {}) {
  return { name, lat: parseCoordinateInput(lat), lon: parseCoordinateInput(lon), source: "manual", ...extra };
}

export function isValidCoordinate(lat, lon) {
  const a = parseCoordinateInput(lat), b = parseCoordinateInput(lon);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}
