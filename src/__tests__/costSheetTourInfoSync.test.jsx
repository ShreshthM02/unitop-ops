import { describe, it, expect, vi } from 'vitest';
import { mapCostSheetDaysToTourExecutionDays, loadFinalCostSheetVersion } from '../lib/utils.js';

describe('mapCostSheetDaysToTourExecutionDays: the reverse mapping (Cost Sheet -> tour_execution shape)', () => {
  it('maps day/movement/hotel into dayLabel/route/hotelName', () => {
    const csDays = [
      { id: 1, day: 'Day 1', date: '24-07-2026', movement: 'DEL-SXR', hotel: 'Hotel Heritage', notes: 'Early check-in' },
      { id: 2, day: 'Day 2', date: '', movement: 'SXR-GULMARG-SXR', hotel: 'Hotel Heritage', notes: '' },
    ];
    const result = mapCostSheetDaysToTourExecutionDays(csDays);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ dayLabel: 'Day 1', date: '24-07-2026', route: 'DEL-SXR', hotelName: 'Hotel Heritage', notes: 'Early check-in' });
    expect(result[1]).toMatchObject({ dayLabel: 'Day 2', route: 'SXR-GULMARG-SXR', hotelName: 'Hotel Heritage' });
  });

  it('leaves rooms blank -- Cost Sheet has no equivalent field to map it from', () => {
    const result = mapCostSheetDaysToTourExecutionDays([{ id:1, day:'Day 1', movement:'X', hotel:'Y' }]);
    expect(result[0].rooms).toBe('');
  });

  it('handles empty/missing input gracefully', () => {
    expect(mapCostSheetDaysToTourExecutionDays([])).toEqual([]);
    expect(mapCostSheetDaysToTourExecutionDays(undefined)).toEqual([]);
  });
});

describe('loadFinalCostSheetVersion: finds the star-marked version, or null if none exists', () => {
  it('returns the version with isFinal true when one exists', async () => {
    const rows = [
      { version: 1, is_final: false, days: [] },
      { version: 2, is_final: true, days: [{day:'Day 1',movement:'X',hotel:'Y'}] },
      { version: 3, is_final: false, days: [] },
    ];
    const db = { from: () => ({ select:()=>({eq:()=>({order:()=>({ then: (resolve) => resolve({ data: rows, error: null }) })})}) }) };
    const result = await loadFinalCostSheetVersion(db, 'UTQ-1');
    expect(result.version).toBe(2);
    expect(result.isFinal).toBe(true);
  });

  it('returns null when no version has been marked final yet', async () => {
    const rows = [{ version: 1, is_final: false, days: [] }, { version: 2, is_final: false, days: [] }];
    const db = { from: () => ({ select:()=>({eq:()=>({order:()=>({ then: (resolve) => resolve({ data: rows, error: null }) })})}) }) };
    const result = await loadFinalCostSheetVersion(db, 'UTQ-1');
    expect(result).toBeNull();
  });

  it('returns null when there are no saved versions at all', async () => {
    const db = { from: () => ({ select:()=>({eq:()=>({order:()=>({ then: (resolve) => resolve({ data: [], error: null }) })})}) }) };
    const result = await loadFinalCostSheetVersion(db, 'UTQ-1');
    expect(result).toBeNull();
  });
});
