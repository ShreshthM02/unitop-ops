import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('Login screen: password visibility toggle', () => {
  it('starts masked, and the eye button reveals then re-hides the entered password', async () => {
    const mockDb = { auth: { login: vi.fn(async () => ({ user: null, error: 'x' })) } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: LoginScreen } = await import('../components/LoginScreen.jsx');
    render(<LoginScreen onSuccess={()=>{}} />);

    const input = screen.getByPlaceholderText('••••••••');
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'my-secret-pass' } });

    fireEvent.click(screen.getByTitle('Show password'));
    expect(input.type).toBe('text');
    expect(input.value).toBe('my-secret-pass'); // typed value survives the toggle

    fireEvent.click(screen.getByTitle('Hide password'));
    expect(input.type).toBe('password');
    expect(input.value).toBe('my-secret-pass');

    vi.doUnmock('../lib/supabase.js');
  });

  it('toggling visibility does not submit the form or trigger a login attempt', async () => {
    const loginSpy = vi.fn(async () => ({ user: null, error: 'x' }));
    const mockDb = { auth: { login: loginSpy } };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: LoginScreen } = await import('../components/LoginScreen.jsx');
    render(<LoginScreen onSuccess={()=>{}} />);
    fireEvent.click(screen.getByTitle('Show password'));
    expect(loginSpy).not.toHaveBeenCalled();
    vi.doUnmock('../lib/supabase.js');
  });
});
