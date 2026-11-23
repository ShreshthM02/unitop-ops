import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { mergeRemarkRows } from '../lib/utils.js';

// Notifications must arrive without a page refresh. Realtime delivers live
// events; these cover the catch-up paths for everything it cannot: a socket
// that dropped (sleep, background tab, network blip) and the periodic check.

describe('mergeRemarkRows (catch-up of discussion messages)', () => {
  const row = (id, q, by, over = {}) => ({ id, query_id: q, by_staff_id: by, by_name: 'X', created_at: '2026-11-23T08:00:00Z', text: 'hi', mentions: [], ...over });
  it('adds messages from others to the right query', () => {
    const qs = [{ id: 'Q1', remarks: [] }, { id: 'Q2', remarks: [] }];
    const out = mergeRemarkRows(qs, [row(1, 'Q2', 'a')], 'me');
    expect(out[1].remarks).toHaveLength(1);
    expect(out[1].remarks[0]).toMatchObject({ id: 1, byStaffId: 'a', text: 'hi' });
    expect(out[0].remarks).toHaveLength(0);
  });
  it('never doubles a message that is already there (live event + catch-up both arrive)', () => {
    const qs = [{ id: 'Q1', remarks: [{ id: 1, text: 'hi' }] }];
    const out = mergeRemarkRows(qs, [row(1, 'Q1', 'a'), row(2, 'Q1', 'a')], 'me');
    expect(out[0].remarks.map(r => r.id)).toEqual([1, 2]);
  });
  it("skips the person's own messages (already shown when sent)", () => {
    const qs = [{ id: 'Q1', remarks: [] }];
    expect(mergeRemarkRows(qs, [row(1, 'Q1', 'me')], 'me')).toBe(qs);
  });
  it('returns the same array when nothing changed, so React does not re-render', () => {
    const qs = [{ id: 'Q1', remarks: [{ id: 1 }] }];
    expect(mergeRemarkRows(qs, [row(1, 'Q1', 'a')], 'me')).toBe(qs);
    expect(mergeRemarkRows(qs, [], 'me')).toBe(qs);
  });
  it('ignores messages for queries it does not hold', () => {
    const qs = [{ id: 'Q1', remarks: [] }];
    expect(mergeRemarkRows(qs, [row(1, 'GONE', 'a')], 'me')).toBe(qs);
  });
});

describe('useRealtimeTable: catches up after a drop, a return to the tab, or the network coming back', () => {
  let statusCb, onResync, channelObj;
  beforeEach(() => {
    vi.resetModules();
    statusCb = null; onResync = vi.fn();
    channelObj = { on: vi.fn(() => channelObj), subscribe: vi.fn((cb) => { statusCb = cb; return channelObj; }) };
    vi.doMock('../lib/supabase.js', () => ({ realtimeClient: { channel: vi.fn(() => channelObj), removeChannel: vi.fn() } }));
  });
  async function mount() {
    const { useRealtimeTable } = await import('../lib/useRealtimeTable.js');
    const C = () => { useRealtimeTable('chat_messages', () => {}, true, onResync); return null; };
    return render(<C />);
  }
  it('does not resync on the first connect, but does after a drop and reconnect', async () => {
    await mount();
    statusCb('SUBSCRIBED');
    expect(onResync).not.toHaveBeenCalled();
    statusCb('CHANNEL_ERROR');
    statusCb('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(1);
    statusCb('TIMED_OUT'); statusCb('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(2);
  });
  it('resyncs when the window regains focus or the network returns', async () => {
    await mount();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    expect(onResync).toHaveBeenCalledTimes(2);
  });
  it('stops listening after unmount', async () => {
    const r = await mount();
    r.unmount(); cleanup();
    window.dispatchEvent(new Event('focus'));
    expect(onResync).not.toHaveBeenCalled();
  });
});

describe('wiring', () => {
  it('the app re-checks every 45s while visible, and the realtime client no longer auto-refreshes a token it cannot refresh', async () => {
    const fs = await import('fs');
    const app = fs.readFileSync('src/components/UnitopApp.jsx', 'utf8');
    expect(app).toContain('}, 45000)');
    expect(app).toContain('}, true, syncRemarks)');
    const sb = fs.readFileSync('src/lib/supabase.js', 'utf8');
    expect(sb).toContain('autoRefreshToken: false');
    expect(sb.match(/realtime\.setAuth\(data\.jwt\)/g).length).toBeGreaterThanOrEqual(2);
  });
});
