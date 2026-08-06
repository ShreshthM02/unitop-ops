// Route map, generated as SVG from the itinerary's own data.
//
// WHY NOT AN AI-GENERATED IMAGE. The hand-made maps this replaces are
// beautiful, but an image model doesn't know where Kushinagar sits relative
// to Lumbini -- it draws something *shaped like* a map, with plausible
// rather than real geography, and it garbles small text, which is fatal for
// a table of exact distances. So the target isn't cartography, it's an
// illustration whose facts happen to be true. That is a drawing problem,
// and drawing is deterministic: we already hold the sectors, distances,
// times and overnight stops in the itinerary, and coordinates are a
// one-time lookup per destination. SVG then renders text perfectly, in
// brand colour, identically every time, at no per-export cost.
//
// The trade honestly stated: this will not have the hand-illustrated
// monument vignettes of a bespoke map. It gains accuracy, consistency and
// automation, and the icon vocabulary below is a small deliberate
// substitute for that charm rather than a pretence of matching it.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Keyed to the brochure's brand palette rather than the beige it started
// with, which sat outside the scheme and made the map look like a different
// document. Water is a desaturated tint of the navy, land is a shade off the
// page so the coastline reads without a hard edge, and the only saturated
// colour anywhere is the lotus red on the tour's own stops -- which is what
// makes them findable at a glance against everything else.
export const MAP_THEME = {
  sea: "#DEE6EC",       // pale tint of the brand navy
  land: "#F4F0E8",      // a shade off the page, so the coast reads softly
  landAlt: "#EFEAE1",
  border: "#C9C2B4",
  coast: "#BFB8A9",
  ink: "#1A3A52",       // brand navy: route lines and stop labels
  accent: "#8B0000",    // lotus red: the tour's own stops, nothing else
  soft: "#98A0A8",      // passive towns
  faint: "#B3BAC2",     // region and country names
  flight: "#4A7C99",
  train: "#6B7F8C",
};

// Equirectangular projection is the right choice at this scale: over a few
// hundred kilometres the distortion is invisible, and it keeps the maths
// simple enough to reason about. A conformal projection would be
// over-engineering for a brochure illustration.
function makeProjection(bbox, width, height, pad) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  // Latitude compression: a degree of longitude shortens as you move away
  // from the equator, so without this the map looks horizontally stretched.
  const latMid = (minLat + maxLat) / 2;
  const lonScale = Math.cos((latMid * Math.PI) / 180);
  const effLonSpan = lonSpan * lonScale;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / effLonSpan, innerH / latSpan);
  const offX = pad + (innerW - effLonSpan * scale) / 2;
  const offY = pad + (innerH - latSpan * scale) / 2;
  return (lon, lat) => [
    offX + (lon - minLon) * lonScale * scale,
    offY + (maxLat - lat) * scale,
  ];
}

function ringToPath(ring, project) {
  let d = "";
  ring.forEach(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return d + "Z";
}

function geometryToPaths(geom, project) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates.map(r => ringToPath(r, project)).join(" ")];
  if (geom.type === "MultiPolygon") return geom.coordinates.map(poly => poly.map(r => ringToPath(r, project)).join(" "));
  return [];
}

// A gentle arc rather than a straight line between stops. Straight segments
// on a route map read as engineering; a slight bow reads as a journey, and
// it also stops overlapping legs from sitting exactly on top of each other.
function arcPath(from, to, bend = 0.16) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

// Labels are placed away from the map's centre of mass, which keeps them off
// the route lines in the common case without needing a full collision
// solver. Not perfect; predictable, which matters more.
function labelAnchor(x, y, cx, cy) {
  return x >= cx ? { anchor: "start", dx: 7 } : { anchor: "end", dx: -7 };
}

// Turns the days a stop is occupied into a readable pin label: consecutive
// days collapse to a range ("1-3"), a place returned to later lists both
// blocks ("1-3, 8"). A single arbitrary number on a place the group sleeps
// at for three nights misreports the itinerary.
export function formatDayLabel(days) {
  const list = [...new Set((days || []).filter(d => Number.isFinite(d)))].sort((a, b) => a - b);
  if (!list.length) return "";
  const runs = [];
  let start = list[0], prev = list[0];
  for (let i = 1; i <= list.length; i++) {
    const d = list[i];
    if (d === prev + 1) { prev = d; continue; }
    runs.push(start === prev ? `${start}` : `${start}\u2013${prev}`);
    start = prev = d;
  }
  return runs.join(", ");
}

// GATEWAY STOPS -- the traveller's origin and final destination.
//
// The test is ROLE, not distance. A domestic flight between two places the
// group actually visits -- Delhi to Leh, Delhi to Mumbai -- is part of the
// service and belongs on the map as a proper flight arc, even when that
// means zooming the map out to hold both. What does NOT belong is the city
// the traveller flies in from and back to: Bangkok, Hong Kong, Taipei. That
// is context, not itinerary.
//
// Once it is context, it should not be drawn as geography at all. An earlier
// version put arrows through the frame edge for these, which duplicated what
// the sector table already said and piled both labels into the same corner
// when the origin and destination happened to lie in the same direction.
// They are now excluded from the map and reported as a line of text, which
// is what information wants to be.
//
// A gateway is the origin of the first sector or the destination of the last
// one, provided the place is not otherwise visited during the tour.
export function partitionGateways(stops, sectors) {
  const list = sectors || [];
  if (!list.length) return { ground: stops, gateways: [] };

  const byName = new Map(stops.map(s => [s.name, s]));
  const first = list[0];
  const last = list[list.length - 1];

  // Appearances in the MIDDLE of the itinerary -- every leg except the first
  // and the last. A gateway typically appears twice, flown into on day 1 and
  // out of on the final day, so counting total appearances would wrongly
  // treat it as a visited place. What marks a real destination is being
  // touched by a leg that is neither the arrival nor the departure.
  const middle = list.slice(1, Math.max(1, list.length - 1));
  const visited = new Set();
  middle.forEach(sec => { visited.add(sec.from); visited.add(sec.to); });

  // Structure alone cannot separate "Bangkok - ... - Bangkok" from a loop
  // tour that starts and ends at Bodhgaya: both appear only at the two ends.
  // Nights are the only reliable signal, so the demotion is applied ONLY when
  // night data exists to judge by. Where it doesn't, every place stays on the
  // map -- wrongly dropping a real destination is far worse than wrongly
  // drawing an origin.
  const haveNightData = stops.some(s2 => Array.isArray(s2.days) && s2.days.length);

  const gateways = [];
  const seen = new Set();
  const consider = (name, leg, kind) => {
    if (!name || seen.has(name + kind)) return;
    if (visited.has(name)) return;                 // touched mid-tour: a real destination
    // Nights are the deciding signal. Nobody stays in the city they fly in
    // from, so a place with days assigned to it is part of the tour even
    // when it happens to sit at both ends -- which is exactly Delhi on a
    // Delhi-Leh-Agra-Delhi itinerary, and exactly not Bangkok.
    const stop = byName.get(name);
    if (!haveNightData) return;
    if (stop && Array.isArray(stop.days) && stop.days.length) return;
    if (stop && stop.overnight === true) return;
    if ((leg.mode || "road") !== "flight") return; // driven in/out: still part of the tour
    seen.add(name + kind);
    gateways.push({
      ...(byName.get(name) || { name }),
      kind,
      flight: leg.flightNo || leg.label || "",
      day: leg.day ?? null,
      counterpart: kind === "arrival" ? leg.to : leg.from,
    });
  };
  consider(first.from, first, "arrival");
  consider(last.to, last, "departure");

  const gatewayNames = new Set(gateways.map(g => g.name));
  return { ground: stops.filter(s => !gatewayNames.has(s.name)), gateways };
}

// One line of text describing how the traveller arrives and leaves. Flight
// numbers are optional -- an itinerary quoted against an enquiry often has
// "Hong Kong - Delhi" and nothing more, and that is still worth stating.
export function gatewayNoteHTML(gateways, theme = MAP_THEME) {
  if (!gateways || !gateways.length) return "";
  const part = (g) => {
    const label = g.kind === "arrival" ? "Arrival" : "Departure";
    const leg = g.kind === "arrival" ? `${g.name} \u2013 ${g.counterpart}` : `${g.counterpart} \u2013 ${g.name}`;
    const bits = [leg, g.flight, g.day != null ? `Day ${g.day}` : ""].filter(Boolean).join("  \u00b7  ");
    return `<span style="white-space:nowrap"><strong style="color:${theme.ink}">${esc(label)}</strong> ${esc(bits)}</span>`;
  };
  return `<div style="display:flex;gap:10mm;flex-wrap:wrap;font-size:8.5pt;color:${theme.soft};
    padding-top:3mm;margin-top:1mm;border-top:0.5pt solid ${theme.border}">
    ${gateways.map(part).join("")}
  </div>`;
}

export function computeBBox(points, padDeg = 0.9) {
  const lons = points.map(p => p.lon);
  const lats = points.map(p => p.lat);
  return [
    Math.min(...lons) - padDeg,
    Math.min(...lats) - padDeg,
    Math.max(...lons) + padDeg,
    Math.max(...lats) + padDeg,
  ];
}

/**
 * stops:    [{ name, lon, lat, dayLabel, overnight, kind }]
 * sectors:  [{ from, to, distance, time, mode }]  mode: 'road' | 'flight'
 * features: GeoJSON features for the land beneath (states, countries)
 */
// Reference places and region names carry no itinerary meaning -- they exist
// so the drawing reads as a MAP rather than a diagram of eight dots floating
// on a blank field. They are deliberately quiet: small, grey, unmarked or
// hairline-dotted, and never allowed to compete with the tour's own stops.
// How many passive towns to show, by how much ground the map covers. A
// continent-wide itinerary showing every district town becomes noise; a
// single-state map showing only megacities looks empty. Natural Earth's
// scalerank is an importance ordering, so the threshold moves with the
// extent -- standard cartographic practice, not a guess.
export function rankThresholdForSpan(spanDeg) {
  // Raised across the board: the map read as sparse, and empty ground makes
  // a route look like a diagram rather than a journey through populated
  // country. GeoNames goes down to village level, so at tight spans this
  // deliberately lets almost everything through and relies on maxReference
  // plus the label-collision guard to keep it readable.
  if (spanDeg > 30) return 6;
  if (spanDeg > 18) return 8;
  if (spanDeg > 10) return 10;
  if (spanDeg > 5) return 12;
  return 14;
}

export function buildRouteMapSVG({
  stops = [],
  sectors = [],
  features = [],
  // Land is drawn in two layers on purpose. `features` used to carry only
  // the handful of states a tour crossed, so every square inch outside them
  // rendered as sea -- which is why the map had large flat blue areas where
  // there is in fact land. `land` carries whole-country polygons so the
  // ground is continuous, and `borders` draws internal state outlines on top
  // as hairlines. Water is then only genuinely water.
  land = [],
  borders = [],
  reference = [],
  regions = [],
  countries = [],
  gazetteer = null,
  maxReference = 45,
  width = 900,
  height = 620,
  pad = 34,
  theme = MAP_THEME,
  title = "",
  showLegend = true,
} = {}) {
  if (!stops.length) return "";

  // Frame on the GROUND itinerary. A gateway thousands of kilometres away
  // would otherwise stretch the extent until the tour itself is unreadable.
  const split = partitionGateways(stops, sectors);
  const groundStops = split.ground.length ? split.ground : stops;
  const gateways = split.gateways;
  const bbox = computeBBox(groundStops);
  // Auto-select passive towns from the gazetteer when one is supplied, so the
  // map fills in appropriately whatever region the itinerary covers -- rather
  // than relying on a hand-typed list that only suits one tour.
  let passive = reference;
  if (gazetteer && gazetteer.length) {
    const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
    const maxRank = rankThresholdForSpan(span);
    const named = new Set(stops.map(x => (x.name || "").toLowerCase()));
    passive = gazetteer
      .filter(g => g.lon >= bbox[0] && g.lon <= bbox[2] && g.lat >= bbox[1] && g.lat <= bbox[3])
      .filter(g => (g.rank ?? 10) <= maxRank)
      // Never draw a passive dot where the tour already has a stop -- the
      // duplicate label is the most obvious way a generated map looks wrong.
      .filter(g => !named.has((g.name || "").toLowerCase()))
      .sort((a, b) => (a.rank ?? 10) - (b.rank ?? 10))
      .slice(0, maxReference);
  }
  const project = makeProjection(bbox, width, height, pad);
  const pts = groundStops.map(s => ({
    ...s,
    dayLabel: s.dayLabel != null ? s.dayLabel : formatDayLabel(s.days),
    xy: project(s.lon, s.lat),
  }));
  const cx = pts.reduce((a, p) => a + p.xy[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.xy[1], 0) / pts.length;
  const byName = new Map(pts.map(p => [p.name, p]));

  const landSource = land.length ? land : features;
  const landPaths = landSource.map(f =>
    geometryToPaths(f.geometry, project)
      .map(d => `<path d="${d}" fill="${theme.land}" stroke="none"/>`).join("")
  ).join("");
  const borderPaths = borders.map(f =>
    geometryToPaths(f.geometry, project)
      .map(d => `<path d="${d}" fill="none" stroke="${theme.border}" stroke-width="0.6" stroke-dasharray="3 2.5" opacity="0.75"/>`).join("")
  ).join("");

  const gatewayNames = new Set(gateways.map(g => g.name));
  const legs = sectors.map(sec => {
    // A leg touching a gateway is represented by that gateway's edge arrow,
    // not by an arc to a pin that isn't on the map.
    if (gatewayNames.has(sec.from) || gatewayNames.has(sec.to)) return "";
    const a = byName.get(sec.from);
    const b = byName.get(sec.to);
    if (!a || !b) return "";
    const mode = sec.mode || "road";
    const stroke = mode === "flight" ? theme.flight : mode === "train" ? theme.train : theme.ink;
    const dash = mode === "flight" ? `stroke-dasharray="6 5"` : mode === "train" ? `stroke-dasharray="2 3"` : "";
    return `<path d="${arcPath(a.xy, b.xy)}" fill="none"
      stroke="${stroke}" stroke-width="${mode === "road" ? 2.1 : 1.7}"
      stroke-linecap="round" ${dash} opacity="${mode === "road" ? 0.92 : 0.85}"/>`;
  }).join("");

  // Drawn BEFORE the route and the real stops, so anything that collides
  // ends up underneath rather than on top of the itinerary.
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  // Which tier carries the map: wide spans are read by country, regional
  // spans by state, tight spans by district.
  const primaryTier = span > 20 ? "country" : span > 6 ? "region" : "local";
  // The country holding most of the tour's stops is the one the reader is
  // already oriented in; labelling it adds nothing.
  const homeCountry = (() => {
    const tally = {};
    stops.forEach(s2 => { if (s2.country) tally[s2.country] = (tally[s2.country] || 0) + 1; });
    return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;
  })();
  const countryLabels = countries.filter(c => primaryTier === "country" || c.name !== homeCountry).map(c => {
    const [x, y] = project(c.lon, c.lat);
    const inset = pad + 20;
    if (x < inset || x > width - inset || y < inset || y > height - inset) return "";
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="${primaryTier === "country" ? 16 : 12}" font-weight="700"
      letter-spacing="${primaryTier === "country" ? 4 : 3}" fill="${theme.faint}" opacity="0.7">${esc((c.name || "").toUpperCase())}</text>`;
  }).join("");

  const regionLabels = regions.map(r => {
    const [x, y] = project(r.lon, r.lat);
    const inset = pad + 26;
    if (x < inset || x > width - inset || y < inset || y > height - inset) return "";
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="${primaryTier === "country" ? 9 : (r.size || 12)}"
      letter-spacing="${r.spacing || 2.6}" fill="${theme.faint}" opacity="0.75"
      text-transform="uppercase">${esc((r.name || "").toUpperCase())}</text>`;
  }).join("");

  const referenceMarks = passive.map(r => {
    const [x, y] = project(r.lon, r.lat);
    if (x < pad || x > width - pad || y < pad || y > height - pad) return "";
    return `<g>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" fill="${theme.soft}"/>
      <text x="${(x + 4.5).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="start"
        font-family="Helvetica, Arial, sans-serif" font-size="8.5" fill="${theme.soft}">${esc(r.name)}</text>
    </g>`;
  }).join("");

  const markers = pts.map(p => {
    const [x, y] = p.xy;
    const { anchor, dx } = labelAnchor(x, y, cx, cy);
    const overnight = p.overnight !== false;
    const label = String(p.dayLabel || "");
    // Width follows the label: a single digit stays a disc, "1-3" or "1-3, 8"
    // becomes a pill. Sizing it to the text is what stops the number
    // overflowing the marker.
    const w = label.length <= 1 ? 11 : 7 + label.length * 4.6;
    const h = 11;
    const shape = overnight
      ? `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}"
           rx="${(h / 2).toFixed(1)}" fill="${theme.accent}" stroke="#fff" stroke-width="1.5"/>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.8" fill="#fff" stroke="${theme.accent}" stroke-width="1.8"/>`;
    // Place labels clear the pill's actual half-width, not a fixed offset,
    // so a wide pill never sits under its own name.
    const off = (overnight ? w / 2 : 4) + 4;
    return `<g>
      ${shape}
      ${overnight && label ? `<text x="${x.toFixed(1)}" y="${(y + 2.5).toFixed(1)}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="7.2" font-weight="700" fill="#fff">${esc(label)}</text>` : ""}
      <text x="${(x + (anchor === "start" ? off : -off)).toFixed(1)}" y="${(y + 3.4).toFixed(1)}" text-anchor="${anchor}"
        font-family="Georgia, serif" font-size="12.5" font-weight="700" fill="${theme.ink}"
        stroke="${theme.land}" stroke-width="2.6" paint-order="stroke">${esc(p.name)}</text>
    </g>`;
  }).join("");

  const hasRoad = sectors.some(x => (x.mode || "road") === "road");
  const hasFlight = legs.includes("stroke-dasharray=\"6 5\"");
  const hasTrain = sectors.some(x => x.mode === "train");
  const legendRows = [
    hasRoad && { y: 0, draw: `<line x1="0" y1="Y" x2="22" y2="Y" stroke="${theme.ink}" stroke-width="2.1" stroke-linecap="round"/>`, label: "Road sector" },
    hasTrain && { draw: `<line x1="0" y1="Y" x2="22" y2="Y" stroke="${theme.train}" stroke-width="1.8" stroke-dasharray="2 3" stroke-linecap="round"/>`, label: "Train sector" },
    hasFlight && { draw: `<line x1="0" y1="Y" x2="22" y2="Y" stroke="${theme.flight}" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>`, label: "Flight sector" },
    { draw: `<circle cx="11" cy="Y" r="5.2" fill="${theme.accent}" stroke="#fff" stroke-width="1.6"/>`, label: "Overnight stay" },
  ].filter(Boolean);
  const legendH = legendRows.length * 16 + 14;
  const legendBuilt = showLegend ? `
    <g transform="translate(${pad}, ${height - pad - legendH})">
      <rect x="-8" y="-12" width="150" height="${legendH}" rx="4" fill="#fff" opacity="0.86" stroke="${theme.border}" stroke-width="0.8"/>
      ${legendRows.map((r, i) => `${r.draw.replace(/Y/g, String(i * 16))}
        <text x="29" y="${i * 16 + 3.5}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${theme.soft}">${esc(r.label)}</text>`).join("")}
    </g>` : "";



  const titleEl = title ? `<text x="${pad}" y="${pad - 8}" font-family="Georgia, serif" font-size="15"
    font-weight="700" fill="${theme.ink}">${esc(title)}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${theme.sea}"/>
    ${landPaths}
    ${borderPaths}
    ${countryLabels}
    ${regionLabels}
    ${referenceMarks}
    ${legs}
    ${markers}
    ${legendBuilt}
    ${titleEl}
  </svg>`;
}

// The sector table that sits beside the map. Generated from the same data,
// so the two can never disagree -- which is the failure mode of a map drawn
// once by hand and an itinerary edited afterwards.
// The sector table lists EVERY day, not only days with a road leg. The
// previous version was driven off sectors alone, so days 1, 2, 8 and 9 --
// arrival, a local sightseeing day, a city day and departure -- simply
// vanished from a table headed "Day", which reads as a document with holes
// in it rather than as a deliberate omission.
//
// A rule separates DAYS, never legs within a day, so a break journey reads
// as one day with two movements rather than two unrelated rows.
export function buildSectorTableHTML(sectors, theme = MAP_THEME, days = null) {
  const list = sectors || [];
  if (!list.length && !(days && days.length)) return "";

  // Group legs by day. Days with no leg still get a row, labelled with
  // whatever the day is actually about.
  const rows = [];
  if (days && days.length) {
    days.forEach((d, idx) => {
      const dayNo = idx + 1;
      const legs = list.filter(sec => sec.day === dayNo);
      if (legs.length) {
        legs.forEach((leg, k) => rows.push({
          label: k === 0 ? String(dayNo).padStart(2, "0") : "",
          text: `${leg.from} – ${leg.to}`,
          meta: [leg.distance, leg.time].filter(Boolean).join(" · "),
          last: k === legs.length - 1,
        }));
      } else {
        rows.push({
          label: String(dayNo).padStart(2, "0"),
          text: d.title || "At leisure",
          meta: "",
          last: true,
        });
      }
    });
  } else {
    list.forEach((leg, i) => {
      const prev = list[i - 1];
      const same = prev && leg.day && prev.day === leg.day;
      const next = list[i + 1];
      rows.push({
        label: same ? "" : String(leg.day ?? i + 1).padStart(2, "0"),
        text: `${leg.from} – ${leg.to}`,
        meta: [leg.distance, leg.time].filter(Boolean).join(" · "),
        last: !(next && leg.day && next.day === leg.day),
      });
    });
  }

  const body = rows.map(r => {
    const rule = r.last ? `0.4pt solid ${theme.border}` : "0";
    return `<tr>
      <td style="padding:2.2mm 2mm 2.2mm 0;font-size:8pt;border-bottom:${rule};color:${theme.accent};font-weight:700;width:8mm">${esc(r.label)}</td>
      <td style="padding:2.2mm 2mm 2.2mm 0;font-size:8.5pt;border-bottom:${rule}">${esc(r.text)}</td>
      <td style="padding:2.2mm 0;font-size:8pt;border-bottom:${rule};color:${theme.soft};text-align:right;white-space:nowrap">${esc(r.meta)}</td>
    </tr>`;
  }).join("");

  return `<table style="width:100%;border-collapse:collapse"><tbody>${body}</tbody></table>`;
}

export const svgToDataUri = (svg) =>
  "data:image/svg+xml;base64," + (typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg, "utf8").toString("base64"));
