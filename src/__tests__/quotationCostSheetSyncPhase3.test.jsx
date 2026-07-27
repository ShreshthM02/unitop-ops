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

  it('does NOT auto-fire when there is no linked costSheetId AND no final Cost Sheet exists at all', async () => {
    const db = makeDb({});
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(db.from).toHaveBeenCalledWith('quotations'));
    // cost_sheets IS queried now (regardless of costSheetId, this is the
    // fix for the "button never shows when opened from the toolbar" bug)
    // -- but with no rows returned at all, there's genuinely nothing to
    // auto-pull, which is still correct.
    expect(db.from).toHaveBeenCalledWith('cost_sheets');
    expect(screen.queryByText(/Pulled from Cost Sheet/)).toBeNull();
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

  it('shows no banner when there is no final Cost Sheet at all (cost_sheets is queried, but nothing comes back)', async () => {
    const db = makeDb({});
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(db.from).toHaveBeenCalledWith('quotations'));
    expect(db.from).toHaveBeenCalledWith('cost_sheets');
    expect(screen.queryByText('↻ Pull latest')).toBeNull();
  });
});

describe('QuotationGenerator: "Pull from Cost Sheet" button visibility (bug fix -- previously only showed when opened via Cost Sheet\'s "Proceed to Quotation" flow, never when opened directly from the toolbar even if a real Cost Sheet existed)', () => {
  it('the button shows when a final Cost Sheet exists for this query, even with no costSheetId prop passed at all (e.g. opened directly from the toolbar)', async () => {
    const finalCS = { id: 'cs-toolbar', version: 2, is_final: true, days: [], slabs: [], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'X', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [], is_final: false };
    const db = makeDb({ costSheetRows: [finalCS], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    // No costSheetId prop at all -- matches how the toolbar opens Quotation directly
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByText('↻ Pull from Cost Sheet')).toBeTruthy());
  });

  it('clicking the button in this no-costSheetId case still pulls correctly from the final Cost Sheet version', async () => {
    const finalCS = { id: 'cs-toolbar2', version: 5, is_final: true, days: [], slabs: [{id:'s1',label:'TOOLBAR-PULL-SLAB',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const savedQuotation = { version: 1, attn_company: 'X', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [], is_final: false };
    const db = makeDb({ costSheetRows: [finalCS], quotationRows: [savedQuotation] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(screen.getByText('↻ Pull from Cost Sheet')).toBeTruthy());
    fireEvent.click(screen.getByText('↻ Pull from Cost Sheet'));
    await rtlWaitFor(() => expect(screen.getByDisplayValue('TOOLBAR-PULL-SLAB')).toBeTruthy());
  });

  it('still shows no button at all when neither costSheetId nor any final Cost Sheet exists', async () => {
    const db = makeDb({});
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await rtlWaitFor(() => expect(db.from).toHaveBeenCalledWith('quotations'));
    expect(screen.queryByText('↻ Pull from Cost Sheet')).toBeNull();
  });
});

describe('QuotationGenerator: "pulling" state bug fix (button stuck on "Pulling…" forever after a successful pull, since the success path\'s early return skipped setPulling(false) entirely)', () => {
  it('after a successful pull, the button returns to its normal label -- not stuck on "Pulling…"', async () => {
    const finalCS = { id: 'cs-stuck', version: 3, is_final: true, days: [], slabs: [{id:'s1',label:'STUCK-TEST-SLAB',foc:10}], tl_slabs: [], monuments: [], transports: [], local_handlers: [], extras: [], gst_pct:0, markup_pct:20, roe:80, currency:'US $' };
    const db = makeDb({ costSheetRows: [finalCS] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} costSheetId="cs-stuck" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    // Auto-pull fires on creation; wait for it to genuinely finish (the
    // pull message confirms success), then confirm the button is no
    // longer stuck on "Pulling…" and is clickable again.
    await rtlWaitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v3/)).toBeTruthy());
    expect(screen.queryByText('Pulling…')).toBeNull();
    const btn = screen.getByText('↻ Pull from Cost Sheet');
    expect(btn.disabled).toBe(false);
  });
});
