import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VendorMaster from '../components/VendorMaster.jsx';

// Real finding while building items 6/7: Contracted Rates never
// actually persisted anything at all -- rates was pure local component
// state, always reset to [] on every vendor selection regardless of
// what that vendor's own rates actually were. Anything typed there
// vanished the moment the panel closed. This tests the real fix
// (loading from and saving to the vendor's own rates) alongside items
// 6 (date range replacing Season) and 7 (the tax toggle).

describe('Contracted Rates: real persistence (the actual prerequisite fix)', () => {
  const hotelVendor = { id: 'v1', name: 'Taj Palace', type: 'Hotel', city: 'Delhi', active: true,
    rates: [{ id: 1, roomType: 'Deluxe', ratePP: '5000', ratesFrom: '2026-10-01', ratesTill: '2027-03-31', taxExclusive: true, taxPct: '18', notes: 'Peak season' }] };

  it('loads the vendor\u2019s own saved rates when selected, instead of always resetting to empty', () => {
    render(<VendorMaster vendors={[hotelVendor]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    expect(screen.getByDisplayValue('Deluxe')).toBeTruthy();
    expect(screen.getByDisplayValue('5000')).toBeTruthy();
    expect(screen.getByDisplayValue('Peak season')).toBeTruthy();
  });

  it('Save Rates genuinely persists via onSaveVendor, not just local state', async () => {
    const onSaveVendor = vi.fn(async () => {});
    const setVendors = vi.fn();
    render(<VendorMaster vendors={[hotelVendor]} setVendors={setVendors} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={onSaveVendor} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    fireEvent.click(screen.getByText('💾 Save Rates'));
    await waitFor(() => expect(onSaveVendor).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1', rates: expect.any(Array) })));
    expect(setVendors).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Rates saved ✓')).toBeTruthy());
  });

  it('a brand-new vendor starts with genuinely empty rates, not stale rates from whichever vendor was selected before', () => {
    render(<VendorMaster vendors={[hotelVendor]} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    expect(screen.getByDisplayValue('Deluxe')).toBeTruthy(); // confirm rates loaded first
    fireEvent.click(screen.getByText('+ New Vendor'));
    // form now shown for a new vendor -- no leftover rate rows from Taj Palace
    expect(screen.queryByDisplayValue('Deluxe')).toBeFalsy();
  });
});

describe('Contracted Rates item 6: Season replaced with real date pickers', () => {
  const vendors = [
    { id: 'v1', name: 'Taj Palace', type: 'Hotel', active: true, rates: [] },
    { id: 'v2', name: 'Golden Cabs', type: 'Transport', active: true, rates: [] },
    { id: 'v3', name: 'Ranthambore Safari', type: 'Activity Provider', active: true, rates: [] },
  ];

  it('Hotel (previously had Season) gets Rates From/Till date pickers', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Rates From')).toBeTruthy();
    expect(screen.getByText('Rates Till')).toBeTruthy();
    expect(screen.queryByText('Season')).toBeFalsy();
  });

  it('Activity Provider (never had Season) does not get date pickers -- not adding one it never had', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Ranthambore Safari'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.queryByText('Rates From')).toBeFalsy();
  });
});

describe('Contracted Rates item 7: tax toggle', () => {
  const vendors = [
    { id: 'v1', name: 'Taj Palace', type: 'Hotel', active: true, rates: [] },
    { id: 'v2', name: 'Ranthambore Safari', type: 'Activity Provider', active: true, rates: [] },
  ];

  it('the tax % field is hidden by default, and only appears once "Exclusive of tax" is checked', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.queryByText('Tax %')).toBeFalsy();
    fireEvent.click(screen.getByText('Exclusive of tax'));
    expect(screen.getByText('Tax %')).toBeTruthy();
  });

  it('applies to a vendor type that never had any tax field before (Activity Provider)', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Ranthambore Safari'));
    fireEvent.click(screen.getByText('Contracted Rates'));
    fireEvent.click(screen.getByText('+ Add Rate'));
    expect(screen.getByText('Exclusive of tax')).toBeTruthy();
  });
});
