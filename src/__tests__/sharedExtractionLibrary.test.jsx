import { describe, it, expect } from 'vitest';
import {
  parseMealPlanFlags, extractItineraryFromCostSheetDays,
  extractHotelsFromCostSheetDays, extractItineraryBuilderDaysFromCostSheet,
  extractTourBriefingHotelsFromCostSheetDays, extractTourBriefingProgrammeFromCostSheetDays,
  extractTourBriefingTransportSummary,
} from '../lib/utils.js';

describe('parseMealPlanFlags: the one true source every other extractor builds on', () => {
  it('detects B/L/D correctly regardless of separators', () => {
    expect(parseMealPlanFlags('B/L/D')).toEqual({ breakfast: true, lunch: true, dinner: true });
    expect(parseMealPlanFlags('B/L-800/D-800')).toEqual({ breakfast: true, lunch: true, dinner: true });
    expect(parseMealPlanFlags('B/D')).toEqual({ breakfast: true, lunch: false, dinner: true });
  });
  it('returns all false for empty/missing input', () => {
    expect(parseMealPlanFlags('')).toEqual({ breakfast: false, lunch: false, dinner: false });
    expect(parseMealPlanFlags(undefined)).toEqual({ breakfast: false, lunch: false, dinner: false });
  });
});

describe('extractItineraryFromCostSheetDays: Quotation and Meal Plan shape (Included/"" flags)', () => {
  it('maps day/movement and Included/"" meal flags', () => {
    const result = extractItineraryFromCostSheetDays([
      { day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/L/D' },
      { day: 'Day 2', movement: 'SXR-LEH', mealPlan: 'D' },
    ]);
    expect(result[0]).toEqual({ day: 'Day 1', movement: 'DEL-SXR', breakfast: 'Included', lunch: 'Included', dinner: 'Included' });
    expect(result[1]).toEqual({ day: 'Day 2', movement: 'SXR-LEH', breakfast: '', lunch: '', dinner: 'Included' });
  });
  it('handles empty input', () => {
    expect(extractItineraryFromCostSheetDays([])).toEqual([]);
    expect(extractItineraryFromCostSheetDays(undefined)).toEqual([]);
  });
});

describe('extractHotelsFromCostSheetDays: consolidates consecutive same-hotel days', () => {
  it('groups consecutive days at the same hotel into one row with a nights count', () => {
    const result = extractHotelsFromCostSheetDays([
      { movement: 'DEL-SXR', hotel: 'Hotel A' },
      { movement: 'SXR-GULMARG-SXR', hotel: 'Hotel A' },
      { movement: 'SXR-LEH', hotel: 'Hotel B' },
    ]);
    expect(result).toEqual([
      { place: 'SXR', nights: 2, hotel: 'Hotel A' },
      { place: 'LEH', nights: 1, hotel: 'Hotel B' },
    ]);
  });
  it('skips days with no hotel set', () => {
    const result = extractHotelsFromCostSheetDays([{ movement: 'DEL-SXR', hotel: '' }, { movement: 'SXR-LEH', hotel: 'Hotel B' }]);
    expect(result).toEqual([{ place: 'LEH', nights: 1, hotel: 'Hotel B' }]);
  });
});

describe('extractItineraryBuilderDaysFromCostSheet: Itinerary Builder shape (meals as letter array, one row per day)', () => {
  it('maps to dayLabel + meals, with movement and hotel becoming ordered day items', () => {
    const result = extractItineraryBuilderDaysFromCostSheet([
      { day: 'Day 1', movement: 'DEL-SXR', hotel: 'Hotel A', mealPlan: 'B/D' },
    ]);
    // A day is now an ordered item list rather than fixed route/hotel fields,
    // so the extractor's output goes through the same legacy->items
    // conversion the load path uses. Meals stay a day-level field.
    expect(result[0]).toMatchObject({ dayLabel: 'Day 1', meals: ['B','D'] });
    expect(result[0].items.map(i => [i.type, i.text])).toEqual([
      ['route', 'DEL-SXR'],
      ['stay', 'Hotel A'],
    ]);
  });

  it('a Cost Sheet day with no movement or hotel yields no items, not blank ones', () => {
    const result = extractItineraryBuilderDaysFromCostSheet([{ day: 'Day 1', movement: '', hotel: '', mealPlan: 'B' }]);
    expect(result[0].items).toEqual([]);
  });
  it('does not consolidate by hotel -- one row per day, unlike the hotels extractor', () => {
    const result = extractItineraryBuilderDaysFromCostSheet([
      { day: 'Day 1', movement: 'A', hotel: 'Same Hotel', mealPlan: '' },
      { day: 'Day 2', movement: 'B', hotel: 'Same Hotel', mealPlan: '' },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('extractTourBriefingHotelsFromCostSheetDays: consolidates by hotel with real checkIn/checkOut dates', () => {
  it('computes checkIn from the first day and checkOut from the last day of a consecutive same-hotel stay', () => {
    const result = extractTourBriefingHotelsFromCostSheetDays([
      { date: '2026-08-01', movement: 'DEL-SXR', hotel: 'Hotel A' },
      { date: '2026-08-02', movement: 'SXR-GULMARG-SXR', hotel: 'Hotel A' },
      { date: '2026-08-03', movement: 'SXR-LEH', hotel: 'Hotel B' },
    ]);
    expect(result).toEqual([
      { checkIn: '2026-08-01', checkOut: '2026-08-02', city: 'SXR', hotelName: 'Hotel A', rooms: '', bookingStatus: 'Requested' },
      { checkIn: '2026-08-03', checkOut: '2026-08-03', city: 'LEH', hotelName: 'Hotel B', rooms: '', bookingStatus: 'Requested' },
    ]);
  });
  it('skips days with no hotel set', () => {
    expect(extractTourBriefingHotelsFromCostSheetDays([{ date:'', movement:'A', hotel:'' }])).toEqual([]);
  });
});

describe('extractTourBriefingProgrammeFromCostSheetDays: day/date/movement plus meal "At Hotel" flags (2026-08-27: was "Included", changed to "At Hotel" -- TBS-exclusive, so no shared-function collision with Quotation to worry about here)', () => {
  it('maps date, day, movement (as itinerary), and meal flags, leaving the narrative programme field blank', () => {
    const result = extractTourBriefingProgrammeFromCostSheetDays([
      { date: '2026-08-01', day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/D' },
    ]);
    expect(result[0]).toMatchObject({ date: '2026-08-01', day: 'Day 1', itinerary: 'DEL-SXR', programme: '', breakfast: 'At Hotel', lunch: '', dinner: 'At Hotel' });
  });
});

describe('extractTourBriefingTransportSummary: a free-text summary line, not a table', () => {
  it('joins vehicle+sector pairs into one readable line', () => {
    const result = extractTourBriefingTransportSummary([
      { vehicleType: 'Mini Bus', sector: 'DELHI' },
      { vehicleType: 'Large Coach', sector: 'SXR' },
    ]);
    expect(result).toBe('Mini Bus for DELHI; Large Coach for SXR');
  });
  it('returns an empty string for no transports', () => {
    expect(extractTourBriefingTransportSummary([])).toBe('');
    expect(extractTourBriefingTransportSummary(undefined)).toBe('');
  });
});
