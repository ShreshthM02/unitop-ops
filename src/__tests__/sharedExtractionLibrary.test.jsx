import { describe, it, expect } from 'vitest';
import {
  parseMealPlanFlags, extractItineraryFromCostSheetDays,
  extractHotelsFromCostSheetDays, extractItineraryBuilderDaysFromCostSheet,
  extractTourBriefingHotelsFromCostSheetDays, extractTourBriefingProgrammeFromCostSheetDays,
  extractTourBriefingTransportSummary, extractExchangeOrderDraftsFromCostSheet,
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
  it('maps to dayLabel/route/hotel with meals as an array of included letters only', () => {
    const result = extractItineraryBuilderDaysFromCostSheet([
      { day: 'Day 1', movement: 'DEL-SXR', hotel: 'Hotel A', mealPlan: 'B/D' },
    ]);
    expect(result[0]).toMatchObject({ dayLabel: 'Day 1', route: 'DEL-SXR', hotel: 'Hotel A', meals: ['B','D'] });
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

describe('extractTourBriefingProgrammeFromCostSheetDays: day/date/movement plus meal Included flags', () => {
  it('maps date, day, movement (as itinerary), and meal flags, leaving the narrative programme field blank', () => {
    const result = extractTourBriefingProgrammeFromCostSheetDays([
      { date: '2026-08-01', day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/D' },
    ]);
    expect(result[0]).toMatchObject({ date: '2026-08-01', day: 'Day 1', itinerary: 'DEL-SXR', programme: '', breakfast: 'Included', lunch: '', dinner: 'Included' });
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

describe('extractExchangeOrderDraftsFromCostSheet: partial drafts only -- route/vehicle/serviceType, never fabricated vendor contact info', () => {
  it('creates one transport draft per transport row and one handler draft per local handler row', () => {
    const result = extractExchangeOrderDraftsFromCostSheet(
      [{ sector: 'DELHI', vehicleType: 'Large Coach' }],
      [{ sector: 'KASHMIR' }],
    );
    expect(result).toEqual([
      { serviceType: 'transport', route: 'DELHI', vehicleType: 'Large Coach' },
      { serviceType: 'handler', route: 'KASHMIR', vehicleType: '' },
    ]);
  });
  it('never includes vendor name, contact, or escort fields -- those have no Cost Sheet source', () => {
    const result = extractExchangeOrderDraftsFromCostSheet([{ sector: 'X', vehicleType: 'Y' }], []);
    expect(result[0]).not.toHaveProperty('drawnOn');
    expect(result[0]).not.toHaveProperty('escort');
  });
});
