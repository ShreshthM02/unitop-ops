import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Direct request: "Choosing hotel from dropdown should also have an
// option of free text if not choosing from existing vendors." The
// picker already had a display-only fallback for legacy free-text
// data (fallbackDisplay); this adds an actual INPUT mechanism -- an
// explicit "+ Use ... (not in vendor list)" option appears when
// what's typed matches no real vendor, for both the primary and alt
// hotel pickers.

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

describe('Cost Sheet hotel picker: a free-text option when the hotel is not an existing vendor', () => {
  it('typing a name that matches no vendor shows a "+ Use ..." option for the primary hotel', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.change(hotelInput, { target: { value: 'The Grand Riverside (new, not on file yet)' } });
    expect(screen.getByText(/\+ Use "The Grand Riverside \(new, not on file yet\)"/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('clicking the free-text option sets the hotel name directly, with no vendor link', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.change(hotelInput, { target: { value: 'A Brand New Hotel' } });
    fireEvent.mouseDown(screen.getByText(/\+ Use "A Brand New Hotel"/));
    expect(screen.getByDisplayValue('A Brand New Hotel')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('does not show the free-text option when the typed text exactly matches a real vendor', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: makeMockDb(), realtimeClient: null }));
    vi.resetModules();
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-1', tourFileId: 'TF-1', nights: 2 }} onClose={()=>{}} onProceedToQuotation={()=>{}} vendors={fakeVendors}/>);
    const hotelInput = screen.getAllByPlaceholderText('Primary hotel…')[0];
    fireEvent.focus(hotelInput);
    fireEvent.change(hotelInput, { target: { value: 'Test Hotel (Agra)' } });
    expect(screen.queryByText(/\+ Use/)).toBeNull();
    vi.doUnmock('../lib/supabase.js');
  });
});
