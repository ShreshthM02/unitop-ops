import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockChannel = {
  on: vi.fn(function () { return this; }),
  subscribe: vi.fn(function () { return this; }),
};
const mockClient = {
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
};

vi.mock('../lib/supabase.js', () => ({
  realtimeClient: mockClient,
}));

const { useRealtimeTable } = await import('../lib/useRealtimeTable.js');

beforeEach(() => {
  mockChannel.on.mockClear();
  mockChannel.subscribe.mockClear();
  mockClient.channel.mockClear();
  mockClient.removeChannel.mockClear();
});

describe('useRealtimeTable', () => {
  it('subscribes to the given table on mount', () => {
    renderHook(() => useRealtimeTable('queries', () => {}));
    expect(mockClient.channel).toHaveBeenCalledWith('realtime:queries');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queries' },
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('unsubscribes (removeChannel) on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeTable('queries', () => {}));
    unmount();
    expect(mockClient.removeChannel).toHaveBeenCalled();
  });

  it('does not subscribe when enabled=false', () => {
    renderHook(() => useRealtimeTable('queries', () => {}, false));
    expect(mockClient.channel).not.toHaveBeenCalled();
  });

  it('calls onChange with (eventType, new, old) when a postgres_changes payload arrives', () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable('queries', onChange));
    const handler = mockChannel.on.mock.calls[0][2];
    handler({ eventType: 'UPDATE', new: { id: 'X', status: 'operations' }, old: { id: 'X' } });
    expect(onChange).toHaveBeenCalledWith('UPDATE', { id: 'X', status: 'operations' }, { id: 'X' });
  });

  it('always calls the latest onChange closure, not a stale one from first render', () => {
    let count = 0;
    const { rerender } = renderHook(
      ({ cb }) => useRealtimeTable('queries', cb),
      { initialProps: { cb: () => { count = 1; } } }
    );
    rerender({ cb: () => { count = 2; } });
    const handler = mockChannel.on.mock.calls[0][2];
    handler({ eventType: 'UPDATE', new: {}, old: {} });
    expect(count).toBe(2);
  });
});
