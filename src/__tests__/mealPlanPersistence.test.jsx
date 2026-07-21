import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid-' + table }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }), // starts empty: no saved versions yet
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: MealPlanDocument } = await import('../components/MealPlanDocument.jsx');

const fakeQuery = { id: 'UTQ-2026-600', groupName: 'Meal Plan Persistence Test', nights: 5 };
const fakeTemplate = { defaultHeading: 'Meal Plan' };

beforeEach(() => { mockDb.from.mockClear(); });

describe('MealPlanDocument: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadMealPlanVersions (via db.from("meal_plans")) on mount', async () => {
    render(<MealPlanDocument query={fakeQuery} template={fakeTemplate} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('meal_plans'));
  });

  it('clicking Save Version calls the meal_plans insert with the current draft (heading + rows)', async () => {
    render(<MealPlanDocument query={fakeQuery} template={fakeTemplate} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='meal_plans')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('rows');
      expect(insertCalls[0][0]).toHaveProperty('heading');
    });
  });

  it('Save Version does not auto-close the panel', async () => {
    const onClose = vi.fn();
    render(<MealPlanDocument query={fakeQuery} template={fakeTemplate} onClose={onClose} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('meal_plans'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<MealPlanDocument query={fakeQuery} template={fakeTemplate} onClose={()=>{}}/>);
    expect(await screen.findByText(/MEAL PLAN/)).toBeTruthy();
  });

  it('loading a previously saved version populates heading and rows into the draft', async () => {
    const versionRows = [
      { version: 1, heading: 'Saved Heading', rows: [{id:1,day:'Day 1',date:'',movement:'',breakfast:'B',lunch:'',dinner:'',notes:''}], is_final: false },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'meal_plans' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: MPD } = await import('../components/MealPlanDocument.jsx');
    render(<MPD query={fakeQuery} template={fakeTemplate} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Saved Heading')).toBeTruthy());
    expect(screen.getByDisplayValue('B')).toBeTruthy();
  });
});
