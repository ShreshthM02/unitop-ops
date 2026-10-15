import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { bookingAttention, lineUsage, seriesHealth, statusKind, daysBetween, mapBookingCategory, bookingToDb, saveSeriesBooking, timelineBuckets, coversColumn, bookingsForDeparture } from '../lib/seriesManager.js';

describe('timeline and per-departure helpers', () => {
  it('uses day columns for a short span and week columns for a long one', () => {
    const short = timelineBuckets([{ dateFrom: '2026-11-01', dateTo: '2026-11-05' }]);
    expect(short.step).toBe(1); expect(short.cols).toHaveLength(5);
    const long = timelineBuckets([{ dateFrom: '2026-11-01', dateTo: '2027-02-01' }]);
    expect(long.step).toBe(7);
  });
  it('returns null when nothing has a date', () => { expect(timelineBuckets([{ title: 'x' }])).toBeNull(); });
  it('a booking covers a column when its dates overlap it', () => {
    const col = { start: '2026-11-03', end: '2026-11-03' };
    expect(coversColumn({ dateFrom: '2026-11-01', dateTo: '2026-11-05' }, col)).toBe(true);
    expect(coversColumn({ dateFrom: '2026-11-04', dateTo: '2026-11-05' }, col)).toBe(false);
    expect(coversColumn({ dateFrom: '2026-11-03' }, col)).toBe(true);
  });
  it('bookingsForDeparture includes ones allocated to that file or to the whole series', () => {
    const bs = [{ id: 'a', allocations: [{ queryId: 'Q1' }] }, { id: 'b', allocations: [{ queryId: 'Q2' }] }, { id: 'c', allocations: [{ queryId: '' }] }, { id: 'd', allocations: [] }];
    expect(bookingsForDeparture(bs, 'Q1').map(b => b.id)).toEqual(['a', 'c']);
  });
});

const hotel = mapBookingCategory({ id: 'c-hotel', name: 'Hotel', statuses: [
  { name: 'Enquiry sent', kind: 'open' }, { name: 'Held (option)', kind: 'open' }, { name: 'Confirmed', kind: 'done' }, { name: 'Cancelled', kind: 'cancelled' }] });
const flight = mapBookingCategory({ id: 'c-flight', name: 'Flight', statuses: [{ name: 'Held', kind: 'open' }, { name: 'Ticketed', kind: 'done' }] });
const base = { id: 'b1', categoryId: 'c-hotel', title: 'Hotel Imperial', status: 'Held (option)', dateFrom: '', deadlineDate: '', deadlineLabel: '', lines: [], allocations: [] };

describe('statusKind / daysBetween', () => {
  it('reads the kind from the editable list and falls back to a cancel check', () => {
    expect(statusKind(hotel, 'Confirmed')).toBe('done');
    expect(statusKind(hotel, 'Held (option)')).toBe('open');
    expect(statusKind(null, 'Cancelled by vendor')).toBe('cancelled');
  });
  it('counts whole days', () => { expect(daysBetween('2026-10-15', '2026-10-20')).toBe(5); });
});

describe('lineUsage', () => {
  it('compares blocked with allocated per item, case-insensitively, and flags over-allocation', () => {
    const u = lineUsage({ lines: [{ item: 'Deluxe Double', qty: 20 }], allocations: [{ item: 'deluxe double', qty: 14 }, { item: 'Deluxe Double', qty: 8 }] });
    expect(u).toEqual([{ item: 'Deluxe Double', blocked: 20, used: 22, over: true, left: -2 }]);
  });
  it('shows allocated items that were never listed as blocked', () => {
    expect(lineUsage({ lines: [], allocations: [{ item: 'Suite', qty: 2 }] })[0]).toMatchObject({ blocked: 0, used: 2, over: true });
  });
});

describe('bookingAttention', () => {
  const today = '2026-10-15';
  it('flags an overdue deadline on an open booking as high, and ignores confirmed ones', () => {
    const a = bookingAttention([{ ...base, deadlineDate: '2026-10-13', deadlineLabel: 'Option release' }, { ...base, id: 'b2', status: 'Confirmed', deadlineDate: '2026-10-13' }], [hotel], today);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ bookingId: 'b1', level: 'high' });
    expect(a[0].reason).toMatch(/Option release passed 2 days ago/);
  });
  it('flags a deadline coming up within a week, but not one far away', () => {
    expect(bookingAttention([{ ...base, deadlineDate: '2026-10-19' }], [hotel], today)[0].reason).toMatch(/in 4 days/);
    expect(bookingAttention([{ ...base, deadlineDate: '2026-12-01' }], [hotel], today)).toHaveLength(0);
  });
  it('flags an open booking starting soon', () => {
    expect(bookingAttention([{ ...base, dateFrom: '2026-10-20' }], [hotel], today)[0].reason).toMatch(/Starts in 5 days/);
  });
  it('flags a cancelled booking that still has departures allocated', () => {
    const a = bookingAttention([{ ...base, status: 'Cancelled', allocations: [{ qty: 3, item: 'Room' }] }], [hotel], today);
    expect(a[0].reason).toMatch(/Cancelled, but departures/);
  });
  it('puts high-priority items first', () => {
    const a = bookingAttention([{ ...base, id: 'm', deadlineDate: '2026-10-20' }, { ...base, id: 'h', deadlineDate: '2026-10-14' }], [hotel], today);
    expect(a[0].bookingId).toBe('h');
  });
});

describe('seriesHealth', () => {
  it('summarises confirmed vs total per category, skipping cancelled, and adds the attention count', () => {
    const line = seriesHealth([
      { ...base, status: 'Confirmed' }, { ...base, id: 'b2' }, { ...base, id: 'b3', status: 'Cancelled' },
      { id: 'f', categoryId: 'c-flight', status: 'Ticketed', lines: [], allocations: [] }], [hotel, flight], 2);
    expect(line).toBe('Hotel 1/2 · Flight 1/1 · 2 need attention');
  });
});

describe('persistence', () => {
  it('bookingToDb drops blank lines and coerces quantities', () => {
    const p = bookingToDb({ ...base, seriesId: 's1', lines: [{ item: ' Suite ', qty: '3' }, { item: '', qty: 9 }] });
    expect(p.lines).toEqual([{ item: 'Suite', qty: 3 }]);
    expect(p.series_id).toBe('s1');
  });
  it('saving an edit that changes status writes a history entry; a brand-new booking writes "created"', async () => {
    const hist = [];
    const db = {
      from: (t) => {
        const b = { eq: () => b, update: async () => ({ error: null }), insert: async (row) => { if (t === 'series_booking_history') hist.push(row); return { data: [{ id: 'new-id' }], error: null }; } };
        return b;
      },
    };
    await saveSeriesBooking(db, { ...base, seriesId: 's1', status: 'Confirmed' }, { ...base, status: 'Held (option)' }, 'Priya');
    expect(hist[0]).toMatchObject({ kind: 'status', from_status: 'Held (option)', to_status: 'Confirmed', by_name: 'Priya' });
    const r = await saveSeriesBooking(db, { ...base, id: undefined, seriesId: 's1' }, null, 'Priya');
    expect(r.id).toBe('new-id');
    expect(hist[1].kind).toBe('created');
  });
  it('refuses a booking with no title', async () => {
    expect((await saveSeriesBooking({}, { ...base, title: '  ', seriesId: 's' }, null, 'x')).error).toMatch(/title/);
  });
  it('tells the user to run the migration when the tables are missing', async () => {
    const db = { from: () => { const b = { eq: () => b, update: async () => ({ error: { message: 'relation "series_bookings" does not exist 42P01' } }) }; return b; } };
    expect((await saveSeriesBooking(db, { ...base, seriesId: 's' }, base, 'x')).error).toMatch(/migration/);
  });
});

const rows = {
  series_booking_categories: [{ id: 'c-hotel', name: 'Hotel', sort_order: 1, active: true, statuses: [{ name: 'Held (option)', kind: 'open' }, { name: 'Confirmed', kind: 'done' }] }],
  series_bookings: [{ id: 'b1', series_id: 's1', category_id: 'c-hotel', title: 'Hotel Imperial block', vendor_name: 'Hotel Imperial', reference: 'CNF123', status: 'Held (option)', deadline_date: '2020-01-01', deadline_label: 'Option release', lines: [{ item: 'Deluxe Double', qty: 20 }] }],
  series_booking_allocations: [{ id: 'a1', booking_id: 'b1', query_id: 'Q1', item: 'Deluxe Double', qty: 14 }],
  series_booking_history: [],
};
vi.mock('../lib/supabase.js', () => ({
  db: {
    from: (t) => { const b = { select: () => b, eq: () => b, is: () => b, or: () => b, order: () => b, then: (res) => res({ data: rows[t] || [], error: null }) }; return b; },
    drive: {}, authRpc: vi.fn(),
  },
  realtimeClient: null,
}));

describe('SeriesBookings screen', () => {
  beforeEach(() => vi.clearAllMocks());
  it('lists a booking with its blocked/used counts and surfaces the overdue deadline', async () => {
    const { default: SeriesBookings } = await import('../components/SeriesBookings.jsx');
    const onCount = vi.fn();
    render(<SeriesBookings series={{ id: 's1', name: 'Test' }} queries={[{ id: 'Q1', seriesId: 's1', tourFileId: 'UT-1', groupName: 'G' }]} vendors={[]} currentUser={{ name: 'Priya' }} onAttentionCount={onCount} />);
    await waitFor(() => expect(screen.getByTestId('series-booking')).toBeTruthy());
    expect(screen.getByText('Deluxe Double: 14/20')).toBeTruthy();
    expect(screen.getByText(/Needs attention \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Option release passed/)).toBeTruthy();
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1, expect.stringContaining('Hotel 0/1')));
  });
  it('opens the new-booking form with the category statuses', async () => {
    const { default: SeriesBookings } = await import('../components/SeriesBookings.jsx');
    render(<SeriesBookings series={{ id: 's1', name: 'Test' }} queries={[]} vendors={[]} currentUser={{ name: 'Priya' }} />);
    await waitFor(() => expect(screen.getByText('+ New booking')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New booking'));
    expect(screen.getByText('New booking')).toBeTruthy();
    const status = screen.getByLabelText('Status');
    expect(Array.from(status.options).map(o => o.value)).toEqual(['Held (option)', 'Confirmed']);
  });
});
