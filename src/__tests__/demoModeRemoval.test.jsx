import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Demo Mode removed entirely (2026-09) rather than fixed: it turned out
// to fetch and display real production data over the plain anon key
// with no login at all, and -- more seriously -- write actions
// (creating/editing a query) would have written fake demo data straight
// into the real database too. Removed as simpler and safer than making
// it genuinely isolated, since it wasn't an actively used feature.

describe('LoginScreen: no Demo Mode option remains', () => {
  it('does not render a "Continue in Demo Mode" button or accept an onDemoMode prop', async () => {
    const mockDb = { auth: { login: vi.fn(async () => ({ user: null, error: 'x' })) } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: LoginScreen } = await import('../components/LoginScreen.jsx');
    render(<LoginScreen onSuccess={()=>{}} />);
    expect(screen.queryByText(/Demo Mode/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('App.jsx: login is the only path in, no demo bypass', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows the login screen when there is no valid session, with no demo option', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      db: { auth: { validateSession: vi.fn(async () => null), login: vi.fn(async () => ({ user: null, error: 'x' })) } },
      realtimeClient: null,
    }));
    const { default: App } = await import('../App.jsx');
    render(<App />);
    await waitFor(() => expect(screen.getByPlaceholderText(/username/i)).toBeTruthy());
    expect(screen.queryByText(/Demo Mode/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('UnitopApp: never fetches real data without a real logged-in user (the guard that made Demo Mode’s removal safe)', () => {
  beforeEach(() => { vi.resetModules(); });

  it('skips the Supabase data-load entirely when authUser is absent', async () => {
    let fetchCalled = false;
    const mockDb = { from: () => { fetchCalled = true; return { select: () => ({ order: async () => ({ data: [], error: null }) }) }; },
      auth: { getSession: async () => null } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={null} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await new Promise(r => setTimeout(r, 100));
    expect(fetchCalled).toBe(false);
    vi.doUnmock('../lib/supabase.js');
  });

  it('does load real data once a real authUser is present', async () => {
    let fetchCalled = false;
    const mockDb = { from: () => { fetchCalled = true; return { select: () => ({ order: async () => ({ data: [], error: null }) }) }; },
      auth: { getSession: async () => null } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{id:'staff-1',name:'Priya',role:'admin'}} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await waitFor(() => expect(fetchCalled).toBe(true));
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Master Data sidebar items open the full dashboard directly, no intermediate mini-list', () => {
  it('clicking "Agents / Clients" opens AgentMaster directly', async () => {
    const mockDb = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }), auth: { getSession: async () => null } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{id:'staff-1',name:'Priya',role:'admin'}} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Agents / Clients')).toBeTruthy());
    fireEvent.click(screen.getByText('Agents / Clients'));
    // AgentMaster's own panel header appears immediately -- no
    // "Open Full Agent Dashboard" intermediate button/click needed.
    expect(screen.queryByText('Open Full Agent Dashboard')).toBeFalsy();
    expect(screen.getByText('+ New Agent')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('clicking "Vendors" opens VendorMaster directly', async () => {
    const mockDb = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }), auth: { getSession: async () => null } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{id:'staff-1',name:'Priya',role:'admin'}} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Vendors')).toBeTruthy());
    fireEvent.click(screen.getByText('Vendors'));
    expect(screen.queryByText('Open Full Vendor Dashboard')).toBeFalsy();
    expect(screen.getByText('+ New Vendor')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('A genuinely empty database shows a real empty state, never the hardcoded demo data', () => {
  // Real, serious bug found and fixed: queries/agents/vendors/staff/
  // payments state used to start as hardcoded demo constants
  // (INITIAL_QUERIES etc, including a sample query literally named
  // "Anderson Family"), on the assumption the real fetch below would
  // always replace them -- but a genuinely empty real table (a fresh
  // install, or right after a clean-slate wipe) correctly returned an
  // empty array, and a separate bug (requiring `.length > 0` before
  // trusting the fetch) then left that empty result silently discarded,
  // keeping the fake demo data displayed as if it were real. Fixed in
  // two places: the length>0 guards removed (a real, empty result is
  // always trusted), AND the hardcoded initial state itself removed
  // (starts genuinely empty, not demo data waiting to be overwritten).
  it('never shows "Anderson Family" or any other hardcoded demo query when Supabase genuinely returns none', async () => {
    const mockDb = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }), is: () => ({ order: async () => ({ data: [], error: null }) }) }) }), auth: { getSession: async () => null } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{id:'staff-1',name:'Priya',role:'admin'}} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeFalsy());
    expect(screen.queryByText(/Anderson Family/)).toBeFalsy();
    expect(screen.queryByText(/Chen Group/)).toBeFalsy();
    expect(screen.queryByText(/Smith Group/)).toBeFalsy();
    expect(screen.queryByText(/Tanaka Group/)).toBeFalsy();
    expect(screen.queryByText(/Mueller Tour/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});
