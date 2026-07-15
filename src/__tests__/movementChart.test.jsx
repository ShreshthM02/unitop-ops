import { describe, it, expect } from 'vitest';
import { getMovementChartRows, buildRouteLines } from '../lib/utils.js';

const users = [{ id: 1, name: 'Harsh' }, { id: 2, name: 'Priya' }];

const baseQuery = {
  id: 'UTQ-2026-100', tourFileId: 'TF-2026-100', status: 'operations', cancelled: false,
  travelDate: '2026-08-10', nights: 5, agentCompany: 'Uni Travel', destination: 'Kashmir',
  pax: 21, notes: 'VIP group', assignedTo: 1,
};

describe('getMovementChartRows', () => {
  it('includes a tour whose dates fall entirely within the selected month', () => {
    const rows = getMovementChartRows([baseQuery], users, 2026, 7); // August = month index 7
    expect(rows.length).toBe(1);
    expect(rows[0].tourFileId).toBe('TF-2026-100');
    expect(rows[0].fileHandler).toBe('Harsh');
    expect(rows[0].fto).toBe('Uni Travel');
    expect(rows[0].sector).toBe('Kashmir');
    expect(rows[0].pax).toBe(21);
    expect(rows[0].remarks).toBe('VIP group');
  });

  it('excludes a tour entirely in a different month', () => {
    const rows = getMovementChartRows([baseQuery], users, 2026, 9); // October
    expect(rows.length).toBe(0);
  });

  it('includes a tour that starts in the prior month but ends inside the selected month', () => {
    const spanning = { ...baseQuery, travelDate: '2026-07-28', nights: 10 }; // ends Aug 7
    const rows = getMovementChartRows([spanning], users, 2026, 7); // August
    expect(rows.length).toBe(1);
  });

  it('includes a tour that starts inside the selected month but ends in the next month', () => {
    const spanning = { ...baseQuery, travelDate: '2026-08-28', nights: 10 }; // ends Sep 7
    const rows = getMovementChartRows([spanning], users, 2026, 7); // August
    expect(rows.length).toBe(1);
  });

  it('excludes cancelled queries', () => {
    const rows = getMovementChartRows([{ ...baseQuery, cancelled: true }], users, 2026, 7);
    expect(rows.length).toBe(0);
  });

  it('excludes queries not yet in operations/completed status', () => {
    const rows = getMovementChartRows([{ ...baseQuery, status: 'costing' }], users, 2026, 7);
    expect(rows.length).toBe(0);
  });

  it('excludes queries without a travel date at all', () => {
    const rows = getMovementChartRows([{ ...baseQuery, travelDate: '' }], users, 2026, 7);
    expect(rows.length).toBe(0);
  });

  it('leaves fileHandler blank when assignedTo does not match any user (does not crash)', () => {
    const rows = getMovementChartRows([{ ...baseQuery, assignedTo: 999 }], users, 2026, 7);
    expect(rows[0].fileHandler).toBe('');
  });

  it('falls back to agentName when agentCompany is missing, and to raw pax when paxDisplay is missing', () => {
    const q = { ...baseQuery, agentCompany: '', agentName: 'John Doe', paxDisplay: '' };
    const rows = getMovementChartRows([q], users, 2026, 7);
    expect(rows[0].fto).toBe('John Doe');
    expect(rows[0].pax).toBe(21);
  });

  it('sorts results by arrival date ascending and numbers them sequentially', () => {
    const later = { ...baseQuery, id: 'UTQ-2', tourFileId: 'TF-2', travelDate: '2026-08-20' };
    const earlier = { ...baseQuery, id: 'UTQ-1', tourFileId: 'TF-1', travelDate: '2026-08-01' };
    const rows = getMovementChartRows([later, earlier], users, 2026, 7);
    expect(rows[0].tourFileId).toBe('TF-1');
    expect(rows[0].sNo).toBe(1);
    expect(rows[1].tourFileId).toBe('TF-2');
    expect(rows[1].sNo).toBe(2);
  });
});

describe('getMovementChartRows: new operational columns (Arr/Dep Flight, Route, Rooming, Transporter)', () => {
  const users = [{ id: 'u1', name: 'Priya' }];
  const query = { id: 'UTQ-1', tourFileId: 'TF-1', status: 'operations', travelDate: '2026-08-10', nights: 3, cancelled: false };
  const vendors = [{ id: 'v1', name: 'Delhi Coaches' }, { id: 'v2', name: 'Rajasthan Rides' }];

  it('pulls arrival/departure flight details from tourExecution', () => {
    const tourExecutions = { 'UTQ-1': { arrFlightDetails: 'AI-101 10:00', depFlightDetails: 'AI-102 18:00', days: [], transporters: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].arrFlight).toBe('AI-101 10:00');
    expect(rows[0].depFlight).toBe('AI-102 18:00');
  });

  it('builds Route as per-stop lines, uppercased, with the overnight hotel attached to the last stop of each day -- the actual Khajuraho example', () => {
    const tourExecutions = { 'UTQ-1': { days: [
      { route: 'Khajuraho - Orchha - Jhansi - Agra', hotelName: 'Trident Agra' },
    ], transporters: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].routeLines).toEqual(['KHAJURAHO', 'ORCHHA', 'JHANSI', 'AGRA - Trident Agra']);
  });

  it('does not repeat a stop that exactly matches the previous day\'s last stop', () => {
    const tourExecutions = { 'UTQ-1': { days: [
      { route: 'Delhi - Agra', hotelName: 'Taj View' },
      { route: 'Agra - Jaipur', hotelName: 'Rambagh Palace' },
    ], transporters: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].routeLines).toEqual(['DELHI', 'AGRA - Taj View', 'JAIPUR - Rambagh Palace']);
  });

  it('leaves a stop with no hotel set as a plain line, without a trailing " - "', () => {
    const tourExecutions = { 'UTQ-1': { days: [{ route: 'Delhi - Agra' }], transporters: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].routeLines).toEqual(['DELHI', 'AGRA']);
  });

  it('builds Rooming from unique hotel+room combos across days', () => {
    const tourExecutions = { 'UTQ-1': { days: [
      { hotelName: 'Taj View', rooms: '5 Twin, 1 Sgl' }, { hotelName: 'Taj View', rooms: '5 Twin, 1 Sgl' }, { hotelName: 'Rambagh Palace', rooms: '3 Twin' },
    ], transporters: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].rooming).toBe('Taj View (5 Twin, 1 Sgl); Rambagh Palace (3 Twin)');
  });

  it('resolves Transporter vendor ids to real names, deduplicated', () => {
    const tourExecutions = { 'UTQ-1': { days: [], transporters: [
      { vendorId: 'v1', sector: 'Delhi' }, { vendorId: 'v1', sector: 'Agra' }, { vendorId: 'v2', sector: 'Jaipur' },
    ] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].transporter).toBe('Delhi Coaches, Rajasthan Rides');
  });

  it('leaves all new fields blank without throwing when tourExecutions/vendors are not passed at all', () => {
    const rows = getMovementChartRows([query], users, 2026, 7);
    expect(rows[0].arrFlight).toBe('');
    expect(rows[0].routeLines).toEqual([]);
    expect(rows[0].rooming).toBe('');
    expect(rows[0].transporter).toBe('');
  });

  it('leaves fields blank when this specific query has no tour_execution row yet, without crashing', () => {
    const rows = getMovementChartRows([query], users, 2026, 7, {}, vendors);
    expect(rows[0].routeLines).toEqual([]);
    expect(rows[0].transporter).toBe('');
  });
});

describe('buildRouteLines (pure function, tested directly)', () => {
  it('handles multiple days with mixed hotel/no-hotel and repeated boundary stops correctly', () => {
    const days = [
      { route: 'Delhi - Agra', hotelName: 'Taj View' },
      { route: 'Agra - Khajuraho - Orchha', hotelName: 'Orchha Resort' },
      { route: '' }, // blank route -- skipped entirely
      { route: 'Orchha - Jhansi - Varanasi', hotelName: 'Ganges View' },
    ];
    expect(buildRouteLines(days)).toEqual([
      'DELHI', 'AGRA - Taj View',
      'KHAJURAHO', 'ORCHHA - Orchha Resort',
      'JHANSI', 'VARANASI - Ganges View',
    ]);
  });

  it('returns an empty array for no days or all-blank routes', () => {
    expect(buildRouteLines([])).toEqual([]);
    expect(buildRouteLines([{ route: '' }, { route: null }])).toEqual([]);
    expect(buildRouteLines(null)).toEqual([]);
  });

  it('handles a single-stop day (no hyphen) correctly', () => {
    expect(buildRouteLines([{ route: 'Udaipur', hotelName: 'Lake Palace' }])).toEqual(['UDAIPUR - Lake Palace']);
  });
});

describe('getMovementChartRows: Tour Facilitator and Local Handler columns (same single-source discipline as Transporter)', () => {
  const users = [{ id: 'u1', name: 'Priya' }];
  const query = { id: 'UTQ-1', tourFileId: 'TF-1', status: 'operations', travelDate: '2026-08-10', nights: 3, cancelled: false };
  const vendors = [{ id: 'v1', name: 'Prithvi' }, { id: 'v2', name: 'Rajgir Handlers Co' }];

  it('resolves Tour Facilitator vendor ids to real names, deduplicated', () => {
    const tourExecutions = { 'UTQ-1': { days: [], facilitators: [{ vendorId: 'v1', sector: 'Bodhgaya' }, { vendorId: 'v1', sector: 'Varanasi' }] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].facilitator).toBe('Prithvi');
  });

  it('resolves Local Handler vendor ids to real names, deduplicated', () => {
    const tourExecutions = { 'UTQ-1': { days: [], localHandlers: [{ vendorId: 'v2', sector: 'Rajgir' }] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].localHandler).toBe('Rajgir Handlers Co');
  });

  it('both are read exclusively from tour_execution (te.facilitators / te.localHandlers), never any other source', () => {
    const tourExecutions = { 'UTQ-1': { days: [], facilitators: [], localHandlers: [] } };
    const rows = getMovementChartRows([query], users, 2026, 7, tourExecutions, vendors);
    expect(rows[0].facilitator).toBe('');
    expect(rows[0].localHandler).toBe('');
  });

  it('leaves both blank without throwing when tour_execution is entirely missing', () => {
    const rows = getMovementChartRows([query], users, 2026, 7, {}, vendors);
    expect(rows[0].facilitator).toBe('');
    expect(rows[0].localHandler).toBe('');
  });
});
