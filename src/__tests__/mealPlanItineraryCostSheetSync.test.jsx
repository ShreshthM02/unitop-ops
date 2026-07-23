import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1700', groupName: 'Phase 4 Sync Test', nights: 3 };

function makeDb({ costSheetRows = [], mealPlanRows = [], itineraryRows = [] } = {}) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({
          data: t === 'cost_sheets' ? costSheetRows : (t === 'meal_plans' ? mealPlanRows : (t === 'itineraries' ? itineraryRows : [])),
          error: null,
        }),
      };
      return builder;
    }),
  };
}

describe('MealPlanDocument Phase 4: auto-pulls from the star-marked Cost Sheet on creation', () => {
  it('a brand-new Meal Plan (zero saved versions) with a final Cost Sheet available pulls automatically', async () => {
    const finalCS = { id: 'cs-1', version: 2, is_final: true, days: [{ day:'Day 1', movement:'DEL-SXR', mealPlan:'B/L/D' }] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v2/)).toBeTruthy());
    expect(screen.getByDisplayValue('DEL-SXR')).toBeTruthy();
  });

  it('shows the staleness banner when a newer final Cost Sheet exists beyond what was pulled', async () => {
    const finalCS = { id: 'cs-2', version: 5, is_final: true, days: [{ day:'Day 1', movement:'NEWER', mealPlan:'B' }] };
    const savedMealPlan = { version: 1, heading: 'Test', rows: [], is_final: false, pulled_from_cost_sheet_version: 3 };
    const db = makeDb({ costSheetRows: [finalCS], mealPlanRows: [savedMealPlan] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Cost Sheet v5 \(final\) has meal-plan data/)).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull latest'));
    await waitFor(() => expect(screen.getByDisplayValue('NEWER')).toBeTruthy());
  });

  it('shows no banner when already in sync', async () => {
    const finalCS = { id: 'cs-3', version: 2, is_final: true, days: [] };
    const savedMealPlan = { version: 1, heading: 'X', rows: [], is_final: false, pulled_from_cost_sheet_version: 2 };
    const db = makeDb({ costSheetRows: [finalCS], mealPlanRows: [savedMealPlan] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');
    render(<MealPlanDocument query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('X')).toBeTruthy());
    expect(screen.queryByText('↻ Pull latest')).toBeNull();
  });
});

describe('ItineraryBuilder Phase 4: auto-pulls from the star-marked Cost Sheet on creation', () => {
  it('a brand-new Itinerary (zero saved versions) with a final Cost Sheet available pulls automatically', async () => {
    const finalCS = { id: 'cs-4', version: 3, is_final: true, days: [{ day:'Day 1', movement:'DEL-AGRA', hotel:'Taj Hotel', mealPlan:'D' }] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ItineraryBuilder } = await import('../components/ItineraryBuilder.jsx');
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v3/)).toBeTruthy());
    expect(screen.getByDisplayValue('DEL-AGRA')).toBeTruthy();
    expect(screen.getByDisplayValue('Taj Hotel')).toBeTruthy();
  });

  it('shows the staleness banner + re-pull when a newer final Cost Sheet version exists', async () => {
    const finalCS = { id: 'cs-5', version: 4, is_final: true, days: [{ day:'Day 1', movement:'NEWER-ROUTE', hotel:'', mealPlan:'' }] };
    const savedItinerary = { version: 1, tour_title: 'X', route: '', days: [], active_tab: 'brief', is_final: false, pulled_from_cost_sheet_version: 2 };
    const db = makeDb({ costSheetRows: [finalCS], itineraryRows: [savedItinerary] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ItineraryBuilder } = await import('../components/ItineraryBuilder.jsx');
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Cost Sheet v4 \(final\) has route\/hotel data/)).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull latest'));
    await waitFor(() => expect(screen.getByDisplayValue('NEWER-ROUTE')).toBeTruthy());
  });
});
