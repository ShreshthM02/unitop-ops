import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Chat, User Management, Series, Agents, and Vendors used to open as a
// split-pane overlay from the sidebar, unlike every other nav item,
// which opens a real full tab. The components themselves already
// fully supported an asTab mode (no backdrop, full width/height, no
// close button) -- it was simply never wired up from the sidebar
// click handler, which special-cased these 5 items to set an overlay
// boolean instead of the normal setView(item.id). Fixed by removing
// the special cases (falling through to the same setView every other
// item already uses) and rendering each with asTab in the main view-
// switching block. The overlay-based rendering these components also
// support is intentionally left in place for its OTHER real use -- a
// mention click elsewhere in the app opening a quick, contextual look
// without navigating away from what the user was doing.

const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');

describe('Sidebar: Chat/UserMgmt/Series/Agents/Vendors open as real full tabs, not split-pane overlays', () => {
  it('the nav click handler no longer special-cases any of these 5 items into an overlay', () => {
    expect(src).not.toMatch(/if\(item\.id===["']chat["']\)\{setShowChat/);
    expect(src).not.toMatch(/if\(item\.id===["']usermgmt["']\)\{setShowUserMgmt/);
    expect(src).not.toMatch(/if\(item\.id===["']series["']\)\{setShowSeries/);
    expect(src).not.toMatch(/if\(item\.id===["']agents["']\)\{setShowAgents/);
    expect(src).not.toMatch(/if\(item\.id===["']vendors["']\)\{setShowVendors/);
  });

  it('each of the 5 now renders as a real tab (view===id, with asTab) in the main content area', () => {
    expect(src).toMatch(/view===["']chat["']\s*&&\s*<InAppChat asTab/);
    expect(src).toMatch(/view===["']usermgmt["']\s*&&\s*<UserManagementPanel asTab/);
    expect(src).toMatch(/view===["']series["']\s*&&\s*<SeriesManagement asTab/);
    expect(src).toMatch(/view===["']agents["']\s*&&\s*<AgentMaster asTab/);
    expect(src).toMatch(/view===["']vendors["']\s*&&\s*<VendorMaster asTab/);
  });

  it('the overlay-based rendering (for the OTHER real use -- a mention click opening a quick, contextual look) is still present, untouched', () => {
    expect(src).toMatch(/showChat\s*&&\s*<InAppChat/);
    expect(src).toMatch(/showAgents\s*&&\s*<AgentMaster/);
    expect(src).toMatch(/showSeries\s*&&\s*<SeriesManagement/);
    expect(src).toMatch(/showVendors\s*&&\s*<VendorMaster/);
  });
});

describe('VendorMaster: asTab support added, matching the other 4 components', () => {
  const vendorSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/VendorMaster.jsx'), 'utf8');
  it('accepts asTab, and hides the overlay backdrop/close button when true', () => {
    expect(vendorSrc).toMatch(/asTab\s*=\s*false/);
    expect(vendorSrc).toMatch(/className=\{asTab \? undefined : ["']overlay["']\}/);
    expect(vendorSrc).toMatch(/\{!asTab && <button onClick=\{onClose\}/);
  });
});
