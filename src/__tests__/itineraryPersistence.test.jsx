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

const { default: Itinerary } = await import('../components/Itinerary.jsx');

const fakeQuery = { id: 'UTQ-2026-700', groupName: 'Itinerary Persistence Test', destination: 'Ladakh', nights: 6 };

beforeEach(() => { mockDb.from.mockClear(); });

// Brief and Detailed Itinerary were split into two separate components on
// 2026-07-24, merged into one document (Itinerary) with a Brief/Detailed
// flavor toggle, then had their SAVE HISTORY split apart again by explicit
// request: it should be possible to browse and mark final "Brief v3"
// independently of "Detailed v2". What stays merged is the live editing
// draft -- one shared working set of days, loaded as the single overall
// latest save regardless of which flavor tag it carries -- while the
// version DROPDOWN and NEXT-VERSION NUMBERING are filtered per flavor, so
// each flavor keeps its own independent, reviewable timeline even though
// both draw from the same table and the same in-progress draft.

describe('Itinerary: real versioned persistence (Phase 0 of the Document Chain plan), now a single shared history', () => {
  it('calls loadItineraryVersions (via db.from("itineraries")) on mount', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('clicking Save Version calls the itineraries insert with the current draft, active_tab recording the flavor open at save time', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('days');
      expect(insertCalls[0][0]).toHaveProperty('tour_title');
      // Defaults to 'brief', the flavor the document opens on.
      expect(insertCalls[0][0].active_tab).toBe('brief');
    });
  });

  it('saving while the Detailed flavor tab is active records active_tab as "detailed"', async () => {
    render(<Itinerary query={fakeQuery} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls[0][0].active_tab).toBe('detailed');
    });
  });

  it('the previously dead footer Save button now actually saves (had no onClick handler at all before the original fix)', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    expect(saveButtons.length).toBeGreaterThanOrEqual(1); // header + footer both have one
    fireEvent.click(saveButtons[saveButtons.length - 1]); // footer's copy
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/ITINERARY/)).toBeTruthy();
  });

  it('the draft you land on is the overall latest save regardless of flavor tag, but the version DROPDOWN and NUMBERING are per-flavor', async () => {
    const versionRows = [
      { version: 1, tour_title: 'First Save', route: 'Delhi - Leh - Alchi', active_tab: 'brief',
        days: [{id:1,dayLabel:'DAY-1',title:'Custom Title',meals:['B'],items:[]}], is_final: false },
      { version: 2, tour_title: 'Second Save (Detailed Tab Open)', route: 'Delhi - Leh - Alchi v2', active_tab: 'detailed',
        days: [{id:1,dayLabel:'DAY-1',title:'Custom Title',meals:['B'],items:[]}], is_final: false },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'itineraries' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: It } = await import('../components/Itinerary.jsx');
    render(<It query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    // The DRAFT is the overall latest save, whichever tab it was saved
    // under -- editing is one shared working session.
    await waitFor(() => expect(screen.getByDisplayValue('Second Save (Detailed Tab Open)')).toBeTruthy());
    expect(screen.getByDisplayValue('Delhi - Leh - Alchi v2')).toBeTruthy();
    // The document opens on the Brief tab by default, and Brief's own
    // history has exactly ONE save (v1) -- so its next save is v2, not v3.
    // A shared/single counter would show v3 here; per-flavor numbering
    // shows v2, which is what distinguishes the two behaviours.
    expect(screen.getAllByText(/💾 Save v2/).length).toBeGreaterThan(0);
  });

  it('switching to the Detailed tab shows ITS OWN next version number, independent of Brief\u2019s', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Brief v1', route: '', active_tab: 'brief', days: [], is_final: false },
      { version: 2, tour_title: 'Brief v2', route: '', active_tab: 'brief', days: [], is_final: false },
      { version: 1, tour_title: 'Detailed v1', route: '', active_tab: 'detailed', days: [], is_final: false },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'itineraries' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: It } = await import('../components/Itinerary.jsx');
    render(<It query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getAllByText(/💾 Save v3/).length).toBeGreaterThan(0)); // Brief: v1,v2 saved -> next v3
    fireEvent.click(screen.getByText('Detailed'));
    // Detailed only has v1 saved -> next is v2, a completely different
    // counter from Brief's, proving the two histories are independent.
    await waitFor(() => expect(screen.getAllByText(/💾 Save v2/).length).toBeGreaterThan(0));
  });

  it('the version dropdown for the active flavor only shows that flavor\u2019s own saves, and marking final is scoped to it', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Brief Save', route: '', active_tab: 'brief', days: [], is_final: true },
      { version: 1, tour_title: 'Detailed Save', route: '', active_tab: 'detailed', days: [], is_final: false },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'itineraries' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: It } = await import('../components/Itinerary.jsx');
    render(<It query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Detailed Save')).toBeTruthy());
    // The draft loaded is Detailed's row (last in the array), but the doc
    // opens on Brief's tab -- Brief's dropdown should show ONLY Brief's own
    // final star, from Brief's v1, not Detailed's.
    const toggle = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('▾') && !b.textContent.includes('Export'));
    expect(toggle, 'version dropdown toggle not found').toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText('★')).toBeTruthy();
  });
});
