import { useState, useRef } from 'react';
import { reorderArray } from './utils.js';

// Drag-to-reorder for a list kept in React state. A row only becomes draggable
// while its ⠿ grip is held, so typing/selecting text in the row's inputs is never
// disturbed. Usage:
//   const dr = useDragReorder(setList);
//   <div key=.. {...dr.row(i, baseStyle)}> <span {...dr.grip(i)}>⠿</span> ... </div>
export function useDragReorder(setList) {
  const [armed, setArmed] = useState(null);
  const [over, setOver] = useState(null);
  const from = useRef(null);
  const reset = () => { from.current = null; setArmed(null); setOver(null); };
  const row = (i, style) => ({
    draggable: armed === i,
    onDragStart: (e) => { from.current = i; try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); } catch (err) { /* old browsers */ } },
    onDragOver: (e) => { if (from.current !== null) { e.preventDefault(); if (over !== i) setOver(i); } },
    onDrop: (e) => { e.preventDefault(); const f = from.current; reset(); if (f !== null && f !== i) setList(p => reorderArray(p, f, i)); },
    onDragEnd: reset,
    "data-drag-over": over === i && from.current !== null && from.current !== i ? "true" : undefined,
    style: { position: "relative", ...style, ...(over === i && from.current !== null && from.current !== i ? { boxShadow: "0 -3px 0 0 #2E86C1" } : {}) },
  });
  const grip = (i, style) => ({
    onMouseDown: () => setArmed(i), onMouseUp: () => setArmed(null), onTouchStart: () => setArmed(i),
    title: "Drag to reorder", "aria-label": "Drag to reorder", role: "button",
    style: { cursor: "grab", color: "#9CA3AF", fontSize: 13, lineHeight: 1, userSelect: "none", ...style },
  });
  // Centered grip for card-style rows (sits in the card's top padding).
  const cardGrip = (i) => grip(i, { position: "absolute", left: "50%", top: 1, transform: "translateX(-50%)", fontSize: 11, letterSpacing: 1 });
  return { row, grip, cardGrip };
}
