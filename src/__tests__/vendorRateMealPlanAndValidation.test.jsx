import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, direct report (with a screenshot): saving a Hotel rate failed
// with "null value in column \"meal_plan\" ... violates not-null
// constraint" -- despite the Meal Plan dropdown visibly showing "CP"
// selected. Root cause: the <select> shows "CP" as a purely visual
// default whenever nothing's been explicitly chosen yet
// (value={rateForm.meal_plan||"CP"}), but the save payload read
// rateForm.meal_plan raw, with no matching default -- so a rate saved
// without ever touching that already-correct-looking dropdown sent
// meal_plan:null. Fixed to use the same "CP" default the dropdown
// itself already shows.
//
// A second, related bug found via the same investigation: the
// database's meal_plan column was unconditionally NOT NULL, even
// though the app's own schema deliberately sends null for every
// vendor type except Hotel (Restaurant/Transport/Local Handler/
// Activity/Other never have a meal plan at all) -- meaning every
// non-Hotel rate save was ALSO failing this same constraint. Fixed
// live in the database (column is now nullable).
//
// A third, separate bug found in the same area: room_category is a
// genuinely required field (its own real NOT NULL constraint) with no
// client-side check at all -- an empty save reached the database and
// came back as a raw Postgres error instead of a clear message.

function makeMockDb(initialRows = []) {
  let rows = [...initialRows];
  let nextId = 100;
  const db = {
    from: (table) => {
      let filters = {};
      const builder = {
        select: () => builder,
        eq: (col, val) => { filters[col] = val; return builder; },
        is: (col, val) => ({ then: (res) => res({ data: rows.filter(r => filters.vendor_id ? r.vendor_id === filters.vendor_id : true), error: null }) }),
        insert: async (payload) => { const row = { ...payload, id: String(nextId++) }; rows.push(row); return { data: [row], error: null }; },
        update: async (payload) => {
          rows = rows.map(r => (filters.id ? r.id === filters.id : true) ? { ...r, ...payload } : r);
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
  return { db, getRows: () => rows };
}

describe('Vendor Rates: Meal Plan defaults to "CP" in the actual saved payload, matching what the dropdown already shows', () => {
  it('saving a Hotel rate without ever touching the Meal Plan dropdown still saves meal_plan as "CP", not null', async () => {
    const { db, getRows } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    fireEvent.change(screen.getByText(/Room Category/).parentElement.querySelector('input'), { target: { value: 'Deluxe Room' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(getRows().length).toBe(1));
    expect(getRows()[0].meal_plan).toBe('CP');
  });

  it('explicitly choosing a different meal plan still saves that exact choice', async () => {
    const { db, getRows } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    fireEvent.change(screen.getByText(/Room Category/).parentElement.querySelector('input'), { target: { value: 'Deluxe Room' } });
    const mealSelect = screen.getByText('Meal Plan').parentElement.querySelector('select');
    fireEvent.change(mealSelect, { target: { value: 'MAP' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(getRows().length).toBe(1));
    expect(getRows()[0].meal_plan).toBe('MAP');
  });
});

describe('Vendor Rates: Room Category (or Menu/Particulars, per vendor type) is validated before attempting a save', () => {
  it('shows a clear message and does not attempt to save when left empty', async () => {
    const { db, getRows } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(screen.getByText(/Room Category is required/)).toBeTruthy());
    expect(getRows().length).toBe(0);
  });
});
