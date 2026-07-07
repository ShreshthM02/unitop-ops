import { describe, it, expect } from 'vitest';
import { mergePaymentsRows, blankPaymentRecord } from '../lib/utils.js';

describe('mergePaymentsRows', () => {
  it('merges a payments header row with its incoming/outgoing children into one record', () => {
    const pay = [{ query_id: 'UTQ-001', tour_value: 2000, currency: 'US $', roe_used: 90, tour_value_inr: 180000 }];
    const incoming = [{ id: 1, query_id: 'UTQ-001', type: 'advance', in_currency: 'INR', amount: 50000, date: '2026-01-01', mode: 'Remittance', ref: 'X', note: '', receipt: 'RCP-1' }];
    const outgoing = [{ id: 2, query_id: 'UTQ-001', vendor: 'Hotel X', amount: 20000, date: '2026-01-02', mode: 'NEFT/RTGS', ref: '', note: '', receipt_name: '' }];

    const result = mergePaymentsRows(pay, incoming, outgoing);
    expect(result['UTQ-001'].tourValue).toBe(2000);
    expect(result['UTQ-001'].entries.length).toBe(1);
    expect(result['UTQ-001'].entries[0].inCurrency).toBe('INR');
    expect(result['UTQ-001'].outgoing.length).toBe(1);
    expect(result['UTQ-001'].outgoing[0].vendor).toBe('Hotel X');
  });

  it('creates a blank header record if an entry exists but the payments header row is missing', () => {
    const incoming = [{ id: 1, query_id: 'UTQ-002', type: 'advance', in_currency: 'INR', amount: 1000, date: '2026-01-01', mode: 'Cash', ref: '', note: '', receipt: 'RCP-2' }];
    const result = mergePaymentsRows([], incoming, []);
    expect(result['UTQ-002']).toBeTruthy();
    expect(result['UTQ-002'].entries.length).toBe(1);
    expect(result['UTQ-002'].tourValue).toBe(blankPaymentRecord('x').tourValue); // default fallback
  });

  it('returns an empty object when there is no data at all (caller should keep demo fallback in that case)', () => {
    const result = mergePaymentsRows([], [], []);
    expect(Object.keys(result).length).toBe(0);
  });

  it('handles multiple queries independently without cross-contamination', () => {
    const pay = [
      { query_id: 'A', tour_value: 100, currency: 'US $', roe_used: 90, tour_value_inr: 9000 },
      { query_id: 'B', tour_value: 200, currency: 'US $', roe_used: 90, tour_value_inr: 18000 },
    ];
    const incoming = [
      { id: 1, query_id: 'A', type: 'advance', in_currency: 'INR', amount: 100, date: '', mode: '', ref: '', note: '', receipt: '' },
      { id: 2, query_id: 'B', type: 'advance', in_currency: 'INR', amount: 200, date: '', mode: '', ref: '', note: '', receipt: '' },
    ];
    const result = mergePaymentsRows(pay, incoming, []);
    expect(result['A'].entries.length).toBe(1);
    expect(result['B'].entries.length).toBe(1);
    expect(result['A'].entries[0].amount).toBe(100);
    expect(result['B'].entries[0].amount).toBe(200);
  });
});
