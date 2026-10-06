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

// Direct request (2026-10-06): a confirmed Exchange Order counts as a
// service in Service History for every vendor type.
import { getVendorServiceHistory, groupExchangeOrderVersions } from '../lib/utils.js';

const eoRow = (over = {}) => ({
  id: 'r1', orderNo: 'EO-1', queryId: 'UTQ-1', vendorId: 'h1', version: 1, isFinal: false,
  createdAt: '2026-08-01', order: { confirmed: true }, ...over,
});
const hotel = { id: 'h1', name: 'Hotel Taj', type: 'Hotel' };

describe('getVendorServiceHistory: confirmed Exchange Orders', () => {
  it('lists a tour for a vendor with NO Tour Info assignment once its EO is confirmed, labelled with the vendor type', () => {
    const groups = groupExchangeOrderVersions([eoRow()]);
    const rows = getVendorServiceHistory(hotel, {}, queries, groups);
    expect(rows.length).toBe(1);
    expect(rows[0].tourFileId).toBe('TF-1');
    expect(rows[0].role).toBe('Hotel');
    expect(rows[0].eoNos).toEqual(['EO-1']);
  });

  it('does NOT list a tour whose EO is still pending (unconfirmed)', () => {
    const groups = groupExchangeOrderVersions([eoRow({ order: { confirmed: false } })]);
    expect(getVendorServiceHistory(hotel, {}, queries, groups)).toEqual([]);
  });

  it('removes the entry again if the EO is un-confirmed', () => {
    const confirmed = groupExchangeOrderVersions([eoRow()]);
    const unconfirmed = groupExchangeOrderVersions([eoRow({ order: { confirmed: false } })]);
    expect(getVendorServiceHistory(hotel, {}, queries, confirmed).length).toBe(1);
    expect(getVendorServiceHistory(hotel, {}, queries, unconfirmed).length).toBe(0);
  });

  it('merges into ONE card when the vendor is also assigned on that tour in Tour Info', () => {
    const v = { id: 'v1', name: 'Raj', type: 'Tour Facilitator' };
    const te = { 'UTQ-1': { facilitators: [{ vendorId: 'v1' }] } };
    const groups = groupExchangeOrderVersions([eoRow({ vendorId: 'v1' })]);
    const rows = getVendorServiceHistory(v, te, queries, groups);
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe('Tour Facilitator');
    expect(rows[0].eoNos).toEqual(['EO-1']);
  });

  it("ignores another vendor's confirmed EO", () => {
    const groups = groupExchangeOrderVersions([eoRow({ vendorId: 'someone-else' })]);
    expect(getVendorServiceHistory(hotel, {}, queries, groups)).toEqual([]);
  });

  it('keeps a cancelled tour in the list, flagged cancelled (shown dimmed with a badge)', () => {
    const groups = groupExchangeOrderVersions([eoRow({ queryId: 'UTQ-3' })]);
    const rows = getVendorServiceHistory(hotel, {}, queries, groups);
    expect(rows.length).toBe(1);
    expect(rows[0].cancelled).toBe(true);
  });

  it("reads 'confirmed' from the order's latest/final version, same row the Confirm toggle writes", () => {
    const groups = groupExchangeOrderVersions([
      eoRow({ id: 'a', version: 1, order: { confirmed: true } }),
      eoRow({ id: 'b', version: 2, order: { confirmed: false } }),
    ]);
    expect(getVendorServiceHistory(hotel, {}, queries, groups)).toEqual([]);
  });

  it('skips a confirmed EO whose tour no longer exists, and tolerates missing inputs', () => {
    const groups = groupExchangeOrderVersions([eoRow({ queryId: 'UTQ-GONE' })]);
    expect(getVendorServiceHistory(hotel, {}, queries, groups)).toEqual([]);
    expect(getVendorServiceHistory(hotel, null, null, null)).toEqual([]);
    expect(getVendorServiceHistory(null, {}, queries, [])).toEqual([]);
  });
});
