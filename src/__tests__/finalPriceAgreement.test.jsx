import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-quotation-uuid' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');

const fakeQuery = { id: 'UTQ-2026-999', groupName: 'Final Price Test', destination: 'Kerala' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

beforeEach(() => {
  mockDb.from.mockClear();
  if (window.alert.mockRestore) window.alert.mockRestore();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('Final Price Agreement: required before marking a version final', () => {
  it('shows the Final Price Agreement section with slab dropdown, confirmed pax, and tour value fields', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByText('💰 Final Price Agreement')).toBeTruthy();
    expect(screen.getByText('Agreed Slab')).toBeTruthy();
    expect(screen.getByText('Confirmed Pax')).toBeTruthy();
    expect(screen.getByText(/Tour Value/)).toBeTruthy();
  });

  it('the "Calculate (slab × pax)" button correctly computes tour value from the agreed slab price and confirmed pax', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    // The default template includes a slab with a label -- set its price and select it
    const priceInputs = document.querySelectorAll('input[placeholder="237"]');
    fireEvent.change(priceInputs[0], { target: { value: '250' } });
    const slabSelect = screen.getByText('Agreed Slab').parentElement.querySelector('select');
    const firstRealOption = Array.from(slabSelect.options).find(o => o.value !== '');
    fireEvent.change(slabSelect, { target: { value: firstRealOption.value } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 17'), { target: { value: '17' } });
    fireEvent.click(screen.getByText('= Calculate (slab × pax)'));
    expect(screen.getByPlaceholderText('0').value).toBe('4250'); // 250 * 17
  });

  it('the calculate button warns instead of computing when slab or pax is missing', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('= Calculate (slab × pax)'));
    expect(window.alert).toHaveBeenCalled();
  });
});

describe('Final Price Agreement: marking a version final is blocked without it (the actual critical requirement)', () => {
  it('clicking the star on a version with no agreed slab/pax/tour value shows a warning and does NOT mark it final', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText(/💾 Save v1/));
    // A version pill now exists; try to star it without ever filling in the agreement fields
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    expect(starButtons.length).toBeGreaterThan(0);
    fireEvent.click(starButtons[0]);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Final Price Agreement'));
    // Should still show the empty star, not the filled one
    expect(starButtons[0].textContent).toBe('☆');
  });

  it('a version saved WITH all three fields filled in can be marked final successfully', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const priceInputs = document.querySelectorAll('input[placeholder="237"]');
    fireEvent.change(priceInputs[0], { target: { value: '250' } });
    const slabSelect = screen.getByText('Agreed Slab').parentElement.querySelector('select');
    const firstRealOption = Array.from(slabSelect.options).find(o => o.value !== '');
    fireEvent.change(slabSelect, { target: { value: firstRealOption.value } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 17'), { target: { value: '17' } });
    fireEvent.click(screen.getByText('= Calculate (slab × pax)'));
    fireEvent.click(screen.getByText(/💾 Save v1/));

    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]);
    expect(window.alert).not.toHaveBeenCalled();
    expect(starButtons[0].textContent).toBe('★');
  });
});
