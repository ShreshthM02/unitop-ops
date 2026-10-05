import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 2026-10-05: a round of mobile fixes driven by real phone screenshots
// (Dashboard, Templates, Reports, Team, Series, All Queries). Source-level
// checks rather than full renders, matching the existing convention in
// mobileResponsivePanelWidth.test.jsx -- these components need substantial
// scaffolding to mount, which is disproportionate for verifying a handful
// of CSS/JSX values didn't regress.

describe('Mobile round 2: list+detail screens now collapse to a single pane on phones', () => {
  // Same house convention already used by VendorMaster/AgentMaster/
  // UserManagementPanel: a fixed-width list pane beside a flex:1 detail
  // pane squeezes both into a sliver on a real phone width, so each of
  // these three screens was retrofitted with the existing
  // useIsNarrowViewport/showDetailMobile hook pattern instead of a new,
  // one-off mechanism.
  ['TemplatesHub', 'ReportsView', 'SeriesManagement'].forEach(name => {
    it(`${name}.jsx uses the shared useIsNarrowViewport/showDetailMobile pattern`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../components/${name}.jsx`), 'utf8');
      expect(src, `${name}.jsx should import useIsNarrowViewport`).toMatch(/useIsNarrowViewport/);
      expect(src, `${name}.jsx should track showDetailMobile state`).toMatch(/showDetailMobile/);
      expect(src, `${name}.jsx should offer a "Back to list" affordance on narrow viewports`).toMatch(/Back to list/);
    });
  });
});

describe('Mobile round 2: Team view collapses to a single column on phones', () => {
  it('TeamView.jsx grid collapses to 1 column under the mobile breakpoint', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/TeamView.jsx'), 'utf8');
    expect(src).toMatch(/className="team-grid"/);
    const css = fs.readFileSync(path.resolve(__dirname, '../lib/constants.js'), 'utf8');
    expect(css).toMatch(/\.team-grid\{grid-template-columns:1fr!important;\}/);
  });
});

describe('Mobile round 2: All Queries table scrolls horizontally instead of overlapping', () => {
  it('AllQueriesView.jsx wraps its table in an overflow-x:auto container with a minWidth', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/AllQueriesView.jsx'), 'utf8');
    expect(src).toMatch(/overflowX:"auto"/);
    expect(src).toMatch(/minWidth:\s*760/);
  });

  it('AllQueriesView.jsx header cells clip overflowing text instead of visually overlapping the next column', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/AllQueriesView.jsx'), 'utf8');
    const thMatch = src.match(/const th\s*=\s*\{[^}]*\}/);
    expect(thMatch, 'expected a `th` style constant').toBeTruthy();
    expect(thMatch[0]).toMatch(/overflow:"hidden"/);
    expect(thMatch[0]).toMatch(/textOverflow:"ellipsis"/);
  });
});

describe('Mobile round 2: form inputs no longer trigger the browser auto-zoom-on-focus bug', () => {
  it('constants.js forces 16px form-control font-size on mobile widths', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../lib/constants.js'), 'utf8');
    // The classic iOS/Android bug: focusing an input with a computed
    // font-size under ~16px makes the browser auto-zoom the whole page,
    // and since this is a single-page app with no full reload between
    // screens, that zoom level then sticks across every screen visited
    // afterwards. 16px is the safe threshold, scoped to mobile only.
    expect(css).toMatch(/select,textarea\{font-size:16px!important;\}/);
  });
});
