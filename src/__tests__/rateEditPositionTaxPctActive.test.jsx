import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Three real, direct fixes/additions requested together:
// 1. Editing a rate opens the form right below THAT rate, not at the
//    bottom of the whole list.
// 2. A real "Tax %" input reappears when exclusive of tax, applied to
//    the stored base rate to compute the final (not baked in).
// 3. Rates can be marked active/inactive -- auto-computed from dates,
//    manually overridable, active shown first.

function makeMockDb(initialRows = []) {
  let rows = [...initialRows];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ then: (res) => res({ data: rows, error: null }) }),
        }),
      }),
      insert: async (payload) => { const row = { ...payload, id: String(Math.random()) }; rows.push(row); return { data: [row], error: null }; },
      update: (payload) => ({ eq: async (col, val) => { rows = rows.map(r => r.id === val ? { ...r, ...payload } : r); return { data: null, error: null }; } }),
    }),
  };
  return { db, getRows: () => rows };
}

describe('Editing a rate opens the form right below that rate, not at the bottom of the list', () => {
  it('the edit form for the SECOND rate appears right after it, not after the last rate in the list', async () => {
    const { db } = makeMockDb([
      { id: 'r1', vendor_id: 'v1', room_category: 'Classic', meal_plan: 'CP', single_rate: 3000, tax_inclusive: true },
      { id: 'r2', vendor_id: 'v1', room_category: 'Deluxe', meal_plan: 'CP', single_rate: 4000, tax_inclusive: true },
      { id: 'r3', vendor_id: 'v1', room_category: 'Suite', meal_plan: 'CP', single_rate: 5000, tax_inclusive: true },
    ]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('Deluxe')).toBeTruthy());
    const editButtons = screen.getAllByText('✏ Edit');
    // index 0 is the vendor Profile tab's own Edit button, index 1 is
    // Classic's, index 2 is Deluxe's -- the one we actually want here.
    fireEvent.click(editButtons[2]);
    // The edit form must be positioned as a sibling immediately after
    // the specific rate row being edited (Deluxe's own wrapper <div>),
    // not appended after every rate in the list.
    const deluxeCard = screen.getByText('Deluxe').closest('div[style*="background"]');
    const wrapperDiv = deluxeCard.parentElement; // the <div key={r.id}> wrapping card+form
    expect(wrapperDiv.textContent).toContain('💾 Save Rate');
    expect(wrapperDiv.textContent).not.toContain('Suite');
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Tax %: a real input reappears when exclusive of tax, applied to the base rate', () => {
  it('shows a Tax % input when Inclusive of tax is unchecked', async () => {
    const { db } = makeMockDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('+ Add Rate')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.queryByText('Tax %')).toBeFalsy(); // hidden while inclusive (the default)
    fireEvent.click(screen.getByLabelText(/Inclusive of tax/));
    expect(screen.getByText('Tax %')).toBeTruthy(); // appears once exclusive
  });

  it('a saved exclusive-of-tax rate displays the real base rate + the stored tax % applied, not a pre-baked final', async () => {
    const { db } = makeMockDb([
      { id: 'r1', vendor_id: 'v1', room_category: 'Deluxe', meal_plan: 'CP', single_rate: 10000, tax_inclusive: false, tax_pct: 18 },
    ]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    // Base 10000 + 18% = 11800, computed live, not stored.
    await waitFor(() => expect(screen.getByText('₹11,800')).toBeTruthy());
    expect(screen.getByText('+18%')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Active/Inactive: computed from dates, manually overridable, active shown first', () => {
  it('a rate within its date range shows Active; one outside shows Inactive', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 365*86400000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 365*86400000).toISOString().slice(0, 10);
    const { db } = makeMockDb([
      { id: 'r1', vendor_id: 'v1', room_category: 'Current Season', meal_plan: 'CP', single_rate: 5000, tax_inclusive: true, season_start: today, season_end: future, manual_active: null },
      { id: 'r2', vendor_id: 'v1', room_category: 'Expired Season', meal_plan: 'CP', single_rate: 5000, tax_inclusive: true, season_start: past, season_end: past, manual_active: null },
    ]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('Current Season')).toBeTruthy());
    // Active shown first in document order.
    const allText = document.body.textContent;
    expect(allText.indexOf('Current Season')).toBeLessThan(allText.indexOf('Expired Season'));
    expect(screen.getByText('● Active')).toBeTruthy();
    expect(screen.getByText('○ Inactive')).toBeTruthy();
  });

  it('a rate with no date range at all is treated as always active (evergreen), never silently hidden', async () => {
    const { db } = makeMockDb([
      { id: 'r1', vendor_id: 'v1', room_category: 'No Season Given', meal_plan: 'CP', single_rate: 5000, tax_inclusive: true, season_start: null, season_end: null, manual_active: null },
    ]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('No Season Given')).toBeTruthy());
    expect(screen.getByText('● Active')).toBeTruthy();
  });

  it('a manual override (marking an in-range rate inactive) takes precedence over the date computation', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 365*86400000).toISOString().slice(0, 10);
    const { db, getRows } = makeMockDb([
      { id: 'r1', vendor_id: 'v1', room_category: 'Manually Disabled', meal_plan: 'CP', single_rate: 5000, tax_inclusive: true, season_start: today, season_end: future, manual_active: null },
    ]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[{ id: 'v1', name: 'Test Hotel', type: 'Hotel', active: true }]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Test Hotel'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    await waitFor(() => expect(screen.getByText('● Active')).toBeTruthy());
    fireEvent.click(screen.getByText('Mark Inactive'));
    await waitFor(() => expect(getRows()[0].manual_active).toBe(false));
    await waitFor(() => expect(screen.getByText('○ Inactive')).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});
