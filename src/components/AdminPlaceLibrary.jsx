import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const {
  G, db, realtimeClient,
  loadPhotoLibrary, updateLibraryPhoto, deleteLibraryPhoto, uploadLibraryPhoto,
  listCustomPlaces, updateCustomPlace, deleteCustomPlace,
  isValidCoordinate,
} = Lib;

// The backdoor. Everyone already has add/delete access to the shared photo
// and place libraries through the itinerary pickers (that is how each
// learns -- someone hits an unresolved place or a missing photo, fixes it
// on the spot, and it is there for the next person). This is the one
// screen where that shared, other-people-filled data actually gets
// reviewed and corrected rather than just added to -- a wrong coordinate,
// a mislabelled photo, or an entry nobody will ever search for again all
// need a place someone with real oversight can find and fix, and the
// day-to-day pickers were never built for that; they are built for adding
// one thing quickly in the middle of another task, not for auditing
// everything that has accumulated.
//
// Admin-only by the same logic that makes User Management and Templates
// admin-only: a surface that edits shared data other people rely on, not
// a personal workspace.
export default function AdminPlaceLibrary() {
  const [tab, setTab] = useState('photos');
  const [photos, setPhotos] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [filter, setFilter] = useState('');
  // Everyone already has add access to the photo library through the
  // itinerary picker -- this is the same capability, just reachable from
  // the review screen too, for the case where you are auditing the
  // library and notice a gap right there rather than while editing a
  // specific itinerary.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDestination, setUploadDestination] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);

  const reload = () => {
    setLoading(true);
    Promise.all([loadPhotoLibrary(db), listCustomPlaces(db)]).then(([p, c]) => {
      setPhotos(p.photos);
      setPlaces(c.places);
      setError(p.error || c.error || null);
      setLoading(false);
    });
  };
  useEffect(() => { reload(); }, []);

  const startEdit = (row) => { setEditingId(row.id); setDraft({ ...row }); };
  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const savePhoto = async (id) => {
    const { error } = await updateLibraryPhoto(db, id, { destination: draft.destination, label: draft.label });
    if (error) { setError(error); return; }
    cancelEdit();
    reload();
  };
  const doUpload = async () => {
    const file = fileRef.current && fileRef.current.files && fileRef.current.files[0];
    if (!file) { setUploadError('Choose a file first.'); return; }
    if (!uploadDestination.trim()) { setUploadError('A destination is required so the photo can be reused.'); return; }
    setUploading(true);
    setUploadError('');
    const { error } = await uploadLibraryPhoto(realtimeClient, db, {
      file, destination: uploadDestination.trim(), label: uploadLabel.trim(),
    });
    setUploading(false);
    if (error) { setUploadError(error); return; }
    setUploadDestination(''); setUploadLabel(''); setUploadOpen(false);
    if (fileRef.current) fileRef.current.value = '';
    reload();
  };

  const removePhoto = async (id) => {
    if (!window.confirm('Remove this photo from the shared library? It stops appearing for every future suggestion and pick, everywhere.')) return;
    const { error } = await deleteLibraryPhoto(db, id);
    if (error) { setError(error); return; }
    reload();
  };

  const savePlace = async (id) => {
    const { error } = await updateCustomPlace(db, id, { name: draft.name, lat: draft.lat, lon: draft.lon, country: draft.country, admin1: draft.admin1 });
    if (error) { setError(error); return; }
    cancelEdit();
    reload();
  };
  const removePlace = async (id) => {
    if (!window.confirm('Remove this place? Future searches for it will fall back to the gazetteer, or come up empty if it genuinely is not in GeoNames.')) return;
    const { error } = await deleteCustomPlace(db, id);
    if (error) { setError(error); return; }
    reload();
  };

  const term = filter.trim().toLowerCase();
  const filteredPhotos = term ? photos.filter(p => (p.destination||'').toLowerCase().includes(term) || (p.label||'').toLowerCase().includes(term)) : photos;
  const filteredPlaces = term ? places.filter(p => (p.name||'').toLowerCase().includes(term) || (p.country||'').toLowerCase().includes(term)) : places;

  const cell = { padding:'7px 10px', borderBottom:`1px solid ${G.gray100}`, fontSize:12, verticalAlign:'top' };
  const input = { padding:'4px 6px', border:`1px solid ${G.gray200}`, borderRadius:4, fontSize:12, width:'100%', fontFamily:"'Inter',sans-serif" };

  return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[['photos', `Photos (${photos.length})`], ['places', `Places (${places.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); cancelEdit(); }}
            style={{ padding:'6px 14px', borderRadius:6, border:`1px solid ${tab===id?G.navy:G.gray200}`,
              background:tab===id?G.navy:G.white, color:tab===id?'#fff':G.gray600, cursor:'pointer', fontSize:12, fontWeight:600 }}>
            {label}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        {tab === 'photos' && (
          <button onClick={() => setUploadOpen(o => !o)}
            style={{ padding:'6px 14px', borderRadius:6, border:`1px solid ${G.navy}`, background:G.white, color:G.navy, cursor:'pointer', fontSize:12, fontWeight:600 }}>
            {uploadOpen ? 'Cancel' : '+ Add Photo'}
          </button>
        )}
        <input style={{ ...input, width:220 }} value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter…"/>
      </div>

      {tab === 'photos' && uploadOpen && (
        <div style={{ background:G.white, border:`1px solid ${G.gray200}`, borderRadius:8, padding:14, marginBottom:14, maxWidth:420 }}>
          <input ref={fileRef} type="file" accept="image/*" aria-label="Choose photo file" style={{ fontSize:12, marginBottom:8, width:'100%' }}/>
          <input style={{ ...input, marginBottom:8 }} value={uploadDestination} onChange={e=>setUploadDestination(e.target.value)} placeholder="Destination (required)" aria-label="Photo destination"/>
          <input style={{ ...input, marginBottom:8 }} value={uploadLabel} onChange={e=>setUploadLabel(e.target.value)} placeholder="Caption (optional)" aria-label="Photo caption"/>
          {uploadError && <div style={{ fontSize:11, color:'#B91C1C', marginBottom:8 }}>{uploadError}</div>}
          <button className="btn btn-primary" style={{ fontSize:12 }} disabled={uploading} onClick={doUpload}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}

      {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#B91C1C', padding:'8px 12px', borderRadius:6, fontSize:12, marginBottom:12 }}>{error}</div>}
      {loading && <div style={{ color:G.gray400, fontSize:12 }}>Loading…</div>}

      {!loading && tab === 'photos' && (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Photo</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Destination</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Caption</th>
            <th style={{ ...cell, textAlign:'right', color:G.gray400, fontWeight:600 }}></th>
          </tr></thead>
          <tbody>
            {filteredPhotos.length === 0 && <tr><td colSpan={4} style={{ ...cell, color:G.gray400 }}>{photos.length ? 'No match.' : 'Library is empty.'}</td></tr>}
            {filteredPhotos.map(p => {
              const editing = editingId === p.id;
              return (
                <tr key={p.id}>
                  <td style={cell}><img src={p.url} alt="" style={{ width:56, height:40, objectFit:'cover', borderRadius:4, border:`1px solid ${G.gray200}` }}/></td>
                  <td style={cell}>{editing
                    ? <input style={input} value={draft.destination||''} onChange={e=>setDraft(d=>({...d,destination:e.target.value}))}/>
                    : p.destination}</td>
                  <td style={cell}>{editing
                    ? <input style={input} value={draft.label||''} onChange={e=>setDraft(d=>({...d,label:e.target.value}))}/>
                    : (p.label || <span style={{color:G.gray400}}>—</span>)}</td>
                  <td style={{ ...cell, textAlign:'right', whiteSpace:'nowrap' }}>
                    {editing ? (
                      <>
                        <button className="btn btn-primary" style={{ fontSize:11, marginRight:6 }} onClick={()=>savePhoto(p.id)}>Save</button>
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost" style={{ fontSize:11, marginRight:6 }} onClick={()=>startEdit(p)}>Edit</button>
                        <button className="btn btn-ghost" style={{ fontSize:11, color:'#B91C1C' }} onClick={()=>removePhoto(p.id)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!loading && tab === 'places' && (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Name</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Latitude</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Longitude</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>Country</th>
            <th style={{ ...cell, textAlign:'left', color:G.gray400, fontWeight:600 }}>State</th>
            <th style={{ ...cell, textAlign:'right', color:G.gray400, fontWeight:600 }}></th>
          </tr></thead>
          <tbody>
            {filteredPlaces.length === 0 && <tr><td colSpan={6} style={{ ...cell, color:G.gray400 }}>{places.length ? 'No match.' : 'No manually placed coordinates saved yet.'}</td></tr>}
            {filteredPlaces.map(p => {
              const editing = editingId === p.id;
              return (
                <tr key={p.id}>
                  <td style={cell}>{editing
                    ? <input style={input} value={draft.name||''} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/>
                    : p.name}</td>
                  <td style={cell}>{editing
                    ? <input style={{...input,width:90}} value={draft.lat??''} onChange={e=>setDraft(d=>({...d,lat:e.target.value}))}/>
                    : p.lat}</td>
                  <td style={cell}>{editing
                    ? <input style={{...input,width:90}} value={draft.lon??''} onChange={e=>setDraft(d=>({...d,lon:e.target.value}))}/>
                    : p.lon}</td>
                  <td style={cell}>{editing
                    ? <input style={input} value={draft.country||''} onChange={e=>setDraft(d=>({...d,country:e.target.value}))}/>
                    : (p.country || <span style={{color:G.gray400}}>—</span>)}</td>
                  <td style={cell}>{editing
                    ? <input style={input} value={draft.admin1||''} onChange={e=>setDraft(d=>({...d,admin1:e.target.value}))}/>
                    : (p.admin1 || <span style={{color:G.gray400}}>—</span>)}</td>
                  <td style={{ ...cell, textAlign:'right', whiteSpace:'nowrap' }}>
                    {editing ? (
                      <>
                        <button className="btn btn-primary" style={{ fontSize:11, marginRight:6 }}
                          disabled={!isValidCoordinate(draft.lat, draft.lon) || !String(draft.name||'').trim()}
                          onClick={()=>savePlace(p.id)}>Save</button>
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost" style={{ fontSize:11, marginRight:6 }} onClick={()=>startEdit(p)}>Edit</button>
                        <button className="btn btn-ghost" style={{ fontSize:11, color:'#B91C1C' }} onClick={()=>removePlace(p.id)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === 'places' && (
        // GeoNames is CC-BY 4.0, which requires attribution wherever the
        // data is used. Moved here from a persistent sidebar footer
        // visible to every user on every page -- this screen is where
        // GeoNames-sourced place data is actually reviewed, which is a
        // more relevant home for the credit than a page nobody was
        // looking at it on. The obligation is ours regardless of where it
        // lives; a brochure is not the place to discharge it either way.
        <div style={{ textAlign:'center', marginTop:16, fontSize:10, color:G.gray400, lineHeight:1.5 }}>
          Place data © <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer"
            style={{ color:G.gray400, textDecoration:'underline' }}>GeoNames</a>, CC BY 4.0
        </div>
      )}
    </div>
  );
}
