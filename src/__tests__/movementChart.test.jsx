import { describe, it, expect } from 'vitest';
import { getMovementChartRows } from '../lib/utils.js';

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
