import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { serviceStatusTone, serviceState, composeServiceName, mapServiceEntry, filterEntries, stateCounts, seriesSummary, formatDMY, parseDMY,
  saveServiceEntry, addVendorBooking, deleteVendorBooking, cancelLinkedServices } from '../lib/seriesManager.js';
import { mapDbServiceRow, saveQueryServices } from '../lib/utils.js';

describe('status tone and state', () => {
  it('known statuses keep their colour, free text is coloured by keyword', () => {
    expect(serviceStatusTone('confirmed')).toBe('confirmed');
    expect(serviceStatusTone('Reconfirmed against 3739')).toBe('confirmed');
    expect(serviceStatusTone('Waitlist - clears 60 days prior')).toBe('pending');
    expect(serviceStatusTone('Release requested')).toBe('cancelled');
    expect(serviceStatusTone('Sold out, try 16 Dec')).toBe('sold out');
    expect(serviceStatusTone('Rooming list awaited')).toBe('pending');
    expect(serviceStatusTone('something odd')).toBe('requested');
  });
  it('state groups for the filters', () => {
    expect(serviceState('Ex. Order Issued')).toBe('confirmed');
    expect(serviceState('Waitlisted')).toBe('open');
    expect(serviceState('sold out')).toBe('soldout');
    expect(serviceState('Cancelled by vendor')).toBe('cancelled');
  });
});

describe('naming and dates', () => {
  it('names a service Vendor / Title / Reservation and skips empty parts', () => {
    expect(composeServiceName('KK Royal', '2 nights twin', 'KKR/7607')).toBe('KK Royal / 2 nights twin / KKR/7607');
    expect(composeServiceName('KK Royal', 'Block', '')).toBe('KK Royal / Block');
  });
  it('formats and parses dd/mm/yyyy', () => {
    expect(formatDMY('2027-01-14')).toBe('14/01/2027');
    expect(parseDMY('5/3/2027')).toBe('2027-03-05');
    expect(parseDMY('05-03-27')).toBe('2027-03-05');
    expect(parseDMY('31/02/2027')).toBe('');
    expect(parseDMY('nonsense')).toBe('');
  });
});

const G1 = { id: 'g1', seriesId: 's1', vendorName: 'KK Royal', vendorType: 'Hotel', entries: [
  { id: 1, queryId: 'Q1', title: 'Twin', dateFrom: '2026-12-17', dateTo: '2026-12-19', reservationNo: 'KKR/7607', status: 'confirmed', rates: '₹6,050 APAI', name: 'KK Royal / Twin / KKR/7607' },
  { id: 2, queryId: 'Q2', title: 'Twin', dateFrom: '2027-01-14', dateTo: '2027-01-16', reservationNo: '', status: 'Waitlisted', rates: '', name: 'KK Royal / Twin' }] };
const G2 = { id: 'g2', seriesId: 's1', vendorName: 'Bharat Cabs', vendorType: 'Transport', entries: [
  { id: 3, queryId: '', title: 'Coach', dateFrom: '', dateTo: '', reservationNo: 'BC-1', status: 'sold out', rates: '', name: 'x' }] };

describe('filters and counts', () => {
  const groups = [G1, G2];
  it('counts by state and summarises', () => {
    expect(stateCounts(groups)).toMatchObject({ all: 3, confirmed: 1, open: 1, soldout: 1 });
    expect(seriesSummary(groups)).toBe('3 services · 1 confirmed · 1 open · 1 sold out');
    expect(seriesSummary([])).toBe('');
  });
  it('filters by vendor, category, tour file, state, text', () => {
    expect(filterEntries(groups, { vendor: 'g2' })).toHaveLength(1);
    expect(filterEntries(groups, { type: 'Hotel' })).toHaveLength(2);
    expect(filterEntries(groups, { queryId: 'Q2' })[0].entry.id).toBe(2);
    expect(filterEntries(groups, { queryId: '__none' })[0].entry.id).toBe(3);
    expect(filterEntries(groups, { state: 'open' })[0].entry.id).toBe(2);
    expect(filterEntries(groups, { text: 'kkr/76' })[0].entry.id).toBe(1);
    expect(filterEntries(groups, { text: '6,050' })).toHaveLength(1);
  });
  it('filters by service date range (overlap) and drops undated ones', () => {
    expect(filterEntries(groups, { from: '2026-12-18', to: '2026-12-31' }).map(x => x.entry.id)).toEqual([1]);
    expect(filterEntries(groups, { from: '2027-01-01' }).map(x => x.entry.id)).toEqual([2]);
  });
  it('finds entries with no reservation number', () => {
    expect(filterEntries(groups, { noReservation: true }).map(x => x.entry.id)).toEqual([2]);
  });
});

function fakeDb(extra = {}) {
  const log = { upserts: [], inserts: [], updates: [], deletes: [] };
  const db = { from: (t) => {
    let eqs = {};
    const b = {
      select: () => b, eq: (k, v) => { eqs[k] = v; return b; },
      upsert: async (r) => { log.upserts.push([t, r]); return { error: null }; },
      insert: async (r) => { log.inserts.push([t, r]); return { data: [{ id: 'new-id' }], error: null }; },
      update: async (r) => { log.updates.push([t, r, { ...eqs }]); return { error: null }; },
      delete: async () => { log.deletes.push([t, { ...eqs }]); return { error: null }; },
      then: (res) => res({ data: extra[t] || [], error: null }),
    };
    return b; } };
  return { db, log };
}

describe('saving an entry registers the service in the tour file', () => {
  it('writes one query_services row named Vendor / Title / Reservation, with a free-text status', async () => {
    const { db, log } = fakeDb();
    const r = await saveServiceEntry(db, { queryId: 'Q1', title: 'Twin', dateFrom: '2026-12-17', dateTo: '2026-12-19', reservationNo: 'KKR/7607', status: 'Waitlist, clears 60d prior', rates: '₹6,050', remarksHtml: '<b>hi</b>' }, G1, 'Priya');
    expect(r.error).toBeNull();
    const [t, row] = log.upserts[0];
    expect(t).toBe('query_services');
    expect(row).toMatchObject({ query_id: 'Q1', series_id: 's1', svb_id: 'g1', name: 'KK Royal / Twin / KKR/7607', status: 'Waitlist, clears 60d prior', date: '2026-12-17', date_to: '2026-12-19', reservation_no: 'KKR/7607', rates: '₹6,050', remarks_html: '<b>hi</b>', sort_order: 1000 });
    expect(typeof row.id).toBe('number');
    expect(log.inserts.find(i => i[0] === 'query_audit')[1]).toMatchObject({ query_id: 'Q1', by_name: 'Priya' });
  });
  it('an entry without a tour file is saved with no query_id and no audit line', async () => {
    const { db, log } = fakeDb();
    await saveServiceEntry(db, { title: 'Block', status: 'requested' }, G1, 'P');
    expect(log.upserts[0][1].query_id).toBeNull();
    expect(log.inserts).toHaveLength(0);
  });
  it('editing keeps the id and does not reset the order', async () => {
    const { db, log } = fakeDb();
    await saveServiceEntry(db, { id: 77, queryId: 'Q1', title: 'Twin', status: 'confirmed' }, G1, 'P');
    expect(log.upserts[0][1].id).toBe(77); expect(log.upserts[0][1]).not.toHaveProperty('sort_order');
  });
  it('refuses a missing title and an end before the start', async () => {
    const { db } = fakeDb();
    expect((await saveServiceEntry(db, { title: ' ' }, G1, 'P')).error).toMatch(/title/);
    expect((await saveServiceEntry(db, { title: 'x', dateFrom: '2027-01-05', dateTo: '2027-01-01' }, G1, 'P')).error).toMatch(/end date/);
  });
  it('tells the user to run the migration when the column is missing', async () => {
    const db = { from: () => ({ upsert: async () => ({ error: { message: 'column "svb_id" does not exist' } }) }) };
    expect((await saveServiceEntry(db, { title: 'x' }, G1, 'P')).error).toMatch(/migration/);
  });
});

describe('vendor bookings and cancellation', () => {
  it('opens a vendor booking and refuses an empty vendor', async () => {
    const { db, log } = fakeDb();
    expect((await addVendorBooking(db, { seriesId: 's1', vendorName: ' ' }, 'P')).error).toMatch(/vendor/i);
    const r = await addVendorBooking(db, { seriesId: 's1', vendorId: 'v1', vendorName: 'KK Royal', vendorType: 'Hotel' }, 'P');
    expect(r.id).toBe('new-id'); expect(log.inserts[0][1]).toMatchObject({ series_id: 's1', vendor_name: 'KK Royal', vendor_type: 'Hotel' });
  });
  it('deleting a vendor booking removes its services and soft-deletes the group', async () => {
    const { db, log } = fakeDb();
    await deleteVendorBooking(db, G1);
    expect(log.deletes[0]).toEqual(['query_services', { svb_id: 'g1' }]);
    expect(log.updates[0][0]).toBe('series_vendor_bookings'); expect(log.updates[0][1]).toHaveProperty('deleted_at');
  });
  it('cancelling a tour file cancels only its series-backed services', async () => {
    const { db, log } = fakeDb({ query_services: [{ id: 1, svb_id: 'g1', status: 'confirmed' }, { id: 2, svb_id: null, status: 'confirmed' }, { id: 3, svb_id: 'g1', status: 'cancelled' }] });
    await cancelLinkedServices(db, 'Q1');
    expect(log.updates.map(u => u[2].id)).toEqual([1]);
    expect(log.updates[0][1]).toEqual({ status: 'cancelled' });
  });
});

describe('tour-file side of a linked service', () => {
  it('maps the booking fields only for series-backed rows', () => {
    expect(mapDbServiceRow({ id: 1, name: 'x', status: 'a' })).not.toHaveProperty('svbId');
    expect(mapDbServiceRow({ id: 1, name: 'x', status: 'a', svb_id: 'g1', reservation_no: 'R1', date_to: '2027-01-02', remarks_html: '<i>r</i>' }))
      .toMatchObject({ svbId: 'g1', reservationNo: 'R1', dateTo: '2027-01-02', remarksHtml: '<i>r</i>' });
  });
  it('saving from the tour file writes only status, remarks and order for a linked row, so it cannot overwrite series-side edits', async () => {
    const { db, log } = fakeDb();
    await saveQueryServices(db, 'Q1', [{ id: 5, svbId: 'g1', name: 'STALE NAME', date: '2020-01-01', status: 'confirmed', remarksHtml: '<b>r</b>' }, { id: 6, name: 'Plain', status: 'requested', date: '' }]);
    expect(log.upserts[0][1]).toEqual({ id: 5, query_id: 'Q1', status: 'confirmed', remarks_html: '<b>r</b>', sort_order: 0 });
    expect(log.upserts[1][1]).toMatchObject({ id: 6, name: 'Plain' });
  });
});

const rows = {
  series_vendor_bookings: [{ id: 'g1', series_id: 's1', vendor_name: 'KK Royal', vendor_type: 'Hotel' }],
  query_services: [
    { id: 1, svb_id: 'g1', series_id: 's1', query_id: 'Q1', title: 'Twin', date: '2026-12-17', date_to: '2026-12-19', reservation_no: 'KKR/7607', status: 'confirmed', rates: '₹6,050', remarks_html: '<b>Early check-in</b>' },
    { id: 2, svb_id: 'g1', series_id: 's1', query_id: 'Q2', title: 'Twin', date: '2027-01-14', status: 'Waitlisted - clears Nov 15' }],
};
vi.mock('../lib/supabase.js', () => ({
  db: { from: (t) => { const b = { select: () => b, eq: () => b, is: () => b, or: () => b, order: () => b, then: (res) => res({ data: rows[t] || [], error: null }) }; return b; }, drive: {}, authRpc: vi.fn() },
  realtimeClient: null,
}));

describe('Series bookings screen', () => {
  const queries = [{ id: 'Q1', seriesId: 's1', tourFileId: 'UT-1', groupName: 'A' }, { id: 'Q2', seriesId: 's1', tourFileId: 'UT-2', groupName: 'B' }];
  it('shows vendor groups with entries, a custom status as typed, dates as dd/mm/yyyy, and filters by state', async () => {
    const { default: SeriesBookings } = await import('../components/SeriesBookings.jsx');
    const onSummary = vi.fn();
    render(<SeriesBookings series={{ id: 's1', name: 'T' }} queries={queries} vendors={[]} currentUser={{ name: 'Priya' }} onSummary={onSummary} />);
    await waitFor(() => expect(screen.getByTestId('vendor-booking')).toBeTruthy());
    expect(screen.getAllByTestId('series-entry')).toHaveLength(2);
    expect(screen.getByText(/17\/12\/2026 – 19\/12\/2026/)).toBeTruthy();
    expect(screen.getByDisplayValue('Waitlisted - clears Nov 15')).toBeTruthy();       // free-text status kept as written
    expect(screen.getByText('Early check-in')).toBeTruthy();
    await waitFor(() => expect(onSummary).toHaveBeenCalledWith('2 services · 1 confirmed · 1 open'));
    fireEvent.click(screen.getByRole('button', { name: /^Open 1/ }));
    expect(screen.getAllByTestId('series-entry')).toHaveLength(1);
    expect(screen.getByText(/1 of 2 match/)).toBeTruthy();
    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.getAllByTestId('series-entry')).toHaveLength(2);
  });
  it('the entry form offers this series’ tour files and the simple fields', async () => {
    const { default: SeriesBookings } = await import('../components/SeriesBookings.jsx');
    render(<SeriesBookings series={{ id: 's1', name: 'T' }} queries={queries} vendors={[]} currentUser={{ name: 'Priya' }} />);
    await waitFor(() => expect(screen.getByText('+ Add booking')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add booking'));
    const form = within(screen.getByTestId('entry-form'));
    expect(Array.from(form.getByLabelText('Tour file').options).map(o => o.textContent)).toEqual(['— no file yet (series only) —', 'UT-1 · A', 'UT-2 · B']);
    ['Title', 'Start date', 'End date', 'Reservation or PNR number', 'Rates', 'Entry status'].forEach(l => expect(form.getByLabelText(l)).toBeTruthy());
    expect(form.getAllByPlaceholderText('dd/mm/yyyy')).toHaveLength(2);
  });
});
