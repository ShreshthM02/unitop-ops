import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-2100', groupName: 'Pagination Test Group 2' };
const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

function makeDb() {
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    }),
  };
}

describe('QuotationGenerator: migrated to the shared toggle hook and async paginated print builder', () => {
  it('the toggle bar (now inside the Preview tab, not always visible) shows the single combined "Header + Footer on all pages" toggle, not two separate ones', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    expect(screen.getByText('Header + Footer on all pages')).toBeTruthy();
    expect(screen.queryByText('Header on all pages')).toBeNull();
    expect(screen.queryByText('Footer on all pages')).toBeNull();
  });

  it('the preview tab loads the async paginated HTML into an iframe without crashing', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="Print Preview"]');
      expect(iframe).toBeTruthy();
      expect(iframe.srcdoc).toContain('Quotation');
      expect(iframe.srcdoc).not.toContain('[object Promise]');
    });
  });

  it('clicking Print/PDF does not throw even though the builder is now async', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    // Header's own Print/PDF button was removed (redundant with the
    // footer's Print/Export PDF button, which is always visible
    // regardless of active tab) as part of decluttering the header.
    const printButtons = screen.getAllByText('🖨 Print / Export PDF');
    expect(() => fireEvent.click(printButtons[0])).not.toThrow();
  });
});

describe('ProformaInvoice: migrated to the shared toggle hook and async paginated print builder', () => {
  it('the toggle bar (now inside the Preview tab, not always visible) shows the single combined "Header + Footer on all pages" toggle, not two separate ones', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');
    render(<ProformaInvoice query={fakeQuery} template={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    expect(screen.getByText('Header + Footer on all pages')).toBeTruthy();
    expect(screen.queryByText('Header on all pages')).toBeNull();
    expect(screen.queryByText('Footer on all pages')).toBeNull();
  });

  it('the preview tab loads the async paginated HTML into an iframe without crashing', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');
    render(<ProformaInvoice query={fakeQuery} template={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe.srcdoc).toContain('Proforma');
      expect(iframe.srcdoc).not.toContain('[object Promise]');
    });
  });

  it('clicking Print/PDF does not throw even though the builder is now async', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');
    const originalOpen = window.open;
    window.open = vi.fn(() => ({ document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() }));
    render(<ProformaInvoice query={fakeQuery} template={{}} onClose={()=>{}}/>);
    expect(() => fireEvent.click(screen.getAllByText('🖨 Print / PDF')[0])).not.toThrow();
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    window.open = originalOpen;
  });
});

describe('QuotationGenerator: table-splitting wiring across all 4 tables (itinerary, accommodation, price, monuments)', () => {
  it('the printed output contains real table content for all sections, not stringified [object Object]', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const templateWithMonuments = { ...fakeTemplate, showMonuments: true, monuments: [{ name: 'Taj Mahal', fee: '50' }] };
    render(<QuotationGenerator query={fakeQuery} template={templateWithMonuments} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="Print Preview"]');
      expect(iframe.srcdoc).toContain('Day-wise Itinerary');
      expect(iframe.srcdoc).toContain('Accommodation');
      expect(iframe.srcdoc).toContain('Cost Per Person');
      expect(iframe.srcdoc).not.toContain('[object Object]');
    });
  });
});

describe('QuotationGenerator: header decluttering (version dropdown, single Print button, toggles moved into Preview)', () => {
  it('only one Print button exists in the whole document now (was two: header + footer)', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getAllByText('🖨 Print / Export PDF')).toHaveLength(1);
  });

  it('the toggle bar is not visible on the Content tab (default), only inside Preview', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.queryByText('Header + Footer on all pages')).toBeNull();
    fireEvent.click(screen.getByText('👁 Preview'));
    expect(screen.getByText('Header + Footer on all pages')).toBeTruthy();
  });
});
