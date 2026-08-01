// Destination-keyed photo library with per-tour overrides.
//
// The point of the library is that Buddhist Circuit tours reuse the same
// Bodhgaya and Sarnath photography every time: shoot it or licence it once,
// tag it by destination, and every future brochure picks it up without
// anyone re-uploading. The per-tour override exists for the cases the
// library cannot know about -- a specific group's hotel, a seasonal shot,
// a photo the client supplied.
//
// Resolution order for a day's image, most specific first:
//   1. An explicit per-tour choice for that day (including an explicit
//      "no image", which is why `null` and `undefined` mean different
//      things here -- a user who deliberately clears a day's photo must not
//      have one auto-suggested straight back).
//   2. A destination explicitly set on the day.
//   3. An auto-suggestion derived from the day's own text.
//   4. Nothing, and the brochure omits the figure entirely.
//
// Auto-suggestion matters more than it looks: the whole complaint behind
// this batch was "nobody wants to keep writing data again and again". A
// library that required picking a photo for every day of every tour would
// recreate exactly that. So we guess from what the day already says, and
// make the guess trivially overridable rather than authoritative.

export const PHOTO_BUCKET = "itinerary-photos";

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();

// Candidate texts for a day, in the order most likely to name somewhere
// photogenic. Sightseeing first on purpose: "Mahabodhi Temple" makes a
// better brochure image than the route leg that got you there, and the stay
// is usually a hotel name rather than a place.
export function dayImageTextCandidates(day) {
  const items = (day && day.items) || [];
  const byType = (t) => items.filter(i => i.type === t).map(i => i.text).filter(Boolean);
  return [...byType("sightseeing"), ...byType("route"), ...byType("stay")];
}

// Longest match wins, so a library holding both "Gaya" and "Bodhgaya"
// resolves "Bodhgaya" correctly rather than matching the shorter name that
// happens to be a substring of it.
function bestMatch(text, photos) {
  const hay = norm(text);
  if (!hay) return null;
  let best = null;
  for (const photo of photos) {
    const dest = norm(photo.destination);
    if (!dest || !hay.includes(dest)) continue;
    if (!best || dest.length > norm(best.destination).length) best = photo;
  }
  return best;
}

export function suggestPhotoForDay(day, photos) {
  const library = photos || [];
  if (!day || library.length === 0) return null;
  if (day.destination) {
    const direct = bestMatch(day.destination, library);
    if (direct) return direct;
  }
  for (const text of dayImageTextCandidates(day)) {
    const hit = bestMatch(text, library);
    if (hit) return hit;
  }
  return null;
}

// Resolves every day to a URL (or nothing) for the brochure renderer.
// `overrides` is keyed by day id: a string URL pins that day's image, and an
// explicit null means "this day has no photo" and suppresses the suggestion.
export function resolveDayImages(days, photos, overrides = {}) {
  const out = {};
  (days || []).forEach((day) => {
    const key = day.id;
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const chosen = overrides[key];
      if (chosen) out[key] = chosen;
      return; // explicit null -> deliberately no image
    }
    const suggested = suggestPhotoForDay(day, photos);
    if (suggested) out[key] = suggested.url;
  });
  return out;
}

// Distinct destinations currently in the library, for the picker's filter.
export function libraryDestinations(photos) {
  const seen = new Map();
  (photos || []).forEach(p => {
    const key = norm(p.destination);
    if (key && !seen.has(key)) seen.set(key, p.destination);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function mapDbPhotoRow(row) {
  return {
    id: row.id,
    destination: row.destination || "",
    label: row.label || "",
    url: row.url || "",
    storagePath: row.storage_path || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function loadPhotoLibrary(db) {
  try {
    const { data, error } = await db.from("photo_library").select("*").order("destination");
    if (error) return { photos: [], error: error.message || String(error) };
    return { photos: (data || []).map(mapDbPhotoRow), error: null };
  } catch (e) {
    return { photos: [], error: e.message || String(e) };
  }
}

// Uploads a file to Supabase Storage and records it in the library.
//
// Storage goes through the real Supabase client (the one already created for
// Realtime) rather than the hand-rolled REST wrapper, which only speaks
// PostgREST and has no storage support. That client is null when the
// environment is unconfigured -- exactly as Realtime handles it -- so this
// reports a clear error instead of throwing on a null dereference.
export async function uploadLibraryPhoto(client, db, { file, destination, label, createdBy }) {
  if (!client || !client.storage) {
    return { photo: null, error: "Storage is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_KEY missing)." };
  }
  if (!file) return { photo: null, error: "No file selected." };
  if (!destination || !destination.trim()) {
    // Without a destination the photo can never be matched to anything, so
    // it would sit in the bucket costing storage and helping nobody.
    return { photo: null, error: "A destination is required so the photo can be reused." };
  }
  const safe = String(file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${norm(destination).replace(/[^a-z0-9]+/g, "-")}/${Date.now()}-${safe}`;
  try {
    const up = await client.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
    if (up.error) return { photo: null, error: up.error.message || String(up.error) };
    const { data: pub } = client.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const url = pub && pub.publicUrl;
    const { data, error } = await db.from("photo_library").insert({
      destination: destination.trim(),
      label: (label || "").trim(),
      url,
      storage_path: path,
      created_by: createdBy || null,
    });
    if (error) return { photo: null, error: error.message || String(error) };
    return { photo: data && data[0] ? mapDbPhotoRow(data[0]) : { destination, label, url, storagePath: path }, error: null };
  } catch (e) {
    return { photo: null, error: e.message || String(e) };
  }
}

// Removes the library row. The stored object is deliberately left in the
// bucket: a brochure already exported and sent to a client may reference
// that URL, and breaking a live link to reclaim a few kilobytes is a bad
// trade. Bucket housekeeping is a separate, deliberate job.
export async function deleteLibraryPhoto(db, id) {
  try {
    const { error } = await db.from("photo_library").delete().eq("id", id);
    if (error) return { error: error.message || String(error) };
    return { error: null };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}
