import { useState, useRef, useEffect } from 'react';
import { reorderArray } from './utils.js';

// Drag-to-reorder for a list kept in React state. A row only becomes draggable
// while its ⠿ grip is held, so typing/selecting text in the row's inputs is never
// disturbed. Usage:
//   const dr = useDragReorder(setList);
//   <div key=.. {...dr.row(i, baseStyle)}> <span {...dr.grip(i)}>⠿</span> ... </div>
// Scroll guard: dragging/reordering used to throw the page back to the top
// (the cost sheet scrolls inside its own container). Before anything changes
// we remember the scroll position of the window AND every scrolling ancestor of
// the grip, then put them back right after the re-render (and again a moment
// later, in case the browser scrolls once the drag ends). Every list that uses
// this hook gets the guard, so a new section can't bring the bug back.
function captureScroll(el) {
  const saved = [{ el: window, x: window.scrollX, y: window.scrollY }];
  for (let n = el && el.parentElement; n; n = n.parentElement) {
    if (n.scrollTop || n.scrollLeft) saved.push({ el: n, x: n.scrollLeft, y: n.scrollTop });
  }
  return () => saved.forEach(s => {
    try { if (s.el === window) window.scrollTo(s.x, s.y); else { s.el.scrollTop = s.y; s.el.scrollLeft = s.x; } } catch (e) { /* ignore */ }
  });
}
const restoreSoon = (restore) => {
  restore();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
  setTimeout(restore, 60); setTimeout(restore, 250);
};

export function useDragReorder(setList) {
  const [armed, setArmed] = useState(null);
  const [over, setOver] = useState(null);
  const from = useRef(null);
  const guard = useRef(null);
  useEffect(() => () => { guard.current = null; }, []);
  const reset = () => { from.current = null; setArmed(null); setOver(null); if (guard.current) { restoreSoon(guard.current); guard.current = null; } };
  const row = (i, style) => ({
    draggable: armed === i,
    onDragStart: (e) => { from.current = i; if (!guard.current) guard.current = captureScroll(e.currentTarget); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); } catch (err) { /* old browsers */ } },
    onDragOver: (e) => { if (from.current !== null) { e.preventDefault(); if (over !== i) setOver(i); } },
    onDrop: (e) => { e.preventDefault(); const f = from.current; reset(); if (f !== null && f !== i) setList(p => reorderArray(p, f, i)); },
    onDragEnd: reset,
    "data-drag-over": over === i && from.current !== null && from.current !== i ? "true" : undefined,
    style: { position: "relative", ...style, ...(over === i && from.current !== null && from.current !== i ? { boxShadow: "0 -3px 0 0 #2E86C1" } : {}) },
  });
  const grip = (i, style) => ({
    onMouseDown: (e) => { guard.current = captureScroll(e.currentTarget); setArmed(i); }, onMouseUp: () => setArmed(null), onTouchStart: (e) => { guard.current = captureScroll(e.currentTarget); setArmed(i); },
    title: "Drag to reorder", "aria-label": "Drag to reorder", role: "button",
    style: { cursor: "grab", color: "#9CA3AF", fontSize: 13, lineHeight: 1, userSelect: "none", ...style },
  });
  // Centered grip for card-style rows (sits in the card's top padding).
  const cardGrip = (i) => grip(i, { position: "absolute", left: "50%", top: 1, transform: "translateX(-50%)", fontSize: 11, letterSpacing: 1 });
  return { row, grip, cardGrip };
}
