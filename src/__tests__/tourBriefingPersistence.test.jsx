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
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');

const fakeQuery = { id: 'UTQ-2026-900', groupName: 'Tour Briefing Persistence Test' };

beforeEach(() => { mockDb.from.mockClear(); });

describe('TourBriefingSheet: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadTourBriefingVersions (via db.from("tour_briefings")) on mount', async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('tour_briefings'));
  });

  it('clicking Save Version calls the tour_briefings insert with the bundled content', async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='tour_briefings')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('content');
      expect(insertCalls[0][0].content).toHaveProperty('hotels');
      expect(insertCalls[0][0].content).toHaveProperty('programme');
    });
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}}/>);
    expect(await screen.findByText(/TOUR BRIEFING SHEET/)).toBeTruthy();
  });

  it('loading a previously saved version populates recipient and subject into the draft', async () => {
    const versionRows = [
      { version: 1, content: { recipient: 'Saved Recipient', subject: 'SAVED SUBJECT LINE', hotels: [], flights: [], trains: [], guides: [], otherSvcs: [], programme: [], contacts: [] }, is_final: false },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'tour_briefings' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TBS } = await import('../components/TourBriefingSheet.jsx');
    render(<TBS query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('Saved Recipient')).toBeTruthy());
    expect(screen.getByDisplayValue('SAVED SUBJECT LINE')).toBeTruthy();
  });
});

describe('TourBriefingSheet: facilitators prop bug fix (was passed as "vendors", unfiltered -- the component always saw an empty list)', () => {
  it('when facilitators are passed correctly, they appear as selectable options in the Tour Facilitators section', async () => {
    const facilitators = [{ id: 'VND-1', name: 'Prithvi', type: 'Tour Facilitator', active: true }];
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={facilitators} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('Tour Facilitators'));
    expect(await screen.findByText('Prithvi')).toBeTruthy();
  });
});
