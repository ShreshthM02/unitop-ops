import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

// Rows are laid out Pax Paying | FOC | Source | Slab/Description | Rate | remove.
// Both FOC and Rate share placeholder="0", so tests must pick by column
// position, not just placeholder text.
function addCustomLine(paxPaying, foc, rate) {
  fireEvent.click(screen.getByText('+ Add Rate Line'));
  const sourceSelect = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === 'custom'));
  fireEvent.change(sourceSelect, { target: { value: 'custom' } });
  fireEvent.change(screen.getAllByPlaceholderText('e.g. 18').slice(-1)[0], { target: { value: paxPaying } });
  const zeroInputs = document.querySelectorAll('input[placeholder="0"]'); // [FOC, Rate] for this line
  fireEvent.change(zeroInputs[zeroInputs.length - 2], { target: { value: foc } });
  fireEvent.change(zeroInputs[zeroInputs.length - 1], { target: { value: rate } });
}

describe('Final Price Agreement tab: Pax Paying vs FOC', () => {
  it('shows separate Pax Paying and FOC fields, not just one Pax field', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    expect(screen.getAllByText('Pax Paying').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FOC').length).toBeGreaterThan(0);
  });

  it('FOC counts toward total confirmed pax but not toward tour value -- the actual 18 paying + 1 FOC example', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    addCustomLine('18', '1', '237');
    expect(screen.getAllByText('18').length).toBeGreaterThan(0); // Pax Paying total
    expect(screen.getAllByText('19').length).toBeGreaterThan(0); // Total Confirmed Pax = 18 + 1 FOC
    expect(screen.getByText(/4266/)).toBeTruthy(); // Tour Value = 18 * 237, FOC contributes 0
  });

  it('the warning message clarifies FOC is optional', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    expect(screen.getByText(/FOC is optional/)).toBeTruthy();
  });
});

describe('Multiple rate lines still work correctly with the new column layout', () => {
  it('totals correctly sum across multiple lines (18 paying @ 237 + 2 paying @ 50, no FOC)', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    addCustomLine('18', '0', '237');
    addCustomLine('2', '0', '50');
    expect(screen.getAllByText('20').length).toBeGreaterThan(0); // total confirmed pax (and pax paying, same value since FOC=0)
    expect(screen.getByText(/4366/)).toBeTruthy(); // 18*237 + 2*50
  });

  it('a rate line can be removed', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    expect(screen.getAllByPlaceholderText('e.g. 18').length).toBe(2);
    const removeButtons = Array.from(document.querySelectorAll('span')).filter(s => s.textContent === '✕' && s.style.cursor === 'pointer');
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByPlaceholderText('e.g. 18').length).toBe(1);
  });

  it('selecting a slab auto-fills and locks the rate field (the 2nd "0"-placeholder input, after FOC)', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const priceInputs = document.querySelectorAll('input[placeholder="237"]');
    fireEvent.change(priceInputs[0], { target: { value: '237' } });
    openFinalPriceTab();
    fireEvent.click(screen.getByText('+ Add Rate Line'));
    const slabSelect = document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    const realOption = Array.from(slabSelect.options).find(o => o.value !== '');
    fireEvent.change(slabSelect, { target: { value: realOption.value } });
    const rateInput = document.querySelectorAll('input[placeholder="0"]')[1]; // [FOC, Rate]
    expect(rateInput.value).toBe('237');
    expect(rateInput.readOnly).toBe(true);
  });
});

describe('Marking final is blocked without complete rate lines (Pax Paying + rate required, FOC optional)', () => {
  it('clicking the star with no rate lines shows a warning and does not mark final', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText(/💾 Save v1/));
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Final Price'));
    expect(starButtons[0].textContent).toBe('☆');
  });

  it('a version with Pax Paying + rate on every line (FOC left blank) can be marked final', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    openFinalPriceTab();
    addCustomLine('20', '', '200');
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
    addCustomLine('20', '', '200');
    mockDb.from.mockClear();
    fireEvent.click(screen.getByText(/💾 Save v1/));
    expect(mockDb.from).toHaveBeenCalledWith('query_audit');
  });
});

describe('Update Final Price in place (no new version for a pax-count refinement)', () => {
  it('the update-in-place button only appears when viewing the currently-final version', () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    openFinalPriceTab();
    expect(screen.queryByText(/Update Final Price/)).toBeNull(); // no final version yet

    addCustomLine('20', '', '200');
    fireEvent.click(screen.getByText(/💾 Save v1/));
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]); // now v1 is final and being viewed
    expect(screen.getByText(/Update Final Price/)).toBeTruthy();
  });

  it('clicking Update Final Price calls the in-place update (quotations + query_audit), not a new version save', async () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    openFinalPriceTab();
    addCustomLine('20', '', '200');
    fireEvent.click(screen.getByText(/💾 Save v1/));
    const starButtons = document.querySelectorAll('[title="Mark as final"]');
    fireEvent.click(starButtons[0]);

    mockDb.from.mockClear();
    fireEvent.click(screen.getByText(/Update Final Price/));
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('quotations'));
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('query_audit'));
  });
});
