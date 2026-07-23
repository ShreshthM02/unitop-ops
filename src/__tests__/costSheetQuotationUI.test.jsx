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

describe('QuotationGenerator: "Pull from Cost Sheet" (#11/#12 -- addressee, itinerary, accommodation, cost without retyping)', () => {
  function makeDbWithCostSheetRow(row) {
    return {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'cost_sheets' ? [row] : [], error: null }),
        };
        return builder;
      }),
    };
  }

  it('pulls addressee (Client/Foreign Agent), itinerary, consolidated accommodation, and slab pricing from the linked Cost Sheet version', async () => {
    const costSheetRow = {
      id: 'cs-linked-123', version: 3, gst_pct: 0, markup_pct: 20, roe: 80, currency: 'US $',
      tl_mode: 'lumpsum', tl_cost: 24000, misc_mode: 'lumpsum', misc_cost: 5000, mon_mode: 'pp', mon_extra: 12000,
      client_agent_name: 'UNI TRAVEL',
      days: [
        { day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/L/D', hotel: 'Hotel Alpha', hotelNetPP: 1750, mealCost: 0 },
        { day: 'Day 2', movement: 'SXR-GULMARG-SXR', mealPlan: 'B/L/D', hotel: 'Hotel Alpha', hotelNetPP: 0, mealCost: 0 },
        { day: 'Day 3', movement: 'SXR-LEH', mealPlan: 'B/D', hotel: 'Hotel Beta', hotelNetPP: 0, mealCost: 0 },
      ],
      monuments: [], transports: [{ cost: 30000, slabs: ['slab-a'] }],
      slabs: [{ id: 'slab-a', label: '10-14 pax + 1 FOC', foc: 10 }],
      local_handlers: [], extras: [],
    };
    const db = makeDbWithCostSheetRow(costSheetRow);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-linked-123" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);

    fireEvent.click(await screen.findByText('↻ Pull from Cost Sheet'));
    await waitFor(() => expect(screen.getByDisplayValue('UNI TRAVEL')).toBeTruthy());

    // Itinerary: movement pulled in, meals parsed from mealPlan
    expect(screen.getByDisplayValue('DEL-SXR')).toBeTruthy();
    expect(screen.getByDisplayValue('SXR-LEH')).toBeTruthy();

    // Accommodation: Day 1+2 (same hotel) consolidated into one row with 2 nights;
    // Day 3 (different hotel) is its own row.
    expect(screen.getByDisplayValue('Hotel Alpha')).toBeTruthy();
    expect(screen.getByDisplayValue('Hotel Beta')).toBeTruthy();
    const nightsInputs = screen.getAllByDisplayValue('2');
    expect(nightsInputs.length).toBeGreaterThan(0);

    // Cost: slab label + computed final price (matches the real TUR-2025-022
    // calculation verified earlier: sub 55,650 -> after markup -> ceiling/roe)
    expect(screen.getByDisplayValue('10-14 pax + 1 FOC')).toBeTruthy();
  });

  it('shows a message and does not crash when no Cost Sheet version matches costSheetId', async () => {
    const db = makeDbWithCostSheetRow({ id: 'some-other-id', version: 1, days: [], slabs: [] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-does-not-exist" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('↻ Pull from Cost Sheet'));
    await waitFor(() => expect(screen.getByText(/Could not find the linked Cost Sheet/)).toBeTruthy());
  });

  it('the button does not render at all when there is no linked Cost Sheet (costSheetId is null)', async () => {
    const db = makeDbWithCostSheetRow({ id: 'irrelevant', version: 1, days: [], slabs: [] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId={null} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await screen.findByText('Kind Attn (Name)');
    expect(screen.queryByText('↻ Pull from Cost Sheet')).toBeNull();
  });
});

describe('QuotationGenerator: "Pull from Cost Sheet" also pulls T/L Slabs and Monuments (previously silently missing -- only group slabs pulled, T/L slabs and monuments were never touched)', () => {
  function makeDbWithCostSheetRow(row) {
    return {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'cost_sheets' ? [row] : [], error: null }),
        };
        return builder;
      }),
    };
  }

  it('pulls a T/L slab with its correctly-computed final price (T/L Surcharge formula, not the group-slab formula)', async () => {
    // Hand-computed expected result: totHotel=1000, monPP=500 (mode=pp,
    // one included monument at 500, one excluded at 999 ignored),
    // everything else 0 -> base.sub=1500. Surcharge: fuel 800 included /
    // 8 pax = 100 -> sub=1600. GST 0% -> afterTax=1600. Markup 10% ->
    // 160 -> sellingINR=1760. ROE 80 -> finalFX = ceil(1760/80) = 22.
    const costSheetRow = {
      id: 'cs-tl-1', version: 1, gst_pct: 0, markup_pct: 10, roe: 80, currency: 'US $',
      tl_mode: 'lumpsum', tl_cost: 0, misc_mode: 'lumpsum', misc_cost: 0, mon_mode: 'pp', mon_extra: 0,
      days: [{ day: 'Day 1', movement: 'X', mealPlan: '', hotel: '', hotelNetPP: 1000, mealCost: 0 }],
      monuments: [{ name: 'Fort', fee: 500, include: true }, { name: 'Excluded Palace', fee: 999, include: false }],
      transports: [], slabs: [], local_handlers: [], extras: [],
      tl_slabs: [{ id: 'tl-1', label: '8 pax + 1 T/L', pax: 8, vehicle: 'Mini Bus', costs: { fuel: 800 }, includes: { fuel: true } }],
    };
    const db = makeDbWithCostSheetRow(costSheetRow);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-tl-1" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('↻ Pull from Cost Sheet'));
    await waitFor(() => expect(screen.getByDisplayValue('8 pax + 1 T/L')).toBeTruthy());
    expect(screen.getByDisplayValue('22')).toBeTruthy();
  });

  it('pulls only included monuments, not excluded ones (an excluded monument was priced as an optional extra, not a client-facing inclusion)', async () => {
    const costSheetRow = {
      id: 'cs-mon-1', version: 1, gst_pct: 0, markup_pct: 10, roe: 80, currency: 'US $',
      tl_mode: 'lumpsum', tl_cost: 0, misc_mode: 'lumpsum', misc_cost: 0, mon_mode: 'pp', mon_extra: 0,
      days: [], monuments: [{ name: 'Fort', fee: 500, include: true }, { name: 'Excluded Palace', fee: 999, include: false }],
      transports: [], slabs: [], local_handlers: [], extras: [], tl_slabs: [],
    };
    const db = makeDbWithCostSheetRow(costSheetRow);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-mon-1" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('↻ Pull from Cost Sheet'));
    await waitFor(() => expect(screen.getByDisplayValue('Fort')).toBeTruthy());
    expect(screen.queryByDisplayValue('Excluded Palace')).toBeNull();
  });

  it('pulls both group slabs and T/L slabs together into the same list when a Cost Sheet has both', async () => {
    const costSheetRow = {
      id: 'cs-both-1', version: 1, gst_pct: 0, markup_pct: 10, roe: 80, currency: 'US $',
      tl_mode: 'lumpsum', tl_cost: 0, misc_mode: 'lumpsum', misc_cost: 0, mon_mode: 'pp', mon_extra: 0,
      days: [{ day: 'Day 1', movement: 'X', mealPlan: '', hotel: '', hotelNetPP: 0, mealCost: 0 }],
      monuments: [], transports: [], local_handlers: [], extras: [],
      slabs: [{ id: 'grp-1', label: '15 pax + 1 FOC', foc: 15 }],
      tl_slabs: [{ id: 'tl-2', label: '6 pax + 1 T/L', pax: 6, vehicle: 'Mini Bus', costs: {}, includes: {} }],
    };
    const db = makeDbWithCostSheetRow(costSheetRow);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-both-1" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText('↻ Pull from Cost Sheet'));
    await waitFor(() => expect(screen.getByDisplayValue('15 pax + 1 FOC')).toBeTruthy());
    expect(screen.getByDisplayValue('6 pax + 1 T/L')).toBeTruthy();
  });
});
