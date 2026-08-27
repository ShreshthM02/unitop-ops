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

describe('Itinerary (Brief flavor, the default) Phase 4: auto-pulls from the star-marked Cost Sheet on creation', () => {
  it('a brand-new Itinerary (zero saved versions) with a final Cost Sheet available pulls automatically', async () => {
    const finalCS = { id: 'cs-4', version: 3, is_final: true, days: [{ day:'Day 1', movement:'DEL-AGRA', hotel:'Taj Hotel', mealPlan:'D' }] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: Itinerary } = await import('../components/Itinerary.jsx');
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
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
    const { default: Itinerary } = await import('../components/Itinerary.jsx');
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Cost Sheet v4 \(final\) has route\/hotel data/)).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull latest'));
    await waitFor(() => expect(screen.getByDisplayValue('NEWER-ROUTE')).toBeTruthy());
  });
});
