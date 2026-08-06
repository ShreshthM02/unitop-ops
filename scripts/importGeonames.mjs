#!/usr/bin/env node
/**
 * One-time import of the GeoNames gazetteer into Supabase.
 *
 * WHY THIS EXISTS. The route map and the place resolver both need to turn a
 * typed place name into coordinates, for any place a client might name --
 * not from a curated list, because no list survives contact with "can you
 * quote me something through Chitrakoot". GeoNames covers India down to
 * village level (roughly half a million populated places) and is CC-BY
 * licensed, so commercial use is fine with attribution.
 *
 * RUN IT LIKE THE MIGRATIONS -- once, from a machine with internet:
 *
 *   1. Create the table (SQL below, in the Supabase SQL editor).
 *   2. node scripts/importGeonames.mjs
 *
 * It is safe to re-run: rows are upserted on geoname_id.
 *
 * ── TABLE ───────────────────────────────────────────────────────────────
 *   create table gazetteer (
 *     geoname_id   bigint primary key,
 *     name         text not null,
 *     ascii_name   text,
 *     alt_names    text[],
 *     lat          double precision not null,
 *     lon          double precision not null,
 *     country      text,
 *     admin1       text,
 *     population   bigint default 0,
 *     feature_code text
 *   );
 *   create index gazetteer_name_idx  on gazetteer (lower(name));
 *   create index gazetteer_ascii_idx on gazetteer (lower(ascii_name));
 *   create index gazetteer_pop_idx   on gazetteer (population desc);
 *   -- Fuzzy search for the "did you mean" path:
 *   create extension if not exists pg_trgm;
 *   create index gazetteer_trgm_idx on gazetteer using gin (lower(name) gin_trgm_ops);
 *
 *   alter table gazetteer enable row level security;
 *   create policy "gazetteer read" on gazetteer for select to anon using (true);
 *   -- Read-only for the app: it is reference data, never written at runtime.
 *
 * ATTRIBUTION: GeoNames is CC-BY 4.0. Credit belongs somewhere in the app
 * (an About or Settings line), not on client-facing documents.
 */

import { createWriteStream } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { execFileSync } from "child_process";

// Countries worth holding. India first; the neighbours matter because
// itineraries cross into Nepal, Bhutan and Sri Lanka regularly.
const COUNTRIES = (process.env.GEONAMES_COUNTRIES || "IN,NP,BT,BD,LK,MM,PK,TH").split(",");

// GeoNames feature classes: P is populated places. Including everything else
// (rivers, ridges, farms) would multiply the row count for no benefit -- the
// resolver is looking up towns, not terrain.
const FEATURE_CLASS = "P";

// Below this, GeoNames is full of hamlets that add noise to autocomplete
// without ever being sold. Set GEONAMES_MIN_POP=0 to keep everything.
const MIN_POP = Number(process.env.GEONAMES_MIN_POP ?? 0);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY (service key, not anon -- this writes).");
  process.exit(1);
}

const BATCH = 500;

async function download(country, dir) {
  const url = `https://download.geonames.org/export/dump/${country}.zip`;
  const zip = join(dir, `${country}.zip`);
  process.stdout.write(`  ${country}: downloading… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${country}: HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(zip));
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  console.log("ok");
  return join(dir, `${country}.txt`);
}

// GeoNames dumps are tab-separated with a fixed column order and no header.
const COL = {
  id: 0, name: 1, ascii: 2, alt: 3, lat: 4, lon: 5,
  fclass: 6, fcode: 7, country: 8, admin1: 10, population: 14,
};

async function* rows(file) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const f = line.split("\t");
    if (f[COL.fclass] !== FEATURE_CLASS) continue;
    const pop = Number(f[COL.population]) || 0;
    if (pop < MIN_POP) continue;
    yield {
      geoname_id: Number(f[COL.id]),
      name: f[COL.name],
      ascii_name: f[COL.ascii],
      // Alternate names are where Benares, Kashi and every transliteration
      // variant live -- they are the reason fuzzy matching rarely has to run.
      alt_names: (f[COL.alt] || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 12),
      lat: Number(f[COL.lat]),
      lon: Number(f[COL.lon]),
      country: f[COL.country],
      admin1: f[COL.admin1] || null,
      population: pop,
      feature_code: f[COL.fcode] || null,
    };
  }
}

async function push(batch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/gazetteer?on_conflict=geoname_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(`upsert failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const dir = await mkdtemp(join(tmpdir(), "geonames-"));
let total = 0;
try {
  for (const country of COUNTRIES) {
    const file = await download(country.trim(), dir);
    let batch = [];
    let n = 0;
    for await (const row of rows(file)) {
      batch.push(row);
      if (batch.length >= BATCH) { await push(batch); n += batch.length; batch = []; process.stdout.write(`\r  ${country}: ${n} places`); }
    }
    if (batch.length) { await push(batch); n += batch.length; }
    total += n;
    console.log(`\r  ${country}: ${n} places imported`);
  }
  console.log(`\nDone. ${total} places in the gazetteer.`);
  console.log("Remember the GeoNames attribution line in the app's About screen.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
