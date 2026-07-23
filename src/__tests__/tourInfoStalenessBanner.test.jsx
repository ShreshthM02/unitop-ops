import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const tourFileQuery = { id: 'UTQ-2026-1400', tourFileId: 'TF-2026-1400', groupName: 'Staleness Banner Test', status: 'operations', manualWF: [], audit: [], remarks: [], assignedTo: 'staff-1' };
const staff = [{ id: 'staff-1', name: 'Priya', role: 'ops' }];
const baseProps = { query: tourFileQuery, onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{}, onToggleWF:()=>{}, onCancel:()=>{}, onUpdateRemarks:()=>{}, onUpdateQuery:()=>{}, staff, currentUser:{id:'staff-1',name:'Priya'} };

function mockDbWithFinalCostSheet(finalVersionRow) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: t === 'cost_sheets' ? [finalVersionRow] : [], error: null }),
      };
      return builder;
    }),
  };
}

beforeEach(() => { vi.resetModules(); });

describe('Tour Info Day-wise Itinerary/Hotels: mutual staleness banner against the star-marked Cost Sheet', () => {
  it('shows the "sync available" banner + button when tour_execution has never been synced from the final Cost Sheet', async () => {
    const finalCS = { version: 2, is_final: true, days: [{ day:'Day 1', movement:'DEL-SXR', hotel:'Hotel Heritage' }] };
    const db = mockDbWithFinalCostSheet(finalCS);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    await waitFor(() => expect(screen.getByText(/Cost Sheet v2 \(final\) has route\/hotel data/)).toBeTruthy());
    expect(screen.getByText('↻ Sync from Cost Sheet')).toBeTruthy();
  });

  it('shows the "in sync" confirmation, no banner, when tour_execution.syncedFromCostSheetVersion already matches the final version', async () => {
    const finalCS = { version: 3, is_final: true, days: [{ day:'Day 1', movement:'X', hotel:'Y' }] };
    const db = mockDbWithFinalCostSheet(finalCS);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    const syncedTE = { queryId: tourFileQuery.id, days: [{id:1,dayLabel:'Day 1',route:'X',hotelName:'Y'}], facilitators:[], localHandlers:[], transporters:[], flights:[], syncedFromCostSheetVersion: 3 };
    render(<QueryDrawerWithQuote {...baseProps} tourExecution={syncedTE} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    await waitFor(() => expect(screen.getByText(/In sync with Cost Sheet v3/)).toBeTruthy());
    expect(screen.queryByText('↻ Sync from Cost Sheet')).toBeNull();
  });

  it('shows a neutral message, no banner, when no Cost Sheet has been marked final yet', async () => {
    const db = { from: vi.fn(() => ({ select:()=>({eq:()=>({order:()=>({ then: (resolve) => resolve({ data: [], error: null }) })})}) })) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    await waitFor(() => expect(screen.getByText(/No Cost Sheet has been marked final yet/)).toBeTruthy());
    expect(screen.queryByText('↻ Sync from Cost Sheet')).toBeNull();
  });

  it('clicking Sync pulls the final Cost Sheet\'s movement/hotel into the Day-wise Itinerary fields', async () => {
    const finalCS = { version: 2, is_final: true, days: [{ day:'Day 1', movement:'DEL-SXR-SYNCED', hotel:'Synced Hotel' }] };
    const db = mockDbWithFinalCostSheet(finalCS);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    const onUpdateTourExecution = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={onUpdateTourExecution}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    await waitFor(() => expect(screen.getByText('↻ Sync from Cost Sheet')).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Sync from Cost Sheet'));
    expect(screen.getByDisplayValue('DEL-SXR-SYNCED')).toBeTruthy();
    expect(onUpdateTourExecution).toHaveBeenCalled();
    const [, savedData] = onUpdateTourExecution.mock.calls[0];
    expect(savedData.syncedFromCostSheetVersion).toBe(2);
  });

  it('does not check staleness at all for a plain query (not yet converted to a tour file)', async () => {
    const plainQuery = { id: 'UTQ-2026-1401', groupName: 'Plain Query', status: 'new_query', manualWF: [], audit: [], remarks: [] };
    const finalCS = { version: 1, is_final: true, days: [] };
    const db = mockDbWithFinalCostSheet(finalCS);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    render(<QueryDrawerWithQuote {...baseProps} query={plainQuery} onUpdateTourExecution={()=>{}}/>);
    // No Day-wise Itinerary tab exists at all for a plain query
    expect(screen.queryByText('Day-wise Itinerary')).toBeNull();
    expect(db.from).not.toHaveBeenCalledWith('cost_sheets');
  });
});
