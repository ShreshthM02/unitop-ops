import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid-' + table }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }), // starts empty: no saved versions/quotation yet
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { CostSheet } = await import('../components/CostSheet.jsx');
const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');

const fakeQuery = { id: 'UTQ-2026-500', groupName: 'Persistence Test Group', nights: 5, pax: 10, destination: 'Kerala' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

beforeEach(() => { mockDb.from.mockClear(); });

describe('CostSheet uses real persistence', () => {
  it('calls loadCostSheetVersions (via db.from("cost_sheets")) on mount', async () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'cfff444a-718e-4c14-83a3-f55f368d64dd'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('cost_sheets'));
  });

  it('clicking Save Version calls the cost_sheets insert with the current draft', async () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'cfff444a-718e-4c14-83a3-f55f368d64dd'}}/>);
    const saveButtons = await screen.findAllByText(/💾 Save v1/);
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      const costSheetCalls = mockDb.from.mock.results.filter((r, i) => mockDb.from.mock.calls[i][0] === 'cost_sheets');
      expect(costSheetCalls.length).toBeGreaterThan(0);
    });
  });

  it('renders without crashing when currentUser is not passed (demo mode)', () => {
    expect(() => render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>)).not.toThrow();
  });
});

describe('QuotationGenerator uses real persistence', () => {
  it('calls loadQuotation (via db.from("quotations")) on mount', async () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('quotations'));
  });

  it('accepts a costSheetId prop and includes it when saving', async () => {
    const onSaved = vi.fn();
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId="linked-cost-sheet-uuid" onClose={()=>{}} onSaved={onSaved} currentUser={{id:'x'}}/>);
    // Find and click the Save button (the primary save-and-close action)
    const saveBtn = await screen.findByText((content, el) => el.tagName === 'BUTTON' && /save/i.test(content) && el.className.includes('btn-primary'));
    fireEvent.click(saveBtn);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0].costSheetId).toBe('linked-cost-sheet-uuid');
  });

  it('renders without crashing when costSheetId is not passed (opened directly, not via Cost Sheet)', () => {
    expect(() => render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}}/>)).not.toThrow();
  });
});
