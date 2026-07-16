import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-090', groupName: 'Extras Bug Test Group', nights: 3 };

// The bug: Extra Services were fully built (add/edit/save all worked, and
// were persisted correctly), but the amount was never actually included
// in calcSlab's subtotal -- meaning every cost sheet using Extras was
// silently under-costing the client by exactly however much was entered
// there. This test locks in the fix with an exact expected number, not
// just "the total changed."
describe('CostSheet: Extra Services now actually included in the Final Price Summary (real bug fix)', () => {
  it('a Lumpsum extra cost flows all the way through to the Final Price, with the exact right math', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Extra Service'));

    const descInput = screen.getByPlaceholderText(/Boat ride at Varanasi/);
    fireEvent.change(descInput, { target: { value: 'Cultural show' } });

    // Cost input is the number input in the same row as the description
    const row = descInput.closest('div').parentElement;
    const costInput = row.querySelector('input[type="number"]');
    fireEvent.change(costInput, { target: { value: '15000' } });
    // Mode defaults to "PP" in the UI, but the default slab's math is
    // easiest to verify with Lumpsum -- explicitly select it.
    const modeSelect = row.querySelector('select');
    fireEvent.change(modeSelect, { target: { value: 'Lumpsum' } });

    // Default slab: foc=15, gst=5%, markup=20%, roe=90, currency=US $.
    // extrasPP = 15000/15 = 1000. sub = 1000 (no other costs entered).
    // tax = round(1000*0.05) = 50. afterTax = 1050.
    // markupAmt = round(1050*0.20) = 210. sellingINR = 1260.
    // finalFX = ceil(1260/90) = 14.
    expect(screen.getByText('US $ 14')).toBeTruthy();
  });

  it('a "PP" mode extra cost is added directly, not divided by slab pax', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Extra Service'));

    const descInput = screen.getByPlaceholderText(/Boat ride at Varanasi/);
    const row = descInput.closest('div').parentElement;
    const costInput = row.querySelector('input[type="number"]');
    fireEvent.change(costInput, { target: { value: '100' } });
    // Mode already defaults to "PP" -- no change needed.

    // sub = 100 (added directly, not divided). tax = round(100*0.05) = 5.
    // afterTax = 105. markupAmt = round(105*0.20) = 21. sellingINR = 126.
    // finalFX = ceil(126/90) = 2.
    expect(screen.getAllByText('US $ 2').length).toBeGreaterThan(0);
  });

  it('with no extras entered, extras contribute nothing (no regression to the zero-cost baseline)', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    // No extras added at all -- Final Price should show "—" for a slab
    // with zero cost anywhere (matching the existing zero-cost display).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('the Extras PP column header now appears in the Final Price Summary table', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText('Extras PP')).toBeTruthy();
  });
});
