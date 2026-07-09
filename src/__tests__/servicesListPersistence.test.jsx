import { describe, it, expect, vi } from 'vitest';
import { mapDbServiceRow, loadQueryServices, saveQueryServices } from '../lib/utils.js';

describe('mapDbServiceRow', () => {
  it('maps snake_case DB fields to the camelCase shape ServicesList uses', () => {
    const mapped = mapDbServiceRow({ id: 1, name: 'Hotel', status: 'confirmed', date: '2026-08-01', sort_order: 2 });
    expect(mapped).toEqual({ id: 1, name: 'Hotel', status: 'confirmed', date: '2026-08-01', sortOrder: 2 });
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

  it('deletes a service that existed in DB but is no longer in the local array', async () => {
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
    await saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'Kept', status: 'requested' }]);
    expect(calls.deletes.some(d => d.id === 2)).toBe(true);
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'X', status: 'requested' }])).resolves.toBeUndefined();
  });
});
