import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Real, definitive bug found from an actual browser console error:
// "Error: cannot add `postgres_changes` callbacks for realtime:
// chat_messages after `subscribe()`." Root cause: useRealtimeTable
// named every channel just `realtime:${table}` -- when two different
// components subscribed to the SAME table at once (UnitopApp's
// always-mounted global chat badge, and InAppChat's own subscription
// while the panel is open), Supabase's channel(name) returned the
// SAME underlying channel for the repeated name, and calling .on() to
// add a second callback on an already-.subscribe()'d channel throws
// outright -- crashing whichever component mounted second (InAppChat,
// since UnitopApp is always mounted first), which is exactly why the
// chat panel went blank.

describe('useRealtimeTable: unique channel names per subscriber', () => {
  it('two simultaneous hook instances for the SAME table get genuinely different channel names', async () => {
    const channelNames = [];
    const fakeChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
    const fakeRealtimeClient = {
      channel: vi.fn((name) => { channelNames.push(name); return fakeChannel; }),
      removeChannel: vi.fn(),
    };
    vi.doMock('../lib/supabase.js', () => ({ realtimeClient: fakeRealtimeClient, db: {} }));
    vi.resetModules();
    const { useRealtimeTable } = await import('../lib/useRealtimeTable.js');

    // Simulates UnitopApp's always-mounted subscription and InAppChat's
    // own subscription to the same table existing at the same time --
    // two separate hook calls, both for "chat_messages".
    renderHook(() => useRealtimeTable('chat_messages', () => {}));
    renderHook(() => useRealtimeTable('chat_messages', () => {}));

    expect(channelNames).toHaveLength(2);
    expect(channelNames[0]).not.toBe(channelNames[1]); // the actual bug: these used to be identical
    expect(fakeChannel.on).toHaveBeenCalledTimes(2); // both subscriptions genuinely registered, neither rejected
    vi.doUnmock('../lib/supabase.js');
  });

  it('does not crash when realtimeClient is unavailable (matches this test environment, env vars unset)', async () => {
    vi.doMock('../lib/supabase.js', () => ({ realtimeClient: null, db: {} }));
    vi.resetModules();
    const { useRealtimeTable } = await import('../lib/useRealtimeTable.js');
    expect(() => renderHook(() => useRealtimeTable('chat_messages', () => {}))).not.toThrow();
    vi.doUnmock('../lib/supabase.js');
  });
});
