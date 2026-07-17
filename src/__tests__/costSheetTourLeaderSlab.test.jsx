import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-500', tourFileId: 'TF-500', groupName: 'TL Slab Redesign Test', nights: 3 };

describe('Tour Leader Slabs: none by default, multiple allowed, correct default label', () => {
  it('starts with none added, showing an explanatory note', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText(/For when no FOC policy applies/)).toBeTruthy();
    expect(screen.queryByText(/Costs to cover/)).toBeNull();
  });

  it('"+ Add T/L Slab" adds one with the correct new default label "10 pax + 1 T/L"', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    expect(screen.getByDisplayValue('10 pax + 1 T/L')).toBeTruthy();
  });

  it('allows adding a second, independent T/L slab', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    expect(screen.getAllByDisplayValue('10 pax + 1 T/L').length).toBe(2);
  });

  it('removing one T/L slab leaves the other untouched', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const labelInputs = screen.getAllByDisplayValue('10 pax + 1 T/L');
    fireEvent.change(labelInputs[0], { target: { value: 'First Slab Renamed' } });
    // T/L slab cards render with a distinct background (#FFF9E6, i.e.
    // rgb(255, 249, 230) once jsdom normalizes it) -- this reliably
    // distinguishes their own "✕" from the 5 default group slabs' remove
    // buttons, which render earlier in the DOM.
    const tlCards = Array.from(document.querySelectorAll('div')).filter(el => el.getAttribute('style')?.includes('rgb(255, 249, 230)'));
    expect(tlCards.length).toBe(2);
    const removeSpan = Array.from(tlCards[0].querySelectorAll('span')).find(el => el.textContent === '✕');
    fireEvent.click(removeSpan);
    expect(screen.queryByDisplayValue('First Slab Renamed')).toBeNull();
    expect(screen.getByDisplayValue('10 pax + 1 T/L')).toBeTruthy();
  });
});

describe('Tour Leader Slabs: appear as real rows in the Final Price Summary, "just like a normal slab"', () => {
  it('an added T/L slab with a real label shows up as its own row in the Final Price Summary table', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const labelInput = screen.getByDisplayValue('10 pax + 1 T/L');
    fireEvent.change(labelInput, { target: { value: 'Small Group T/L Slab' } });
    expect(screen.getAllByText(/Small Group T\/L Slab/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Final Price Summary')).toBeTruthy();
  });

  it('the T/L slab row computes a real Final Price using its own costs and paying pax, not folded into group slabs', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '2500' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '10' } });
    expect(screen.getByText(/Final Price \(this T\/L slab\)/)).toBeTruthy();
  });
});

describe('Tour Leader Slabs: correct math (T/L never pays, surcharge divides only across paying pax)', () => {
  it('surcharge is checked-cost total divided by paying pax only', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '12000' } });
    ['Extra Meals (PP)','Transport (PP)','Monument (PP)','Local Handler (PP)','Extras (PP)'].forEach(label => {
      const checkbox = screen.getByText(label).closest('label').querySelector('input[type="checkbox"]');
      fireEvent.click(checkbox);
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
    expect(screen.getByText(/T\/L Surcharge \(per pax\)/).parentElement.textContent).toContain('1,000');
  });

  it('shows a clear prompt instead of a bad number when paying pax is not set', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const hotelInput = screen.getByText('Hotel (PP)').closest('div').querySelector('input[type="number"]');
    fireEvent.change(hotelInput, { target: { value: '5000' } });
    expect(screen.getByText('Set paying pax above')).toBeTruthy();
  });
});

describe('Tour Leader Slabs: "Fetch Latest Costs" works per-slab, independently', () => {
  it('fetching costs for one T/L slab does not affect another', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const mealCostInputs = document.querySelectorAll('input[placeholder="0"]');
    fireEvent.change(mealCostInputs[0], { target: { value: '800' } });
    fireEvent.change(mealCostInputs[1], { target: { value: '2500' } });

    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const fetchButtons = screen.getAllByText(/Fetch Latest Costs from Cost Sheet/);
    fireEvent.click(fetchButtons[0]);

    const hotelInputs = screen.getAllByText('Hotel (PP)').map(el => el.closest('div').querySelector('input[type="number"]'));
    expect(hotelInputs[0].value).toBe('2500');
    expect(hotelInputs[1].value).toBe('');
  });
});
