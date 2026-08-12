import { describe, it, expect, vi } from 'vitest';
import {
  suggestPhotoForDay, resolveDayImages, libraryDestinations,
  dayImageTextCandidates, loadPhotoLibrary, uploadLibraryPhoto, deleteLibraryPhoto, defaultResizeImage,
} from '../lib/photoLibrary.js';

const photo = (destination, url) => ({ id: destination, destination, url, label: '' });
const library = [
  photo('Bodhgaya', 'bodhgaya.jpg'),
  photo('Gaya', 'gaya.jpg'),
  photo('Sarnath', 'sarnath.jpg'),
  photo('Varanasi', 'varanasi.jpg'),
];

const day = (items, over = {}) => ({ id: 'd1', dayLabel: 'DAY-1', items, ...over });

describe('auto-suggestion: the library must not become another thing to fill in by hand', () => {
  it('matches a sightseeing item against the library', () => {
    const d = day([{ type:'sightseeing', text:'Dhamek Stupa, Sarnath' }]);
    expect(suggestPhotoForDay(d, library).url).toBe('sarnath.jpg');
  });

  it('prefers sightseeing over the route leg -- a temple photographs better than a highway', () => {
    const d = day([
      { type:'route', text:'Varanasi – Sarnath' },
      { type:'sightseeing', text:'Mahabodhi Temple, Bodhgaya' },
    ]);
    expect(suggestPhotoForDay(d, library).url).toBe('bodhgaya.jpg');
  });

  it('falls back to the route when there is no sightseeing item', () => {
    expect(suggestPhotoForDay(day([{ type:'route', text:'Delhi – Varanasi' }]), library).url).toBe('varanasi.jpg');
  });

  it('prefers the longest matching destination, so Bodhgaya never resolves as Gaya', () => {
    expect(suggestPhotoForDay(day([{ type:'sightseeing', text:'Bodhgaya' }]), library).url).toBe('bodhgaya.jpg');
  });

  it('matches case- and spacing-insensitively', () => {
    expect(suggestPhotoForDay(day([{ type:'sightseeing', text:'  visit   BODHGAYA  today' }]), library).url).toBe('bodhgaya.jpg');
  });

  it('an explicit destination on the day beats anything inferred from its text', () => {
    const d = day([{ type:'sightseeing', text:'Sarnath' }], { destination:'Varanasi' });
    expect(suggestPhotoForDay(d, library).url).toBe('varanasi.jpg');
  });

  it('returns nothing rather than guessing when no destination is recognisable', () => {
    expect(suggestPhotoForDay(day([{ type:'sightseeing', text:'Free morning at leisure' }]), library)).toBeNull();
    expect(suggestPhotoForDay(day([]), library)).toBeNull();
    expect(suggestPhotoForDay(day([{ type:'sightseeing', text:'Bodhgaya' }]), [])).toBeNull();
  });

  it('lists candidate texts in the intended priority order', () => {
    const d = day([
      { type:'stay', text:'Hotel X' },
      { type:'route', text:'A – B' },
      { type:'sightseeing', text:'Temple' },
    ]);
    expect(dayImageTextCandidates(d)).toEqual(['Temple', 'A – B', 'Hotel X']);
  });
});

describe('per-tour overrides', () => {
  const days = [
    { id:'d1', items:[{ type:'sightseeing', text:'Bodhgaya' }] },
    { id:'d2', items:[{ type:'sightseeing', text:'Sarnath' }] },
  ];

  it('auto-fills every day it can, with no overrides at all', () => {
    expect(resolveDayImages(days, library)).toEqual({ d1:'bodhgaya.jpg', d2:'sarnath.jpg' });
  });

  it('an override pins that day and leaves the others auto-resolved', () => {
    expect(resolveDayImages(days, library, { d1:'clients-own-photo.jpg' }))
      .toEqual({ d1:'clients-own-photo.jpg', d2:'sarnath.jpg' });
  });

  it('an explicit null means "no photo on this day" and is NOT re-suggested', () => {
    // The distinction that matters: someone who deliberately clears a day's
    // photo must not have the suggestion put straight back.
    const out = resolveDayImages(days, library, { d1: null });
    expect(out).not.toHaveProperty('d1');
    expect(out.d2).toBe('sarnath.jpg');
  });

  it('omits days with no match rather than emitting an empty entry', () => {
    const out = resolveDayImages([{ id:'d9', items:[{ type:'route', text:'Somewhere unlisted' }] }], library);
    expect(out).toEqual({});
  });

  it('tolerates empty and undefined input', () => {
    expect(resolveDayImages(undefined, undefined)).toEqual({});
    expect(resolveDayImages([], library)).toEqual({});
  });
});

describe('library destinations', () => {
  it('de-duplicates case-insensitively and sorts for the picker', () => {
    const dests = libraryDestinations([photo('Varanasi'), photo('bodhgaya'), photo('Bodhgaya'), photo('Sarnath')]);
    expect(dests).toEqual(['bodhgaya', 'Sarnath', 'Varanasi']);
  });
  it('ignores entries with no destination', () => {
    expect(libraryDestinations([photo(''), photo('Agra')])).toEqual(['Agra']);
  });
});

describe('persistence', () => {
  const okDb = (rows) => ({ from: () => ({ select: () => ({ order: async () => ({ data: rows, error: null }) }) }) });

  it('maps library rows into the shape the app uses', async () => {
    const { photos, error } = await loadPhotoLibrary(okDb([{ id:'1', destination:'Agra', url:'u', storage_path:'p' }]));
    expect(error).toBeNull();
    expect(photos[0]).toMatchObject({ id:'1', destination:'Agra', url:'u', storagePath:'p' });
  });

  it('reports a load failure instead of silently returning an empty library', async () => {
    const db = { from: () => ({ select: () => ({ order: async () => ({ data:null, error:{ message:'relation does not exist' } }) }) }) };
    const { photos, error } = await loadPhotoLibrary(db);
    expect(photos).toEqual([]);
    expect(error).toContain('relation does not exist');
  });

  it('refuses an upload with no destination -- an untagged photo can never be reused', async () => {
    const { error } = await uploadLibraryPhoto({ storage:{} }, {}, { file:{ name:'a.jpg' }, destination:'  ' });
    expect(error).toMatch(/destination is required/i);
  });

  it('reports clearly when storage is not configured, rather than throwing on a null client', async () => {
    const { error } = await uploadLibraryPhoto(null, {}, { file:{ name:'a.jpg' }, destination:'Agra' });
    expect(error).toMatch(/not configured/i);
  });

  it('uploads then records the row, returning the stored photo', async () => {
    const client = { storage: { from: () => ({
      upload: vi.fn(async () => ({ error:null })),
      getPublicUrl: () => ({ data:{ publicUrl:'https://x/agra/1-a.jpg' } }),
    }) } };
    const db = { from: () => ({ insert: async (row) => ({ data:[{ id:'9', ...row }], error:null }) }) };
    const { photo: saved, error } = await uploadLibraryPhoto(client, db, { file:{ name:'a.jpg' }, destination:'Agra', label:'Taj' });
    expect(error).toBeNull();
    expect(saved).toMatchObject({ destination:'Agra', label:'Taj', url:'https://x/agra/1-a.jpg' });
  });

  it('surfaces a storage failure rather than recording a row pointing at nothing', async () => {
    const client = { storage: { from: () => ({ upload: async () => ({ error:{ message:'bucket not found' } }) }) } };
    const insert = vi.fn();
    const { photo: saved, error } = await uploadLibraryPhoto(client, { from: () => ({ insert }) }, { file:{ name:'a.jpg' }, destination:'Agra' });
    expect(saved).toBeNull();
    expect(error).toContain('bucket not found');
    expect(insert).not.toHaveBeenCalled();
  });

  it('deleting removes the library row and reports failures', async () => {
    const ok = { from: () => ({ delete: () => ({ eq: async () => ({ error:null }) }) }) };
    expect((await deleteLibraryPhoto(ok, '1')).error).toBeNull();
    const bad = { from: () => ({ delete: () => ({ eq: async () => ({ error:{ message:'denied' } }) }) }) };
    expect((await deleteLibraryPhoto(bad, '1')).error).toContain('denied');
  });
});

describe('uploads are resized before ever reaching storage', () => {
  // Root cause of a reported 13MB, slow-to-render brochure PDF: nothing
  // downscaled an uploaded photo before it went into the bucket, so a
  // phone photo (commonly several MB, 4000x3000px) was stored and later
  // embedded into an exported PDF at its full original resolution.

  it('the file resizeFn returns is what actually gets uploaded, not the original', async () => {
    const originalFile = { name: 'a.jpg', size: 8_000_000 };
    const resizedFile = { name: 'a.jpg', size: 400_000 };
    const upload = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({
      upload, getPublicUrl: () => ({ data: { publicUrl: 'https://x/agra/1-a.jpg' } }),
    }) } };
    const db = { from: () => ({ insert: async (row) => ({ data: [{ id: '9', ...row }], error: null }) }) };
    const resizeFn = vi.fn(async (f) => { expect(f).toBe(originalFile); return resizedFile; });

    await uploadLibraryPhoto(client, db, { file: originalFile, destination: 'Agra', resizeFn });

    expect(resizeFn).toHaveBeenCalledWith(originalFile);
    expect(upload.mock.calls[0][1]).toBe(resizedFile); // the SECOND arg to .upload() is the file
  });

  it('a resizeFn that throws does not block the upload -- falls back to the original file', async () => {
    const originalFile = { name: 'a.jpg' };
    const upload = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({
      upload, getPublicUrl: () => ({ data: { publicUrl: 'https://x/agra/1-a.jpg' } }),
    }) } };
    const db = { from: () => ({ insert: async (row) => ({ data: [{ id: '9', ...row }], error: null }) }) };
    const resizeFn = vi.fn(async () => { throw new Error('canvas unavailable'); });

    const { error } = await uploadLibraryPhoto(client, db, { file: originalFile, destination: 'Agra', resizeFn });

    expect(error).toBeNull();
    expect(upload.mock.calls[0][1]).toBe(originalFile);
  });

  it('with no resizeFn given, the real default is used and degrades gracefully in this test environment', async () => {
    // No real canvas/image-decoding here (this is jsdom, not a browser) --
    // confirmed the image element never fires onload OR onerror for a real
    // File object, which is exactly why defaultResizeImage has a timeout
    // fallback. A short timeoutMs here proves that fallback resolves
    // rather than waiting out the real 8s default.
    const originalFile = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const resized = await defaultResizeImage(originalFile, { timeoutMs: 50 });
    expect(resized).toBe(originalFile);
  }, 10000);
});

describe('defaultResizeImage: safe-return paths that do not require a real canvas', () => {
  it('returns the file unchanged for a non-image type', async () => {
    const file = { type: 'application/pdf' };
    expect(await defaultResizeImage(file)).toBe(file);
  });

  it('returns the file unchanged for SVG -- vector art has no pixel dimensions to downscale', async () => {
    const file = { type: 'image/svg+xml' };
    expect(await defaultResizeImage(file)).toBe(file);
  });

  it('returns the file unchanged when there is no file at all, rather than throwing', async () => {
    expect(await defaultResizeImage(null)).toBe(null);
  });
});
