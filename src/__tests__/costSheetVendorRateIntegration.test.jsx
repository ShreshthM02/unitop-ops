import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, direct request: a real vendor dropdown for primary hotel
// (replacing free text), with rates fetched only from that vendor's
// own real, active, date-matching contracted rates. Selecting a rate
// auto-computes Hotel Net PP (double rate / 2) and Single Supplement
// (the real single rate), both with tax applied live.

const fakeVendors = [
  { id: 'v1', name: 'Test Hotel', type: 'Hotel', city: 'Agra', active: true },
  { id: 'v2', name: 'Other Hotel', type: 'Hotel', city: 'Delhi', active: true },
  { id: 'v3', name: 'A Restaurant', type: 'Restaurant', active: true }, // should never appear as a hotel option
];

function makeMockDb(rates) {
  // Fully mocked, matching the established, proven-working pattern
  // used by this app's other CostSheet tests (e.g.
  // costSheetTourExecutionPreFill.test.jsx) -- every table resolves to
  // a real, controlled {data:[],error:null} shape rather than
  // delegating to a real, unmocked connection that fails unpredictably
  // in a test environment. Only vendor_rates resolves to this test's
  // own fixture rates.
  return {
    from: (table) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        is: () => builder,
        insert: async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }),
        update: async () => ({ data: [], error: null }),
        then: (resolve) => resolve({ data: table === 'vendor_rates' ? rates : [], error: null }),
      };
      return builder;
    },
  };
}

describe('CostSheet: real vendor-linked hotel picker, replacing free text', () => {
  it('only Hotel-type vendors appear as options, never Restaurant or other types', async () => {
    const db = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Primary hotel…').length).toBeGreaterThan(0));
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    expect(screen.getByText(/Test Hotel/)).toBeTruthy();
    expect(screen.getByText(/Other Hotel/)).toBeTruthy();
    expect(screen.queryByText(/A Restaurant/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('selecting a hotel then a rate auto-fills Meal Plan, Hotel Net PP (double/2), and Single Supplement (the exact same value as Hotel Net PP, not the hotel\'s own single_rate), with tax applied', async () => {
    const rates = [
      { id: 'r1', vendor_id: 'v1', room_category: 'Deluxe', meal_plan: 'CP', single_rate: 4000, double_rate: 5000, tax_inclusive: true, season_start: null, season_end: null, manual_active: null },
    ];
    const db = makeMockDb(rates);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2, travelDate: '2026-11-01' }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Primary hotel…').length).toBeGreaterThan(0));
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.mouseDown(screen.getByText(/Test Hotel/));
    await waitFor(() => expect(screen.getByText('Deluxe (CP)')).toBeTruthy());
    fireEvent.change(screen.getByText('Deluxe (CP)').closest('select'), { target: { value: 'r1' } });
    // Hotel Net PP = double_rate / 2 = 2500 (tax-inclusive already); Single
    // Supp is now set to that exact same 2500 -- direct instruction,
    // deliberately ignoring the rate's own single_rate (4000) entirely.
    expect(screen.getAllByDisplayValue('2500').length).toBe(2);
    expect(screen.queryByDisplayValue('4000')).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a rate outside the query\'s own travel date is excluded, but one with no date range at all is always included', async () => {
    const rates = [
      { id: 'r1', vendor_id: 'v1', room_category: 'Winter Only', meal_plan: 'CP', single_rate: 3000, double_rate: 4000, tax_inclusive: true, season_start: '2026-10-01', season_end: '2026-12-31', manual_active: null },
      { id: 'r2', vendor_id: 'v1', room_category: 'Summer Only', meal_plan: 'CP', single_rate: 3500, double_rate: 4500, tax_inclusive: true, season_start: '2027-04-01', season_end: '2027-06-30', manual_active: null },
      { id: 'r3', vendor_id: 'v1', room_category: 'Evergreen Rate', meal_plan: 'CP', single_rate: 3200, double_rate: 4200, tax_inclusive: true, season_start: null, season_end: null, manual_active: null },
    ];
    const db = makeMockDb(rates);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    // Query's travel date falls in Winter's range, not Summer's.
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2, travelDate: '2026-11-15' }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Primary hotel…').length).toBeGreaterThan(0));
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.mouseDown(screen.getByText(/Test Hotel/));
    await waitFor(() => expect(screen.getByText('Winter Only (CP)')).toBeTruthy());
    expect(screen.getByText('Evergreen Rate (CP)')).toBeTruthy(); // no date range -- always included
    expect(screen.queryByText('Summer Only (CP)')).toBeFalsy(); // outside the query's travel date
    vi.doUnmock('../lib/supabase.js');
  });

  it('with no travel date set on the query, every rate is shown with a clear warning, not silently filtered to none', async () => {
    const rates = [
      { id: 'r1', vendor_id: 'v1', room_category: 'Any Season', meal_plan: 'CP', single_rate: 3000, double_rate: 4000, tax_inclusive: true, season_start: '2026-10-01', season_end: '2026-12-31', manual_active: null },
    ];
    const db = makeMockDb(rates);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>); // no travelDate
    await waitFor(() => expect(screen.getAllByPlaceholderText('Primary hotel…').length).toBeGreaterThan(0));
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.mouseDown(screen.getByText(/Test Hotel/));
    await waitFor(() => expect(screen.getByText('Any Season (CP)')).toBeTruthy());
    expect(screen.getByText(/No travel date set on this query/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('Alt hotel is a real vendor picker too, but never fetches or applies rates', async () => {
    const db = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Alt hotel…').length).toBeGreaterThan(0));
    const altInput = screen.getAllByPlaceholderText('Alt hotel…')[0];
    fireEvent.focus(altInput);
    fireEvent.mouseDown(screen.getByText(/Other Hotel/));
    // No "Pick rate" dropdown should ever appear for Alt hotel.
    expect(screen.queryByText('Pick rate…')).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});
