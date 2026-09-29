import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Real, reported bug: "upon refreshing, user finds itself on the main
// screen like the vendor repository instead of being at vendor repository
// -> vendor -> contracted rates (from where he refreshed in the first
// place)." Investigated directly: `view` (the top-level sidebar tab, e.g.
// "vendors") already persisted across a refresh via localStorage
// ("unitop_last_view") -- so a refresh DID correctly restore the Vendor
// Repository tab. What it never restored was WHICH vendor was drilled
// into: focusVendorId/focusAgentId/focusSeriesId (read by VendorMaster/
// AgentMaster/SeriesManagement's own `initialSelectedId` prop to
// auto-select a record) were plain in-memory React state, always reset to
// null on a fresh mount -- so a refresh always dropped back to the bare
// list, exactly matching the report. Fixed by persisting these three ids
// to localStorage the same way `view` already is, and restoring them as
// each one's initial state.
//
// UnitopApp.jsx is too large/deeply-integrated (real Supabase calls,
// dozens of child panels) to mount directly in a unit test, so -- same
// established pattern this codebase already uses for this class of
// "is the wiring actually present" check (see auditTrailCoverage.test.jsx)
// -- this asserts directly against the source that the persistence
// read/write is genuinely wired up for all three ids, not just declared.

const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf-8');

describe('Navigation state survives a browser refresh: focus ids (Vendors/Agents/Series drill-down)', () => {
  it('view already persists across a refresh (pre-existing behavior, confirming the baseline this fix extends)', () => {
    expect(src).toContain('useState(() => localStorage.getItem("unitop_last_view") || "dashboard")');
    expect(src).toContain('localStorage.setItem("unitop_last_view", view)');
  });

  it.each([
    ['focusVendorId', 'unitop_focus_vendor'],
    ['focusAgentId',  'unitop_focus_agent'],
    ['focusSeriesId', 'unitop_focus_series'],
  ])('%s is seeded from localStorage("%s") on mount', (stateVar, key) => {
    const initRegex = new RegExp(`${stateVar}\\s*,\\s*set${stateVar[0].toUpperCase()}${stateVar.slice(1)}\\s*\\]\\s*=\\s*useState\\(\\(\\)\\s*=>\\s*localStorage\\.getItem\\("${key}"\\)`);
    expect(src).toMatch(initRegex);
  });

  it.each([
    ['focusAgentId',  'unitop_focus_agent'],
    ['focusVendorId', 'unitop_focus_vendor'],
    ['focusSeriesId', 'unitop_focus_series'],
  ])('%s is written back to localStorage("%s") whenever it changes, so the NEXT refresh picks up wherever the user drilled into most recently', (stateVar, key) => {
    expect(src).toContain(`localStorage.setItem("${key}", ${stateVar})`);
  });

  it('the persisted focus id is still wired into the matching asTab panel\'s initialSelectedId prop (the actual restore mechanism), not just stored and forgotten', () => {
    expect(src).toContain('initialSelectedId={focusVendorId}');
    expect(src).toContain('initialSelectedId={focusAgentId}');
    expect(src).toContain('initialSelectedId={focusSeriesId}');
  });
});
