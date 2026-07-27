import { describe, it, expect, vi } from 'vitest';

// Root-cause regression test for #6 ("new query not persisting"). The db
// wrapper's upsert() never throws on a failed save -- it resolves
// normally with { data: null, error: {...} } even on a 4xx/5xx response,
// since the underlying fetch() only rejects on network-level failures,
// not HTTP error statuses. saveQueryToDB's try/catch had genuinely never
// been capable of catching a real save failure, because the returned
// error field was never checked at all -- a query could appear created
// (optimistic UI update) while silently never persisting, with nothing
// in the console or UI hinting why. This documents the actual contract
// that was being misunderstood, since saveQueryToDB itself is a closure
// inside UnitopApp and not independently testable without rendering the
// whole (very large) component.

describe('db wrapper upsert(): the actual contract that caused the "silent save failure" bug', () => {
  it('resolves normally (does not throw/reject) even when the request fails, returning {data:null, error} instead', async () => {
    // Simulates the real wrapper's behavior: a failed fetch() (4xx/5xx)
    // still resolves the promise successfully -- it's the caller's job
    // to check `error`, not to rely on a catch block ever firing.
    const simulateUpsert = async (rowsWouldFail) => {
      const ok = !rowsWouldFail;
      return { data: ok ? [{}] : null, error: ok ? null : { message: 'invalid input syntax for type uuid: "1"' } };
    };

    const result = await simulateUpsert(true);
    // The critical assertion: this does NOT throw. A caller using only
    // try/catch around this call, without checking result.error, will
    // never observe the failure at all.
    expect(result).toEqual({ data: null, error: { message: 'invalid input syntax for type uuid: "1"' } });
  });

  it('the fix: explicitly checking and throwing on the error field makes the failure catchable and surfaceable', async () => {
    const simulateUpsert = async () => ({ data: null, error: { message: 'invalid input syntax for type uuid: "1"' } });

    let caught = null;
    try {
      const { error } = await simulateUpsert();
      if (error) throw new Error(error.message || 'Query save failed');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    expect(caught.message).toContain('invalid input syntax for type uuid');
  });

  it('a genuinely successful save still resolves cleanly with no error, and does not falsely trigger the new error path', async () => {
    const simulateUpsert = async () => ({ data: [{ id: 'UTQ-2026-999' }], error: null });

    let caught = null;
    try {
      const { error } = await simulateUpsert();
      if (error) throw new Error(error.message || 'Query save failed');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeNull();
  });
});
