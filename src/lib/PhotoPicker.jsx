import { useState, useRef, useEffect } from 'react';
import { libraryDestinations, dayImageTextCandidates } from './photoLibrary.js';

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
export function PhotoPicker({
  day,
  resolvedUrl,       // what resolveDayImages() currently shows for this day
  overrideValue,      // undefined | string | null -- the raw override, not the resolved result
  library = [],
  onChangeOverride,    // (value: string | null) => void
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

  const status = overrideValue === null
    ? { dot: '#9CA3AF', label: 'No photo', reason: 'Cleared for this day -- will not be auto-suggested again.' }
    : typeof overrideValue === 'string'
      ? { dot: '#15803D', label: 'Chosen', reason: 'Set manually for this day.' }
      : resolvedUrl
        ? { dot: '#15803D', label: 'Suggested', reason: 'Matched automatically from this day\u2019s own text.' }
        : { dot: '#B45309', label: 'None yet', reason: 'Nothing in the library matches this day.' };

  const term = filter.trim().toLowerCase();
  const filtered = term
    ? library.filter(p => (p.destination || '').toLowerCase().includes(term) || (p.label || '').toLowerCase().includes(term))
    : library;

  const pick = (url) => { onChangeOverride(url); setOpen(false); };
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
    if (photo && photo.url) pick(photo.url);
    setDestination(''); setLabel('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {resolvedUrl
          ? <img src={resolvedUrl} alt="" style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 4, border: `1px solid ${G.gray200}`, flexShrink: 0 }}/>
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
      <div style={{ fontSize: 10.5, color: G.gray400, marginTop: 2, marginLeft: 48 }}>{status.reason}</div>

      {open && !readOnly && (
        <div style={{ marginTop: 6, marginLeft: 48, padding: 10, borderRadius: 8, border: `1px solid ${G.gray200}`, background: G.white, maxWidth: 360 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
            {filtered.map(p => (
              <div key={p.id} style={{ position: 'relative' }}>
                <img src={p.url} alt={p.destination} title={`${p.destination}${p.label ? ' \u2014 ' + p.label : ''}`}
                  onClick={() => pick(p.url)}
                  style={{ width: '100%', height: 44, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: `1px solid ${G.gray200}` }}/>
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
            {uploading ? 'Uploading\u2026' : 'Upload & use for this day'}
          </button>
        </div>
      )}
    </div>
  );
}
