import { describe, it, expect, vi, waitFor } from 'vitest';
import { render, screen, fireEvent, waitFor as rtlWaitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1600', groupName: 'Phase 3 Auto-Pull Test', nights: 5, pax: 10, destination: 'Kerala' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

function makeDb({ costSheetRows = [], quotationRows = [] } = {}) {
  const insertSpy = vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }));
  return {
    insertSpy,
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: insertSpy,
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({
          data: t === 'cost_sheets' ? costSheetRows : (t === 'quotations' ? quotationRows : []),
          error: null,
        }),
      };
      return builder;
    }),
  };
}

describe('QuotationGenerator Phase 3: auto-fires the pull on creation (no button click needed)', () => {
  it('a brand-new Quotation (zero saved versions) with a linked costSheetId pulls automatically', async () => {
    const costSheetRow = { id: 'cs-auto-1', version: 4, is_final: false, days: [], slabs: [{id:'s1',label:'10 pax + 1 FOC',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const { db } = { db: makeDb({ costSheetRows: [costSheetRow] }) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-auto-1" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    // No button click at all -- pull message should appear on its own.
    await rtlWaitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v4/)).toBeTruthy());
    expect(screen.getByDisplayValue('10 pax + 1 FOC')).toBeTruthy();
  });

  it('does NOT auto-fire when a saved Quotation version already exists (safe by construction, one-time only)', async () => {
    const costSheetRow = { id: 'cs-auto-2', version: 1, is_final: false, days: [], slabs: [{id:'s1',label:'SHOULD-NOT-AUTO-PULL',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'Already Saved Co', itinerary: [], hotels: [], slabs: [{label:'Existing Slab',price:'500'}], monuments: [], includes: [], excludes: [], is_final: false };
    const db = makeDb({ costSheetRows: [costSheetRow], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-auto-2" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByDisplayValue('Already Saved Co')).toBeTruthy());
    expect(screen.queryByDisplayValue('SHOULD-NOT-AUTO-PULL')).toBeNull();
    expect(screen.queryByText(/Pulled from Cost Sheet/)).toBeNull();
  });

  it('does NOT auto-fire when there is no linked costSheetId at all', async () => {
    const db = makeDb({});
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(db.from).toHaveBeenCalledWith('quotations'));
    expect(db.from).not.toHaveBeenCalledWith('cost_sheets');
  });
});

describe('QuotationGenerator Phase 3: mutual staleness banner against the star-marked Cost Sheet', () => {
  it('shows the staleness banner + "Pull latest" when a newer final Cost Sheet version exists beyond what was pulled', async () => {
    const finalCostSheetRow = { id: 'cs-final', version: 3, is_final: true, days: [], slabs: [{id:'s1',label:'NEWER-SLAB',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'X', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [], is_final: false, pulled_from_cost_sheet_version: 2 };
    const db = makeDb({ costSheetRows: [finalCostSheetRow], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-final" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByText(/Cost Sheet v3 \(final\) has pricing/)).toBeTruthy());
    expect(screen.getByText('↻ Pull latest')).toBeTruthy();
  });

  it('shows no banner when pulledFromCostSheetVersion already matches the final version', async () => {
    const finalCostSheetRow = { id: 'cs-final2', version: 2, is_final: true, days: [], slabs: [], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'X', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [], is_final: false, pulled_from_cost_sheet_version: 2 };
    const db = makeDb({ costSheetRows: [finalCostSheetRow], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-final2" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByDisplayValue('X')).toBeTruthy());
    expect(screen.queryByText('↻ Pull latest')).toBeNull();
  });

  it('clicking "Pull latest" re-pulls from the newer final version and updates pulledFromCostSheetVersion', async () => {
    const finalCostSheetRow = { id: 'cs-final3', version: 5, is_final: true, days: [], slabs: [{id:'s1',label:'FRESH-PULL-SLAB',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'X', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [], is_final: false, pulled_from_cost_sheet_version: 4 };
    const db = makeDb({ costSheetRows: [finalCostSheetRow], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-final3" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByText('↻ Pull latest')).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull latest'));
    await rtlWaitFor(() => expect(screen.getByDisplayValue('FRESH-PULL-SLAB')).toBeTruthy());
  });

  it('shows no banner and does not check anything when there is no linked costSheetId', async () => {
    const db = makeDb({});
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(db.from).toHaveBeenCalledWith('quotations'));
    expect(db.from).not.toHaveBeenCalledWith('cost_sheets');
    expect(screen.queryByText('↻ Pull latest')).toBeNull();
  });
});
