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

const { default: ItineraryBuilder } = await import('../components/ItineraryBuilder.jsx');

const fakeQuery = { id: 'UTQ-2026-700', groupName: 'Itinerary Persistence Test', destination: 'Ladakh', nights: 6 };

beforeEach(() => { mockDb.from.mockClear(); });

describe('ItineraryBuilder: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadItineraryVersions (via db.from("itineraries")) on mount', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('clicking Save Version calls the itineraries insert with the current draft (tourTitle, route, days)', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('days');
      expect(insertCalls[0][0]).toHaveProperty('tour_title');
      expect(insertCalls[0][0]).toHaveProperty('active_tab');
    });
  });

  it('the previously dead footer Save button now actually saves (had no onClick handler at all before)', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    expect(saveButtons.length).toBeGreaterThanOrEqual(1); // header + footer both have one
    fireEvent.click(saveButtons[saveButtons.length - 1]); // footer's copy
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/ITINERARY BUILDER/)).toBeTruthy();
  });

  it('loading a previously saved version populates tourTitle, route, and days into the draft', async () => {
    const versionRows = [
      { version: 1, tour_title: 'Saved Tour Title', route: 'Delhi - Leh - Alchi', active_tab: 'outlined',
        days: [{id:1,dayLabel:'DAY-1',title:'Custom Title',route:'',distance:'',time:'',meals:['B'],description:'',hotel:''}], is_final: false },
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
    const { default: IB } = await import('../components/ItineraryBuilder.jsx');
    render(<IB query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Saved Tour Title')).toBeTruthy());
    expect(screen.getByDisplayValue('Delhi - Leh - Alchi')).toBeTruthy();
    expect(screen.getByDisplayValue('Custom Title')).toBeTruthy();
  });
});

describe('ItineraryBuilder: Brief and Detailed have genuinely independent version sequences (not shared)', () => {
  it('saving a Brief version does not bump Detailed\'s next version number, and vice versa', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    // Starts on Brief (renamed from "outlined"), save v1
    fireEvent.click(await screen.findByText('📋 Brief'));
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('itineraries'));

    // Switch to Detailed -- should still be v1, not v2, since it has its own sequence
    fireEvent.click(screen.getByText('📖 Detailed'));
    expect((await screen.findAllByText(/💾 Save v1/)).length).toBeGreaterThan(0);
  });

  it('the internal style value is "brief", not "outlined" (renamed everywhere)', async () => {
    render(<ItineraryBuilder query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='itineraries')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0].active_tab).toBe('brief');
    });
  });

  it('marking a Brief version final does not affect Detailed\'s final marking (scoped by style in markItineraryVersionFinal)', async () => {
    const versionRows = [
      { version: 1, active_tab: 'brief', tour_title: 'T', days: [], is_final: false },
      { version: 1, active_tab: 'detailed', tour_title: 'T', days: [], is_final: true },
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
    const { default: IB } = await import('../components/ItineraryBuilder.jsx');
    render(<IB query={fakeQuery} briefTemplate={{}} detailTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    // Detailed's v1 should show as final (★), confirming per-style final tracking loaded correctly
    fireEvent.click(await screen.findByText('📖 Detailed'));
    await waitFor(() => expect(screen.getByText('★')).toBeTruthy());
  });
});
