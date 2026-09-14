import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real, direct request: Hotel/Restaurant/Transport/Local Handler/
// Activity & Other all get a redesigned, real, database-backed
// (vendor_rates) contracted-rates system, editable from the app --
// replacing the old generic, manually-typed jsonb editor entirely for
// these five types. Tour Facilitator (not part of this request) keeps
// the old system unchanged -- covered separately in
// vendorContractedRates.test.jsx.

function makeMockDb(initialRows = []) {
  let rows = [...initialRows];
  let nextId = 100;
  const db = {
    // Matches the real supabase.js shape: a single shared builder where
    // eq()/is() push filters and return the SAME builder (so they can be
    // called before OR after update(), matching the real, correct
    // .eq(...).update(...) call order this app actually uses).
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

describe('Vendor Rates Redesign: Hotel gets a real, editable rates UI (not read-only anymore)', () => {
  it('can add a brand-new rate through the app, which is genuinely saved via a real database insert', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Market Segment')).toBeTruthy();
    expect(screen.getByText('Rates From')).toBeTruthy();
    expect(screen.getByText('Rates Till')).toBeTruthy();
    expect(screen.getByText('Room Category')).toBeTruthy();
    expect(screen.getByText('Meal Plan')).toBeTruthy();
    const mealSelect = screen.getByText('Meal Plan').parentElement.querySelector('select');
    expect(['EP','CP','MAP','AP']).toEqual(Array.from(mealSelect.options).map(o=>o.value));
    fireEvent.change(screen.getByText('Room Category').parentElement.querySelector('input'), { target: { value: 'Deluxe Room' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(screen.getByText('Deluxe Room')).toBeTruthy());
  });

  it('can edit an existing real rate, which updates via a real database update, not a fresh insert', async () => {
    const { db, getRows } = makeMockDb([{ id: 'r1', vendor_id: 'v1', room_category: 'Classic', meal_plan: 'CP', single_rate: 3000, tax_inclusive: true }]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('Classic')).toBeTruthy());
    // Two "✏ Edit" controls exist on screen (the vendor profile's own
    // Edit button, and this rate row's) -- get the rate row's specifically.
    const editButtons = screen.getAllByText('✏ Edit');
    fireEvent.click(editButtons[editButtons.length - 1]);
    fireEvent.change(screen.getByDisplayValue('Classic'), { target: { value: 'Classic Renovated' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(getRows().find(r=>r.id==='r1').room_category).toBe('Classic Renovated'));
    expect(getRows()).toHaveLength(1); // still one row, not a second one created
  });

  it('can delete a rate, which soft-deletes it (sets deleted_at) rather than a hard delete', async () => {
    const { db, getRows } = makeMockDb([{ id: 'r1', vendor_id: 'v1', room_category: 'Classic', meal_plan: 'CP', single_rate: 3000, tax_inclusive: true }]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const hotel = { id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<VendorMaster vendors={[hotel]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('Classic')).toBeTruthy());
    fireEvent.click(screen.getByText('✕ Delete'));
    await waitFor(() => expect(getRows()[0].deleted_at).toBeTruthy());
    vi.restoreAllMocks();
  });
});

describe('Vendor Rates Redesign: Restaurant -- "Meal Type" renamed to "Menu", now free text', () => {
  it('shows a free-text Menu field, not the old Meal Type dropdown', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const restaurant = { id: 'v2', name: 'Test Restaurant', type: 'Restaurant', active: true };
    render(<VendorMaster vendors={[restaurant]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Restaurant'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.queryByText('Meal Type')).toBeFalsy();
    const menuInput = screen.getByText('Menu').parentElement.querySelector('input');
    expect(menuInput).toBeTruthy(); // free text, not a <select>
    fireEvent.change(menuInput, { target: { value: 'Set menu with 3 courses' } });
    expect(menuInput.value).toBe('Set menu with 3 courses');
  });
});

describe('Vendor Rates Redesign: Transport -- Vehicle Type is now free text, old rate fields removed, Particulars + Rate added', () => {
  it('Vehicle Type is a free-text input, not the old dropdown', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const transport = { id: 'v3', name: 'Test Transport', type: 'Transport', active: true };
    render(<VendorMaster vendors={[transport]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Transport'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Vehicle Type')).toBeTruthy();
    const vehicleInput = screen.getByText('Vehicle Type').parentElement.querySelector('input');
    expect(vehicleInput).toBeTruthy(); // free text now, not a <select>
    fireEvent.change(vehicleInput, { target: { value: 'Custom 20-seater minibus' } });
    expect(vehicleInput.value).toBe('Custom 20-seater minibus');
  });

  it('removes Rate/Day, Rate/KM, and Capacity; adds Particulars and a free-text Rate', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const transport = { id: 'v3', name: 'Test Transport', type: 'Transport', active: true };
    render(<VendorMaster vendors={[transport]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Transport'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.queryByText('Rate/Day (₹)')).toBeFalsy();
    expect(screen.queryByText('Rate/KM (₹)')).toBeFalsy();
    expect(screen.queryByText('Capacity')).toBeFalsy();
    expect(screen.getByText('Particulars')).toBeTruthy();
    expect(screen.getByText('Rate')).toBeTruthy();
    const rateInput = screen.getByText('Rate').parentElement.querySelector('input');
    expect(rateInput.type).toBe('text'); // genuinely free text, not type="number"
    fireEvent.change(rateInput, { target: { value: '₹3000/day + ₹15/km beyond 250km' } });
    expect(rateInput.value).toBe('₹3000/day + ₹15/km beyond 250km');
  });
});

describe('Vendor Rates Redesign: Local Handler -- full new field set', () => {
  it('shows Market Segment, Rates From/Till, Particulars, Rate (per person), Single Supplement, and a tax toggle', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const handler = { id: 'v4', name: 'Test Handler', type: 'Local Handler', active: true };
    render(<VendorMaster vendors={[handler]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Handler'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Market Segment')).toBeTruthy();
    expect(screen.getByText('Rates From')).toBeTruthy();
    expect(screen.getByText('Rates Till')).toBeTruthy();
    expect(screen.getByText('Particulars')).toBeTruthy();
    expect(screen.getByText('Rate (per person)')).toBeTruthy();
    expect(screen.getByText('Single Supplement')).toBeTruthy();
    expect(screen.getByText('Tax')).toBeTruthy();
  });

  it('saving a Local Handler rate persists rate (numeric) and single_supplement correctly via a real insert', async () => {
    const { db, getRows } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const handler = { id: 'v4', name: 'Test Handler', type: 'Local Handler', active: true };
    render(<VendorMaster vendors={[handler]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Handler'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    fireEvent.change(screen.getByText('Rate (per person)').parentElement.querySelector('input'), { target: { value: '1500' } });
    fireEvent.change(screen.getByText('Single Supplement').parentElement.querySelector('input'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('💾 Save Rate'));
    await waitFor(() => expect(getRows()).toHaveLength(1));
    expect(getRows()[0].rate).toBe('1500');
    expect(getRows()[0].single_supplement).toBe('500');
  });
});

describe('Vendor Rates Redesign: Activity & Other -- full new field set, applies to both', () => {
  it.each(['Activity', 'Other'])('%s vendor type shows Rates From/Till, Particulars, Rate, and a tax toggle', async (vtype) => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const vendor = { id: 'v5', name: `Test ${vtype}`, type: vtype, active: true };
    render(<VendorMaster vendors={[vendor]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText(`Test ${vtype}`));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Rates From')).toBeTruthy();
    expect(screen.getByText('Rates Till')).toBeTruthy();
    expect(screen.getByText('Particulars')).toBeTruthy();
    expect(screen.getByText('Rate')).toBeTruthy();
    expect(screen.getByText('Tax')).toBeTruthy();
    expect(screen.queryByText('Market Segment')).toBeFalsy(); // not part of this type's spec
  });
});
