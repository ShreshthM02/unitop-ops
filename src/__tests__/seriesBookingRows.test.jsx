import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { mapBookingCategory, mapBooking, bookingToDb, bookingAttention, bookingKind, rowsSummary, rateStatus, waitlistDate,
  saveBookingRow, bulkSetRowStatus, addCorrespondence, chartModel, chartHtml, chartText, bookingsForDeparture, rowsForDeparture, seriesHealth, timelineBuckets } from '../lib/seriesManager.js';

const hotel = mapBookingCategory({ id: 'h', name: 'Hotel', statuses: [
  { name: 'Enquiry sent', kind: 'open' }, { name: 'Waitlisted', kind: 'open' }, { name: 'Sold out', kind: 'open' },
  { name: 'Confirmed', kind: 'done' }, { name: 'Cancelled', kind: 'cancelled' }] });
const row = (o) => ({ id: 'r' + Math.random(), bookingId: 'b', queryId: '', label: '', dateFrom: '', dateTo: '', plan: '', detail: '', foc: '', status: 'Confirmed', confirmationNo: 'X1', deadlineDate: '', deadlineLabel: '', ...o });
const bk = (o) => ({ id: 'b', categoryId: 'h', title: 'KK Royal', status: '', lines: [], allocations: [], rows: [], rates: [], waitlistDays: '', awaiting: '', followUpDate: '', ...o });
const today = '2026-10-16';

describe('rows drive the booking state', () => {
  it('all confirmed -> done, mixed -> open, all cancelled -> cancelled', () => {
    expect(bookingKind(bk({ rows: [row({}), row({})] }), hotel)).toBe('done');
    expect(bookingKind(bk({ rows: [row({}), row({ status: 'Waitlisted' })] }), hotel)).toBe('open');
    expect(bookingKind(bk({ rows: [row({ status: 'Cancelled' })] }), hotel)).toBe('cancelled');
    expect(bookingKind(bk({ status: 'Confirmed' }), hotel)).toBe('done');
  });
  it('summarises like the Jaipur chart', () => {
    const b = bk({ rows: [row({}), row({}), row({ status: 'Waitlisted' }), row({ status: 'Sold out' }), row({ status: 'Cancelled' })] });
    expect(rowsSummary(b, hotel)).toBe('2 of 4 confirmed · 1 waitlisted · 1 sold out · 1 cancelled');
  });
  it('health counts a booking with rows by its rows', () => {
    expect(seriesHealth([bk({ rows: [row({}), row({})] })], [hotel], 0)).toBe('Hotel 1/1');
  });
});

describe('waitlist rule', () => {
  it('computes arrival minus N days', () => { expect(waitlistDate({ waitlistDays: 60 }, { dateFrom: '2027-01-14' })).toBe('2026-11-15'); });
  it('is null without the rule or date', () => { expect(waitlistDate({ waitlistDays: '' }, { dateFrom: '2027-01-14' })).toBeNull(); expect(waitlistDate({ waitlistDays: 60 }, {})).toBeNull(); });
  it('flags a waitlisted row whose clearing date is near or past', () => {
    const near = bookingAttention([bk({ waitlistDays: 60, rows: [row({ label: '14 Jan', status: 'Waitlisted', dateFrom: '2026-12-20' })] })], [hotel], today);
    expect(near.some(a => /vendor to clear waitlist in 5 days/.test(a.reason))).toBe(true);
    const past = bookingAttention([bk({ waitlistDays: 60, rows: [row({ label: '14 Jan', status: 'Waitlisted', dateFrom: '2026-12-01' })] })], [hotel], today);
    expect(past.some(a => a.level === 'high' && /should have cleared/.test(a.reason))).toBe(true);
  });
  it('stays quiet for a far-off waitlisted date', () => {
    expect(bookingAttention([bk({ waitlistDays: 60, rows: [row({ status: 'Waitlisted', dateFrom: '2027-03-11' })] })], [hotel], today)).toHaveLength(0);
  });
});

describe('other attention rules', () => {
  it('confirmed row without a confirmation number', () => {
    const a = bookingAttention([bk({ rows: [row({ label: 'T1', confirmationNo: '' })] })], [hotel], today);
    expect(a[0].reason).toMatch(/T1: marked Confirmed but has no confirmation number/);
  });
  it('vendor waiting on us, and chase due', () => {
    expect(bookingAttention([bk({ awaiting: 'us' })], [hotel], today)[0].reason).toMatch(/waiting on us/);
    const chase = bookingAttention([bk({ awaiting: 'vendor', followUpDate: '2026-10-10' })], [hotel], today);
    expect(chase[0]).toMatchObject({ level: 'high' }); expect(chase[0].reason).toMatch(/chase was due 6 days ago/);
    expect(bookingAttention([bk({ awaiting: 'vendor', followUpDate: '2026-10-20' })], [hotel], today)).toHaveLength(0);
  });
  it('quoted rate above budget', () => {
    const a = bookingAttention([bk({ rates: [{ label: 'APAI', budget: 5500, quoted: 6050 }, { label: 'MAPAI', budget: 5000, quoted: 5300 }] })], [hotel], today);
    expect(a).toHaveLength(2);
    expect(a[0].reason).toMatch(/APAI quoted ₹6,050 is ₹550 above our budget of ₹5,500/);
    expect(bookingAttention([bk({ rates: [{ label: 'APAI', budget: 6000, quoted: 5900 }] })], [hotel], today)).toHaveLength(0);
  });
  it('row deadline and row starting soon use the row, not the booking', () => {
    const a = bookingAttention([bk({ rows: [row({ label: 'T2', status: 'Waitlisted', dateFrom: '2026-10-20' })] })], [hotel], today);
    expect(a.some(x => /T2: Starts in 4 days/.test(x.reason))).toBe(true);
  });
  it('rateStatus gives the gap', () => {
    expect(rateStatus({ rates: [{ label: 'A', budget: 5000, quoted: 5300 }, { label: 'B', budget: '', quoted: 100 }] }).map(r => r.gap)).toEqual([300, null]);
  });
});

describe('departures and timeline', () => {
  it('a booking is relevant to a departure through its row even without an allocation', () => {
    const b = bk({ rows: [row({ queryId: 'Q1' })] });
    expect(bookingsForDeparture([b], 'Q1')).toHaveLength(1);
    expect(bookingsForDeparture([b], 'Q2')).toHaveLength(0);
    expect(rowsForDeparture(b, 'Q1')).toHaveLength(1);
  });
  it('the timeline spans row dates', () => {
    const tl = timelineBuckets([bk({ rows: [row({ dateFrom: '2026-12-10', dateTo: '2026-12-12' }), row({ dateFrom: '2027-03-18', dateTo: '2027-03-20' })] })]);
    expect(tl.step).toBe(7); expect(tl.cols[0].start).toBe('2026-12-10');
  });
});

describe('mapping', () => {
  it('maps the new booking fields and writes waitlist days and clean rates', () => {
    const b = mapBooking({ id: 'x', series_id: 's', waitlist_days: 60, rates: [{ label: 'APAI', budget: 5500, quoted: 6050 }], awaiting: 'us', follow_up_date: '2026-10-20' });
    expect(b).toMatchObject({ waitlistDays: 60, awaiting: 'us', followUpDate: '2026-10-20' });
    const db = bookingToDb({ ...b, title: 'T', rates: [{ label: ' APAI ', budget: '5500', quoted: '' }, { label: '', budget: '', quoted: '' }] });
    expect(db.waitlist_days).toBe(60);
    expect(db.rates).toEqual([{ label: 'APAI', budget: 5500, quoted: null }]);
    expect(db).not.toHaveProperty('awaiting');
  });
});

function fakeDb() {
  const log = { hist: [], ins: [], upd: [] };
  const db = { from: (t) => {
    const b = { eq: () => b, update: async (p) => { log.upd.push([t, p]); return { error: null }; },
      insert: async (r) => { log.ins.push([t, r]); if (t === 'series_booking_history') log.hist.push(r); return { data: [{ id: 'new' }], error: null }; } };
    return b; } };
  return { db, log };
}
describe('persistence', () => {
  it('changing a row status writes a row_status history line with the row id', async () => {
    const { db, log } = fakeDb();
    const prev = row({ id: 'r1', bookingId: 'b', label: 'T1', status: 'Waitlisted' });
    await saveBookingRow(db, { ...prev, status: 'Confirmed' }, prev, 'Priya');
    expect(log.hist[0]).toMatchObject({ kind: 'row_status', from_status: 'Waitlisted', to_status: 'Confirmed', row_id: 'r1', by_name: 'Priya' });
  });
  it('changing only the confirmation number is recorded too', async () => {
    const { db, log } = fakeDb();
    const prev = row({ id: 'r1', label: 'T1', confirmationNo: '' });
    await saveBookingRow(db, { ...prev, confirmationNo: 'KKR/7607' }, prev, 'P');
    expect(log.hist[0].kind).toBe('row_ref'); expect(log.hist[0].note).toMatch(/KKR\/7607/);
  });
  it('bulk status only touches rows that differ', async () => {
    const { db, log } = fakeDb();
    await bulkSetRowStatus(db, [row({ id: 'a', status: 'Confirmed' }), row({ id: 'b', status: 'Waitlisted' })], 'Confirmed', 'P');
    expect(log.upd.filter(u => u[0] === 'series_booking_rows')).toHaveLength(1);
  });
  it('logging correspondence stores the entry and sets whose turn it is', async () => {
    const { db, log } = fakeDb();
    const r = await addCorrespondence(db, { bookingId: 'b', direction: 'out', summary: 'Sent chart', rowIds: ['r1'], awaiting: 'vendor', followUpDate: '2026-10-19', occurredOn: '2026-10-16' }, 'P');
    expect(r.error).toBeNull();
    expect(log.ins[0][1]).toMatchObject({ booking_id: 'b', direction: 'out', row_ids: ['r1'], by_name: 'P' });
    expect(log.upd[0][1]).toMatchObject({ awaiting: 'vendor', follow_up_date: '2026-10-19', last_contact_on: '2026-10-16' });
  });
  it('clearing the turn also clears the follow-up date; empty entry refused', async () => {
    const { db, log } = fakeDb();
    await addCorrespondence(db, { bookingId: 'b', direction: 'in', summary: 'Confirmed', awaiting: '', followUpDate: '2026-10-19' }, 'P');
    expect(log.upd[0][1]).toMatchObject({ awaiting: null, follow_up_date: null });
    expect((await addCorrespondence(db, { bookingId: 'b', summary: ' ' }, 'P')).error).toMatch(/summary/);
  });
});

describe('charts', () => {
  const b = bk({ title: 'KK Royal, Jaipur', rates: [{ label: 'APAI', budget: 5500, quoted: 6050 }], rows: [
    row({ label: '17-Dec', dateFrom: '2026-12-17', dateTo: '2026-12-19', plan: 'APAI', detail: '12 twin + 2 single', foc: '1', status: 'Confirmed', confirmationNo: 'KKR/7607' }),
    row({ label: '10-Dec', dateFrom: '2026-12-10', dateTo: '2026-12-12', plan: 'APAI', detail: '12 twin + 2 single', status: 'Sold out', confirmationNo: '' })] });
  it('request chart is sorted by date and ends with the budget, no status columns', () => {
    const m = chartModel(b);
    expect(m.head).not.toContain('Status'); expect(m.body[0][1]).toMatch(/10-Dec-26/);
    expect(chartText(b)).toMatch(/Maximum budget: Rs\. 5,500 APAI/);
    expect(chartHtml(b)).toMatch(/<table/);
  });
  it('status chart carries status and confirmation numbers but not the budget', () => {
    const t = chartText(b, { withStatus: true });
    expect(t).toMatch(/KKR\/7607/); expect(t).toMatch(/Sold out/); expect(t).not.toMatch(/Maximum budget/);
  });
  it('escapes html in cells', () => { expect(chartHtml(bk({ rows: [row({ detail: '<b>x</b>' })] }))).toMatch(/&lt;b&gt;/); });
});

const dbRows = {
  series_booking_categories: [{ id: 'h', name: 'Hotel', sort_order: 1, active: true, statuses: [{ name: 'Waitlisted', kind: 'open' }, { name: 'Confirmed', kind: 'done' }] }],
  series_bookings: [{ id: 'b1', series_id: 's1', category_id: 'h', title: 'KK Royal', vendor_name: 'Nouvelle', status: '', waitlist_days: 60, awaiting: 'us', rates: [{ label: 'APAI', budget: 5500, quoted: 6050 }] }],
  series_booking_rows: [
    { id: 'r1', booking_id: 'b1', label: '17-Dec', date_from: '2026-12-17', status: 'Confirmed', confirmation_no: 'KKR/7607' },
    { id: 'r2', booking_id: 'b1', label: '14-Jan', date_from: '2027-01-14', status: 'Waitlisted' }],
  series_booking_correspondence: [{ id: 'c1', booking_id: 'b1', occurred_on: '2026-10-08', direction: 'in', contact: 'Aman', summary: 'Sent chart with confirmation numbers', row_ids: ['r1'] }],
};
vi.mock('../lib/supabase.js', () => ({
  db: { from: (t) => { const b = { select: () => b, eq: () => b, is: () => b, or: () => b, order: () => b, then: (res) => res({ data: dbRows[t] || [], error: null }) }; return b; }, drive: {}, authRpc: vi.fn() },
  realtimeClient: null,
}));

describe('Series bookings screen with rows', () => {
  it('shows the rows summary, rates, waiting-on-us and the logged correspondence', async () => {
    const { default: SeriesBookings } = await import('../components/SeriesBookings.jsx');
    render(<SeriesBookings series={{ id: 's1', name: 'Test' }} queries={[]} vendors={[]} currentUser={{ name: 'Priya' }} />);
    await waitFor(() => expect(screen.getByTestId('series-booking')).toBeTruthy());
    expect(screen.getByTestId('rows-summary').textContent).toBe('1 of 2 confirmed · 1 waitlisted');
    expect(screen.getByText(/APAI: ₹6,050 \(budget ₹5,500, \+₹550\)/)).toBeTruthy();
    expect(screen.getAllByText(/Waiting on us/).length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByTestId('series-booking')).getByText('KK Royal'));
    expect(screen.getAllByTestId('booking-row')).toHaveLength(2);
    expect(screen.getByText('KKR/7607')).toBeTruthy();
    expect(screen.getByTestId('correspondence-entry').textContent).toMatch(/Aman/);
  });
});
