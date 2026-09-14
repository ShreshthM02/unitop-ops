import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, serious bug found from a direct incident report: a duplicate
// agent record appeared right after editing an existing one, and a
// vendor briefly showed as a duplicate before vanishing entirely on
// refresh (missing from a backup export too). Root-caused to two
// independent, uncoordinated editors being able to exist for the
// same agent/vendor at once: clicking a global search result used to
// unconditionally open a second, separate overlay -- its own
// completely separate form/selected/editing state -- even while that
// same entity's Master-data tab was already the active view. This
// tests the real fix: activating an agent/vendor while its own tab is
// already open must never open a second editor.

describe('Activating an agent/vendor while its own Master tab is already open never opens a second, competing editor', () => {
  beforeEach(() => { vi.resetModules(); });

  it('dispatching unitop-activate-agent while already on the Agents tab does not open a second Agent overlay', async () => {
    const mockAgent = { id: 'agent-1', company: 'Global Tours', country: 'USA', active: true };
    const mockDb = {
      from: (table) => ({
        select: () => ({
          order: async () => ({ data: table === 'agents' ? [mockAgent] : [], error: null }),
          is: () => ({ order: async () => ({ data: table === 'agents' ? [mockAgent] : [], error: null }) }),
        }),
      }),
      auth: { getSession: async () => null },
    };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{ id: 'staff-1', name: 'Priya', role: 'admin' }} onUpdateAuthUser={() => {}} onOpenVendorLedger={() => {}} onOpenAgentLedger={() => {}} />);

    // Wait for the app to finish its initial load before navigating.
    await waitFor(() => expect(screen.getByText('Agents / Clients')).toBeTruthy());
    // Navigate to the Agents tab first.
    fireEvent.click(screen.getByText('Agents / Clients'));
    await waitFor(() => expect(screen.getByText('Agent & Client Repository')).toBeTruthy());
    expect(screen.getAllByText('Agent & Client Repository')).toHaveLength(1);

    // Now simulate a global search result activating the SAME agent
    // while already here -- this used to unconditionally spawn a
    // second, independent overlay on top of the tab.
    document.dispatchEvent(new CustomEvent('unitop-activate-agent', { detail: { id: 'agent-1' } }));
    await new Promise(r => setTimeout(r, 50));

    // Still only ONE Agent Repository header -- no second, competing
    // editor was ever mounted.
    expect(screen.getAllByText('Agent & Client Repository')).toHaveLength(1);
    vi.doUnmock('../lib/supabase.js');
  });

  it('dispatching unitop-activate-agent while on a DIFFERENT tab (e.g. Dashboard) still opens the overlay as before', async () => {
    const mockAgent = { id: 'agent-1', company: 'Global Tours', country: 'USA', active: true };
    const mockDb = {
      from: (table) => ({
        select: () => ({
          order: async () => ({ data: table === 'agents' ? [mockAgent] : [], error: null }),
          is: () => ({ order: async () => ({ data: table === 'agents' ? [mockAgent] : [], error: null }) }),
        }),
      }),
      auth: { getSession: async () => null },
    };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{ id: 'staff-1', name: 'Priya', role: 'admin' }} onUpdateAuthUser={() => {}} onOpenVendorLedger={() => {}} onOpenAgentLedger={() => {}} />);

    // Stay on Dashboard (default view) -- never navigate to the Agents tab.
    document.dispatchEvent(new CustomEvent('unitop-activate-agent', { detail: { id: 'agent-1' } }));
    await waitFor(() => expect(screen.getAllByText('Agent & Client Repository').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Agent & Client Repository')).toHaveLength(1);
    vi.doUnmock('../lib/supabase.js');
  });
});
