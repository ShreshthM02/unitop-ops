import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, reported bug: meal toggles (Breakfast/Lunch/Dinner) were not
// displaying in chronological order regardless of how they were
// selected -- specifically, Dinner would appear before Lunch. Root
// cause: toggleMeal used a plain `.sort()` with no comparator, which
// sorts the "B"/"L"/"D" codes ALPHABETICALLY as strings (B, D, L) --
// completely different from the intended chronological order
// (B, L, D), since "D" alphabetically precedes "L". This happened
// regardless of click order because a plain string sort always
// produces the same (wrong) result for a given set of selected meals.

const mockDb = {
  from: vi.fn((table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid-' + table }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: Itinerary } = await import('../components/Itinerary.jsx');

const fakeQuery = { id: 'UTQ-2026-800', groupName: 'Meal Order Test', destination: 'Agra', nights: 2 };

beforeEach(() => { mockDb.from.mockClear(); });

describe('Itinerary: meal toggles always end up in Breakfast -> Lunch -> Dinner order', () => {
  it('adding Breakfast then Lunch to a day that already has Dinner selected still results in B, L, D order, not B, D, L', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);

    // Day 1 starts with only Dinner selected (meals: ["D"]). Adding
    // Breakfast then Lunch -- in that click order -- is exactly the
    // scenario that used to produce the wrong ["B","D","L"] order: a
    // plain alphabetical .sort() on that set gives B, D, L (since "D"
    // alphabetically precedes "L"), when the correct chronological
    // order is B, L, D.
    const bButtons = screen.getAllByText('B', { selector: 'button' });
    const lButtons = screen.getAllByText('L', { selector: 'button' });
    fireEvent.click(bButtons[0]); // Day 1's Breakfast button: add Breakfast
    fireEvent.click(lButtons[0]); // Day 1's Lunch button: add Lunch

    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      const savedDay = insertCalls[0][0].days[0];
      expect(savedDay.meals).toEqual(['B', 'L', 'D']);
    });
  });
});
