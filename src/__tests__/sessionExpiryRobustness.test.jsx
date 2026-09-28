import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Item 4: "all users/team vanished" -- root-caused to staff_login()/
// validate_session() issuing a JWT good for only 12 hours, refreshed
// (before this fix) only once, on App's very first mount. A tab left
// open past that window kept sending an expired JWT forever; every
// request 401'd, and the rest of the app had no way to distinguish that
// from "there's genuinely nothing here". Two fixes, both covered here:
// (1) a periodic proactive re-validate while logged in, well inside the
// 12h window, and an immediate one when a backgrounded tab becomes
// visible again; (2) a hard safety net -- db.auth.onSessionExpired --
// that drops the app back to the login screen the moment ANY request
// comes back 401, instead of silently leaving stale/empty data on screen.

describe('App.jsx: periodic session re-validation while logged in', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('re-validates the session automatically well before the 12h token expiry, without user action', async () => {
    let validateCalls = 0;
    const mockDb = {
      auth: {
        validateSession: vi.fn(async () => { validateCalls++; return { id: 1, name: 'Priya' }; }),
        onSessionExpired: vi.fn(),
      },
    };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.doMock('../components/index.js', () => ({
      LoginScreen: () => null,
      UnitopApp: () => null,
      VendorLedgerPanel: () => null,
      AgentLedgerPanel: () => null,
    }));
    const { default: App } = await import('../App.jsx');
    render(<App />);

    await vi.waitFor(() => expect(validateCalls).toBe(1)); // the initial mount check

    await vi.advanceTimersByTimeAsync(31 * 60 * 1000); // past the 30-min re-validate interval
    await vi.waitFor(() => expect(validateCalls).toBeGreaterThanOrEqual(2));

    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../components/index.js');
  });

  it('drops back to the login screen if a periodic re-validate finds the session is no longer valid', async () => {
    let calls = 0;
    const mockDb = {
      auth: {
        // Valid on mount, then expired on the next periodic check --
        // simulating a JWT that finally aged out.
        validateSession: vi.fn(async () => { calls++; return calls === 1 ? { id: 1, name: 'Priya' } : null; }),
        onSessionExpired: vi.fn(),
        login: vi.fn(async () => ({ user: null, error: 'x' })),
      },
    };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.doMock('../components/index.js', () => ({
      LoginScreen: () => <div>LOGIN_SCREEN</div>,
      UnitopApp: () => <div>MAIN_APP</div>,
      VendorLedgerPanel: () => null,
      AgentLedgerPanel: () => null,
    }));
    const { default: App } = await import('../App.jsx');
    render(<App />);
    await vi.waitFor(() => expect(calls).toBe(1));

    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
    await vi.waitFor(() => expect(screen.queryByText('LOGIN_SCREEN')).toBeTruthy());

    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../components/index.js');
  });
});

describe('App.jsx: hard safety net on an unexpected 401', () => {
  beforeEach(() => { vi.resetModules(); });

  it('registers db.auth.onSessionExpired and forces the login screen when it fires', async () => {
    let expiredCallback = null;
    const mockDb = {
      auth: {
        validateSession: vi.fn(async () => ({ id: 1, name: 'Priya' })),
        onSessionExpired: vi.fn((cb) => { expiredCallback = cb; }),
        login: vi.fn(async () => ({ user: null, error: 'x' })),
      },
    };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.doMock('../components/index.js', () => ({
      LoginScreen: () => <div>LOGIN_SCREEN</div>,
      UnitopApp: () => <div>MAIN_APP</div>,
      VendorLedgerPanel: () => null,
      AgentLedgerPanel: () => null,
    }));
    const { default: App } = await import('../App.jsx');
    render(<App />);
    await waitFor(() => expect(screen.getByText('MAIN_APP')).toBeTruthy());
    expect(expiredCallback).toBeInstanceOf(Function);

    expiredCallback();
    await waitFor(() => expect(screen.getByText('LOGIN_SCREEN')).toBeTruthy());

    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../components/index.js');
  });
});
