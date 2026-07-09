import { describe, it, expect, vi } from 'vitest';
import { computeFinalPriceTotals, isFinalPriceComplete, summarizeFinalPriceEntries, logFinalPriceAgreementChange, loadFinalPriceAgreementAudits, updateFinalPriceAgreement, FINAL_PRICE_AUDIT_PREFIX } from '../lib/utils.js';

describe('computeFinalPriceTotals', () => {
  it('sums pax and pax*rate across multiple entries -- the actual 18+2 example', () => {
    const entries = [
      { paxPaying: '18', rate: '237' },
      { paxPaying: '2', rate: '50' },
    ];
    const totals = computeFinalPriceTotals(entries);
    expect(totals.paxPaying).toBe(20);
    expect(totals.foc).toBe(0);
    expect(totals.confirmedPax).toBe(20);
    expect(totals.tourValue).toBe(18 * 237 + 2 * 50);
  });

  it('FOC pax count toward total headcount but contribute nothing to tour value', () => {
    const entries = [{ paxPaying: '18', foc: '1', rate: '237' }];
    const totals = computeFinalPriceTotals(entries);
    expect(totals.paxPaying).toBe(18);
    expect(totals.foc).toBe(1);
    expect(totals.confirmedPax).toBe(19); // 18 paying + 1 FOC
    expect(totals.tourValue).toBe(18 * 237); // FOC contributes 0
  });

  it('returns zero totals for an empty or missing list, without throwing', () => {
    expect(computeFinalPriceTotals([])).toEqual({ confirmedPax: 0, paxPaying: 0, foc: 0, tourValue: 0 });
    expect(computeFinalPriceTotals(null)).toEqual({ confirmedPax: 0, paxPaying: 0, foc: 0, tourValue: 0 });
  });

  it('treats a blank pax or rate as 0, not NaN', () => {
    const totals = computeFinalPriceTotals([{ paxPaying: '', rate: '100' }, { paxPaying: '5', rate: '' }]);
    expect(totals.confirmedPax).toBe(5);
    expect(totals.tourValue).toBe(0);
  });

  it('is backward compatible with old entries saved before FOC was split out (using the old "pax" key)', () => {
    const totals = computeFinalPriceTotals([{ pax: '18', rate: '237' }]); // old shape, no paxPaying/foc
    expect(totals.paxPaying).toBe(18);
    expect(totals.confirmedPax).toBe(18);
    expect(totals.tourValue).toBe(18 * 237);
  });
});

describe('isFinalPriceComplete', () => {
  it('is false for an empty list -- at least one entry is required', () => {
    expect(isFinalPriceComplete([])).toBe(false);
  });

  it('is false if any entry is missing paying pax or rate', () => {
    expect(isFinalPriceComplete([{ paxPaying: '18', rate: '237' }, { paxPaying: '', rate: '50' }])).toBe(false);
    expect(isFinalPriceComplete([{ paxPaying: '18', rate: '237' }, { paxPaying: '2', rate: '' }])).toBe(false);
  });

  it('is true when every entry has paying pax and rate -- FOC is optional and does not block completeness', () => {
    expect(isFinalPriceComplete([{ paxPaying: '18', rate: '237' }, { paxPaying: '2', foc: '0', rate: '50' }])).toBe(true);
  });
});

describe('summarizeFinalPriceEntries', () => {
  it('builds a readable summary distinguishing slab vs custom sources, and including FOC when present', () => {
    const entries = [
      { paxPaying: '18', foc: '1', rate: '237', source: 'slab', slabLabel: '15-19 Pax Paying' },
      { paxPaying: '2', rate: '50', source: 'custom' },
    ];
    const summary = summarizeFinalPriceEntries(entries, 'US $');
    expect(summary).toContain('18 pax paying + 1 FOC @ US $237 (15-19 Pax Paying)');
    expect(summary).toContain('2 pax paying @ US $50 (Custom)'); // no FOC mentioned when it's 0/absent
  });

  it('returns a clear "no entries" message for an empty list', () => {
    expect(summarizeFinalPriceEntries([], 'US $')).toBe('no entries');
  });
});

describe('logFinalPriceAgreementChange / loadFinalPriceAgreementAudits', () => {
  it('logs an audit entry with the fixed prefix and a readable summary', async () => {
    const insert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ insert }) };
    await logFinalPriceAgreementChange(db, 'UTQ-1', 'Priya', [{ pax: '18', rate: '237', source: 'slab', slabLabel: 'Main Slab' }], 'US $');
    const row = insert.mock.calls[0][0];
    expect(row.query_id).toBe('UTQ-1');
    expect(row.by_name).toBe('Priya');
    expect(row.action.startsWith(FINAL_PRICE_AUDIT_PREFIX)).toBe(true);
    expect(row.action).toContain('18 pax');
  });

  it('does not throw when logging fails', async () => {
    const db = { from: () => ({ insert: async () => { throw new Error('fail'); } }) };
    await expect(logFinalPriceAgreementChange(db, 'UTQ-1', 'X', [], 'US $')).resolves.toBeUndefined();
  });

  it('loads only audit entries with the final-price prefix, filtering out unrelated ones', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [
      { by_name: 'Priya', created_at: '2026-08-01', action: `${FINAL_PRICE_AUDIT_PREFIX} 18 pax @ US $237` },
      { by_name: 'Ravi', created_at: '2026-08-02', action: 'Updated day-wise itinerary' }, // unrelated, should be filtered out
    ] }) }) }) }) };
    const audits = await loadFinalPriceAgreementAudits(db, 'UTQ-1');
    expect(audits.length).toBe(1);
    expect(audits[0].by).toBe('Priya');
    expect(audits[0].action).toBe('18 pax @ US $237'); // prefix stripped for clean display
  });

  it('returns an empty array without throwing on failure', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => { throw new Error('fail'); } }) }) }) };
    expect(await loadFinalPriceAgreementAudits(db, 'UTQ-1')).toEqual([]);
  });
});

describe('updateFinalPriceAgreement (in-place update to an already-final version, no new version needed)', () => {
  it('updates the existing row by query_id + version, not an insert, on the quotations table specifically', async () => {
    const update = vi.fn(async () => ({ data: [], error: null }));
    const quotationsInsert = vi.fn();
    const filters = {};
    const db = { from: (table) => {
      const builder = {
        eq: (col, val) => { filters[col] = val; return builder; },
        update,
        insert: table === 'quotations' ? quotationsInsert : vi.fn(async () => ({ data: [], error: null })),
      };
      return builder;
    } };
    await updateFinalPriceAgreement(db, 'UTQ-1', 2, [{ paxPaying: '19', rate: '237' }], 'US $', 'Priya');
    expect(quotationsInsert).not.toHaveBeenCalled(); // must not create a new quotations row
    expect(update).toHaveBeenCalledTimes(1);
    expect(filters.query_id).toBe('UTQ-1');
    expect(filters.version).toBe(2);
  });

  it('recomputes and saves confirmed_pax and tour_value from the new entries', async () => {
    const update = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => { const b = { eq: () => b, update, insert: vi.fn() }; return b; } };
    await updateFinalPriceAgreement(db, 'UTQ-1', 2, [{ paxPaying: '19', foc: '1', rate: '237' }], 'US $', 'Priya');
    const row = update.mock.calls[0][0];
    expect(row.confirmed_pax).toBe(20); // 19 paying + 1 FOC
    expect(row.tour_value).toBe(19 * 237);
    expect(row.final_price_entries).toEqual([{ paxPaying: '19', foc: '1', rate: '237' }]);
  });

  it('logs an audit entry distinguishing this from a new version', async () => {
    const auditCalls = [];
    const db = {
      from: (table) => {
        const b = {
          eq: () => b,
          update: async () => ({ data: [], error: null }),
          insert: async (row) => { if (table === 'query_audit') auditCalls.push(row); return { data: [], error: null }; },
        };
        return b;
      },
    };
    await updateFinalPriceAgreement(db, 'UTQ-1', 2, [{ paxPaying: '19', rate: '237' }], 'US $', 'Priya');
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0].action).toContain('same version, no renegotiation');
    expect(auditCalls[0].action).toContain('19 pax paying');
  });

  it('does not throw when the update fails', async () => {
    const db = { from: () => { const b = { eq: () => b, update: async () => { throw new Error('fail'); } }; return b; } };
    await expect(updateFinalPriceAgreement(db, 'UTQ-1', 2, [], 'US $', 'Priya')).resolves.toBeUndefined();
  });
});
