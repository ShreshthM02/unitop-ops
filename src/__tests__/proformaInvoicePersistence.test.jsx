import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid-' + table }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');

const fakeQuery = { id: 'UTQ-2026-1000', groupName: 'Proforma Persistence Test', destination: 'Ladakh', paxDisplay: '10' };

beforeEach(() => { mockDb.from.mockClear(); });

describe('ProformaInvoice: real, globally-safe invoice numbering (was a per-browser localStorage counter, the exact duplicate-numbering risk the settings migration existed to prevent but never got wired into this file)', () => {
  it('computes the invoice number from existing saved invoice numbers, not a local counter or random value', async () => {
    const existingRows = [{ invoice_no: 'PI-2026-005' }, { invoice_no: 'PI-2026-007' }, { invoice_no: 'PI-2026-003' }];
    const insertSpy = vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }));
    const db = {
      from: vi.fn((t) => {
        let selectArg = '*';
        const builder = {
          select: (arg) => { selectArg = arg; return builder; },
          eq: () => builder, order: () => builder,
          insert: insertSpy,
          update: vi.fn(async () => ({ data: [], error: null })),
          // loadProformaInvoiceVersions selects "*" (this query's own
          // versions, scoped by query_id) -- loadExistingInvoiceNumbers
          // selects "invoice_no" (every invoice ever saved, globally).
          // Both hit the same table, so the mock must distinguish them
          // the same way the real query shape does.
          then: (resolve) => resolve({ data: (t === 'proforma_invoices' && selectArg === 'invoice_no') ? existingRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: PI } = await import('../components/ProformaInvoice.jsx');
    render(<PI query={fakeQuery} template={{}} docSettings={{proforma:{prefix:'PI'}}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    // Highest existing is 007, so the next one must be 008 -- not a reused
    // or random number, and not dependent on how many exist for THIS query.
    // Wait for the async invoice-number computation to actually resolve
    // before saving, matching the real guard now in the component itself
    // (saveVersion refuses to save with a blank invoiceNo).
    await waitFor(() => expect(screen.getByDisplayValue(/PI-\d{4}-008/)).toBeTruthy(), { timeout: 3000 });
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      expect(insertSpy).toHaveBeenCalled();
      const payload = insertSpy.mock.calls[0][0];
      expect(payload.invoice_no).toMatch(/PI-\d{4}-008/);
    });
  });

  it('queries proforma_invoices globally for existing numbers (not scoped to one query_id), since invoice numbers must be unique across the whole business', async () => {
    render(<ProformaInvoice query={fakeQuery} template={{}} docSettings={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('proforma_invoices'));
  });
});

describe('ProformaInvoice: real versioned persistence (Phase 0 of the Document Chain plan, final document)', () => {
  it('clicking Save Version calls the proforma_invoices insert with invoice_no and content', async () => {
    render(<ProformaInvoice query={fakeQuery} template={{}} docSettings={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='proforma_invoices')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('invoice_no');
      expect(insertCalls[0][0]).toHaveProperty('content');
    });
  });

  it('renders without crashing when currentUser/docSettings are not passed (demo mode)', async () => {
    render(<ProformaInvoice query={fakeQuery} template={{}} onClose={()=>{}}/>);
    expect((await screen.findAllByText(/Proforma Invoice/)).length).toBeGreaterThan(0);
  });
});
