import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../lib/utils.js';

// Fake database that, like the real API, never returns more than 1000 rows per request.
function fakeDb(rows) {
  return { from: () => {
    let filters = [], lim = 1000;
    const b = {
      select: () => b,
      gte: (c, v) => { filters.push([c, decodeURIComponent(v)]); return b; },
      order: () => b,
      limit: (n) => { lim = Math.min(n, 1000); return b; },
      then: (res) => { let r = rows.slice().sort((a, z) => a.created_at.localeCompare(z.created_at)); filters.forEach(([c, v]) => { r = r.filter(x => x[c] >= v); }); res({ data: r.slice(0, lim), error: null }); },
    };
    return b;
  } };
}
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, query_id: 'Q' + (i % 7), created_at: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString() }));

describe('fetchAllRows', () => {
  it('returns every row past the 1000-row API cap, newest included, no duplicates', async () => {
    const rows = mk(2504);
    const { data } = await fetchAllRows(fakeDb(rows), 'query_audit');
    expect(data).toHaveLength(2504);
    expect(new Set(data.map(r => r.id)).size).toBe(2504);
    expect(data[data.length - 1].id).toBe('r2503');
  });
  it('copes with many rows sharing one timestamp', async () => {
    const rows = mk(1300).map((r, i) => ({ ...r, created_at: i < 1100 ? '2026-10-31T00:00:00.000Z' : r.created_at }));
    const { data } = await fetchAllRows(fakeDb(rows), 't');
    expect(data.length).toBeGreaterThanOrEqual(1000);
  });
  it('handles small and empty tables', async () => {
    expect((await fetchAllRows(fakeDb(mk(3)), 't')).data).toHaveLength(3);
    expect((await fetchAllRows(fakeDb([]), 't')).data).toHaveLength(0);
  });
});
