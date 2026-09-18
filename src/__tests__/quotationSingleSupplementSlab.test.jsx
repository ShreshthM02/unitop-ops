import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Direct instruction: Single Supplement should appear as its own slab
// at the end of the pulled slab list, since it's the same flat cost
// regardless of which slab -- safe to show as another pricing tier.

const fakeQuery = { id: 'UTQ-2026-1800', groupName: 'Single Supp Slab Test', nights: 2, pax: 10, destination: 'Agra' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

function makeDb({ costSheetRows = [] } = {}) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: t === 'cost_sheets' ? costSheetRows : [], error: null }),
      };
      return builder;
    }),
  };
}

describe('Quotation pulls Single Supplement in as its own slab', () => {
  it('appends a "Single Supplement" slab after the group slabs when the Cost Sheet has a real single supplement cost', async () => {
    const costSheetRow = {
      id: 'cs-ss-1', version: 1, is_final: false,
      days: [{ day: 'Day 1', hotelNetPP: 3000, singleSupp: 2500, mealCost: 0 }],
      slabs: [{ id: 's1', label: '10 pax + 1 FOC', foc: 10 }], tl_slabs: [], monuments: [],
      transports: [], local_handlers: [], extras: [], gst_pct: 0, markup_pct: 0, roe: 1, currency: 'INR',
    };
    const db = makeDb({ costSheetRows: [costSheetRow] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-ss-1" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v1/)).toBeTruthy());

    // Single supplement total = 2500 (day) with 0% gst/markup, roe 1 -> 2500 flat.
    expect(screen.getByDisplayValue('Single Supplement')).toBeTruthy();
    expect(screen.getByDisplayValue('2500')).toBeTruthy();
  });

  it('does not add a Single Supplement slab at all when the Cost Sheet has no single supplement cost', async () => {
    const costSheetRow = {
      id: 'cs-ss-2', version: 1, is_final: false,
      days: [{ day: 'Day 1', hotelNetPP: 2500, singleSupp: 0, mealCost: 0 }],
      slabs: [{ id: 's1', label: '10 pax + 1 FOC', foc: 10 }], tl_slabs: [], monuments: [],
      transports: [], local_handlers: [], extras: [], gst_pct: 0, markup_pct: 0, roe: 1, currency: 'INR',
    };
    const db = makeDb({ costSheetRows: [costSheetRow] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-ss-2" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v1/)).toBeTruthy());

    expect(screen.queryByDisplayValue('Single Supplement')).toBeFalsy();
  });
});
