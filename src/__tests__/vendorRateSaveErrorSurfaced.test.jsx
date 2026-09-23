import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, direct report: "Saving a new contracted rate in vendors
// doesn't show up." Root cause: vendor_rates had a Row-Level Security
// policy scoped only to Supabase's built-in "authenticated" role, but
// this app runs entirely as "anon" -- every save was being silently
// rejected. Fixed directly (a new RLS policy). But there was a SECOND,
// independent problem found while fixing this: the save/delete/toggle
// functions never checked whether insert()/update() actually returned
// an error at all -- they just awaited the call and moved on
// regardless, closing the form and reloading the list as if it had
// worked. That's fixed here: any real failure now surfaces a visible
// Toast message instead of vanishing silently.

function makeFailingMockDb() {
  const db = {
    from: (table) => {
      let filters = {};
      const builder = {
        select: () => builder,
        eq: (col, val) => { filters[col] = val; return builder; },
        is: () => ({ then: (res) => res({ data: [], error: null }) }),
        insert: async () => ({ data: null, error: { message: 'new row violates row-level security policy for table "vendor_rates"' } }),
        update: async () => ({ data: null, error: { message: 'new row violates row-level security policy for table "vendor_rates"' } }),
      };
      return builder;
    },
  };
  return db;
}

describe('Vendor Rates: a failed save is no longer silent', () => {
  it('shows a visible error and does NOT close the form when the save actually fails', async () => {
    const db = makeFailingMockDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    fireEvent.change(screen.getByText('Room Category').parentElement.querySelector('input'), { target: { value: 'Deluxe Room' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));

    await waitFor(() => expect(screen.getByText(/Rate was NOT saved/)).toBeTruthy());
    // Real, pre-existing bug caught on review: Toast always showed a
    // checkmark regardless of message content -- this error should
    // show a warning icon, not one.
    expect(screen.getByText(/⚠ Rate was NOT saved/)).toBeTruthy();
    // The form should still be open with what was typed -- not silently
    // closed as if the save had gone through.
    expect(screen.getByDisplayValue('Deluxe Room')).toBeTruthy();
  });
});
