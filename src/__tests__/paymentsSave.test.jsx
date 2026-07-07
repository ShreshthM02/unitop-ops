import { describe, it, expect, vi } from 'vitest';
import { savePaymentsToDB } from '../lib/utils.js';

// Minimal mock matching the real _supa builder's chaining shape:
// .from(table) -> { upsert, select().eq(), eq().delete() }
function makeMockDb({ existingIncomingIds = [], existingOutgoingIds = [] } = {}) {
  const calls = { upserts: [], deletes: [] };
  const db = {
    from: (table) => {
      const filters = {};
      const builder = {
        upsert: vi.fn(async (row) => { calls.upserts.push({ table, row }); return { data: [row], error: null }; }),
        select: vi.fn(() => builder),
        eq: vi.fn((col, val) => { filters[col] = val; return builder; }),
        delete: vi.fn(async () => { calls.deletes.push({ table, filters: { ...filters } }); return { data: null, error: null }; }),
        then: (resolve) => {
          if (table === 'payment_incoming') return resolve({ data: existingIncomingIds.map(id => ({ id })), error: null });
          if (table === 'payment_outgoing') return resolve({ data: existingOutgoingIds.map(id => ({ id })), error: null });
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
  return { db, calls };
}

describe('savePaymentsToDB', () => {
  it('upserts the payments header row with the right field mapping', async () => {
    const { db, calls } = makeMockDb();
    await savePaymentsToDB(db, 'UTQ-001', { tourValue: 2000, currency: 'US $', roeUsed: 90, tourValueINR: 180000, entries: [], outgoing: [] });
    const headerUpsert = calls.upserts.find(u => u.table === 'payments');
    expect(headerUpsert.row).toEqual({
      query_id: 'UTQ-001', tour_value: 2000, currency: 'US $', roe_used: 90, tour_value_inr: 180000,
    });
  });

  it('upserts every current incoming entry with correct field mapping', async () => {
    const { db, calls } = makeMockDb();
    const entry = { id: 111, type: 'advance', inCurrency: 'INR', currOther: '', amount: '50000', date: '2026-01-01', mode: 'Remittance', modeOther: '', ref: 'X', note: 'n', receipt: 'RCP-1' };
    await savePaymentsToDB(db, 'UTQ-001', { entries: [entry], outgoing: [] });
    const entryUpsert = calls.upserts.find(u => u.table === 'payment_incoming');
    expect(entryUpsert.row).toEqual({
      id: 111, query_id: 'UTQ-001', type: 'advance', in_currency: 'INR', curr_other: '',
      amount: 50000, date: '2026-01-01', mode: 'Remittance', mode_other: '', ref: 'X', note: 'n', receipt: 'RCP-1',
    });
  });

  it('deletes an incoming entry that existed in DB but is no longer in the local array (the actual delete-entry case)', async () => {
    const { db, calls } = makeMockDb({ existingIncomingIds: [111, 222] });
    const entry = { id: 111, type: 'advance', inCurrency: 'INR', amount: '100', date: '', mode: '', ref: '', note: '', receipt: '' };
    await savePaymentsToDB(db, 'UTQ-001', { entries: [entry], outgoing: [] });
    const del = calls.deletes.find(d => d.table === 'payment_incoming');
    expect(del).toBeTruthy();
    expect(del.filters.id).toBe(222);
  });

  it('does not delete anything when the local array still matches DB exactly', async () => {
    const { db, calls } = makeMockDb({ existingIncomingIds: [111] });
    const entry = { id: 111, type: 'advance', inCurrency: 'INR', amount: '100', date: '', mode: '', ref: '', note: '', receipt: '' };
    await savePaymentsToDB(db, 'UTQ-001', { entries: [entry], outgoing: [] });
    expect(calls.deletes.filter(d => d.table === 'payment_incoming').length).toBe(0);
  });

  it('handles outgoing entries the same way (upsert current, delete removed)', async () => {
    const { db, calls } = makeMockDb({ existingOutgoingIds: [55, 66] });
    const outgoing = { id: 55, vendor: 'Hotel A', amount: '1000', date: '', mode: '', ref: '', note: '', receiptName: '' };
    await savePaymentsToDB(db, 'UTQ-001', { entries: [], outgoing: [outgoing] });
    const upsert = calls.upserts.find(u => u.table === 'payment_outgoing');
    expect(upsert.row.vendor).toBe('Hotel A');
    const del = calls.deletes.find(d => d.table === 'payment_outgoing');
    expect(del.filters.id).toBe(66);
  });

  it('does not throw when the db calls fail (network error should be swallowed, not crash the app)', async () => {
    const failingDb = { from: () => ({ upsert: async () => { throw new Error('network fail'); } }) };
    await expect(savePaymentsToDB(failingDb, 'UTQ-001', { entries: [], outgoing: [] })).resolves.toBeUndefined();
  });
});
