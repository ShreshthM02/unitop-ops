import { describe, it, expect, vi } from 'vitest';
import { loadAppSetting, saveAppSetting, mapDbDocRegistryRow, loadDocRegistry, saveDocRegistry } from '../lib/utils.js';

describe('loadAppSetting / saveAppSetting (generic shared settings pattern)', () => {
  it('loads the stored value merged over the fallback defaults', async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ value: { prefix: 'CUSTOM' } }] }) }) }) };
    const result = await loadAppSetting(db, 'doc_numbering', { prefix: 'DEFAULT', serial: 1 });
    expect(result.prefix).toBe('CUSTOM');
    expect(result.serial).toBe(1); // preserved from fallback, not overwritten
  });

  it('falls back to defaults when nothing is stored yet', async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) };
    const result = await loadAppSetting(db, 'doc_numbering', { prefix: 'DEFAULT' });
    expect(result.prefix).toBe('DEFAULT');
  });

  it('falls back to defaults when the db call fails, without throwing', async () => {
    const db = { from: () => ({ select: () => ({ eq: async () => { throw new Error('fail'); } }) }) };
    const result = await loadAppSetting(db, 'x', { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it('saveAppSetting upserts the key/value pair', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveAppSetting(db, 'typography', { titleFont: 'Georgia' });
    expect(upsert).toHaveBeenCalledWith({ key: 'typography', value: { titleFont: 'Georgia' } });
  });

  it('saveAppSetting does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveAppSetting(db, 'x', {})).resolves.toBeUndefined();
  });
});

describe('mapDbDocRegistryRow', () => {
  it('maps snake_case DB fields to the camelCase shape the app uses', () => {
    const row = { id: 1, name: 'Voucher', category: 'Booking Confirmation', from: 'Foreign Agent', date: '2026-08-01', status: 'Received', drive_link: 'http://x', notes: 'n', added_at: '2026-01-01' };
    const mapped = mapDbDocRegistryRow(row);
    expect(mapped.driveLink).toBe('http://x');
    expect(mapped.addedAt).toBe('2026-01-01');
    expect(mapped.name).toBe('Voucher');
  });
});

describe('loadDocRegistry / saveDocRegistry', () => {
  it('loads and maps all documents for a specific query, ordered by most recent', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [
      { id: 2, name: 'Newer', category: 'Voucher', from: 'Client', date: null, status: 'Received', drive_link: null, notes: '', added_at: '2026-02-01' },
      { id: 1, name: 'Older', category: 'Voucher', from: 'Client', date: null, status: 'Received', drive_link: null, notes: '', added_at: '2026-01-01' },
    ] }) }) }) }) };
    const docs = await loadDocRegistry(db, 'UTQ-1');
    expect(docs.length).toBe(2);
    expect(docs[0].name).toBe('Newer');
  });

  it('returns an empty array and does not throw when the db call fails', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => { throw new Error('fail'); } }) }) }) };
    const docs = await loadDocRegistry(db, 'UTQ-1');
    expect(docs).toEqual([]);
  });

  it('saveDocRegistry upserts every current doc and deletes ones no longer present locally', async () => {
    const calls = { upserts: [], deletes: [] };
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          upsert: vi.fn(async (row) => { calls.upserts.push(row); return { data: [row] }; }),
          select: () => builder,
          eq: (col, val) => { filters[col] = val; return builder; },
          delete: async () => { calls.deletes.push({ ...filters }); return { data: null }; },
          then: (resolve) => resolve({ data: [{ id: 1 }, { id: 2 }] }), // DB currently has ids 1 and 2
        };
        return builder;
      },
    };
    // Local state only has id 1 -- id 2 should get deleted
    await saveDocRegistry(db, 'UTQ-1', [{ id: 1, name: 'Kept Doc', category: 'Voucher', from: 'Client', status: 'Received' }]);
    expect(calls.upserts.length).toBe(1);
    expect(calls.upserts[0].name).toBe('Kept Doc');
    expect(calls.deletes.some(d => d.id === 2)).toBe(true);
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveDocRegistry(db, 'UTQ-1', [{ id: 1, name: 'X' }])).resolves.toBeUndefined();
  });
});
