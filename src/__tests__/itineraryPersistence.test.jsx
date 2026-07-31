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

const { default: BriefItinerary } = await import('../components/BriefItinerary.jsx');
const { default: DetailedItinerary } = await import('../components/DetailedItinerary.jsx');

const fakeQuery = { id: 'UTQ-2026-700', groupName: 'Itinerary Persistence Test', destination: 'Ladakh', nights: 6 };

beforeEach(() => { mockDb.from.mockClear(); });

// Split 2026-07-24 (Letterhead Standardization): Brief and Detailed
// Itinerary are now genuinely separate documents/components, not one
// shared ItineraryBuilder with an internal style switcher. Both still
// save into the same `itineraries` table with active_tab hardcoded
// ("brief" / "detailed" respectively) -- these tests confirm each
// component correctly filters to only its own style's saved versions
// when loading from that shared table.

describe('BriefItinerary: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadItineraryVersions (via db.from("itineraries")) on mount', async () => {
    render(<BriefItinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('clicking Save Version calls the itineraries insert with the current draft, active_tab hardcoded to "brief"', async () => {
    render(<BriefItinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('days');
      expect(insertCalls[0][0]).toHaveProperty('tour_title');
      expect(insertCalls[0][0].active_tab).toBe('brief');
    });
  });

  it('the previously dead footer Save button now actually saves (had no onClick handler at all before the original fix)', async () => {
    render(<BriefItinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    expect(saveButtons.length).toBeGreaterThanOrEqual(1); // header + footer both have one
    fireEvent.click(saveButtons[saveButtons.length - 1]); // footer's copy
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<BriefItinerary query={fakeQuery} briefTemplate={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/BRIEF ITINERARY/)).toBeTruthy();
  });

  it('only loads active_tab="brief" versions, ignoring any "detailed" rows from the shared table', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Brief Saved Title', route: 'Delhi - Leh - Alchi', active_tab: 'brief',
        days: [{id:1,dayLabel:'DAY-1',title:'Custom Title',route:'',distance:'',time:'',meals:['B'],description:'',hotel:''}], is_final: false },
      { version: 5, tour_title: 'Detailed Should Not Appear', route: '', active_tab: 'detailed', days: [], is_final: false },
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
    const { default: BI } = await import('../components/BriefItinerary.jsx');
    render(<BI query={fakeQuery} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Brief Saved Title')).toBeTruthy());
    expect(screen.getByDisplayValue('Delhi - Leh - Alchi')).toBeTruthy();
    expect(screen.getByDisplayValue('Custom Title')).toBeTruthy();
    expect(screen.queryByDisplayValue('Detailed Should Not Appear')).toBeNull();
    // Next version should be 2 (following Brief's own v1), not 6 (which
    // would mean it incorrectly saw Detailed's v5 as part of its own sequence)
    expect(screen.getAllByText(/💾 Save v2/).length).toBeGreaterThan(0);
  });
});

describe('DetailedItinerary: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadItineraryVersions (via db.from("itineraries")) on mount', async () => {
    render(<DetailedItinerary query={fakeQuery} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('clicking Save Version calls the itineraries insert with active_tab hardcoded to "detailed"', async () => {
    render(<DetailedItinerary query={fakeQuery} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0].active_tab).toBe('detailed');
    });
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<DetailedItinerary query={fakeQuery} detailTemplate={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/DETAILED ITINERARY/)).toBeTruthy();
  });

  it('only loads active_tab="detailed" versions, ignoring any "brief" rows from the shared table', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Brief Should Not Appear', route: '', active_tab: 'brief', days: [], is_final: false },
      { version: 3, tour_title: 'Detailed Saved Title', route: 'Detailed Route', active_tab: 'detailed',
        days: [{id:1,dayLabel:'DAY-1',title:'',route:'',distance:'',time:'',meals:['B'],description:'',hotel:''}], is_final: true },
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
    const { default: DI } = await import('../components/DetailedItinerary.jsx');
    render(<DI query={fakeQuery} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Detailed Saved Title')).toBeTruthy());
    expect(screen.getByDisplayValue('Detailed Route')).toBeTruthy();
    expect(screen.queryByDisplayValue('Brief Should Not Appear')).toBeNull();
    // Its own v3 should show as final (★), confirming per-style final
    // tracking survived the split correctly. Detailed Itinerary now uses the
    // shared VersionDropdown like every other document, so the star lives in
    // the panel rather than in an always-visible pill row -- open it first.
    const toggle = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('▾') && !b.textContent.includes('Export'));
    expect(toggle, 'version dropdown toggle not found').toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByText('★')).toBeTruthy();
  });
});
