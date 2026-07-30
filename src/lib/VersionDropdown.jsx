import { useState, useRef, useEffect } from 'react';

// Shared version-history dropdown, used by every document's header (Cost
// Sheet, Quotation, Tax Invoice, Pro-forma Invoice, Meal Plan, Tour
// Briefing Sheet, Brief Itinerary). Extracted 2026-07-30 -- previously
// each document had its own copy of this same dropdown logic, which meant
// e.g. the star-highlight styling added here would otherwise have needed
// 7 separate, easy-to-miss edits.
//
// The mark-final action itself is NOT hardcoded here, since each
// document's validation differs (Quotation requires Final Price
// completeness before allowing it; others don't) -- callers pass their
// own onMarkFinal(v) callback with whatever document-specific logic and
// audit-log message they need.
export function VersionDropdown({
  versions,
  viewingVersion,
  displayVersion, // the version number to show on the closed toggle button when nothing is being actively viewed (usually version-1, i.e. the latest saved version)
  finalVersion,
  onSelectVersion,
  onMarkFinal,
  readOnly,
  G,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!versions || versions.length === 0) return null;

  const shownVersion = viewingVersion || displayVersion;

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button onClick={() => setOpen(p => !p)} className="btn btn-ghost"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
        v{shownVersion} {finalVersion === shownVersion && '★'} ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: G.navyMid, borderRadius: 8, padding: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10, minWidth: 170, maxHeight: 240, overflowY: 'auto' }}>
          {versions.slice().reverse().map(v => {
            const isFinal = finalVersion === v.version;
            return (
              <div key={v.version} style={{
                display: 'flex', alignItems: 'center', borderRadius: 6, overflow: 'hidden', marginBottom: 2,
                background: isFinal ? 'rgba(5,150,105,0.35)' : 'transparent',
                border: viewingVersion === v.version ? '1px solid #fff' : '1px solid transparent',
              }}>
                <div onClick={() => { onSelectVersion(v); setOpen(false); }} title={v.note || `View v${v.version}`}
                  style={{ flex: 1, padding: '5px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: viewingVersion === v.version ? 700 : 400 }}>
                  v{v.version}{v.note ? ` — ${v.note}` : ''}
                </div>
                <div onClick={() => { if (readOnly) return; onMarkFinal(v); }} title="Mark as final"
                  style={{ padding: '5px 8px', color: '#fff', fontSize: 11, cursor: readOnly ? 'default' : 'pointer' }}>
                  {isFinal ? '★' : '☆'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
