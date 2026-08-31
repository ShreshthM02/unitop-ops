import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 2026-08-22: every document/master-data drawer panel had a fixed pixel
// width (520-960px, no responsive fallback), so on a phone-width viewport
// the panel overflowed the screen entirely -- controls positioned toward
// either edge of the panel (export/print buttons among them) rendered
// off-screen with no way to reach them. Fixed by making each panel's
// width `min(<original>px, 100vw)`, which is a no-op on desktop and
// shrinks to fit on narrow viewports.
//
// Source-level check rather than a full render: these 18 components each
// need substantial, differently-shaped prop/data scaffolding to mount
// without crashing on unrelated missing props, which is disproportionate
// setup for verifying a single CSS value didn't regress back to a bare
// pixel width.

const FIXED_COMPONENTS = [
  'UserManagementPanel', 'Itinerary', 'ExchangeOrderGenerator',
  'InAppChat', 'TourBriefingSheet', 'VendorMaster', 'QuotationGenerator',
  'AgentLedgerPanel', 'InvoiceGenerator', 'CostSheet',
  'EnhancedPaymentTracker', 'AgentMaster',
  'VendorLedgerPanel', 'DocumentRegistry',
];

describe('Mobile: document panels no longer use a bare fixed width', () => {
  FIXED_COMPONENTS.forEach(name => {
    it(`${name}'s panel width is responsive (min(...px, 100vw)), not a bare pixel value`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../components/${name}.jsx`), 'utf8');
      const match = src.match(/background:\s*G\.white,\s*width:\s*("?)min\(\d+px,\s*100vw\)\1,\s*height:\s*["']100vh["']/);
      expect(match, `${name}.jsx: expected the panel's width to be min(<n>px, 100vw)`).toBeTruthy();
    });
  });

  it("QueryDrawerWithQuote's .drawer width is responsive", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/QueryDrawerWithQuote.jsx'), 'utf8');
    const match = src.match(/className="drawer" style=\{\{width:"min\(\d+px, 100vw\)"\}\}/);
    expect(match).toBeTruthy();
  });
});
