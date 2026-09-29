import { describe, it, expect, vi } from 'vitest';
import { mapDbServiceRow, loadQueryServices, saveQueryServices } from '../lib/utils.js';

describe('mapDbServiceRow', () => {
  it('maps snake_case DB fields to the camelCase shape ServicesList uses', () => {
    const mapped = mapDbServiceRow({ id: 1, name: 'Hotel', status: 'confirmed', date: '2026-08-01', sort_order: 2 });
    expect(mapped).toEqual({ id: 1, name: 'Hotel', status: 'confirmed', date: '2026-08-01', notes: '', sortOrder: 2 });
  });

  it('reads a real note back from its own db column', () => {
    const mapped = mapDbServiceRow({ id: 1, name: 'Hotel', status: 'confirmed', date: '2026-08-01', sort_order: 2, notes: 'Confirmed by phone' });
    expect(mapped.notes).toBe('Confirmed by phone');
  });
});

describe('loadQueryServices', () => {
  it('loads services for a query, ordered by sort_order', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [
      { id: 1, name: 'A', status: 'requested', sort_order: 0 },
      { id: 2, name: 'B', status: 'requested', sort_order: 1 },
    ] }) }) }) }) };
    const services = await loadQueryServices(db, 'UTQ-1');
    expect(services.length).toBe(2);
    expect(services[0].name).toBe('A');
  });

  it('returns an empty array without throwing on failure', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => { throw new Error('fail'); } }) }) }) };
    expect(await loadQueryServices(db, 'UTQ-1')).toEqual([]);
  });
});

describe('saveQueryServices', () => {
  it('upserts every current service with its array-index position as sort_order (persisting drag-reorder)', async () => {
    const calls = [];
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          upsert: vi.fn(async (row) => { calls.push(row); return { data: [row] }; }),
          select: () => builder,
          eq: (col, val) => { filters[col] = val; return builder; },
          delete: async () => ({ data: null }),
          then: (resolve) => resolve({ data: [] }),
        };
        return builder;
      },
    };
    await saveQueryServices(db, 'UTQ-1', [
      { id: 2, name: 'Second (was first)', status: 'confirmed', date: '' },
      { id: 1, name: 'First (was second)', status: 'requested', date: '' },
    ]);
    expect(calls[0]).toMatchObject({ id: 2, sort_order: 0 });
    expect(calls[1]).toMatchObject({ id: 1, sort_order: 1 });
  });

  it('deletes only ids explicitly passed as deletedIds -- never inferred from a diff against the local array (root-cause fix for the UT-3495/UT-3497 vanishing-services bug)', async () => {
    const calls = { deletes: [] };
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          upsert: vi.fn(async (row) => ({ data: [row] })),
          select: () => builder,
          eq: (col, val) => { filters[col] = val; return builder; },
          delete: async () => { calls.deletes.push({ ...filters }); return { data: null }; },
          then: (resolve) => resolve({ data: [{ id: 1 }, { id: 2 }] }),
        };
        return builder;
      },
    };
    await saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'Kept', status: 'requested' }], [2]);
    expect(calls.deletes.some(d => d.id === 2)).toBe(true);
  });

  it('a service present in the DB but missing from a stale local array is NOT deleted when deletedIds is omitted -- this is the actual UT-3497 fix: a local snapshot that simply does not know about another tab\'s row must never cause that row to be deleted', async () => {
    const calls = { deletes: [], selectCalled: false };
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          upsert: vi.fn(async (row) => ({ data: [row] })),
          select: () => { calls.selectCalled = true; return builder; },
          eq: (col, val) => { filters[col] = val; return builder; },
          delete: async () => { calls.deletes.push({ ...filters }); return { data: null }; },
          then: (resolve) => resolve({ data: [{ id: 1 }, { id: 2 }] }), // id:2 exists in DB (e.g. added by another tab) but this tab's snapshot never saw it
        };
        return builder;
      },
    };
    // Stale/incomplete local snapshot -- only knows about id:1. No deletedIds passed.
    await saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'Kept', status: 'requested' }]);
    expect(calls.deletes.length).toBe(0);
    // saveQueryServices no longer even needs to query the existing rows to diff against.
    expect(calls.selectCalled).toBe(false);
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'X', status: 'requested' }])).resolves.toBeUndefined();
  });
});
