import { describe, it, expect, vi } from 'vitest';
import {
  mapDbCostSheetRow, loadCostSheetVersions, saveCostSheetVersion, markCostSheetVersionFinal,
  mapDbQuotationRow, loadQuotationVersions, saveQuotationVersion, markQuotationVersionFinal,
} from '../lib/utils.js';

describe('mapDbCostSheetRow', () => {
  it('maps snake_case DB fields to the camelCase shape CostSheet.jsx uses', () => {
    const row = {
      version: 2, updated_at: '2026-08-01T10:00:00', is_final: true,
      gst_pct: 5, markup_pct: 20, roe: 90, currency: 'US $',
      tl_mode: 'pp', tl_cost: 500, misc_mode: 'lumpsum', misc_cost: 200,
      mon_mode: 'pp', mon_extra: 50,
      days: [{ id: 1 }], transports: [{ id: 2 }], slabs: [{ id: 3 }],
      monuments: [{ id: 4 }], local_handlers: [{ id: 5 }], extras: [{ id: 6 }],
    };
    const mapped = mapDbCostSheetRow(row);
    expect(mapped.version).toBe(2);
    expect(mapped.isFinal).toBe(true);
    expect(mapped.gst).toBe(5);
    expect(mapped.tlMode).toBe('pp');
    expect(mapped.localHandlers).toEqual([{ id: 5 }]);
    expect(mapped.extras).toEqual([{ id: 6 }]);
  });

  it('defaults jsonb arrays to [] when null', () => {
    const mapped = mapDbCostSheetRow({ version: 1, days: null, transports: null, slabs: null, monuments: null, local_handlers: null, extras: null });
    expect(mapped.days).toEqual([]);
    expect(mapped.localHandlers).toEqual([]);
    expect(mapped.extras).toEqual([]);
  });
});

describe('loadCostSheetVersions', () => {
  it('loads and maps all versions for a query, ordered oldest first', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [
      { version: 1, gst_pct: 5 }, { version: 2, gst_pct: 5 },
    ] }) }) }) }) };
    const versions = await loadCostSheetVersions(db, 'UTQ-1');
    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
  });

  it('returns an empty array without throwing on failure', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => { throw new Error('fail'); } }) }) }) };
    expect(await loadCostSheetVersions(db, 'UTQ-1')).toEqual([]);
  });
});

describe('saveCostSheetVersion (INSERT only -- Save Version must never overwrite history)', () => {
  it('inserts a new row with correct field mapping, and returns the real saved id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'real-cost-sheet-uuid' }], error: null }));
    const db = { from: () => ({ insert }) };
    const snap = { version: 3, gst: 5, markup: 20, roe: 90, currency: 'US $', tlMode: 'pp', tlCost: '500', miscMode: 'lumpsum', miscCost: '200', monMode: 'pp', monExtra: '50', days: [], transports: [], slabs: [], monuments: [], localHandlers: [], extras: [] };
    const savedId = await saveCostSheetVersion(db, 'UTQ-1', snap, 'cfff444a-718e-4c14-83a3-f55f368d64dd');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.query_id).toBe('UTQ-1');
    expect(row.version).toBe(3);
    expect(row.is_final).toBe(false);
    expect(row.tl_cost).toBe(500);
    expect(row.created_by).toBe('cfff444a-718e-4c14-83a3-f55f368d64dd');
    expect(savedId).toBe('real-cost-sheet-uuid'); // used to link a Quotation back to this exact version
  });

  it('guards created_by against a non-uuid value (demo mode user), same class of bug as agent_id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'x' }], error: null }));
    const db = { from: () => ({ insert }) };
    await saveCostSheetVersion(db, 'UTQ-1', { version: 1 }, 'demo-user-not-a-uuid');
    expect(insert.mock.calls[0][0].created_by).toBeNull();
  });

  it('does not throw when the db call fails, and returns null', async () => {
    const db = { from: () => ({ insert: async () => { throw new Error('fail'); } }) };
    const result = await saveCostSheetVersion(db, 'UTQ-1', { version: 1 }, null);
    expect(result).toBeNull();
  });
});

describe('markCostSheetVersionFinal', () => {
  it('clears is_final on all versions for the query, then sets it on exactly the target version', async () => {
    const calls = [];
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          eq: (col, val) => { filters[col] = val; return builder; },
          update: async (row) => { calls.push({ filters: { ...filters }, row }); return { data: [], error: null }; },
        };
        return builder;
      },
    };
    await markCostSheetVersionFinal(db, 'UTQ-1', 2);
    expect(calls[0].filters).toEqual({ query_id: 'UTQ-1' });
    expect(calls[0].row).toEqual({ is_final: false });
    expect(calls[1].filters).toEqual({ query_id: 'UTQ-1', version: 2 });
    expect(calls[1].row).toEqual({ is_final: true });
  });
});

describe('mapDbQuotationRow', () => {
  it('maps snake_case DB fields correctly, including the cost_sheet_id link, using savedAt (not date) for the save timestamp', () => {
    const row = {
      version: 2, is_final: true, note: 'Client requested discount', updated_at: '2026-08-01T10:00:00',
      attn_name: 'John', attn_company: 'NCH', attn_city: 'Bangkok', date: '8th August 2026',
      currency: 'US $', roe: 90, ref_line: 'REF-1', period: 'Aug 2026', pax_line: '8 Pax',
      itinerary: [{ id: 1 }], hotels: [{ id: 2 }], slabs: [], monuments: [], show_monuments: true,
      includes: ['a'], excludes: ['b'], greeting: 'Hi', opening_line: 'As desired',
      closing_line: 'Thanks', signoff: 'Regards', monument_note: 'Fees', cost_sheet_id: 'cs-uuid-1',
    };
    const mapped = mapDbQuotationRow(row);
    expect(mapped.version).toBe(2);
    expect(mapped.isFinal).toBe(true);
    expect(mapped.note).toBe('Client requested discount');
    expect(mapped.date).toBe('8th August 2026'); // the quotation's own content field, untouched
    expect(mapped.savedAt).toBeTruthy(); // separate from .date -- no naming collision
    expect(mapped.attnName).toBe('John');
    expect(mapped.costSheetId).toBe('cs-uuid-1');
    expect(mapped.openingLine).toBe('As desired');
  });
});

describe('loadQuotationVersions', () => {
  it('loads and maps all versions for a query, ordered oldest first (same shape as loadCostSheetVersions)', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [
      { version: 1, attn_name: 'John' }, { version: 2, attn_name: 'John' },
    ] }) }) }) }) };
    const versions = await loadQuotationVersions(db, 'UTQ-1');
    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
  });

  it('returns an empty array without throwing on failure', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => { throw new Error('fail'); } }) }) }) };
    expect(await loadQuotationVersions(db, 'UTQ-1')).toEqual([]);
  });
});

describe('saveQuotationVersion (INSERT only, mirrors saveCostSheetVersion -- negotiations produce real history)', () => {
  it('inserts a new row with correct field mapping and returns the real saved id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'real-quotation-uuid' }], error: null }));
    const db = { from: () => ({ insert }) };
    const snap = { version: 2, attnName: 'John', attnCompany: 'NCH', costSheetId: 'cs-1', note: 'Revised after client feedback' };
    const savedId = await saveQuotationVersion(db, 'UTQ-1', snap, 'cfff444a-718e-4c14-83a3-f55f368d64dd');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.query_id).toBe('UTQ-1');
    expect(row.version).toBe(2);
    expect(row.is_final).toBe(false);
    expect(row.note).toBe('Revised after client feedback');
    expect(row.cost_sheet_id).toBe('cs-1');
    expect(savedId).toBe('real-quotation-uuid');
  });

  it('guards created_by against a non-uuid value, same class of bug as agent_id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'x' }], error: null }));
    const db = { from: () => ({ insert }) };
    await saveQuotationVersion(db, 'UTQ-1', { version: 1 }, 'demo-user-not-a-uuid');
    expect(insert.mock.calls[0][0].created_by).toBeNull();
  });

  it('does not throw when the db call fails, and returns null', async () => {
    const db = { from: () => ({ insert: async () => { throw new Error('fail'); } }) };
    expect(await saveQuotationVersion(db, 'UTQ-1', { version: 1 }, null)).toBeNull();
  });
});

describe('markQuotationVersionFinal', () => {
  it('clears is_final on all versions for the query, then sets it on exactly the target version', async () => {
    const calls = [];
    const db = {
      from: () => {
        const filters = {};
        const builder = {
          eq: (col, val) => { filters[col] = val; return builder; },
          update: async (row) => { calls.push({ filters: { ...filters }, row }); return { data: [], error: null }; },
        };
        return builder;
      },
    };
    await markQuotationVersionFinal(db, 'UTQ-1', 2);
    expect(calls[0].filters).toEqual({ query_id: 'UTQ-1' });
    expect(calls[0].row).toEqual({ is_final: false });
    expect(calls[1].filters).toEqual({ query_id: 'UTQ-1', version: 2 });
    expect(calls[1].row).toEqual({ is_final: true });
  });
});
