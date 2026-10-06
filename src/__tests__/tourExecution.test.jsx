import { describe, it, expect, vi } from 'vitest';
import { blankTourExecution, mapDbTourExecutionRow, mergeTourExecutionRows, saveTourExecutionToDB } from '../lib/utils.js';

describe('blankTourExecution', () => {
  it('returns an empty-but-valid shape for a query with no data yet', () => {
    const blank = blankTourExecution('UTQ-2026-100');
    expect(blank.queryId).toBe('UTQ-2026-100');
    expect(blank.days).toEqual([]);
    expect(blank.facilitators).toEqual([]);
    expect(blank.localHandlers).toEqual([]);
    expect(blank.transporters).toEqual([]); // now a list, matching Local Handler's shape
    expect(blank.flights).toEqual([]);
  });
});

describe('mapDbTourExecutionRow', () => {
  it('maps snake_case DB fields to camelCase, defaulting null jsonb arrays to []', () => {
    const row = { query_id: 'UTQ-2026-100', days: null, facilitators: [{id:1,vendorId:'VND-003',sector:'Bodhgaya'}], local_handlers: null, transporters: [{id:1,vendorId:'VND-010',sector:'Delhi',notes:'A/C coach'}], flights: null, arr_flight_details: 'AI-101', dep_flight_details: null };
    const mapped = mapDbTourExecutionRow(row);
    expect(mapped.days).toEqual([]);
    expect(mapped.facilitators).toEqual([{id:1,vendorId:'VND-003',sector:'Bodhgaya'}]);
    expect(mapped.localHandlers).toEqual([]);
    expect(mapped.transporters).toEqual([{id:1,vendorId:'VND-010',sector:'Delhi',notes:'A/C coach'}]);
    expect(mapped.arrFlightDetails).toBe('AI-101');
    expect(mapped.depFlightDetails).toBe('');
  });

  it('defaults transporters to [] when null (multiple transporters per sector, like Local Handler)', () => {
    const mapped = mapDbTourExecutionRow({ query_id: 'X', transporters: null });
    expect(mapped.transporters).toEqual([]);
  });
});

describe('mergeTourExecutionRows', () => {
  it('keys the map by query_id and handles multiple rows independently', () => {
    const rows = [
      { query_id: 'A', days: [{id:1,dayLabel:'Day 1'}], facilitators: [], local_handlers: [], transporters: [], flights: [] },
      { query_id: 'B', days: [], facilitators: [{id:1,vendorId:'VND-003'}], local_handlers: [], transporters: [], flights: [] },
    ];
    const map = mergeTourExecutionRows(rows);
    expect(map['A'].days.length).toBe(1);
    expect(map['B'].facilitators.length).toBe(1);
    expect(map['A'].facilitators.length).toBe(0);
  });

  it('returns an empty object when there are no rows at all', () => {
    expect(mergeTourExecutionRows([])).toEqual({});
    expect(mergeTourExecutionRows(null)).toEqual({});
  });
});

describe('saveTourExecutionToDB', () => {
  it('upserts with correct snake_case field mapping, transporters as a list, flights with fromTime/toTime', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    const data = {
      queryId: 'UTQ-2026-100',
      days: [{id:1,dayLabel:'Day 1',date:'2026-08-10',route:'Delhi-Agra',hotelName:'Taj View',rooms:'5 Twin',notes:''}],
      facilitators: [{id:1,vendorId:'VND-003',sector:'Bodhgaya'}],
      localHandlers: [{id:1,vendorId:'VND-020',sector:'Rajgir',notes:''}],
      transporters: [{id:1,vendorId:'VND-010',sector:'Delhi',notes:'Confirmed A/C coach'}],
      flights: [{id:1,date:'2026-08-12',type:'Flight',number:'6E123',from:'DEL',fromTime:'10:00',to:'VNS',toTime:'11:30'}],
      arrFlightDetails: 'AI-101 10:00', depFlightDetails: 'AI-102 18:00',
    };
    await saveTourExecutionToDB(db, data);
    expect(upsert).toHaveBeenCalledWith({
      query_id: 'UTQ-2026-100',
      days: data.days, facilitators: data.facilitators, local_handlers: data.localHandlers,
      transporters: data.transporters, flights: data.flights,
      arr_flight_details: 'AI-101 10:00', dep_flight_details: 'AI-102 18:00',
      synced_from_cost_sheet_version: null,
      // Everything added by the 2026-10-06 restructure lives in one jsonb
      // column. hotelRows is left OUT when the record never used the new
      // tab (undefined), so old per-day hotels keep showing as legacy rows.
      extras: { otherServices: [], arrFlight: null, depFlight: null, syncedFromQuotationVersion: null },
    });
    // Confirm the flight leg actually carries both timing fields through untouched
    const savedFlight = upsert.mock.calls[0][0].flights[0];
    expect(savedFlight.fromTime).toBe('10:00');
    expect(savedFlight.toTime).toBe('11:30');
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    // Doesn't throw, but no longer hides the failure either: it reports it,
    // so the app can tell the user (an unmigrated database looks exactly
    // like this).
    await expect(saveTourExecutionToDB(db, blankTourExecution('X'))).resolves.toEqual({ error: 'fail' });
  });

  it('returns the database error when the upsert is rejected rather than thrown', async () => {
    const db = { from: () => ({ upsert: async () => ({ data: null, error: { message: 'column "extras" does not exist' } }) }) };
    expect(await saveTourExecutionToDB(db, blankTourExecution('X'))).toEqual({ error: 'column "extras" does not exist' });
  });

  it('returns { error: null } on success', async () => {
    const db = { from: () => ({ upsert: async () => ({ data: [], error: null }) }) };
    expect(await saveTourExecutionToDB(db, blankTourExecution('X'))).toEqual({ error: null });
  });

  it('writes hotel rows, other services, arrival/departure legs and the quotation sync marker into extras', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveTourExecutionToDB(db, {
      ...blankTourExecution('Q'), hotelRows: [{ id: 'a', hotelName: 'H' }],
      otherServices: [{ id: 1, startDate: '2026-10-01', endDate: '2026-10-02', detailsHtml: '<p>x</p>' }],
      arrFlight: { number: 'AI 1' }, depFlight: { number: 'AI 2' }, syncedFromQuotationVersion: 3,
    });
    expect(upsert.mock.calls[0][0].extras).toEqual({
      hotelRows: [{ id: 'a', hotelName: 'H' }],
      otherServices: [{ id: 1, startDate: '2026-10-01', endDate: '2026-10-02', detailsHtml: '<p>x</p>' }],
      arrFlight: { number: 'AI 1' }, depFlight: { number: 'AI 2' }, syncedFromQuotationVersion: 3,
    });
  });

  it('an empty hotelRows array IS saved (the user deliberately removed every row)', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    await saveTourExecutionToDB({ from: () => ({ upsert }) }, { ...blankTourExecution('Q'), hotelRows: [] });
    expect(upsert.mock.calls[0][0].extras.hotelRows).toEqual([]);
  });

  it('round-trips through the mapper', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const original = { ...blankTourExecution('Q'), hotelRows: [{ id: 'a', hotelName: 'H' }], arrFlight: { number: 'AI 1' }, syncedFromQuotationVersion: 2 };
    await saveTourExecutionToDB({ from: () => ({ upsert }) }, original);
    const row = upsert.mock.calls[0][0];
    const back = mapDbTourExecutionRow({ ...row });
    expect(back.hotelRows).toEqual(original.hotelRows);
    expect(back.arrFlight).toEqual(original.arrFlight);
    expect(back.syncedFromQuotationVersion).toBe(2);
  });

  it('sends null for empty optional text fields rather than empty strings', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveTourExecutionToDB(db, blankTourExecution('UTQ-X'));
    const call = upsert.mock.calls[0][0];
    expect(call.arr_flight_details).toBeNull();
    expect(call.transporters).toEqual([]); // empty list, not null -- consistent with other list fields
  });
});
