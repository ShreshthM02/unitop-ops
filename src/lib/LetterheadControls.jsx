// Shared UI for any letterhead-based document (Quotation, Proforma, Tax
// Invoice, Exchange Order, Meal Plan, Tour Briefing Sheet, Itinerary
// Builder, and any future document). Centralizing this means the toggle
// set and Content/Preview pattern only needs to be built once and stays
// consistent everywhere, instead of being hand-copied (and drifting) per
// document.
import { useState, useRef, useEffect } from 'react';
import { withPreviewStyles } from './letterhead.js';

// Standard toggle state (Letterhead Standardization, 2026-07-24): exactly
// 4 toggles now -- Header+Footer on all pages (combined into one, was two
// separate toggles before), Page number, Digital stamp, and Print on
// Letterhead (which supersedes + disables the "on all pages" toggle,
// since physical letterhead paper needs blank space reserved on every
// sheet regardless of its state).
export function useLetterheadToggles({ defaultHeaderFooter = true } = {}) {
  const [headerFooterAllPages, setHeaderFooterAllPages] = useState(defaultHeaderFooter);
  const [showPageNum, setShowPageNum] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [printOnLetterhead, setPrintOnLetterhead] = useState(false);

  const togglePrintOnLetterhead = () => setPrintOnLetterhead(p => {
    const next = !p;
    if (next) { setHeaderFooterAllPages(false); }
    return next;
  });

  return {
    headerFooterAllPages, setHeaderFooterAllPages,
    showPageNum, setShowPageNum,
    showStamp, setShowStamp,
    printOnLetterhead, togglePrintOnLetterhead,
  };
}

export function LetterheadToggleBar({ toggles, G }) {
  const {
    headerFooterAllPages, setHeaderFooterAllPages,
    showPageNum, setShowPageNum, showStamp, setShowStamp,
    printOnLetterhead, togglePrintOnLetterhead,
  } = toggles;

  const Tog = ({ label, val, onToggle, disabled }) => (
    <label style={{ display:'flex', alignItems:'center', gap:6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize:11, color: disabled ? G.gray400 : G.gray600, opacity: disabled ? 0.55 : 1 }}>
      <div onClick={disabled ? undefined : onToggle} style={{ width:30, height:16, borderRadius:8, background: val ? G.navy : G.gray200, position:'relative', flexShrink:0, transition:'background .2s' }}>
        <div style={{ position:'absolute', top:2, left: val ? 14 : 2, width:12, height:12, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
      </div>
      {label}
    </label>
  );

  return (
    <div style={{ padding:'7px 18px', background:G.gray50, borderBottom:`1px solid ${G.gray200}`, display:'flex', gap:16, flexShrink:0, alignItems:'center', flexWrap:'wrap' }}>
      <Tog label="Header + Footer on all pages" val={headerFooterAllPages} onToggle={() => setHeaderFooterAllPages(p => !p)} disabled={printOnLetterhead}/>
      <Tog label="Page number" val={showPageNum} onToggle={() => setShowPageNum(p => !p)}/>
      <Tog label="Digital stamp" val={showStamp} onToggle={() => setShowStamp(p => !p)}/>
      <span style={{ width:1, alignSelf:'stretch', background:G.gray200 }}/>
      <Tog label="🖨 Print on Letterhead" val={printOnLetterhead} onToggle={togglePrintOnLetterhead}/>
    </div>
  );
}

// Content/Preview tab header, shared across every document.
export function DocTabBar({ activeTab, setActiveTab, G }) {
  return (
    <div style={{ display:'flex', gap:4, padding:'0 18px', background:G.white, borderBottom:`1px solid ${G.gray200}` }}>
      {[['content','📝 Content'], ['preview','👁 Preview']].map(([id, label]) => (
        <button key={id} onClick={() => setActiveTab(id)}
          style={{ padding:'10px 16px', border:'none', borderBottom:`2px solid ${activeTab===id ? G.navy : 'transparent'}`,
            background:'transparent', cursor:'pointer', fontSize:12, fontWeight: activeTab===id ? 600 : 400,
            color: activeTab===id ? G.navy : G.gray600, fontFamily:"'Inter',sans-serif" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Live WYSIWYG preview: renders the exact HTML that will be printed, inside
// an iframe via srcDoc (matches the buildPrintHTML -> handlePrint -> iframe
// srcDoc pattern used throughout).
//
// Rebuilt 2026-07-31 to actually look like the browser's own print preview.
// It previously handed the print HTML straight to a full-width iframe, which
// showed the content with no page margins (@page does nothing on screen) and
// no visible boundary between pages, at whatever scale the panel happened to
// be -- accurate markup, misleading picture.
//
// Two parts to the fix:
//   1. withPreviewStyles() injects screen-only CSS that rebuilds true A4
//      sheet geometry with real margins, gaps and shadows (see letterhead.js).
//   2. The iframe is laid out at a FIXED logical width -- one 210mm sheet
//      plus gutters -- and then CSS-scaled down to fit whatever width the
//      panel actually has. Scaling the frame rather than the content keeps
//      the document's own layout maths untouched, so what's on screen is the
//      same layout that prints, just smaller. Pages never reflow to fit the
//      panel, which is the whole point: a preview that reflows can't tell
//      you where a page will break.
const PREVIEW_SHEET_W_PX = 794;                       // 210mm at 96dpi
const PREVIEW_GUTTER_PX = 24;
const PREVIEW_LOGICAL_W = PREVIEW_SHEET_W_PX + PREVIEW_GUTTER_PX * 2;

export function DocPreviewFrame({ html, title = "doc-preview" }) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [docHeight, setDocHeight] = useState(1123); // one A4 at 96dpi, until measured

  // Fit-to-width, recomputed whenever the panel resizes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / PREVIEW_LOGICAL_W));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the rendered document so the scaled frame reserves the right
  // amount of scroll height -- otherwise a multi-page document is either
  // clipped or trailed by dead space.
  const measure = () => {
    try {
      const body = frameRef.current && frameRef.current.contentDocument && frameRef.current.contentDocument.body;
      if (body && body.scrollHeight > 0) setDocHeight(body.scrollHeight);
    } catch (e) { /* cross-origin can't happen with srcDoc, but never break the preview over it */ }
  };
  useEffect(() => { const t = setTimeout(measure, 120); return () => clearTimeout(t); }, [html]);

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", overflowY: "auto", background: "#525659" }}>
      <div style={{ height: docHeight * scale, position: "relative" }}>
        <iframe
          ref={frameRef}
          title={title}
          srcDoc={withPreviewStyles(html)}
          onLoad={measure}
          style={{
            width: PREVIEW_LOGICAL_W,
            height: docHeight,
            border: "none",
            background: "transparent",
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            position: "absolute",
            left: "50%",
            marginLeft: -(PREVIEW_LOGICAL_W * scale) / 2,
          }}
        />
      </div>
    </div>
  );
}

// The print dialog must not open until everything on the page has actually
// loaded. It used to open after a fixed delay (or on the window's load
// event), which is not enough: the logo, footer photos and stamp are images
// that decode a moment after the document itself is "complete", and web
// fonts finish later still -- so the dialog's preview (and a quick Save)
// captured a half-drawn page. This waits for, in order:
//   1. the document to finish loading
//   2. every <img> to load AND decode (a broken image counts as settled)
//   3. every CSS background-image to load (watermarks and the like)
//   4. web fonts to be ready
//   5. a short pause for the final layout to settle
// A ceiling (default 10s) means a dead image can never block printing for
// good: after it, printing goes ahead with whatever has loaded.
export function waitForPrintReady(win, { timeoutMs = 10000, settleMs = 150 } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; clearTimeout(ceiling); resolve(); } };
    const ceiling = setTimeout(finish, timeoutMs);
    const settled = (el, ev) => new Promise(r => { el.addEventListener(ev, r, { once: true }); });
    const run = async () => {
      try {
        const doc = win.document;
        if (doc.readyState !== 'complete') {
          await new Promise(r => { win.addEventListener('load', r, { once: true }); });
        }
        const imgs = Array.from(doc.images || []);
        await Promise.all(imgs.map(img => {
          if (img.complete) return img.naturalWidth > 0 && img.decode ? img.decode().catch(() => {}) : null;
          return Promise.race([settled(img, 'load'), settled(img, 'error')]).then(() => (img.decode ? img.decode().catch(() => {}) : null));
        }));
        const urls = new Set();
        if (typeof win.getComputedStyle === 'function') {
          Array.from(doc.querySelectorAll('*')).forEach(el => {
            const bg = win.getComputedStyle(el).backgroundImage || '';
            const re = /url\(["']?([^"')]+)["']?\)/g; let m;
            while ((m = re.exec(bg))) urls.add(m[1]);
          });
        }
        await Promise.all(Array.from(urls).map(u => new Promise(r => {
          const im = new win.Image();
          im.onload = im.onerror = () => r();
          im.src = u;
        })));
        if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
        await new Promise(r => setTimeout(r, settleMs));
      } catch (e) { /* fall through: print with what we have */ }
      finish();
    };
    run();
  });
}

// Waits until the page is fully drawn, then opens the print dialog.
export async function printWindowWhenReady(win, opts) {
  await waitForPrintReady(win, opts);
  try { win.focus(); } catch (e) { /* not fatal */ }
  win.print();
}

// Standard handlePrint wrapper: opens a popup, writes the pre-built HTML
// string, and opens the print dialog once the page is fully loaded.
export function printHTML(html) {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups for this site to print/export PDF.'); return; }
  win.document.write(html);
  win.document.close();
  return printWindowWhenReady(win);
}
