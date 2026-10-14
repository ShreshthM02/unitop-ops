import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripWorkflowFields, changedFields } from '../lib/utils.js';
import { fetchReadWithRetry } from '../lib/supabase.js';

describe('stripWorkflowFields', () => {
  it('removes status, tourFileId and other workflow-owned fields but keeps ordinary edits', () => {
    const out = stripWorkflowFields({ status: 'costing', tourFileId: '', groupName: 'X', audit: [], cancelled: false });
    expect(out).toEqual({ groupName: 'X' });
  });
  it('tolerates undefined', () => { expect(stripWorkflowFields(undefined)).toEqual({}); });
});

describe('changedFields', () => {
  it('returns only fields that differ from the snapshot taken when editing began', () => {
    const base = { status: 'costing', groupName: 'A', pax: 4 };
    expect(changedFields(base, { ...base, groupName: 'B' })).toEqual({ groupName: 'B' });
    expect(changedFields(base, { ...base })).toEqual({});
  });
  it('a stale edit form cannot revert a status/tourFileId changed after it opened', () => {
    const base = { status: 'costing', tourFileId: '', groupName: 'A' };
    const form = { ...base, groupName: 'A2' };
    const live = { status: 'operations', tourFileId: 'UT-3500', groupName: 'A' };
    const merged = { ...live, ...stripWorkflowFields(changedFields(base, form)) };
    expect(merged).toEqual({ status: 'operations', tourFileId: 'UT-3500', groupName: 'A2' });
  });
});

describe('fetchReadWithRetry', () => {
  afterEach(() => vi.restoreAllMocks());
  it('retries a transient 503 then succeeds', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ status: 503, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });
    const r = await fetchReadWithRetry('x', {}, { backoffMs: 1 });
    expect(r.status).toBe(200); expect(f).toHaveBeenCalledTimes(2);
  });
  it('does not retry a 401', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 401, ok: false });
    const r = await fetchReadWithRetry('x', {}, { backoffMs: 1 });
    expect(r.status).toBe(401); expect(f).toHaveBeenCalledTimes(1);
  });
  it('gives up with a clear error when requests hang past the timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((u, o) => new Promise((_, rej) => { o.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); }); }));
    await expect(fetchReadWithRetry('x', {}, { timeoutMs: 10, retries: 1, backoffMs: 1 })).rejects.toThrow('Request timed out');
  });
});
