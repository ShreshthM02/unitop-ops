import { useState } from 'react';
import { ITINERARY_ITEM_TYPES, addableItemTypes, newItineraryItem, reorderItems } from './utils.js';

// Editor for one day's ordered list of typed items. Shared by Brief and
// Detailed Itinerary so the two cannot drift in how the same item is edited
// -- Detailed differs only in offering the Description type (1.12).
//
// Drag-and-drop is hand-rolled on native HTML5 drag events rather than
// pulling in a library. This is a short single-column list with no nesting,
// no virtualisation and no cross-container moves, which is the case native
// DnD handles well; a dependency would be carrying a lot of capability we
// have no use for. The trade-off worth knowing: native HTML5 drag does not
// fire on touch devices, so the ▲▼ buttons are not a convenience -- they are
// the only way to reorder on a tablet, and must stay.
const typeMeta = (id) => ITINERARY_ITEM_TYPES.find(t => t.id === id) || ITINERARY_ITEM_TYPES[0];

export function DayItemsEditor({ items, onChange, style: docStyle = "brief", G, inp, readOnly }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const list = items || [];

  const update = (i, patch) => onChange(list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (from, to) => onChange(reorderItems(list, from, to));
  const add = (type) => { setAddOpen(false); onChange([...list, newItineraryItem(type)]); };

  const onDrop = (i) => {
    if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
    setDragIndex(null); setOverIndex(null);
  };

  return (
    <div>
      {list.length === 0 && (
        <div style={{ fontSize:11, color:G.gray400, padding:"8px 0" }}>
          No items yet — add a route, sightseeing stop, flight/train or overnight stay.
        </div>
      )}

      {list.map((item, i) => {
        const meta = typeMeta(item.type);
        const isDragging = dragIndex === i;
        const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
        return (
          <div
            key={item.id}
            draggable={!readOnly}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
            onDragLeave={() => setOverIndex(o => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); onDrop(i); }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            style={{
              display:"flex", alignItems:"flex-start", gap:8, marginBottom:6, padding:"7px 8px",
              borderRadius:7, background: isDragging ? G.gray100 : G.white,
              border:`1px solid ${isOver ? G.accent : G.gray200}`,
              borderTop: isOver ? `2px solid ${G.accent}` : `1px solid ${G.gray200}`,
              opacity: isDragging ? 0.5 : 1,
            }}>
            <span title="Drag to reorder" style={{ cursor: readOnly ? "default" : "grab", color:G.gray400, fontSize:13, lineHeight:"22px", userSelect:"none" }}>⠿</span>
            <span style={{ fontSize:12, lineHeight:"22px" }} title={meta.label}>{meta.icon}</span>

            <div style={{ flex:1, display:"flex", gap:6 }}>
              <input
                style={{ ...inp, flex:1 }}
                value={item.text || ""}
                disabled={readOnly}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder={
                  item.type === "route" ? "e.g. Leh – Alchi – Leh"
                  : item.type === "sightseeing" ? "e.g. Mahabodhi Temple"
                  : item.type === "transport" ? "e.g. Delhi / Varanasi — 6E 2134"
                  : item.type === "stay" ? "e.g. Hotel Leh Palace / Similar"
                  : "Detailed description for this day"
                }
              />
              {meta.fields.includes("distance") && (
                <input style={{ ...inp, width:90 }} value={item.distance || ""} disabled={readOnly}
                  onChange={(e) => update(i, { distance: e.target.value })} placeholder="65 km"/>
              )}
              {meta.fields.includes("time") && (
                <input style={{ ...inp, width:90 }} value={item.time || ""} disabled={readOnly}
                  onChange={(e) => update(i, { time: e.target.value })} placeholder="1.5 hrs"/>
              )}
            </div>

            {!readOnly && (
              <div style={{ display:"flex", gap:2 }}>
                {/* Keyboard/touch-accessible reordering -- the only route on
                    devices where native HTML5 drag never fires. */}
                <button aria-label="Move item up" disabled={i === 0} onClick={() => move(i, i - 1)}
                  style={{ border:"none", background:"none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? G.gray200 : G.gray400, fontSize:11 }}>▲</button>
                <button aria-label="Move item down" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}
                  style={{ border:"none", background:"none", cursor: i === list.length - 1 ? "default" : "pointer", color: i === list.length - 1 ? G.gray200 : G.gray400, fontSize:11 }}>▼</button>
                <span style={{ cursor:"pointer", color:G.gray400, fontSize:12, lineHeight:"22px" }} onClick={() => remove(i)}>✕</span>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div style={{ position:"relative", display:"inline-block" }}>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setAddOpen(o => !o)}>+ Add Item ▾</button>
          {addOpen && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:20, background:G.white,
              border:`1px solid ${G.gray200}`, borderRadius:8, boxShadow:"0 6px 20px rgba(0,0,0,0.14)", minWidth:180, padding:4 }}>
              {addableItemTypes(docStyle).map(t => (
                <button key={t.id} onClick={() => add(t.id)}
                  style={{ display:"block", width:"100%", textAlign:"left", border:"none", background:"none",
                    cursor:"pointer", padding:"7px 9px", borderRadius:6, fontSize:12, fontFamily:"'Inter',sans-serif", color:G.gray800 }}
                  onMouseEnter={e => e.currentTarget.style.background = G.gray50}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
