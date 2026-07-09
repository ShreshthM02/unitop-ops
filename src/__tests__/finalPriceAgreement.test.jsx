import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid' }], error: null })),
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

function openFinalPriceTab() {
  fireEvent.click(screen.getByText('💰 Final Price'));
}

describe('Final Price Agreement is now its own tab', () => {
  it('shows a dedicated "Final Price" tab alongside Content and Preview', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    expect(screen.getByText('✏ Content')).toBeTruthy();
    expect(screen.getByText('💰 Final Price')).toBeTruthy();
    expect(screen.getByText('👁 Preview')).toBeTruthy();
  });

  it('the tab starts with no entries and a "no entries" totals state', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    expect(screen.getByText('+ Add Rate Line')).toBeTruthy();
    expect(screen.getByText(/Every line needs both a pax count and a rate/)).toBeTruthy();
  });
});

describe('Multiple rate lines: the actual 18 pax + 2 pax example', () => {
  it('supports adding multiple lines, each independently pax + source + rate', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const paxInputs = document.querySelectorAll('input[placeholder="e.g. 18"]');
    expect(paxInputs.length).toBe(2);
  });

  it('selecting a slab for a line auto-fills its rate from the slab price (read-only)', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    // Set a real price on the first template slab, in Content tab
    const priceInputs = document.querySelectorAll('input[placeholder="237"]');
    fireEvent.change(priceInputs[0], { target: { value: '237' } });

    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const slabSelect = document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    const realOption = Array.from(slabSelect.options).find(o => o.value !== '');
    fireEvent.change(slabSelect, { target: { value: realOption.value } });
    const rateInput = document.querySelector('input[placeholder="0"]');
    expect(rateInput.value).toBe('237');
    expect(rateInput.readOnly).toBe(true);
  });

  it('switching a line to Custom clears the slab reference and makes rate editable', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const sourceSelects = Array.from(document.querySelectorAll('select')).filter(s => Array.from(s.options).some(o => o.value === 'custom'));
    fireEvent.change(sourceSelects[0], { target: { value: 'custom' } });
    expect(screen.getByPlaceholderText('e.g. Single Supplement')).toBeTruthy();
    const rateInput = document.querySelector('input[placeholder="0"]');
    expect(rateInput.readOnly).toBe(false);
  });

  it('totals correctly sum pax and pax*rate across multiple lines (18 @ 237 + 2 @ 50)', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    fireEvent.click(screen.getByText('+ Add Rate Line'));

    const sourceSelects = Array.from(document.querySelectorAll('select')).filter(s => Array.from(s.options).some(o => o.value === 'custom'));
    fireEvent.change(sourceSelects[0], { target: { value: 'custom' } });
    fireEvent.change(sourceSelects[1], { target: { value: 'custom' } });

    const paxInputs = document.querySelectorAll('input[placeholder="e.g. 18"]');
    fireEvent.change(paxInputs[0], { target: { value: '18' } });
    fireEvent.change(paxInputs[1], { target: { value: '2' } });

    const rateInputs = document.querySelectorAll('input[placeholder="0"]');
    fireEvent.change(rateInputs[0], { target: { value: '237' } });
    fireEvent.change(rateInputs[1], { target: { value: '50' } });

    expect(screen.getByText('20')).toBeTruthy(); // total confirmed pax
    expect(screen.getByText(/4366/)).toBeTruthy(); // 18*237 + 2*50 = 4266+100 = 4366
  });

  it('a rate line can be removed', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    expect(document.querySelectorAll('input[placeholder="e.g. 18"]').length).toBe(2);
    const removeButtons = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === '✕' && s.style.cursor === 'pointer');
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(document.querySelectorAll('input[placeholder="e.g. 18"]').length).toBe(1);
  });
});

describe('Marking final is blocked without complete rate lines', () => {
  it('clicking the star with no rate lines at all shows a warning and does not mark final', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText(/💾 Save v1/));
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Final Price'));
    expect(starButtons[0].textContent).toBe('☆');
  });

  it('a version with complete rate lines (pax + rate on every line) can be marked final', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const sourceSelect = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === 'custom'));
    fireEvent.change(sourceSelect, { target: { value: 'custom' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 18'), { target: { value: '20' } });
    fireEvent.change(document.querySelector('input[placeholder="0"]'), { target: { value: '200' } });

    fireEvent.click(screen.getByText(/💾 Save v1/));
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]);
    expect(window.alert).not.toHaveBeenCalled();
    expect(starButtons[0].textContent).toBe('★');
  });
});

describe('"Last Changes" audit log within the Final Price tab', () => {
  it('shows a placeholder message when nothing has been logged yet', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    expect(screen.getByText(/No changes logged yet/)).toBeTruthy();
  });

  it('saving a version with rate lines calls the audit logging function (query_audit insert)', async () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const sourceSelect = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === 'custom'));
    fireEvent.change(sourceSelect, { target: { value: 'custom' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 18'), { target: { value: '20' } });
    fireEvent.change(document.querySelector('input[placeholder="0"]'), { target: { value: '200' } });

    mockDb.from.mockClear();
    fireEvent.click(screen.getByText(/💾 Save v1/));
    expect(mockDb.from).toHaveBeenCalledWith('query_audit');
  });
});
