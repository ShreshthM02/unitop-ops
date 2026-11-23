import { describe, it, expect } from 'vitest';
import fs from 'fs';

// UnitopApp is too heavy to mount here, so these guard the wiring itself:
// every way of opening a tour-file drawer goes through one function that
// closes the other overlays first, and the drawer never renders while chat,
// profile or user management is open.
const src = fs.readFileSync('src/components/UnitopApp.jsx', 'utf8');

describe('Tour-file drawer always opens alone on top', () => {
  it('has a single openQuery that closes chat, search, profile, Masters and document panels first', () => {
    const body = src.slice(src.indexOf('const openQuery = '), src.indexOf('const openQueryRef'));
    for (const w of ['setShowChat(false)', 'setShowSearch(false)', 'setShowProfile(false)', 'setStatFilter(null)', 'setShowAgents(false)', 'setShowSeries(false)', 'setShowVendors(false)', 'setShowCostSheet(null)', 'setShowVoucher(null)', 'setShowPayments(null)']) expect(body).toContain(w);
    expect(body).toContain('setActiveQuery(q)');
  });
  it('the outside-the-tree link event, search, lists and notifications all use it', () => {
    expect(src).toContain('openQueryRef.current(e.detail.query)');
    expect(src).toContain('onSelectQuery={q=>openQuery(q)}');
    expect(src).toContain('onOpenQuery={(q)=>openQuery(q,"remarks")}');
    expect(src).not.toMatch(/onOpenQuery=\{setActiveQuery\}/);
    expect(src).not.toContain('onClick={()=>setActiveQuery(q)}');
  });
  it('the drawer does not render while chat, profile or user management is open', () => {
    const line = src.split('\n').find(l => l.includes('const anyPanel ='));
    for (const w of ['showChat', 'showProfile', 'showUserMgmt']) expect(line).toContain(w);
  });
});
