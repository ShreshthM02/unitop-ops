import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1200', tourFileId: 'TF-1200', groupName: 'Phase 1 Pre-fill Test', nights: 3 };

beforeEach(() => { vi.resetModules(); });

describe('CostSheet Phase 1: pre-fills movement/hotel from tour_execution on first creation (Document Chain plan, docs/DATA_OWNERSHIP.md)', () => {
  it('a brand-new Cost Sheet (no saved versions) pulls movement and hotel from tour_execution\'s Day-wise Itinerary/Hotels, not generic hardcoded placeholder rows', async () => {
    const teRow = {
      query_id: 'UTQ-2026-1200',
      days: [
        { id: 1, dayLabel: 'Day 1', date: '24-07-2026', route: 'DEL-SXR', hotelName: 'Hotel Heritage', rooms: '5', notes: '' },
        { id: 2, dayLabel: 'Day 2', date: '25-07-2026', route: 'SXR-GULMARG-SXR', hotelName: 'Hotel Heritage', rooms: '5', notes: '' },
      ],
      facilitators: [], local_handlers: [], transporters: [], flights: [],
    };
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({
            data: t === 'tour_execution' ? [teRow] : [],
            error: null,
          }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);

    // Movement and hotel come from tour_execution, not the old hardcoded
    // "Day 1"/blank movement/blank hotel defaults.
    await waitFor(() => expect(screen.getByDisplayValue('DEL-SXR')).toBeTruthy());
    expect(screen.getByDisplayValue('SXR-GULMARG-SXR')).toBeTruthy();
    expect(screen.getAllByDisplayValue('Hotel Heritage').length).toBe(2);
  });

  it('pricing-only fields (Meal Cost, Net PP, Sngl Supp) stay blank -- there is no equivalent in tour_execution to pre-fill them from', async () => {
    const teRow = {
      query_id: 'UTQ-2026-1200',
      days: [{ id: 1, dayLabel: 'Day 1', date: '', route: 'DEL-SXR', hotelName: 'Hotel Heritage', rooms: '', notes: '' }],
      facilitators: [], local_handlers: [], transporters: [], flights: [],
    };
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'tour_execution' ? [teRow] : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('DEL-SXR')).toBeTruthy());
    // Meal Plan gets a sensible default ("B/L/D", matching the existing
    // addDay() default for every new row regardless of source) -- but
    // fields with genuinely no tour_execution equivalent are blank.
    const numberInputs = document.querySelectorAll('input[type="number"]');
    const blankNumberInputs = Array.from(numberInputs).filter(i => i.value === '');
    expect(blankNumberInputs.length).toBeGreaterThan(0);
  });

  it('falls back to the existing hardcoded default rows when tour_execution has no days (empty itinerary, nothing to pre-fill from)', async () => {
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: [], error: null }), // no tour_execution row at all
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    // Old default: "Day 1" as the first row's day label.
    await waitFor(() => expect(screen.getByDisplayValue('Day 1')).toBeTruthy());
  });

  it('does NOT touch days[] once a Cost Sheet already has at least one saved version -- one-way pre-fill at creation only, never a live sync', async () => {
    const savedVersion = {
      version: 1, gst_pct: 5, markup_pct: 20, roe: 90, currency: 'US $',
      days: [{ id: 1, day: 'Day 1', movement: 'ALREADY-SAVED-MOVEMENT', hotel: 'Already Saved Hotel', date:'', mealPlan:'', mealCost:'', hotelAlt:'', hotelPlan:'', hotelNetPP:'', singleSupp:'', notes:'' }],
      transports: [], slabs: [], monuments: [], local_handlers: [], extras: [],
    };
    const teRow = {
      query_id: 'UTQ-2026-1200',
      days: [{ id: 1, dayLabel: 'Day 1', date: '', route: 'SHOULD-NOT-APPEAR', hotelName: 'Should Not Appear Hotel', rooms: '', notes: '' }],
      facilitators: [], local_handlers: [], transporters: [], flights: [],
    };
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({
            data: t === 'cost_sheets' ? [savedVersion] : (t === 'tour_execution' ? [teRow] : []),
            error: null,
          }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('ALREADY-SAVED-MOVEMENT')).toBeTruthy());
    expect(screen.queryByDisplayValue('SHOULD-NOT-APPEAR')).toBeNull();
  });
});
