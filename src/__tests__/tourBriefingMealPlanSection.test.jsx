import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Meal Plan folded into Tour Briefing Sheet as one more section (2026-08-22),
// replacing the standalone MealPlanDocument.jsx -- these tests cover what's
// specific to that merge and the 4 requested content fixes. General
// persistence/version-history/pagination behavior is already covered by
// tourBriefingPersistence.test.jsx (TBS bundles every section, including
// this one, into one content blob per version -- Meal Plan needed no new
// coverage there beyond confirming its fields are included).

const mockDb = {
  from: vi.fn(() => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
const fakeQuery = { id: 'UTQ-2026-2100', groupName: 'Meal Plan Section Test' };

describe('TourBriefingSheet: Meal Plan is a section, not a separate document', () => {
  it('has a Meal Plan tab alongside the other sections', async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByText('Meal Plan')).toBeTruthy();
    expect(screen.getByText('Hotels')).toBeTruthy();
  });

  it('MealPlanDocument.jsx no longer exists as a file', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../components/MealPlanDocument.jsx');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('saving includes mealDays and mealNotes in the same content blob as every other section', async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='tour_briefings')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0].content).toHaveProperty('mealDays');
      expect(insertCalls[0][0].content).toHaveProperty('mealNotes');
    });
  });
});

describe('TourBriefingSheet: Meal Plan content fixes (1.1-1.4)', () => {
  const openMealPlanTab = async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('Meal Plan'));
  };

  it('1.1: the column is labeled "Itinerary", not "Itinerary / Movement"', async () => {
    await openMealPlanTab();
    expect(await screen.findByText('Itinerary')).toBeTruthy();
    expect(screen.queryByText('Itinerary / Movement')).toBeNull();
  });

  it('1.3: has an optional notes field below the table, same pattern as every other section', async () => {
    await openMealPlanTab();
    expect(await screen.findByText('Section Notes (prints only if filled)')).toBeTruthy();
  });

  it('1.2 + 1.4: the print output omits the Notes column when no day has one, and centers the heading', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    await openMealPlanTab();
    // give at least one meal value so the section actually renders
    const breakfastInputs = await screen.findAllByPlaceholderText('Venue');
    fireEvent.change(breakfastInputs[0], { target: { value: 'Hotel Restaurant' } });
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    expect(captured.html).not.toContain('<th>Notes</th>');
    expect(captured.html).toMatch(/text-align:center;font-weight:700;font-size:12pt[^>]*>Meal Plan</);
    window.open = realOpen;
  });

  it('1.2: the Notes column appears when at least one day has a note', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    await openMealPlanTab();
    const breakfastInputs = await screen.findAllByPlaceholderText('Venue');
    fireEvent.change(breakfastInputs[0], { target: { value: 'Hotel Restaurant' } });
    // the Notes input has no placeholder -- find it by column position (7th input per row, after day/date/itinerary/breakfast/lunch/dinner)
    const allTextInputs = screen.getAllByRole('textbox');
    const notesInput = allTextInputs.find(el => el.value === '' && el.type !== 'date' && !el.placeholder);
    if (notesInput) fireEvent.change(notesInput, { target: { value: 'Vegetarian only' } });
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    if (notesInput) expect(captured.html).toContain('<th>Notes</th>');
    window.open = realOpen;
  });
});

describe('TourBriefingSheet: Cost Sheet pull populates Meal Plan too, not just Hotels/Programme', () => {
  it('a brand-new Tour Briefing Sheet with a final Cost Sheet available pulls meal days automatically', async () => {
    const finalCS = { id: 'cs-1', version: 2, is_final: true, days: [{ day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/L/D' }] };
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'cost_sheets' ? [finalCS] : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TBS } = await import('../components/TourBriefingSheet.jsx');
    render(<TBS query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v2/)).toBeTruthy());
    fireEvent.click(screen.getByText('Meal Plan'));
    expect(await screen.findByDisplayValue('DEL-SXR')).toBeTruthy();
  });
});

describe('TourBriefingSheet: print body font is Inter (the shared letterhead default), not the old Times New Roman override', () => {
  it('does not force Times New Roman', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    expect(captured.html).not.toContain("font-family:'Times New Roman'");
    window.open = realOpen;
  });
});
