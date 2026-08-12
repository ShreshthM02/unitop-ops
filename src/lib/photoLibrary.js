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

// Downscales an image client-side before it ever reaches storage. Nothing
// did this before -- a phone photo uploaded straight through is commonly
// 4000x3000px and several megabytes, and with one photo per day plus a
// cover, that alone is enough raw image data to make an exported PDF run
// into double-digit megabytes and take real time to render, since
// print-to-PDF embeds whatever resolution the source image actually is,
// not what it happens to display at on the page.
//
// 1600px on the long edge and JPEG quality 0.82 are generously above what
// this brochure ever needs -- the largest a photo renders at is roughly
// A4-page width, well under 1600px -- while still looking sharp printed.
//
// Only runs in a real browser DOM (Image/canvas are not available in Node
// or in this project's jsdom test environment); falls back to the
// original file untouched rather than blocking an upload over a resize
// that could not run, for any reason -- an unsupported format, a missing
// canvas 2d context, a browser that refuses toBlob. A photo that could not
// be shrunk is still a photo worth having.
export async function defaultResizeImage(file, { maxDim = 1600, quality = 0.82, timeoutMs = 8000 } = {}) {
  if (typeof document === "undefined" || !file || !file.type || !file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }
  try {
    const resizePromise = new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(url);
      img.onload = () => {
        cleanup();
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(file); return; } // already small enough
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext && canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file);
        }, "image/jpeg", quality);
      };
      img.onerror = () => { cleanup(); resolve(file); };
      img.src = url;
    });
    // Confirmed necessary, not defensive-programming theatre: a real File
    // object handed to this function inside this project's own jsdom test
    // environment never fires onload OR onerror at all, which would hang
    // an upload forever without this. The same failure mode is not
    // guaranteed impossible in a real browser either, so the timeout stays
    // even outside tests -- a slow resize should degrade to the original
    // file, never block the upload indefinitely.
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(file), timeoutMs));
    return await Promise.race([resizePromise, timeoutPromise]);
  } catch (e) {
    return file;
  }
}

// Uploads a file to Supabase Storage and records it in the library.
//
// Storage goes through the real Supabase client (the one already created for
// Realtime) rather than the hand-rolled REST wrapper, which only speaks
// PostgREST and has no storage support. That client is null when the
// environment is unconfigured -- exactly as Realtime handles it -- so this
// reports a clear error instead of throwing on a null dereference.
//
// resizeFn defaults to defaultResizeImage above; overridable so this stays
// testable without a real browser canvas.
export async function uploadLibraryPhoto(client, db, { file, destination, label, createdBy, resizeFn = defaultResizeImage }) {
  if (!client || !client.storage) {
    return { photo: null, error: "Storage is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_KEY missing)." };
  }
  if (!file) return { photo: null, error: "No file selected." };
  if (!destination || !destination.trim()) {
    // Without a destination the photo can never be matched to anything, so
    // it would sit in the bucket costing storage and helping nobody.
    return { photo: null, error: "A destination is required so the photo can be reused." };
  }
  const uploadFile = await resizeFn(file).catch(() => file);
  const safe = String(file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${norm(destination).replace(/[^a-z0-9]+/g, "-")}/${Date.now()}-${safe}`;
  try {
    const up = await client.storage.from(PHOTO_BUCKET).upload(path, uploadFile, { upsert: false });
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
