import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ITINERARY_ITEM_TYPES, addableItemTypes, newItineraryItem, reorderItems,
  itemTextForFlavor, withItemTextForFlavor, itemNoteForFlavor, withItemNoteForFlavor,
  NOTABLE_ITEM_TYPES, ICON_PATHS,
} from './utils.js';

// Renders the same monochrome line-icon glyphs the printed export uses --
// drawn from ICON_PATHS in utils.js, the single shared source, so the
// editor's icon for a type can never quietly drift from what actually
// prints. `dangerouslySetInnerHTML` is safe here: the content is static,
// developer-authored path data, never user input.
export function ItemIcon({ name, size = 13, color = "#6B7280" }) {
  if (!name || !ICON_PATHS[name]) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ verticalAlign: "-2px", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}/>
  );
}

// Editor for one day's ordered list of typed items. Shared by both flavors
// of the Itinerary document so the two cannot drift in how the same item
// type is edited.
//
// `flavor` ('brief' | 'detailed') matters in one place: the optional NOTE a
// notable item (route/sightseeing/transport/stay) can carry is independent
// per flavor -- see itemNoteForFlavor/withItemNoteForFlavor in utils.js.
// Description used to be its own selectable item type; it is now this note,
// scoped to whichever item it is actually about, because a standalone
// unlabelled Description line was indistinguishable enough from an
// unlabelled Route line to get picked by mistake for a second movement --
// confirmed against a real export where exactly that happened.
//
// Drag-and-drop is hand-rolled on native HTML5 drag events rather than
// pulling in a library. This is a short single-column list with no nesting,
// no virtualisation and no cross-container moves, which is the case native
// DnD handles well; a dependency would be carrying a lot of capability we
// have no use for. The trade-off worth knowing: native HTML5 drag does not
// fire on touch devices, so the ▲▼ buttons are not a convenience -- they are
// the only way to reorder on a tablet, and must stay.
const typeMeta = (id) => ITINERARY_ITEM_TYPES.find(t => t.id === id) || ITINERARY_ITEM_TYPES[0];

// Remarks is the one addable type whose own text is naturally a paragraph.
const MULTILINE_TYPES = new Set(["remarks"]);

export function DayItemsEditor({ items, onChange, style: flavor = "brief", G, inp, readOnly }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const addBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  // Which items currently have their note field expanded -- starts expanded
  // for any item that already has one, so existing notes are never hidden
  // behind an extra click.
  const [openNotes, setOpenNotes] = useState(() => {
    const s = new Set();
    (items || []).forEach(it => { if (itemNoteForFlavor(it, flavor)) s.add(it.id); });
    return s;
  });
  const list = items || [];

  // Each day card is rendered with overflow:hidden (to clip its own rounded
  // corners), and this menu used to be positioned relative to that card --
  // so it was clipped to invisible the moment the card was short enough for
  // the menu to spill past its bottom edge. A portal renders the menu
  // directly on document.body, positioned from the trigger button's real
  // screen coordinates, so no ancestor's overflow can clip it.
  useEffect(() => {
    if (!addOpen || !addBtnRef.current) return;
    const place = () => {
      const r = addBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [addOpen]);

  const update = (i, patch) => onChange(list.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (from, to) => onChange(reorderItems(list, from, to));
  const add = (type) => { setAddOpen(false); onChange([...list, newItineraryItem(type)]); };
  const setText = (i, value) => onChange(list.map((it, idx) => idx === i ? withItemTextForFlavor(it, flavor, value) : it));
  const setNote = (i, value) => onChange(list.map((it, idx) => idx === i ? withItemNoteForFlavor(it, flavor, value) : it));

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
        const multiline = MULTILINE_TYPES.has(item.type);
        const value = itemTextForFlavor(item, flavor);
        const notable = NOTABLE_ITEM_TYPES.has(item.type);
        const noteValue = notable ? itemNoteForFlavor(item, flavor) : "";
        const noteOpen = openNotes.has(item.id);
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
              marginBottom:6, padding:"7px 8px", borderRadius:7,
              background: isDragging ? G.gray100 : G.white,
              border:`1px solid ${isOver ? G.accent : G.gray200}`,
              borderTop: isOver ? `2px solid ${G.accent}` : `1px solid ${G.gray200}`,
              opacity: isDragging ? 0.5 : 1,
            }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <span title="Drag to reorder" style={{ cursor: readOnly ? "default" : "grab", color:G.gray400, fontSize:13, lineHeight:"22px", userSelect:"none" }}>⠿</span>
              <span style={{ lineHeight:"22px", display:"inline-flex", alignItems:"center" }} title={meta.label}>
                {meta.icon
                  ? <ItemIcon name={item.type === "transport" ? (item.mode === "train" ? "train" : "plane") : meta.icon}/>
                  : <span style={{ fontSize:9, color:G.gray400, fontWeight:700, letterSpacing:"0.5px" }}>{meta.label.toUpperCase()}</span>}
              </span>

              <div style={{ flex:1, display:"flex", flexDirection: multiline ? "column" : "row", gap:6, flexWrap:"wrap" }}>
                {item.type === "transport" && !readOnly && (
                  <div style={{ display:"flex", gap:4, marginBottom:2, width:"100%" }}>
                    {["flight","train"].map(m => (
                      <button key={m} type="button" onClick={() => update(i, { mode: m })}
                        style={{ padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:600, cursor:"pointer",
                          border:`1px solid ${(item.mode||"flight")===m ? G.accent : G.gray200}`,
                          background:(item.mode||"flight")===m ? "#FDEDEC" : G.white,
                          color:(item.mode||"flight")===m ? G.accent : G.gray400 }}>
                        {m === "flight" ? "Flight" : "Train"}
                      </button>
                    ))}
                  </div>
                )}
                {multiline ? (
                  <textarea
                    style={{ ...inp, flex:1, minHeight:64, resize:"vertical", fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => setText(i, e.target.value)}
                    placeholder="Note for this day"
                  />
                ) : (
                  <input
                    style={{ ...inp, flex:1, minWidth:140 }}
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => setText(i, e.target.value)}
                    placeholder={
                      item.type === "route" ? "e.g. Leh – Alchi – Leh"
                      : item.type === "sightseeing" ? "e.g. Mahabodhi Temple"
                      : item.type === "transport" ? (item.mode === "train" ? "e.g. 12345" : "e.g. 6E 2134")
                      : "e.g. Hotel Leh Palace / Similar"
                    }
                  />
                )}
                {meta.fields.includes("distance") && (
                  <input style={{ ...inp, width:90 }} value={item.distance || ""} disabled={readOnly}
                    onChange={(e) => update(i, { distance: e.target.value })} placeholder="65 km"/>
                )}
                {meta.fields.includes("time") && (
                  <input style={{ ...inp, width:90 }} value={item.time || ""} disabled={readOnly}
                    onChange={(e) => update(i, { time: e.target.value })} placeholder="1.5 hrs"/>
                )}
                {item.type === "transport" && (
                  <>
                    <input style={{ ...inp, width:78 }} value={item.depTime || ""} disabled={readOnly}
                      onChange={(e) => update(i, { depTime: e.target.value })} placeholder="Dep 14:30"
                      aria-label="Departure time"/>
                    <input style={{ ...inp, width:78 }} value={item.arrTime || ""} disabled={readOnly}
                      onChange={(e) => update(i, { arrTime: e.target.value })} placeholder="Arr 16:10"
                      aria-label="Arrival time"/>
                  </>
                )}
              </div>

              {!readOnly && (
                <div style={{ display:"flex", gap:2, flexShrink:0 }}>
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

            {/* A note attached to this specific item -- what a standalone
                Description item used to be, now scoped to whichever line it
                is actually about. Only offered on notable types; remarks
                (already a freeform aside) and any unknown type don't get a
                second layer of note. */}
            {notable && (noteOpen || noteValue) ? (
              <div style={{ marginLeft:29, marginTop:5 }}>
                <textarea
                  style={{ ...inp, minHeight:44, resize:"vertical", fontFamily:"'Inter',sans-serif", lineHeight:1.5, fontSize:11.5 }}
                  value={noteValue}
                  disabled={readOnly}
                  onChange={(e) => setNote(i, e.target.value)}
                  placeholder={
                    flavor === "detailed"
                      ? "Longer, client-facing note about this — e.g. history of a monument"
                      : "Short note about this"
                  }
                />
                {!readOnly && !noteValue && (
                  <button type="button" onClick={() => setOpenNotes(prev => { const s = new Set(prev); s.delete(item.id); return s; })}
                    style={{ border:"none", background:"none", cursor:"pointer", color:G.gray400, fontSize:10, padding:"2px 0" }}>
                    Cancel
                  </button>
                )}
              </div>
            ) : notable && !readOnly ? (
              <button type="button" onClick={() => setOpenNotes(prev => new Set(prev).add(item.id))}
                style={{ marginLeft:29, marginTop:3, border:"none", background:"none", cursor:"pointer", color:G.gray400, fontSize:10.5, padding:0 }}>
                + Add note
              </button>
            ) : null}
          </div>
        );
      })}

      {!readOnly && (
        <div style={{ display:"inline-block" }}>
          <button ref={addBtnRef} className="btn btn-ghost" style={{ fontSize:11 }}
            onClick={() => setAddOpen(o => !o)}>+ Add Item ▾</button>
          {addOpen && menuPos && createPortal(
            <AddItemMenu
              pos={menuPos}
              G={G}
              types={addableItemTypes()}
              onPick={add}
              onDismiss={() => setAddOpen(false)}
            />,
            document.body,
          )}
        </div>
      )}
    </div>
  );
}

// Split out so the outside-click listener only exists while the menu is
// actually open -- attaching it unconditionally on every DayItemsEditor
// instance (there is one per day) would mean a document-wide listener per
// day card for the entire time the itinerary is open.
function AddItemMenu({ pos, G, types, onPick, onDismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) onDismiss(); };
    const onEsc = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onDismiss]);

  return (
    <div ref={ref} role="menu" style={{
      position:"fixed", top:pos.top, left:pos.left, zIndex:1000, background:G.white,
      border:`1px solid ${G.gray200}`, borderRadius:8, boxShadow:"0 6px 20px rgba(0,0,0,0.14)",
      minWidth:180, padding:4,
    }}>
      {types.map(t => (
        <button key={t.id} role="menuitem" onClick={() => onPick(t.id)}
          style={{ display:"flex", alignItems:"center", gap:7, width:"100%", textAlign:"left", border:"none", background:"none",
            cursor:"pointer", padding:"7px 9px", borderRadius:6, fontSize:12, fontFamily:"'Inter',sans-serif", color:G.gray800 }}
          onMouseEnter={e => e.currentTarget.style.background = G.gray50}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          {t.icon ? <ItemIcon name={t.icon}/> : <span style={{ width:13 }}/>}
          {t.label}
        </button>
      ))}
    </div>
  );
}
