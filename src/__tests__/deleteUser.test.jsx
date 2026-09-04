import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Item 4: a real, permanent Delete User, distinct from the existing
// reversible Deactivate. Investigated first, not assumed safe: several
// FKs to staff are NO ACTION, so a true row DELETE would either fail
// outright for any staff member with real history, or -- if those FKs
// were loosened to allow it -- would silently destroy cost_sheets/
// quotations attribution entirely (neither has a redundant name field
// the way query_audit/query_remarks do). Also confirmed staff_login
// already requires active=true, so Deactivate already fully blocks
// login -- verified this whole flow end to end via direct database
// simulation (a real delete, then a real login attempt, confirmed
// rejected) before any client code was written; these tests cover the
// client-side wiring specifically.

const otherStaff = { id: 'staff-2', name: 'Peeyush', username: 'peyush', role: 'sales', color: '#000', active: true, permissions: {} };

function mockDb(overrides = {}) {
  return {
    auth: {
      getStaffList: vi.fn(async () => [otherStaff]),
      createStaff: vi.fn(),
      changePassword: vi.fn(),
      updatePermissions: vi.fn(async () => ({ success: true })),
      deleteStaffMember: vi.fn(async () => ({ success: true })),
      ...overrides,
    },
  };
}

describe('UserManagementPanel: Delete User', () => {
  it('shows a real confirmation before deleting, and does nothing if declined', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText(/🗑 Delete/));
    expect(confirmSpy).toHaveBeenCalled();
    expect(db.auth.deleteStaffMember).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('confirming actually calls deleteStaffMember with the real target id, and reloads the list on success', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText(/🗑 Delete/));
    await waitFor(() => expect(db.auth.deleteStaffMember).toHaveBeenCalledWith('staff-2'));
    await waitFor(() => expect(db.auth.getStaffList).toHaveBeenCalledTimes(2)); // initial load + reload after delete
    confirmSpy.mockRestore();
  });

  it('a failed delete shows the real error, not silence', async () => {
    const db = mockDb({ deleteStaffMember: vi.fn(async () => ({ success: false, error: 'Admin access required' })) });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText(/🗑 Delete/));
    await waitFor(() => expect(screen.getByText(/Error: Admin access required/)).toBeTruthy());
    confirmSpy.mockRestore();
  });

  it('cannot delete your own account -- the button is hidden, matching the existing self-protection pattern for Deactivate', async () => {
    const selfStaff = { id: 'staff-1', name: 'Shreshth', username: 'shreshth', role: 'admin', color: '#000', active: true, permissions: {} };
    const db = mockDb({ getStaffList: vi.fn(async () => [selfStaff]) });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getAllByText('Shreshth').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Shreshth')[0]);
    expect(screen.queryByText(/🗑 Delete/)).toBeFalsy();
  });
});
