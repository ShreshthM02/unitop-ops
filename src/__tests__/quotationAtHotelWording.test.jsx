import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Direct instruction: Quotation's meal cells should print "At Hotel"
// instead of "Included" -- the same wording change already applied to
// Tour Briefing Sheet earlier, now extended to Quotation too. The
// shared extraction function itself (extractItineraryFromCostSheetDays)
// still legitimately returns "Included"/"" -- each caller translates it
// at its own call site, same pattern as Tour Briefing Sheet already uses.

const fakeQuery = { id: 'UTQ-2026-1700', groupName: 'At Hotel Wording Test', nights: 2, pax: 10, destination: 'Kochi' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

function makeDb({ costSheetRows = [], quotationRows = [] } = {}) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
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

describe('Quotation meal cells print "At Hotel", not "Included"', () => {
  it('a day pulled from the Cost Sheet with meals included shows "At Hotel" in the print preview, never "Included"', async () => {
    const costSheetRow = {
      id: 'cs-at-hotel', version: 1, is_final: false,
      days: [{ day: 'Day 1', movement: 'Kochi arrival', mealPlan: 'B/L/D' }],
      slabs: [{ id: 's1', label: '10 pax + 1 FOC', foc: 10 }], tl_slabs: [], monuments: [],
      transports: [], local_handlers: [], extras: [], gst_pct: 0, markup_pct: 20, roe: 80, currency: 'US $',
    };
    const db = makeDb({ costSheetRows: [costSheetRow] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QG } = await import('../components/QuotationGenerator.jsx');
    render(<QG query={fakeQuery} template={fakeTemplate} costSheetId="cs-at-hotel" onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v1/)).toBeTruthy());

    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = document.querySelector('iframe[title="Print Preview"]').srcdoc;
      expect(html).toContain('At Hotel');
      expect(html).not.toContain('>Included<');
    });
  });
});
