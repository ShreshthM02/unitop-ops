import { useState, useRef, useEffect } from 'react';
import { libraryDestinations, dayImageTextCandidates, normalizePhotoList, MAX_DAY_PHOTOS } from './photoLibrary.js';

// Picking the photo for one day of a brochure.
//
// Same governing principle as PlacePicker: never leave the user unable to
// see or change what was decided. A day's image can come from three
// places, and all three must be visibly distinguishable, not just visually
// present:
//   - auto-suggested from the library, matching something the day's own
//     text already says (no override in state at all)
//   - manually chosen from the library or freshly uploaded (a URL string
//     in state)
//   - explicitly cleared -- "this day has no photo, and do not guess one
//     back in" (an explicit null in state, which is why null and undefined
//     are different values here, not two ways of writing the same thing)
//
// A day with nothing suggested and nothing chosen is not an error state:
// the brochure simply omits the figure. Uploading is offered right where a
// missing photo is noticed, because that is the moment it is easiest to
// fix -- not a separate library-management screen to remember to visit
// later.
//
// MULTI-PHOTO MODE (max > 1, used for the day strip): the day shows up to
// three photographs side by side. The override then becomes an array of
// URLs (an older single-URL string is read as a list of one), and clicking a
// library photo adds or removes it rather than choosing it and closing.
// Whatever is shown is what a click edits, so changing a suggested set
// starts from the suggestion rather than from nothing. An empty selection is
// stored as an explicit null ("no photos, don't guess").
export function PhotoPicker({
  day,
  resolvedUrl,       // what resolveDayImages() currently shows for this day
  resolvedUrls,      // multi mode: the resolved list (suggested or chosen)
  max = 1,           // 1 = single photo (cover); >1 = a strip of that many
  overrideValue,      // undefined | string | string[] | null -- the raw override, not the resolved result
  library = [],
  onChangeOverride,    // (value: string | string[] | null | undefined) => void
  onUpload,            // ({file, destination, label}) => Promise<{photo, error}>
  onDeleteFromLibrary,  // (id) => Promise<{error}>
  G,
  inp,
  readOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [destination, setDestination] = useState('');
  const [label, setLabel] = useState('');
  const fileRef = useRef(null);

  // Defaults the upload destination to whatever the day's own text already
  // suggests, the same "what is this day actually about" question the
  // photo suggester itself answers -- so uploading usually means picking a
  // file, not also typing a destination that was already implied.
  useEffect(() => {
    if (open && !destination) {
      const guess = day ? dayImageTextCandidates(day)[0] : '';
      if (guess) setDestination(guess);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const multi = max > 1;
  const shown = multi
    ? normalizePhotoList(resolvedUrls !== undefined ? resolvedUrls : (resolvedUrl ? [resolvedUrl] : []), max)
    : (resolvedUrl ? [resolvedUrl] : []);
  const commit = (list) => onChangeOverride(list.length ? list : null);
  const toggle = (url) => {
    if (shown.includes(url)) { commit(shown.filter(u => u !== url)); return; }
    if (shown.length >= max) return;       // full: remove one first
    commit([...shown, url]);
  };

  const status = overrideValue === null
    ? { dot: '#9CA3AF', label: 'No photo', reason: 'Cleared for this day -- will not be auto-suggested again.' }
    : (typeof overrideValue === 'string' || Array.isArray(overrideValue))
      ? { dot: '#15803D', label: multi ? `Chosen (${shown.length} of ${max})` : 'Chosen', reason: 'Set manually for this day.' }
      : shown.length
        ? { dot: '#15803D', label: multi ? `Suggested (${shown.length} of ${max})` : 'Suggested', reason: 'Matched automatically from this day\u2019s own text.' }
        : { dot: '#B45309', label: 'None yet', reason: 'Nothing in the library matches this day.' };

  const term = filter.trim().toLowerCase();
  const filtered = term
    ? library.filter(p => (p.destination || '').toLowerCase().includes(term) || (p.label || '').toLowerCase().includes(term))
    : library;

  const pick = (url) => { if (multi) { toggle(url); return; } onChangeOverride(url); setOpen(false); };
  const clear = () => { onChangeOverride(null); setOpen(false); };

  const doUpload = async () => {
    const file = fileRef.current && fileRef.current.files && fileRef.current.files[0];
    if (!file) { setUploadError('Choose a file first.'); return; }
    if (!destination.trim()) { setUploadError('A destination is required so the photo can be reused.'); return; }
    setUploading(true);
    setUploadError('');
    const { photo, error } = await onUpload({ file, destination: destination.trim(), label: label.trim() });
    setUploading(false);
    if (error) { setUploadError(error); return; }
    if (photo && photo.url) {
      // Multi: add to the strip if there is room, otherwise the upload still
      // lands in the library and the user is told why it isn't on the day.
      if (multi && shown.length >= max) setUploadError(`Uploaded to the library. This day already has ${max} photos -- remove one to add it.`);
      else pick(photo.url);
    }
    setDestination(''); setLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {shown.length
          ? <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {shown.map(u => <img key={u} src={u} alt="" style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4, border: `1px solid ${G.gray200}` }}/>)}
            </div>
          : <div style={{ width: 40, height: 30, borderRadius: 4, background: G.gray100, flexShrink: 0 }}/>}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.dot, flex: '0 0 auto' }}/>
        <span style={{ color: G.gray600 }}>{status.label}</span>
        {!readOnly && (
          <button onClick={() => setOpen(o => !o)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: G.accent, fontSize: 11, fontWeight: 600, padding: 0 }}>
            {open ? 'Close' : 'Change'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 2, marginLeft: multi ? 0 : 48 }}>{status.reason}</div>

      {open && !readOnly && (
        <div style={{ marginTop: 6, marginLeft: multi ? 0 : 48, padding: 10, borderRadius: 8, border: `1px solid ${G.gray200}`, background: G.white, maxWidth: multi ? 420 : 360 }}>
          {typeof overrideValue !== 'undefined' && (
            <button onClick={() => { onChangeOverride(undefined); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0', fontSize: 11, color: G.gray600 }}>
              ↺ Go back to auto-suggestion
            </button>
          )}
          <button onClick={clear}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0', fontSize: 11, color: G.gray600 }}>
            ✕ No photo for this day
          </button>

          {multi && shown.length > 0 && (
            <div style={{ display: 'flex', gap: 6, margin: '6px 0' }} data-testid="photo-selected">
              {shown.map((u, idx) => (
                <div key={u} style={{ position: 'relative' }}>
                  <img src={u} alt="" style={{ width: 54, height: 40, objectFit: 'cover', borderRadius: 4, border: `1px solid ${G.gray200}` }}/>
                  <button type="button" aria-label={`Remove photo ${idx + 1}`} onClick={() => commit(shown.filter(x => x !== u))}
                    style={{ position: 'absolute', top: -5, right: -5, width: 15, height: 15, borderRadius: '50%', border: 'none', background: '#B91C1C', color: '#fff', fontSize: 9, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ height: 1, background: G.gray100, margin: '8px 0' }}/>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: G.gray400, marginBottom: 5 }}>
            Library {library.length ? `(${library.length})` : ''}
          </div>
          <input style={{ ...inp, fontSize: 11.5, marginBottom: 6 }} value={filter}
            onChange={e => setFilter(e.target.value)} placeholder="Filter by destination…" aria-label="Filter library"/>
          {filtered.length === 0 && (
            <div style={{ fontSize: 11, color: G.gray400, padding: '4px 0' }}>
              {library.length ? 'No match.' : 'Library is empty -- upload the first photo below.'}
            </div>
          )}
          {multi && (
            <div style={{ fontSize: 10.5, color: G.gray400, marginBottom: 5 }}>
              Click photos to add or remove them. Up to {max} per day, shown left to right in the order added.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
            {filtered.map(p => (
              <div key={p.id} style={{ position: 'relative' }}>
                <img src={p.url} alt={p.destination} title={`${p.destination}${p.label ? ' \u2014 ' + p.label : ''}`}
                  onClick={() => pick(p.url)}
                  style={{ width: '100%', height: 44, objectFit: 'cover', borderRadius: 4, cursor: 'pointer',
                    border: multi && shown.includes(p.url) ? `2px solid ${G.accent}` : `1px solid ${G.gray200}`,
                    opacity: multi && !shown.includes(p.url) && shown.length >= max ? 0.45 : 1 }}/>
                {onDeleteFromLibrary && (
                  <button aria-label={`Remove ${p.destination} from library`}
                    onClick={async (e) => { e.stopPropagation(); await onDeleteFromLibrary(p.id); }}
                    style={{ position: 'absolute', top: -4, right: -4, width: 15, height: 15, borderRadius: '50%',
                      border: 'none', background: '#B91C1C', color: '#fff', fontSize: 9, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: G.gray100, margin: '8px 0' }}/>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: G.gray400, marginBottom: 5 }}>
            Upload new
          </div>
          <input ref={fileRef} type="file" accept="image/*" aria-label="Choose photo file"
            style={{ fontSize: 11, marginBottom: 6, width: '100%' }}/>
          <input style={{ ...inp, fontSize: 11.5, marginBottom: 6 }} value={destination}
            onChange={e => setDestination(e.target.value)} placeholder="Destination (required)" aria-label="Photo destination"/>
          <input style={{ ...inp, fontSize: 11.5, marginBottom: 6 }} value={label}
            onChange={e => setLabel(e.target.value)} placeholder="Caption (optional)" aria-label="Photo caption"/>
          {uploadError && <div style={{ fontSize: 10.5, color: '#B91C1C', marginBottom: 6 }}>{uploadError}</div>}
          <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={uploading} onClick={doUpload}>
            {uploading ? 'Uploading\u2026' : (multi ? 'Upload & add to this day' : 'Upload & use for this day')}
          </button>
        </div>
      )}
    </div>
  );
}
