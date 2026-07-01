// Shared UI for any letterhead-based document (Quotation, Proforma, Tax
// Invoice, Exchange Order, Meal Plan, Tour Briefing Sheet, Itinerary
// Builder, and any future document). Centralizing this means the toggle
// set and Content/Preview pattern only needs to be built once and stays
// consistent everywhere, instead of being hand-copied (and drifting) per
// document.
import { useState } from 'react';

// Standard toggle state: Header/Footer on all pages, Page number, Digital
// stamp, and Print on Letterhead (which supersedes + disables the two
// "on all pages" toggles, since physical letterhead paper needs blank
// space reserved on every sheet regardless of their state).
export function useLetterheadToggles({ defaultHeader = true, defaultFooter = false } = {}) {
  const [headerAllPages, setHeaderAllPages] = useState(defaultHeader);
  const [footerAllPages, setFooterAllPages] = useState(defaultFooter);
  const [showPageNum, setShowPageNum] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [printOnLetterhead, setPrintOnLetterhead] = useState(false);

  const togglePrintOnLetterhead = () => setPrintOnLetterhead(p => {
    const next = !p;
    if (next) { setHeaderAllPages(false); setFooterAllPages(false); }
    return next;
  });

  return {
    headerAllPages, setHeaderAllPages,
    footerAllPages, setFooterAllPages,
    showPageNum, setShowPageNum,
    showStamp, setShowStamp,
    printOnLetterhead, togglePrintOnLetterhead,
  };
}

export function LetterheadToggleBar({ toggles, G }) {
  const {
    headerAllPages, setHeaderAllPages, footerAllPages, setFooterAllPages,
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
      <Tog label="Header on all pages" val={headerAllPages} onToggle={() => setHeaderAllPages(p => !p)} disabled={printOnLetterhead}/>
      <Tog label="Footer on all pages" val={footerAllPages} onToggle={() => setFooterAllPages(p => !p)} disabled={printOnLetterhead}/>
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
export function DocPreviewFrame({ html }) {
  return (
    <iframe title="doc-preview" srcDoc={html} style={{ width:'100%', height:'100%', border:'none', background:'#fff' }}/>
  );
}

// Standard handlePrint wrapper: opens a popup, writes the pre-built HTML
// string, and triggers the browser print dialog.
export function printHTML(html) {
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
}
