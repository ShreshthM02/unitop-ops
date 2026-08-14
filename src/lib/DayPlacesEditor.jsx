import { PlacePicker } from './PlacePicker.jsx';

// Manages the ordered list of places for one day. What used to be a single
// day.place is now day.places[] -- a day's route can go A -> B -> C rather
// than only ever landing on one place, which is what a lot of real
// itineraries actually need (a sightseeing loop through several towns
// before the group overnights somewhere).
//
// Only the FIRST stop gets an auto-derived search query, from the day's
// own text (whatever dayImageTextCandidates already answers for photo
// suggestion) -- there is no equivalent "what is this day about" question
// for a second or third stop the operator has deliberately added, so those
// are always searched by hand. That is why only slot 0 gets pre-fetched
// candidates from the caller; every later slot searches live instead.
//
// Each leg AFTER the first carries its own explicit road/flight/train mode
// on the place object itself (legMode) -- this is what actually makes a
// mixed-mode day representable at all (drive to the airport, fly the rest
// of the way), which a single day-level mode never could.
export function DayPlacesEditor({
  places,            // the day's places array, already normalised by the caller
  onChange,          // (places) => void
  candidatesFor,     // (index) => gazetteer[] candidates for that slot
  queryFor,          // (index) => default search text for that slot
  onSearch,          // (term) => Promise<gazetteer[]> -- live search, every slot
  onSaveCustomPlace,
  context,           // other resolved places in this itinerary, for ranking
  G, inp, readOnly,
}) {
  const list = places && places.length ? places : [undefined];

  const update = (i, place) => onChange(list.map((p, idx) => idx === i ? place : p));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, undefined]);

  return (
    <div>
      {list.map((place, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
          {i > 0 && (
            <div style={{ display: 'flex', gap: 3, flexShrink: 0, paddingTop: 2 }}>
              {['road', 'flight', 'train'].map(m => (
                <button key={m} type="button" disabled={readOnly}
                  onClick={() => update(i, place ? { ...place, legMode: m } : place)}
                  style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                    cursor: readOnly ? 'default' : 'pointer',
                    border: `1px solid ${(place && place.legMode || 'road') === m ? G.accent : G.gray200}`,
                    background: (place && place.legMode || 'road') === m ? '#FDEDEC' : G.white,
                    color: (place && place.legMode || 'road') === m ? G.accent : G.gray400 }}>
                  {m === 'road' ? 'Road' : m === 'flight' ? 'Flight' : 'Train'}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <PlacePicker
              query={queryFor(i)}
              value={place}
              gazetteer={i === 0 ? candidatesFor(0) : []}
              context={context}
              // A leg's mode/distance/time belong to the LEG, not to
              // whichever place happens to be picked for it -- swapping
              // the place at this slot keeps how you get there.
              onChange={(p) => update(i, place ? { ...p, legMode: place.legMode, legDistance: place.legDistance, legTime: place.legTime } : p)}
              onSearch={onSearch}
              onSaveCustomPlace={onSaveCustomPlace}
              G={G}
              inp={inp}
              readOnly={readOnly}
            />
          </div>
          {!readOnly && list.length > 1 && (
            <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => remove(i)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: G.gray400, fontSize: 12, paddingTop: 3, flexShrink: 0 }}>
              ✕
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 10.5 }} onClick={add}>
          + Add another stop this day
        </button>
      )}
    </div>
  );
}
