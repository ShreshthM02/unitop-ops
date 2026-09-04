import { describe, it, expect } from 'vitest';
import { buildPnLSummary } from '../lib/utils.js';

// New P&L export feature: per direct instruction, pulls ONLY from
// incoming/outgoing payment records, nothing else -- buildPnLSummary
// is the single shared calculation both the PDF and Excel export will
// call, so they can never disagree with each other.

describe('buildPnLSummary', () => {
  it('computes totalReceived, totalExpenditure, netProfit, and profitPercent correctly', () => {
    const pt = {
      entries: [{ amount: '100000', inCurrency: 'INR' }, { amount: '50000', inCurrency: 'INR' }],
      outgoing: [{ vendor: 'Hotel Saura', category: 'Hotel', amount: '60000' }, { vendor: 'Golden Cabs', category: 'Transport', amount: '20000' }],
    };
    const result = buildPnLSummary(pt);
    expect(result.totalReceived).toBe(150000);
    expect(result.totalExpenditure).toBe(80000);
    expect(result.netProfit).toBe(70000);
    expect(result.profitPercent).toBeCloseTo(46.67, 1);
  });

  it('respects a foreign-currency entry’s real INR credited amount, not the foreign face value', () => {
    const pt = { entries: [{ amount: '1000', inCurrency: 'USD', amountINR: '83000' }], outgoing: [] };
    expect(buildPnLSummary(pt).totalReceived).toBe(83000);
  });

  it('excludes a foreign-currency entry with no amountINR set yet, matching entryINR’s own "never guess" behavior', () => {
    const pt = { entries: [{ amount: '1000', inCurrency: 'USD', amountINR: null }], outgoing: [] };
    expect(buildPnLSummary(pt).totalReceived).toBe(0);
  });

  it('groups expenditure by category, with a stable order and "Not Categorised" always last', () => {
    const pt = { entries: [], outgoing: [
      { vendor: 'A', category: 'Transport', amount: '100' },
      { vendor: 'B', category: 'Hotel', amount: '200' },
      { vendor: 'C', category: '', amount: '50' },
      { vendor: 'D', category: 'Hotel', amount: '300' },
    ] };
    const result = buildPnLSummary(pt);
    expect(result.byCategory['Hotel'].total).toBe(500);
    expect(result.byCategory['Hotel'].entries).toHaveLength(2);
    expect(result.byCategory['Transport'].total).toBe(100);
    expect(result.byCategory['Not Categorised'].total).toBe(50);
    expect(result.sortedCategories).toEqual(['Hotel', 'Transport', 'Not Categorised']); // Hotel before Transport per SERVICE_TYPES order, uncategorised last
  });

  it('handles a genuinely empty payment record without crashing', () => {
    expect(buildPnLSummary({})).toMatchObject({ totalReceived: 0, totalExpenditure: 0, netProfit: 0, profitPercent: 0, sortedCategories: [] });
    expect(buildPnLSummary(null)).toMatchObject({ totalReceived: 0, totalExpenditure: 0 });
  });

  it('a negative profit (loss) is a genuine negative number, not clamped to zero', () => {
    const pt = { entries: [{ amount: '50000', inCurrency: 'INR' }], outgoing: [{ vendor: 'X', amount: '80000' }] };
    const result = buildPnLSummary(pt);
    expect(result.netProfit).toBe(-30000);
    expect(result.profitPercent).toBeCloseTo(-60, 1);
  });
});
