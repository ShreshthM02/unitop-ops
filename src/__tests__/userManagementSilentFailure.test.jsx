import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// A real, reported bug: clicking to change a user's active status, role,
// or permissions was "totally silent, not responding at all" on
// failure -- handleToggleActive/handlePermChange/handleRoleChange only
// ever reacted to res.success, doing nothing visible at all if the RPC
// came back with success:false (an admin-check failure, a stale
// session, or anything else) -- unlike handleCreate/handleResetPassword,
// which already correctly showed an error. Also fixed a real, actively
// misleading toast bug found along the way: the toast was hardcoded to
// a green background and a checkmark regardless of whether the message
// was success or failure -- an error would have looked like a success.

const otherStaff = { id: 'staff-2', name: 'Peeyush', username: 'peyush', role: 'sales', color: '#000', active: true, permissions: {} };

function mockDb(overrides = {}) {
  return {
    auth: {
      getStaffList: vi.fn(async () => [otherStaff]),
      createStaff: vi.fn(),
      changePassword: vi.fn(),
      updatePermissions: vi.fn(async () => ({ success: false, error: 'Admin access required' })),
      ...overrides,
    },
  };
}

describe('UserManagementPanel: failures are now visible, not silent', () => {
  beforeEach(() => { vi.resetModules(); });

  it('deactivating a user shows the real error when it fails, instead of doing nothing', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText(/Deactivate/));
    await waitFor(() => expect(screen.getByText(/Error: Admin access required/)).toBeTruthy());
  });

  it('a failed permission change shows the real error, instead of doing nothing', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click((await screen.findAllByText('✓ Yes'))[0]);
    await waitFor(() => expect(screen.getByText(/Error: Admin access required/)).toBeTruthy());
  });

  it('a failed role change shows the real error, instead of doing nothing', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText('Ops'));
    await waitFor(() => expect(screen.getByText(/Error: Admin access required/)).toBeTruthy());
  });

  it('the error toast is styled as an error (red, warning icon), not disguised as a success', async () => {
    const db = mockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText(/Deactivate/));
    await waitFor(() => {
      const toastEl = screen.getByText(/Error: Admin access required/);
      expect(toastEl.textContent.startsWith('⚠')).toBe(true);
      expect(toastEl.style.background).toBe('rgb(185, 28, 28)'); // red, not the success green
    });
  });

  it('a genuinely successful change still shows the correct green success toast, unchanged', async () => {
    const db = mockDb({ updatePermissions: vi.fn(async () => ({ success: true })) });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { UserManagementPanel } = await import('../components/UserManagementPanel.jsx');
    render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Peeyush')).toBeTruthy());
    fireEvent.click(screen.getByText('Peeyush'));
    fireEvent.click(await screen.findByText('Ops'));
    await waitFor(() => {
      const toastEl = screen.getByText(/Role updated/);
      expect(toastEl.textContent.startsWith('✓')).toBe(true);
      expect(toastEl.style.background).toBe('rgb(5, 150, 105)'); // the original success green
    });
  });
});
