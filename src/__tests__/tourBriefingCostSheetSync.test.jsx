import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Split out from exchangeOrderTourBriefingCostSheetSync.test.jsx on
// 2026-08-20 (Phase D): Exchange Order no longer pulls from Cost Sheet at
// all (see exchangeOrderPersistence.test.jsx for what replaced it), so
// this file now covers only Tour Briefing Sheet's Cost Sheet auto-pull,
// which is unaffected by that change.

const fakeQuery = { id: 'UTQ-2026-1800', groupName: 'Phase 5 Sync Test', nights: 3, tourFileId: 'TF-1800' };

function makeDb({ costSheetRows = [], tourBriefingRows = [] } = {}) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({
          data: t === 'cost_sheets' ? costSheetRows : (t === 'tour_briefings' ? tourBriefingRows : []),
          error: null,
        }),
      };
      return builder;
    }),
  };
}

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
