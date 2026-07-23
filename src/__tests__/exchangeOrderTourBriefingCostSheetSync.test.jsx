import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1800', groupName: 'Phase 5 Sync Test', nights: 3, tourFileId: 'TF-1800' };

function makeDb({ costSheetRows = [], exchangeOrderRows = [], tourBriefingRows = [] } = {}) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({
          data: t === 'cost_sheets' ? costSheetRows : (t === 'exchange_orders' ? exchangeOrderRows : (t === 'tour_briefings' ? tourBriefingRows : [])),
          error: null,
        }),
      };
      return builder;
    }),
  };
}

describe('ExchangeOrderGenerator Phase 5: auto-pulls partial draft orders from the star-marked Cost Sheet', () => {
  it('a brand-new Exchange Orders panel (zero saved versions) pulls draft orders automatically', async () => {
    const finalCS = { id: 'cs-1', version: 2, is_final: true, days: [], transports: [{ sector:'DELHI', vehicleType:'Large Coach' }], local_handlers: [{ sector:'KASHMIR' }] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled 2 draft orders from Cost Sheet v2/)).toBeTruthy());
  });

  it('never fabricates vendor name/contact fields -- those stay blank for the user to fill in', async () => {
    const finalCS = { id: 'cs-2', version: 1, is_final: true, days: [], transports: [{ sector:'DELHI', vehicleType:'Mini Bus' }], local_handlers: [] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled 1 draft order from Cost Sheet v1/)).toBeTruthy());
    // The saved orders list should show the pulled order with an empty vendor field
    expect(screen.getByText(/Not Confirmed|—/)).toBeTruthy();
  });

  it('shows the staleness banner when a newer final Cost Sheet exists', async () => {
    const finalCS = { id: 'cs-3', version: 4, is_final: true, days: [], transports: [{sector:'X',vehicleType:'Y'}], local_handlers: [] };
    const savedOrders = { version: 1, content: { orders: [], pulledFromCostSheetVersion: 2 }, is_final: false };
    const db = makeDb({ costSheetRows: [finalCS], exchangeOrderRows: [savedOrders] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Cost Sheet v4 \(final\) has transport\/handler data/)).toBeTruthy());
    expect(screen.getByText('↻ Pull latest')).toBeTruthy();
  });
});

describe('TourBriefingSheet Phase 5: auto-pulls hotels/programme/transport summary from the star-marked Cost Sheet', () => {
  it('a brand-new Tour Briefing Sheet (zero saved versions) pulls hotels and programme automatically', async () => {
    const finalCS = { id: 'cs-4', version: 3, is_final: true, days: [
      { day:'Day 1', date:'2026-08-01', movement:'DEL-SXR', hotel:'Hotel Heritage', mealPlan:'B/D' },
    ], transports: [{ sector:'DELHI', vehicleType:'Mini Bus' }] };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v3/)).toBeTruthy());
    fireEvent.click(screen.getByText('Hotels'));
    expect(screen.getByDisplayValue('Hotel Heritage')).toBeTruthy();
  });

  it('shows the staleness banner + re-pull when a newer final Cost Sheet exists', async () => {
    const finalCS = { id: 'cs-5', version: 6, is_final: true, days: [{ day:'Day 1', date:'', movement:'NEWER-MOVE', hotel:'Newer Hotel', mealPlan:'' }], transports: [] };
    const savedTB = { version: 1, content: { pulledFromCostSheetVersion: 3, hotels: [], programme: [] }, is_final: false };
    const db = makeDb({ costSheetRows: [finalCS], tourBriefingRows: [savedTB] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
    render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Cost Sheet v6 \(final\) has hotel\/programme data/)).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull latest'));
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v6/)).toBeTruthy());
    fireEvent.click(screen.getByText('Hotels'));
    expect(screen.getByDisplayValue('Newer Hotel')).toBeTruthy();
  });
});
