import { describe, it, expect, vi } from 'vitest';
import { blankTourExecution, mapDbTourExecutionRow, mergeTourExecutionRows, saveTourExecutionToDB } from '../lib/utils.js';

describe('blankTourExecution', () => {
  it('returns an empty-but-valid shape for a query with no data yet', () => {
    const blank = blankTourExecution('UTQ-2026-100');
    expect(blank.queryId).toBe('UTQ-2026-100');
    expect(blank.days).toEqual([]);
    expect(blank.facilitators).toEqual([]);
    expect(blank.localHandlers).toEqual([]);
    expect(blank.flights).toEqual([]);
  });
});

describe('mapDbTourExecutionRow', () => {
  it('maps snake_case DB fields to camelCase, defaulting null jsonb arrays to []', () => {
    const row = { query_id: 'UTQ-2026-100', days: null, facilitators: [{id:1,vendorId:'VND-003',sector:'Bodhgaya'}], local_handlers: null, flights: null, arr_flight_details: 'AI-101', dep_flight_details: null, transporter_vendor_id: 'VND-010', transporter_notes: 'Confirmed' };
    const mapped = mapDbTourExecutionRow(row);
    expect(mapped.days).toEqual([]);
    expect(mapped.facilitators).toEqual([{id:1,vendorId:'VND-003',sector:'Bodhgaya'}]);
    expect(mapped.localHandlers).toEqual([]);
    expect(mapped.arrFlightDetails).toBe('AI-101');
    expect(mapped.depFlightDetails).toBe('');
    expect(mapped.transporterVendorId).toBe('VND-010');
  });
});

describe('mergeTourExecutionRows', () => {
  it('keys the map by query_id and handles multiple rows independently', () => {
    const rows = [
      { query_id: 'A', days: [{id:1,dayLabel:'Day 1'}], facilitators: [], local_handlers: [], flights: [] },
      { query_id: 'B', days: [], facilitators: [{id:1,vendorId:'VND-003'}], local_handlers: [], flights: [] },
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
  it('upserts with correct snake_case field mapping', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    const data = {
      queryId: 'UTQ-2026-100',
      days: [{id:1,dayLabel:'Day 1',date:'2026-08-10',route:'Delhi-Agra',hotelName:'Taj View',rooms:'5 Twin',notes:''}],
      facilitators: [{id:1,vendorId:'VND-003',sector:'Bodhgaya'}],
      localHandlers: [{id:1,vendorId:'VND-020',sector:'Rajgir',notes:''}],
      flights: [{id:1,date:'2026-08-12',type:'Flight',number:'6E123',from:'DEL',to:'VNS',time:'10:00'}],
      arrFlightDetails: 'AI-101 10:00', depFlightDetails: 'AI-102 18:00',
      transporterVendorId: 'VND-010', transporterNotes: 'Confirmed A/C coach',
    };
    await saveTourExecutionToDB(db, data);
    expect(upsert).toHaveBeenCalledWith({
      query_id: 'UTQ-2026-100',
      days: data.days, facilitators: data.facilitators, local_handlers: data.localHandlers, flights: data.flights,
      arr_flight_details: 'AI-101 10:00', dep_flight_details: 'AI-102 18:00',
      transporter_vendor_id: 'VND-010', transporter_notes: 'Confirmed A/C coach',
    });
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveTourExecutionToDB(db, blankTourExecution('X'))).resolves.toBeUndefined();
  });

  it('sends null for empty optional text fields rather than empty strings', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveTourExecutionToDB(db, blankTourExecution('UTQ-X'));
    const call = upsert.mock.calls[0][0];
    expect(call.arr_flight_details).toBeNull();
    expect(call.transporter_vendor_id).toBeNull();
  });
});
