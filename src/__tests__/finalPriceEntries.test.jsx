import { describe, it, expect, vi } from 'vitest';
import { computeFinalPriceTotals, isFinalPriceComplete, summarizeFinalPriceEntries, logFinalPriceAgreementChange, loadFinalPriceAgreementAudits, FINAL_PRICE_AUDIT_PREFIX } from '../lib/utils.js';

describe('computeFinalPriceTotals', () => {
  it('sums pax and pax*rate across multiple entries -- the actual 18+2 example', () => {
    const entries = [
      { pax: '18', rate: '237' },
      { pax: '2', rate: '50' },
    ];
    const totals = computeFinalPriceTotals(entries);
    expect(totals.confirmedPax).toBe(20);
    expect(totals.tourValue).toBe(18 * 237 + 2 * 50);
  });

  it('returns zero totals for an empty or missing list, without throwing', () => {
    expect(computeFinalPriceTotals([])).toEqual({ confirmedPax: 0, tourValue: 0 });
    expect(computeFinalPriceTotals(null)).toEqual({ confirmedPax: 0, tourValue: 0 });
  });

  it('treats a blank pax or rate as 0, not NaN', () => {
    const totals = computeFinalPriceTotals([{ pax: '', rate: '100' }, { pax: '5', rate: '' }]);
    expect(totals.confirmedPax).toBe(5);
    expect(totals.tourValue).toBe(0);
  });
});

describe('isFinalPriceComplete', () => {
  it('is false for an empty list -- at least one entry is required', () => {
    expect(isFinalPriceComplete([])).toBe(false);
  });

  it('is false if any entry is missing pax or rate', () => {
    expect(isFinalPriceComplete([{ pax: '18', rate: '237' }, { pax: '', rate: '50' }])).toBe(false);
    expect(isFinalPriceComplete([{ pax: '18', rate: '237' }, { pax: '2', rate: '' }])).toBe(false);
  });

  it('is true only when every entry has both a real pax and a real rate', () => {
    expect(isFinalPriceComplete([{ pax: '18', rate: '237' }, { pax: '2', rate: '50' }])).toBe(true);
  });
});

describe('summarizeFinalPriceEntries', () => {
  it('builds a readable summary distinguishing slab vs custom sources', () => {
    const entries = [
      { pax: '18', rate: '237', source: 'slab', slabLabel: '15-19 Pax Paying' },
      { pax: '2', rate: '50', source: 'custom' },
    ];
    const summary = summarizeFinalPriceEntries(entries, 'US $');
    expect(summary).toContain('18 pax @ US $237 (15-19 Pax Paying)');
    expect(summary).toContain('2 pax @ US $50 (Custom)');
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
