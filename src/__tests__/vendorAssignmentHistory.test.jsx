import { describe, it, expect } from 'vitest';
import { getVendorAssignmentHistory } from '../lib/utils.js';

const queries = [
  { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', travelDate: '2026-08-01', status: 'operations', cancelled: false },
  { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', destination: 'Rajasthan', travelDate: '2026-09-01', status: 'completed', cancelled: false },
  { id: 'UTQ-3', tourFileId: 'TF-3', groupName: 'Cancelled Group', destination: 'Goa', travelDate: '2026-07-01', status: 'operations', cancelled: true },
];

describe('getVendorAssignmentHistory: the actual reported bug', () => {
  it('shows a tour the vendor was assigned to as a Tour Facilitator', () => {
    const tourExecutions = { 'UTQ-1': { facilitators: [{ vendorId: 'v1', sector: 'North Kerala', notes: 'Confirmed' }] } };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows.length).toBe(1);
    expect(rows[0].tourFileId).toBe('TF-1');
    expect(rows[0].role).toBe('Tour Facilitator');
    expect(rows[0].groupName).toBe('Group A');
  });

  it('shows assignments across all three roles (Facilitator, Local Handler, Transporter) for the same vendor', () => {
    const tourExecutions = {
      'UTQ-1': { facilitators: [{ vendorId: 'v1' }] },
      'UTQ-2': { localHandlers: [{ vendorId: 'v1' }], transporters: [{ vendorId: 'v1' }] },
    };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows.length).toBe(3);
    expect(rows.map(r => r.role).sort()).toEqual(['Local Handler', 'Tour Facilitator', 'Transporter']);
  });

  it('does NOT show a different vendor\'s assignment -- matched strictly by vendor id, not name', () => {
    const tourExecutions = { 'UTQ-1': { facilitators: [{ vendorId: 'v2' }] } };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows.length).toBe(0);
  });

  it('includes cancelled tours but marks them, rather than hiding history (a vendor was still genuinely assigned)', () => {
    const tourExecutions = { 'UTQ-3': { facilitators: [{ vendorId: 'v1' }] } };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows.length).toBe(1);
    expect(rows[0].cancelled).toBe(true);
  });

  it('ignores an assignment row with no vendorId set at all (not yet assigned)', () => {
    const tourExecutions = { 'UTQ-1': { facilitators: [{ vendorId: '' }] } };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows.length).toBe(0);
  });

  it('returns an empty array without throwing when tourExecutions/queries are empty or missing', () => {
    expect(getVendorAssignmentHistory('v1', {}, [])).toEqual([]);
    expect(getVendorAssignmentHistory('v1', null, null)).toEqual([]);
  });

  it('skips a tour_execution entry whose query_id no longer matches any real query, without crashing', () => {
    const tourExecutions = { 'UTQ-DELETED': { facilitators: [{ vendorId: 'v1' }] } };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows).toEqual([]);
  });

  it('sorts by travel date, most recent first', () => {
    const tourExecutions = {
      'UTQ-1': { facilitators: [{ vendorId: 'v1' }] }, // Aug
      'UTQ-2': { facilitators: [{ vendorId: 'v1' }] }, // Sep -- later
    };
    const rows = getVendorAssignmentHistory('v1', tourExecutions, queries);
    expect(rows[0].tourFileId).toBe('TF-2');
    expect(rows[1].tourFileId).toBe('TF-1');
  });
});
