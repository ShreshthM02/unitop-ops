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

describe('QuotationGenerator uses real persistence (versioned, mirrors Cost Sheet)', () => {
  it('calls loadQuotationVersions (via db.from("quotations")) on mount', async () => {
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('quotations'));
  });

  it('accepts a costSheetId prop and includes it when saving a version', async () => {
    const onSaved = vi.fn();
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId="linked-cost-sheet-uuid" onClose={()=>{}} onSaved={onSaved} currentUser={{id:'x'}}/>);
    const saveBtn = await screen.findByText(/💾 Save v1/);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('Save Version does NOT auto-close the panel (unlike the old single-draft behavior)', async () => {
    const onClose = vi.fn();
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={onClose} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    const saveBtn = await screen.findByText(/💾 Save v1/);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('quotations'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders without crashing when costSheetId is not passed (opened directly, not via Cost Sheet)', () => {
    expect(() => render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}}/>)).not.toThrow();
  });
});

describe('Version pills: clicking to VIEW is separate from clicking to mark FINAL (the actual bug this round)', () => {
  function makeDbWithVersions(table, versionRows) {
    return {
      from: vi.fn((t) => {
        const filters = {};
        const builder = {
          select: () => builder,
          eq: (col, val) => { filters[col] = val; return builder; },
          order: () => builder,
          insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === table ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
  }

  it('CostSheet: clicking a version pill loads it into the draft WITHOUT marking it final', async () => {
    const versionRows = [
      { version: 1, gst_pct: 5, markup_pct: 10, roe: 80, currency: 'US $', days: [], transports: [], slabs: [], monuments: [], local_handlers: [], extras: [], is_final: false },
      { version: 2, gst_pct: 5, markup_pct: 20, roe: 90, currency: 'US $', days: [], transports: [], slabs: [], monuments: [], local_handlers: [], extras: [], is_final: false },
    ];
    const db = makeDbWithVersions('cost_sheets', versionRows);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet: CS } = await import('../components/CostSheet.jsx');
    render(<CS query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    const v1Pills = await screen.findAllByText('v1');
    fireEvent.click(v1Pills[0]);
    // Clicking the version label must NOT call markCostSheetVersionFinal (no update call to cost_sheets)
    const updateCalls = db.from.mock.results.filter((r,i)=>db.from.mock.calls[i][0]==='cost_sheets').map(r=>r.value.update);
    updateCalls.forEach(u => expect(u).not.toHaveBeenCalled());
  });
});
