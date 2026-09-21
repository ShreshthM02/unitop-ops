import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Direct request: "if the date is not chosen and a particular rate is
// not picked because of the unchosen date, the warning flag message
// needs to have a better shape, maybe something common or a single
// banner at the top mentioning the days in which this problem has
// occurred. Having this beneath every hotel is very annoying." Was
// previously repeated once per affected day row; now a single banner
// above the table lists every affected day together.

const fakeVendors = [
  { id: 'v1', name: 'Test Hotel', type: 'Hotel', city: 'Agra', active: true },
];

function makeMockDb() {
  return {
    from: () => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder, is: () => builder,
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
  };
}

describe('Cost Sheet: one consolidated banner for the "no travel date" warning, not one per row', () => {
  it('shows exactly one banner, listing every affected day together, when multiple days have a hotel picked with no travel date set', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    // No travelDate on the query -- exactly the reported scenario.
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);

    const hotelInputs = screen.getAllByPlaceholderText('Primary hotel…');
    expect(hotelInputs.length).toBeGreaterThan(1);

    // Pick a hotel on the first two day rows.
    fireEvent.focus(hotelInputs[0]);
    fireEvent.mouseDown(screen.getByText(/Test Hotel/));
    fireEvent.focus(hotelInputs[1]);
    fireEvent.mouseDown(screen.getAllByText(/Test Hotel/)[0]);

    await waitFor(() => {
      const banners = screen.getAllByText(/No travel date set on this query/);
      expect(banners.length).toBe(1);
      expect(banners[0].textContent).toContain('Day 1');
      expect(banners[0].textContent).toContain('Day 2');
    });
  });

  it('shows no banner at all when no day has a hotel picked yet', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    expect(screen.queryByText(/No travel date set on this query/)).toBeNull();
  });
});
