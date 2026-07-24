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
  it('the toggle bar shows the single combined "Header + Footer on all pages" toggle, not two separate ones', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
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
    const printButtons = screen.getAllByText('🖨 Print / PDF');
    expect(() => fireEvent.click(printButtons[0])).not.toThrow();
  });
});

describe('ProformaInvoice: migrated to the shared toggle hook and async paginated print builder', () => {
  it('the toggle bar shows the single combined "Header + Footer on all pages" toggle, not two separate ones', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');
    render(<ProformaInvoice query={fakeQuery} template={{}} onClose={()=>{}}/>);
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
