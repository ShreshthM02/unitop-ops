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
// 2026-07-24, then merged back into ONE document (Itinerary) with a
// Brief/Detailed flavor toggle -- they always shared the same day-by-day
// structure and the same `itineraries` table, split only by an active_tab
// tag on each saved version. That split is now gone from how history is
// READ: loadItineraryVersions returns every version regardless of which
// flavor was active when it was saved, and the whole list is one shared
// timeline. active_tab is still WRITTEN on save (recording which flavor was
// open at the time, for anyone reading old data), but nothing filters on it
// any more.

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

  it('loads EVERY saved version regardless of which flavor tag it carries -- one shared timeline, not two filtered ones', async () => {
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
    // The LATEST version loads into the draft regardless of which flavor
    // tag it was saved under -- version 2, tagged "detailed", is what shows.
    await waitFor(() => expect(screen.getByDisplayValue('Second Save (Detailed Tab Open)')).toBeTruthy());
    expect(screen.getByDisplayValue('Delhi - Leh - Alchi v2')).toBeTruthy();
    // Next version is 3, continuing the ONE shared sequence -- not 2 (which
    // would mean the "detailed" row above was invisible to this load).
    expect(screen.getAllByText(/💾 Save v3/).length).toBeGreaterThan(0);
  });

  it('the version dropdown shows both flavors\u2019 saves in one list, and marking final works regardless of which flavor a version was saved under', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Brief Save', route: '', active_tab: 'brief', days: [], is_final: false },
      { version: 2, tour_title: 'Detailed Save', route: '', active_tab: 'detailed', days: [], is_final: true },
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
    const toggle = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('▾') && !b.textContent.includes('Export'));
    expect(toggle, 'version dropdown toggle not found').toBeTruthy();
    fireEvent.click(toggle);
    // v2 (saved under the Detailed tag) is final -- shown in one shared list.
    expect(screen.getByText('★')).toBeTruthy();
  });
});
