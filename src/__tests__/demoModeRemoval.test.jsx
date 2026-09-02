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
