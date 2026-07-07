import { describe, it, expect } from 'vitest';
import { mapDbQueryRow, applyQueryRealtimeEvent } from '../lib/utils.js';

const dbRow = {
  id: 'UTQ-2026-070',
  agent_id: null, agent_company: 'Test Agent Co', agent_country: 'Singapore', correspondent: 'John Doe',
  group_name: 'Test Group', client_name: null, sector: 'Rajasthan', nights: 7,
  hotel_cat: '4 Star', pax_known: true, pax_exact: 12, pax_min: null, pax_max: null,
  pax_display: '12 Pax', date_known: true, travel_date_from: '2026-12-01T00:00:00',
  travel_month: null, travel_season: null, date_display: 'Dec 2026',
  status: 'operations', cancelled: false, cancellation_reason: null,
  tour_file_id: 'TF-2026-070', notes: 'Test notes', manual_wf: ['step1'],
  date: '2026-06-01', created_at: '2026-06-01T10:00:00', assigned_to: null,
};

describe('mapDbQueryRow', () => {
  it('converts snake_case DB fields to the camelCase shape the app uses', () => {
    const mapped = mapDbQueryRow(dbRow);
    expect(mapped.agentCompany).toBe('Test Agent Co');
    expect(mapped.groupName).toBe('Test Group');
    expect(mapped.clientName).toBe('Test Group'); // falls back to group_name when client_name is null
    expect(mapped.destination).toBe('Rajasthan'); // destination mirrors sector
    expect(mapped.tourFileId).toBe('TF-2026-070');
    expect(mapped.manualWF).toEqual(['step1']);
  });

  it('parses travel_date_from into a plain YYYY-MM-DD travelDate', () => {
    const mapped = mapDbQueryRow(dbRow);
    expect(mapped.travelDate).toBe('2026-12-01');
  });

  it('falls back to travel_month when travel_date_from is null', () => {
    const mapped = mapDbQueryRow({ ...dbRow, travel_date_from: null, travel_month: 'December 2026' });
    expect(mapped.travelDate).toBe('December 2026');
  });

  it('does not set audit/remarks -- caller is responsible for those', () => {
    const mapped = mapDbQueryRow(dbRow);
    expect(mapped.audit).toBeUndefined();
    expect(mapped.remarks).toBeUndefined();
  });
});

describe('applyQueryRealtimeEvent (pure reducer, no live connection needed)', () => {
  const existingQueries = [
    { id: 'UTQ-2026-001', groupName: 'Existing Group', status: 'new_query', audit: [{by:'A',at:'t',action:'created'}], remarks: [{by:'A',at:'t',text:'note'}] },
    { id: 'UTQ-2026-002', groupName: 'Other Group', status: 'costing', audit: [], remarks: [] },
  ];

  it('INSERT adds a new query to the front of the list, with empty audit/remarks', () => {
    const result = applyQueryRealtimeEvent(existingQueries, 'INSERT', dbRow, null);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('UTQ-2026-070');
    expect(result[0].audit).toEqual([]);
    expect(result[0].remarks).toEqual([]);
  });

  it('UPDATE replaces the matching query\'s fields but PRESERVES existing audit/remarks (a queries-table update never touches those tables)', () => {
    const updatedRow = { ...dbRow, id: 'UTQ-2026-001', status: 'operations' };
    const result = applyQueryRealtimeEvent(existingQueries, 'UPDATE', updatedRow, { id: 'UTQ-2026-001' });
    const updated = result.find(q => q.id === 'UTQ-2026-001');
    expect(updated.status).toBe('operations');
    expect(updated.audit).toEqual([{by:'A',at:'t',action:'created'}]);
    expect(updated.remarks).toEqual([{by:'A',at:'t',text:'note'}]);
    expect(result.length).toBe(2);
  });

  it('UPDATE for a query not yet in local state adds it (covers a client that missed the INSERT)', () => {
    const result = applyQueryRealtimeEvent(existingQueries, 'UPDATE', dbRow, { id: 'UTQ-2026-070' });
    expect(result.length).toBe(3);
    expect(result.some(q => q.id === 'UTQ-2026-070')).toBe(true);
  });

  it('DELETE removes the matching query by id', () => {
    const result = applyQueryRealtimeEvent(existingQueries, 'DELETE', null, { id: 'UTQ-2026-002' });
    expect(result.length).toBe(1);
    expect(result.some(q => q.id === 'UTQ-2026-002')).toBe(false);
  });

  it('is idempotent for an "echo" of the current user\'s own change (applying the same update twice is a no-op the second time)', () => {
    const updatedRow = { ...dbRow, id: 'UTQ-2026-001', status: 'operations' };
    const once = applyQueryRealtimeEvent(existingQueries, 'UPDATE', updatedRow, { id: 'UTQ-2026-001' });
    const twice = applyQueryRealtimeEvent(once, 'UPDATE', updatedRow, { id: 'UTQ-2026-001' });
    expect(twice.find(q => q.id === 'UTQ-2026-001').status).toBe('operations');
    expect(twice.length).toBe(once.length);
  });
});
