import { describe, it, expect } from 'vitest';
import {
  moveItem, reorderItineraryDays, normalizeDayLabel, getHotelRows, rowMatchesDay, getOvernightHotel,
  hotelRowsForDate, roomingSummary, pickQuotationSourceVersion, quotationToHotelRows,
  mergeQuotationHotelRows, serviceActiveOnDate, blankFlightLeg, isLegFilled, formatFlightLeg,
  sanitizeRichHtml, richHtmlHasContent, getServicesForDate, tourDateRange, addDaysToDateStr,
} from '../lib/tourInfo.js';
import { buildRouteLines, getMovementChartRows, getRunningToursForDate, mapDbTourExecutionRow } from '../lib/utils.js';

describe('moveItem / reorderItineraryDays', () => {
  it('moves an item without mutating the input', () => {
    const a = [1, 2, 3, 4];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(a).toEqual([1, 2, 3, 4]);
  });
  it('ignores out-of-range moves', () => {
    expect(moveItem([1, 2], 0, 5)).toEqual([1, 2]);
    expect(moveItem([1, 2], -1, 0)).toEqual([1, 2]);
  });
  it('keeps dates in their slots and renumbers plain "Day N" labels while content moves', () => {
    const days = [
      { id: 1, dayLabel: 'Day 1', date: '2026-10-01', route: 'Delhi' },
      { id: 2, dayLabel: 'Day 2', date: '2026-10-02', route: 'Agra' },
      { id: 3, dayLabel: 'Day 3', date: '2026-10-03', route: 'Jaipur' },
    ];
    const out = reorderItineraryDays(days, 2, 0);
    expect(out.map(d => d.route)).toEqual(['Jaipur', 'Delhi', 'Agra']);
    expect(out.map(d => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(out.map(d => d.dayLabel)).toEqual(['Day 1', 'Day 2', 'Day 3']);
  });
  it('preserves zero-padded labels and leaves custom labels alone', () => {
    const out = reorderItineraryDays([
      { dayLabel: 'Day 01', date: '' }, { dayLabel: 'Arrival day', date: '' }, { dayLabel: 'Day 03', date: '' },
    ], 0, 1);
    expect(out.map(d => d.dayLabel)).toEqual(['Arrival day', 'Day 02', 'Day 03']);
  });
});

describe('hotel rows', () => {
  it('derives legacy rows from old per-day hotel/rooms with BLANK meals (never the raw cost-sheet string)', () => {
    const te = { days: [{ id: 1, dayLabel: 'Day 1', date: '2026-10-01', hotelName: 'Taj', rooms: '5 Twin', mealPlan: 'B/L-800/D' }, { id: 2, dayLabel: 'Day 2' }] };
    const rows = getHotelRows(te);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hotelName: 'Taj', rooms: '5 Twin', breakfast: '', lunch: '', dinner: '', source: 'legacy' });
  });
  it('uses hotelRows as-is once the new model exists, even if empty', () => {
    expect(getHotelRows({ days: [{ hotelName: 'Taj' }], hotelRows: [] })).toEqual([]);
  });
  it('matches rows to days by date, else by normalised label ("Day 02" == "Day 2")', () => {
    expect(rowMatchesDay({ date: '2026-10-02' }, { date: '2026-10-02' })).toBe(true);
    expect(rowMatchesDay({ date: '2026-10-02' }, { date: '2026-10-03' })).toBe(false);
    expect(rowMatchesDay({ dayLabel: 'Day 02' }, { dayLabel: 'Day 2' })).toBe(true);
    expect(normalizeDayLabel('DAY-02')).toBe('day2');
  });
  it('overnight hotel is the last named row for the day', () => {
    const te = { hotelRows: [
      { dayLabel: 'Day 1', date: '2026-10-01', hotelName: 'Morning Hotel' },
      { dayLabel: 'Day 1', date: '2026-10-01', hotelName: 'Night Hotel' },
    ] };
    expect(getOvernightHotel(te, { date: '2026-10-01' })).toBe('Night Hotel');
    expect(getOvernightHotel(te, { date: '2026-10-09' })).toBe('');
  });
  it('rooming summary lists each distinct hotel once with its rooms', () => {
    const te = { hotelRows: [
      { hotelName: 'A', rooms: '5 Twin' }, { hotelName: 'A', rooms: '5 Twin' }, { hotelName: 'B', rooms: '' },
    ] };
    expect(roomingSummary(te)).toBe('A (5 Twin); B');
  });
  it('hotelRowsForDate matches on a row\'s own date, falling back to day label only for undated rows', () => {
    const te = { hotelRows: [
      { id: 1, date: '2026-10-02', hotelName: 'Dated' },
      { id: 2, date: '', dayLabel: 'Day 2', hotelName: 'Undated' },
      { id: 3, date: '2026-10-03', hotelName: 'Other day' },
    ] };
    const rows = hotelRowsForDate(te, '2026-10-02', { dayLabel: 'Day 2' });
    expect(rows.map(r => r.hotelName)).toEqual(['Dated', 'Undated']);
  });
});

describe('quotation -> hotel rows', () => {
  const quotation = {
    itinerary: [
      { day: 'Day 01', date: '2026-10-01', movement: 'Delhi', bf: '', lunch: 'Restaurant X', dinner: 'At Hotel' },
      { day: 'Day 02', date: '', movement: 'Agra', bf: 'At Hotel', lunch: '', dinner: 'At Hotel' },
      { day: 'Day 03', date: '', movement: 'Depart', bf: 'At Hotel', lunch: '', dinner: '' },
    ],
    hotels: [{ place: 'Delhi', nights: '1', hotel: 'Hotel Delhi' }, { place: 'Agra', nights: 1, hotel: 'Hotel Agra' }],
  };
  it('expands per-stay hotels across days, takes meals from the quotation, leaves rooming blank', () => {
    const rows = quotationToHotelRows(quotation, '2026-10-01');
    expect(rows.map(r => r.hotelName)).toEqual(['Hotel Delhi', 'Hotel Agra', '']);
    expect(rows[0]).toMatchObject({ breakfast: '', lunch: 'Restaurant X', dinner: 'At Hotel', rooms: '', source: 'quotation' });
    expect(rows[2]).toMatchObject({ breakfast: 'At Hotel' }); // departure day keeps its meals
  });
  it('fills missing dates from the tour start, one per day', () => {
    expect(quotationToHotelRows(quotation, '2026-10-01').map(r => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
  it('prefers the version marked final, else the latest', () => {
    expect(pickQuotationSourceVersion([{ version: 1, isFinal: true }, { version: 2 }])).toMatchObject({ isFinal: true, version: { version: 1 } });
    expect(pickQuotationSourceVersion([{ version: 1 }, { version: 2 }])).toMatchObject({ isFinal: false, version: { version: 2 } });
    expect(pickQuotationSourceVersion([])).toBeNull();
  });
  it('re-sync replaces quotation/legacy rows, keeps manual rows after their day, and carries rooming over', () => {
    const fresh = quotationToHotelRows(quotation, '2026-10-01');
    const existing = [
      { id: 'a', date: '2026-10-01', hotelName: 'Hotel Delhi', rooms: '5 Twin', source: 'quotation' },
      { id: 'm', date: '2026-10-01', hotelName: 'Airport lounge', rooms: '', source: 'manual' },
      { id: 'old', date: '2026-10-02', hotelName: 'Gone', rooms: '2 Sgl', source: 'legacy' },
    ];
    const out = mergeQuotationHotelRows(existing, fresh);
    expect(out.map(r => r.id)).toEqual(['qt-0', 'm', 'qt-1', 'qt-2']);
    expect(out[0].rooms).toBe('5 Twin');
    expect(out[2].rooms).toBe('2 Sgl'); // same day, hotel changed -> rooming kept
  });
  it('a manual row for a day the quotation does not cover is kept at the end', () => {
    const out = mergeQuotationHotelRows([{ id: 'm', date: '2026-12-25', source: 'manual' }], quotationToHotelRows(quotation, '2026-10-01'));
    expect(out[out.length - 1].id).toBe('m');
  });
});

describe('service date windows (no dates => not shown)', () => {
  it('is active inside the window, inclusive of both ends', () => {
    const e = { startDate: '2026-10-02', endDate: '2026-10-04' };
    expect(serviceActiveOnDate(e, '2026-10-01')).toBe(false);
    expect(serviceActiveOnDate(e, '2026-10-02')).toBe(true);
    expect(serviceActiveOnDate(e, '2026-10-04')).toBe(true);
    expect(serviceActiveOnDate(e, '2026-10-05')).toBe(false);
  });
  it('one date only means that single day', () => {
    expect(serviceActiveOnDate({ startDate: '2026-10-02' }, '2026-10-02')).toBe(true);
    expect(serviceActiveOnDate({ endDate: '2026-10-02' }, '2026-10-03')).toBe(false);
  });
  it('NO dates at all means never active', () => {
    expect(serviceActiveOnDate({ vendorId: 'v1' }, '2026-10-02')).toBe(false);
    expect(serviceActiveOnDate({ startDate: '', endDate: '' }, '2026-10-02')).toBe(false);
  });
});

describe('flight legs', () => {
  it('formats a leg like "AI 101 · DEL 06:30 → BKK 12:10"', () => {
    expect(formatFlightLeg({ number: 'AI 101', from: 'DEL', fromTime: '06:30', to: 'BKK', toTime: '12:10' })).toBe('AI 101 · DEL 06:30 → BKK 12:10');
    expect(formatFlightLeg(null)).toBe('');
  });
  it('a blank leg is not "filled"', () => {
    expect(isLegFilled(blankFlightLeg('2026-10-01'))).toBe(false);
    expect(isLegFilled({ ...blankFlightLeg(), number: 'AI 1' })).toBe(true);
  });
});

describe('sanitizeRichHtml', () => {
  it('keeps basic formatting', () => {
    expect(sanitizeRichHtml('<p><b>Bold</b> and <i>it</i></p><ul><li>x</li></ul>')).toBe('<p><b>Bold</b> and <i>it</i></p><ul><li>x</li></ul>');
  });
  it('drops scripts, event handlers and javascript: links', () => {
    const out = sanitizeRichHtml('<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="x()">hi</a>');
    expect(out).not.toMatch(/script|onerror|onclick|javascript:/i);
    expect(out).toContain('hi');
  });
  it('keeps safe links (opened in a new tab) and highlight colours, strips unsafe styles', () => {
    const out = sanitizeRichHtml('<a href="https://example.com">l</a><span style="background-color: yellow; position: fixed">m</span>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('background-color: yellow');
    expect(out).not.toContain('position');
  });
  it('returns "" for empty input, and detects empty rich text', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(richHtmlHasContent('<p><br></p>')).toBe(false);
    expect(richHtmlHasContent('<p>Dinner at 8</p>')).toBe(true);
  });
});

describe('dates', () => {
  it('tourDateRange runs arrival through departure', () => {
    expect(tourDateRange({ travelDate: '2026-10-01', nights: 3 })).toEqual({ start: '2026-10-01', end: '2026-10-04' });
    expect(tourDateRange({})).toEqual({ start: '', end: '' });
  });
  it('addDaysToDateStr crosses month ends', () => {
    expect(addDaysToDateStr('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDateStr('', 1)).toBe('');
  });
});

describe('getServicesForDate', () => {
  const vendors = [{ id: 'v1', name: 'Rajesh' }, { id: 'v2', name: 'Amit' }];
  const te = {
    facilitators: [{ vendorId: 'v1', startDate: '2026-10-01', endDate: '2026-10-03' }, { vendorId: 'v2' }],
    localHandlers: [{ vendorId: 'v2', sector: 'Agra', notes: 'Meet at hotel', startDate: '2026-10-02', endDate: '2026-10-02' }],
    transporters: [],
    flights: [{ date: '2026-10-02', type: 'Train', number: '12002', from: 'NDLS', to: 'AGC' }, { date: '2026-10-03', number: 'X' }],
    arrFlight: { date: '2026-10-01', number: 'AI 1', from: 'BOM', to: 'DEL' },
    depFlight: { date: '2026-10-04', number: 'AI 2' },
    otherServices: [
      { startDate: '2026-10-02', endDate: '2026-10-02', detailsHtml: '<p>Cooking class</p>' },
      { startDate: '2026-10-02', endDate: '2026-10-02', detailsHtml: '<p><br></p>' },
    ],
  };
  it('returns only what is on the ground that date', () => {
    const s = getServicesForDate(te, vendors, '2026-10-02');
    expect(s.facilitators.map(f => f.name)).toEqual(['Rajesh']); // v2 has no dates -> hidden
    expect(s.localHandlers[0]).toMatchObject({ name: 'Amit', sector: 'Agra' });
    expect(s.legs).toHaveLength(1);
    expect(s.arrival).toBeNull();
    expect(s.other).toHaveLength(1); // the empty editor is ignored
  });
  it('shows arrival and departure legs on their own dates', () => {
    expect(getServicesForDate(te, vendors, '2026-10-01').arrival.number).toBe('AI 1');
    expect(getServicesForDate(te, vendors, '2026-10-04').departure.number).toBe('AI 2');
  });
});

describe('utils consumers of the new model', () => {
  it('buildRouteLines still defaults to the day hotelName, and accepts a lookup', () => {
    const days = [{ route: 'Delhi - Agra', hotelName: 'Old' }];
    expect(buildRouteLines(days)).toEqual(['DELHI', 'AGRA - Old']);
    expect(buildRouteLines(days, () => 'New')).toEqual(['DELHI', 'AGRA - New']);
  });
  it('Movement Chart reads hotels from hotel rows and prefers a structured flight leg over the old text', () => {
    const queries = [{ id: 'q1', tourFileId: 'T1', status: 'operations', travelDate: '2026-10-01', nights: 2 }];
    const te = { q1: {
      days: [{ date: '2026-10-01', dayLabel: 'Day 1', route: 'Delhi - Agra', hotelName: 'Stale' }],
      hotelRows: [{ date: '2026-10-01', dayLabel: 'Day 1', hotelName: 'Fresh', rooms: '2 Twin' }],
      arrFlight: { number: 'AI 1', from: 'BOM', to: 'DEL' }, arrFlightDetails: 'old text',
      depFlightDetails: 'dep old text',
    } };
    const rows = getMovementChartRows(queries, [], 2026, 9, te, []);
    expect(rows[0].routeLines).toEqual(['DELHI', 'AGRA - Fresh']);
    expect(rows[0].rooming).toBe('Fresh (2 Twin)');
    expect(rows[0].arrFlight).toBe('AI 1 · BOM → DEL');
    expect(rows[0].depFlight).toBe('dep old text');
  });
  it('Ground View query returns date-matched hotels and services', () => {
    const queries = [{ id: 'q1', tourFileId: 'T1', status: 'operations', travelDate: '2026-10-01', nights: 2 }];
    const te = { q1: {
      days: [], hotelRows: [{ id: 'a', date: '2026-10-02', hotelName: 'H', breakfast: 'At hotel' }, { id: 'b', date: '2026-10-03', hotelName: 'Z' }],
      facilitators: [{ vendorId: 'v1', startDate: '2026-10-02', endDate: '2026-10-02' }],
    } };
    const r = getRunningToursForDate(queries, te, [{ id: 'v1', name: 'Rajesh' }], '2026-10-02')[0];
    expect(r.hotels.map(h => h.hotelName)).toEqual(['H']);
    expect(r.facilitatorNames).toEqual(['Rajesh']);
    expect(getRunningToursForDate(queries, te, [{ id: 'v1', name: 'Rajesh' }], '2026-10-03')[0].facilitatorNames).toEqual([]);
  });
  it('mapDbTourExecutionRow reads the extras column, and tolerates its absence', () => {
    const withExtras = mapDbTourExecutionRow({ query_id: 'q', extras: { hotelRows: [{ id: 1 }], otherServices: [{ id: 2 }], arrFlight: { number: 'A' }, syncedFromQuotationVersion: 3 } });
    expect(withExtras.hotelRows).toHaveLength(1);
    expect(withExtras.otherServices).toHaveLength(1);
    expect(withExtras.syncedFromQuotationVersion).toBe(3);
    const without = mapDbTourExecutionRow({ query_id: 'q' });
    expect(without.hotelRows).toBeUndefined(); // undefined => legacy view still works
    expect(without.otherServices).toEqual([]);
    expect(without.arrFlight).toBeNull();
  });
});
