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

export const MAP_THEME = {
  sea: "#EFE8DA",
  land: "#F7F2E7",
  landAlt: "#F0E9DA",
  border: "#D9CEB8",
  ink: "#1B2B3A",
  accent: "#B4622D",
  soft: "#8A8172",
  flight: "#2F6D8C",
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
export function buildRouteMapSVG({
  stops = [],
  sectors = [],
  features = [],
  reference = [],
  regions = [],
  width = 900,
  height = 620,
  pad = 34,
  theme = MAP_THEME,
  title = "",
  showLegend = true,
} = {}) {
  if (!stops.length) return "";

  const bbox = computeBBox(stops);
  const project = makeProjection(bbox, width, height, pad);
  const pts = stops.map(s => ({ ...s, xy: project(s.lon, s.lat) }));
  const cx = pts.reduce((a, p) => a + p.xy[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.xy[1], 0) / pts.length;
  const byName = new Map(pts.map(p => [p.name, p]));

  const landPaths = features.map((f, i) => {
    const paths = geometryToPaths(f.geometry, project);
    const fill = i % 2 === 0 ? theme.land : theme.landAlt;
    return paths.map(d => `<path d="${d}" fill="${fill}" stroke="${theme.border}" stroke-width="0.8"/>`).join("");
  }).join("");

  const legs = sectors.map(sec => {
    const a = byName.get(sec.from);
    const b = byName.get(sec.to);
    if (!a || !b) return "";
    const flight = sec.mode === "flight";
    return `<path d="${arcPath(a.xy, b.xy)}" fill="none"
      stroke="${flight ? theme.flight : theme.ink}"
      stroke-width="${flight ? 1.6 : 2.1}"
      stroke-linecap="round"
      ${flight ? `stroke-dasharray="6 5"` : ""}
      opacity="${flight ? 0.85 : 0.9}"/>`;
  }).join("");

  // Drawn BEFORE the route and the real stops, so anything that collides
  // ends up underneath rather than on top of the itinerary.
  const regionLabels = regions.map(r => {
    const [x, y] = project(r.lon, r.lat);
    if (x < pad || x > width - pad || y < pad || y > height - pad) return "";
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="${r.size || 11}"
      letter-spacing="${r.spacing || 2.4}" fill="${theme.soft}" opacity="0.5"
      text-transform="uppercase">${esc((r.name || "").toUpperCase())}</text>`;
  }).join("");

  const referenceMarks = reference.map(r => {
    const [x, y] = project(r.lon, r.lat);
    if (x < pad || x > width - pad || y < pad || y > height - pad) return "";
    return `<g opacity="0.55">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${theme.soft}"/>
      <text x="${(x + 5).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="start"
        font-family="Helvetica, Arial, sans-serif" font-size="8.5" fill="${theme.soft}">${esc(r.name)}</text>
    </g>`;
  }).join("");

  const markers = pts.map(p => {
    const [x, y] = p.xy;
    const { anchor, dx } = labelAnchor(x, y, cx, cy);
    const overnight = p.overnight !== false;
    return `<g>
      ${overnight ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9.5" fill="${theme.accent}" opacity="0.16"/>` : ""}
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${overnight ? 5.2 : 3.8}"
        fill="${overnight ? theme.accent : theme.paper || "#fff"}"
        stroke="${overnight ? "#fff" : theme.accent}" stroke-width="${overnight ? 1.6 : 1.8}"/>
      ${p.dayLabel ? `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle"
        font-family="Georgia, serif" font-size="7" font-weight="700" fill="#fff">${esc(p.dayLabel)}</text>` : ""}
      <text x="${(x + dx).toFixed(1)}" y="${(y + 3.4).toFixed(1)}" text-anchor="${anchor}"
        font-family="Georgia, serif" font-size="12.5" font-weight="700" fill="${theme.ink}">${esc(p.name)}</text>
    </g>`;
  }).join("");

  const legend = showLegend ? `
    <g transform="translate(${pad}, ${height - pad - 44})">
      <rect x="-8" y="-14" width="150" height="58" rx="4" fill="#fff" opacity="0.82" stroke="${theme.border}" stroke-width="0.8"/>
      <line x1="0" y1="0" x2="22" y2="0" stroke="${theme.ink}" stroke-width="2.1" stroke-linecap="round"/>
      <text x="29" y="3.5" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${theme.soft}">Road sector</text>
      <line x1="0" y1="16" x2="22" y2="16" stroke="${theme.flight}" stroke-width="1.6" stroke-dasharray="6 5" stroke-linecap="round"/>
      <text x="29" y="19.5" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${theme.soft}">Flight sector</text>
      <circle cx="11" cy="32" r="5.2" fill="${theme.accent}" stroke="#fff" stroke-width="1.6"/>
      <text x="29" y="35.5" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${theme.soft}">Overnight stay</text>
    </g>` : "";

  const titleEl = title ? `<text x="${pad}" y="${pad - 8}" font-family="Georgia, serif" font-size="15"
    font-weight="700" fill="${theme.ink}">${esc(title)}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${theme.sea}"/>
    ${landPaths}
    ${regionLabels}
    ${referenceMarks}
    ${legs}
    ${markers}
    ${legend}
    ${titleEl}
  </svg>`;
}

// The sector table that sits beside the map. Generated from the same data,
// so the two can never disagree -- which is the failure mode of a map drawn
// once by hand and an itinerary edited afterwards.
export function buildSectorTableHTML(sectors, theme = MAP_THEME) {
  if (!sectors || !sectors.length) return "";
  const rows = sectors.map((s, i) => `<tr>
    <td style="padding:2.2mm 2mm 2.2mm 0;font-size:8pt;border-bottom:0.4pt solid ${theme.border};color:${theme.accent};font-weight:700;width:7mm">${i + 1}</td>
    <td style="padding:2.2mm 2mm 2.2mm 0;font-size:8.5pt;border-bottom:0.4pt solid ${theme.border}">${esc(s.from)} – ${esc(s.to)}</td>
    <td style="padding:2.2mm 0;font-size:8pt;border-bottom:0.4pt solid ${theme.border};color:${theme.soft};text-align:right;white-space:nowrap">${esc([s.distance, s.time].filter(Boolean).join(" · "))}</td>
  </tr>`).join("");
  const total = sectors.reduce((sum, s) => {
    const km = parseFloat(String(s.distance || "").replace(/[^\d.]/g, ""));
    return sum + (isNaN(km) ? 0 : km);
  }, 0);
  return `<table style="width:100%;border-collapse:collapse">
    <tbody>${rows}</tbody>
    ${total > 0 ? `<tfoot><tr>
      <td colspan="2" style="padding:2.6mm 2mm 0 0;font-size:7pt;letter-spacing:1.6px;text-transform:uppercase;color:${theme.soft};font-weight:700">Total road distance</td>
      <td style="padding:2.6mm 0 0;font-size:9pt;text-align:right;font-weight:700;color:${theme.ink};white-space:nowrap">${Math.round(total).toLocaleString("en-IN")} km</td>
    </tr></tfoot>` : ""}
  </table>`;
}

export const svgToDataUri = (svg) =>
  "data:image/svg+xml;base64," + (typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg, "utf8").toString("base64"));
