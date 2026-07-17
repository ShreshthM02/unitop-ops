import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('UserProfilePanel: Save Profile now actually persists (was a client-side no-op)', () => {
  it('calls db.auth.updateOwnProfile with the entered name/color, and calls onSave with the real returned user on success', async () => {
    const mockDb = { auth: { updateOwnProfile: vi.fn(async (name, color) => ({ success: true, user: { id: 1, name, color, role: 'ops' } })) } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { default: UserProfilePanel } = await import('../components/UserProfilePanel.jsx');
    const onSave = vi.fn();
    render(<UserProfilePanel currentUser={{ id: 1, name: 'Old Name', color: '#1A5276', role: 'ops' }} onClose={()=>{}} onSave={onSave}/>);

    const nameInput = screen.getByDisplayValue('Old Name');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    fireEvent.click(screen.getByText('Save Profile'));

    await waitFor(() => expect(mockDb.auth.updateOwnProfile).toHaveBeenCalledWith('New Name', '#1A5276'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: 1, name: 'New Name', color: '#1A5276', role: 'ops' }));
    await waitFor(() => expect(screen.getByText('✓ Saved')).toBeTruthy());
  });

  it('shows an error and does NOT call onSave when the save fails (e.g. expired session)', async () => {
    const mockDb = { auth: { updateOwnProfile: vi.fn(async () => ({ success: false, error: 'Session expired, please log in again' })) } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { default: UserProfilePanel } = await import('../components/UserProfilePanel.jsx');
    const onSave = vi.fn();
    render(<UserProfilePanel currentUser={{ id: 1, name: 'Old Name', color: '#1A5276', role: 'ops' }} onClose={()=>{}} onSave={onSave}/>);
    fireEvent.click(screen.getByText('Save Profile'));
    await waitFor(() => expect(screen.getByText(/Session expired/)).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('UnitopApp: onSave is no longer a no-op, wired to actually update auth state', async () => {
  const fs = await import('fs');
  const path = await import('path');

  it('UnitopApp passes a real onUpdateAuthUser callback to UserProfilePanel, not (u)=>{}', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf-8');
    expect(src).toContain('onSave={onUpdateAuthUser}');
    expect(src).not.toContain('onSave={(u)=>{}}');
  });

  it('App.jsx wires onUpdateAuthUser to setCurrentUserData, so the change reflects immediately app-wide', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf-8');
    expect(src).toContain('onUpdateAuthUser={(user)=>setCurrentUserData(user)}');
  });
});
