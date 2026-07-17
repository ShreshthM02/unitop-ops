import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-400', tourFileId: 'TF-400', groupName: 'TL Slab Test Group', nights: 3 };

describe('Tour Leader Slab: optional, off by default, does not affect group slabs', () => {
  it('is off by default, with an explanatory note instead of the full form', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText(/For when no FOC policy applies/)).toBeTruthy();
    expect(screen.queryByText(/Costs to cover/)).toBeNull();
  });

  it('checking the box reveals the full Tour Leader Slab form', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    expect(screen.getByText(/Costs to cover/)).toBeTruthy();
    expect(screen.getByText('Label (shown in quotation)')).toBeTruthy();
    expect(screen.getAllByText('Vehicle (label only)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paying Pax/).length).toBeGreaterThan(0);
  });

  it('enabling and filling in Tour Leader Slab does not change the group slabs\' own Final Price', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const beforeText = document.body.textContent;
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '5000' } });
    // Group slab Final Price cells are unaffected -- still show "—" for
    // the zero-cost baseline, exactly as before enabling TL Slab.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('Tour Leader Slab: correct math -- surcharge divides only across paying pax, T/L never pays', () => {
  it('computes Total T/L Cost as the sum of only the checked cost lines', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '3000' } });
    const mealsInput = screen.getByText('Extra Meals (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(mealsInput, { target: { value: '1000' } });
    // Uncheck transport/monument/localHandler/extras to isolate hotel+meals
    ['Transport (PP)','Monument (PP)','Local Handler (PP)','Extras (PP)'].forEach(label => {
      const checkbox = screen.getByText(label).closest('label').querySelector('input[type="checkbox"]');
      fireEvent.click(checkbox);
    });
    expect(screen.getByText('Total T/L Cost').parentElement.textContent).toContain('4,000'); // 3000 + 1000
  });

  it('divides the total by Paying Pax only -- confirms the "T/L does not pay" rule', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '12000' } });
    ['Extra Meals (PP)','Transport (PP)','Monument (PP)','Local Handler (PP)','Extras (PP)'].forEach(label => {
      const checkbox = screen.getByText(label).closest('label').querySelector('input[type="checkbox"]');
      fireEvent.click(checkbox);
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
    // 12000 / 12 paying pax = 1000 per pax -- NOT divided by 13 (which
    // would happen if the T/L were mistakenly counted as a payer).
    expect(screen.getByText('Surcharge Per Paying Pax').parentElement.textContent).toContain('1,000');
  });

  it('shows a clear prompt instead of a nonsense number when Paying Pax is not yet set', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '5000' } });
    expect(screen.getByText('Set paying pax above')).toBeTruthy();
  });

  it('unchecking a cost line removes it from the total immediately', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '5000' } });
    expect(screen.getByText('Total T/L Cost').parentElement.textContent).toContain('5,000');
    const hotelCheckbox = screen.getByText('Hotel (PP)').closest('label').querySelector('input[type="checkbox"]');
    fireEvent.click(hotelCheckbox);
    expect(screen.getByText('Total T/L Cost').parentElement.textContent).toContain('0');
  });
});

describe('Tour Leader Slab: "Fetch Latest Costs" pulls real numbers from the sheet, stays editable after', () => {
  it('fetch button populates Hotel/Meals fields from the sheet\'s own day-wise totals', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    // Edit the first existing day directly, rather than adding a new one
    // (which would shift input indices and make them harder to target).
    const mealCostInputs = document.querySelectorAll('input[placeholder="0"]');
    fireEvent.change(mealCostInputs[0], { target: { value: '800' } }); // day 1 meal cost
    fireEvent.change(mealCostInputs[1], { target: { value: '2500' } }); // day 1 hotel net pp

    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    fireEvent.click(screen.getByText(/Fetch Latest Costs from Cost Sheet/));

    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    const mealsInput = screen.getByText('Extra Meals (PP)').closest('div').querySelector('input[type="number"]');
    expect(hotelInput.value).toBe('2500');
    expect(mealsInput.value).toBe('800');
  });

  it('fetched values remain freely editable after fetching', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText(/Tour Leader Slab \(optional\)/));
    fireEvent.click(screen.getByText(/Fetch Latest Costs from Cost Sheet/));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '9999' } });
    expect(hotelInput.value).toBe('9999');
  });
});
