import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Proforma Invoice and Tax Invoice were merged into one InvoiceGenerator
// (2026-08-22), replacing the standalone ProformaInvoice.jsx/TaxInvoice.jsx
// this test file used to cover -- one "Invoices" panel, two sub-tabs
// (Pro-Forma / Tax Invoice), sharing Bill To + Tour Details, each flavor
// keeping its own independent version history via the doc_type column on
// the new unified `invoices` table.

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

const { default: InvoiceGenerator } = await import('../components/InvoiceGenerator.jsx');

const fakeQuery = { id: 'UTQ-2026-1000', groupName: 'Invoice Persistence Test', destination: 'Ladakh', paxDisplay: '10 pax', tourFileId: 'TUR-2026-1000' };
const fakeAgents = [{ id: 'AGT-1', company: 'NCH Holidays', country: 'Thailand', city: 'Bangkok', address: '99 Sukhumvit Rd', gstin: '', contactName: 'Pee Suchint', active: true }];

beforeEach(() => { mockDb.from.mockClear(); });

describe('InvoiceGenerator: real, globally-safe invoice numbering (per flavor)', () => {
  it('Pro-Forma computes its invoice number from existing saved numbers, not a local counter', async () => {
    const existingRows = [{ invoice_no: 'PI-2026-005' }, { invoice_no: 'PI-2026-007' }, { invoice_no: 'TI-2026-999' }];
    const db = {
      from: vi.fn((t) => {
        let selectArg = '*';
        const builder = {
          select: (arg) => { selectArg = arg; return builder; },
          eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          // loadInvoiceVersions selects "*" (this query's own versions,
          // scoped by query_id+doc_type, empty here) -- loadExistingInvoiceNumbers
          // selects "invoice_no" (every invoice ever saved, globally).
          then: (resolve) => resolve({ data: (t === 'invoices' && selectArg === 'invoice_no') ? existingRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InvoiceGenerator2 } = await import('../components/InvoiceGenerator.jsx');
    render(<InvoiceGenerator2 query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{ proforma: { prefix: 'PI' }, taxinvoice: { prefix: 'TI' } }} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue('PI-2026-008')).toBeTruthy());
  });
});

describe('InvoiceGenerator: Pro-Forma / Tax Invoice sub-tabs keep independent version histories', () => {
  it('switching flavor re-queries "invoices" filtered to that doc_type', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('invoices'));
    mockDb.from.mockClear();
    fireEvent.click(screen.getByText('Tax Invoice'));
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('invoices'));
  });

  it('saving a Pro-Forma version inserts with doc_type "proforma"', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(screen.getAllByText(/Save v/)[0]).toBeTruthy());
    fireEvent.click(screen.getAllByText(/Save v/)[0]);
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='invoices')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0].doc_type).toBe('proforma');
    });
  });
});

describe('InvoiceGenerator: Bill To -- Agent Master picker with Custom fallback (mirrors Exchange Order\'s vendor picker)', () => {
  it('selecting an agent auto-fills address, city/country, and GSTIN', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const select = await screen.findByDisplayValue('Select from Agent Master...');
    fireEvent.change(select, { target: { value: 'AGT-1' } });
    await waitFor(() => expect(screen.getByDisplayValue('99 Sukhumvit Rd')).toBeTruthy());
    expect(screen.getByDisplayValue('Bangkok, Thailand')).toBeTruthy();
  });

  it('"Custom" lets staff type a Bill To company not in Agent Master', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const select = await screen.findByDisplayValue('Select from Agent Master...');
    fireEvent.change(select, { target: { value: '__custom__' } });
    expect(await screen.findByPlaceholderText('Company / Agency / Client name')).toBeTruthy();
  });
});

describe('InvoiceGenerator: Pro-Forma content fixes', () => {
  it('subject line does not duplicate "pax" when paxDisplay already includes it', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const subjectInput = await screen.findByDisplayValue(/GROUP FROM/);
    expect(subjectInput.value).not.toMatch(/pax.*PAX|PAX.*pax/i);
    expect((subjectInput.value.match(/pax/gi) || []).length).toBeLessThanOrEqual(1);
  });

  it('opening line is editable and pre-filled from the template', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{ asDesiredLine: 'CUSTOM OPENING LINE' }} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue('CUSTOM OPENING LINE')).toBeTruthy();
  });

  it('notes and sign-off are pre-filled from the template, not hardcoded', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{ notes: 'Template notes here', signOff: 'For Custom Co.' }} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue('Template notes here')).toBeTruthy();
    expect(screen.getByDisplayValue('For Custom Co.')).toBeTruthy();
  });

  it('travel date is shown as an arrival-to-departure range in dd/mm/yyyy', async () => {
    const q = { ...fakeQuery, travelDateFrom: '2026-09-01', travelDateTo: '2026-09-10' };
    render(<InvoiceGenerator query={q} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue('01-09-2026 to 10-09-2026')).toBeTruthy();
  });

  it('has a Tour Name field, distinct from Tour Ref', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByText('Tour Name')).toBeTruthy();
    expect(screen.getByText('Tour Ref')).toBeTruthy();
  });

  it('advance/adjusted payment section is optional and off by default', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const checkbox = await screen.findByText(/Show advance/);
    expect(checkbox).toBeTruthy();
    expect(screen.queryByPlaceholderText('0')).toBeNull();
  });
});

describe('InvoiceGenerator: Tax Invoice content fixes', () => {
  it('has no "Prepared by" field', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} initialFlavor="tax" onClose={()=>{}} currentUser={{id:'x'}}/>);
    await screen.findByText(/Line Items/);
    expect(screen.queryByText('Prepared by')).toBeNull();
  });

  it('Bill To and Tour Details are editable, same as Pro-Forma', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} initialFlavor="tax" onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByText(/Bill To/)).toBeTruthy();
    expect(screen.getByText(/Tour Details/)).toBeTruthy();
  });
});

describe('InvoiceGenerator: Phase B -- Advance / Adjusted Payment auto-fetch from receipted incoming payments', () => {
  const paymentsWithEntries = {
    'UTQ-2026-1000': {
      entries: [
        { id: 1, type: 'advance', inCurrency: 'INR', amount: '50000', date: '2026-08-01', receipt: 'RCP-2026-001' },
        { id: 2, type: 'balance', inCurrency: 'INR', amount: '25000', date: '2026-08-10', receipt: 'RCP-2026-002' },
        { id: 3, type: 'advance', inCurrency: 'USD', amount: '500', date: '2026-08-05', receipt: 'RCP-2026-003' },
        // No receipt -- must not be counted, per direct instruction
        // ("only incoming payments which have a receipt get fetched").
        { id: 4, type: 'advance', inCurrency: 'INR', amount: '9999', date: '2026-08-12', receipt: '' },
      ],
    },
  };

  it('turning the section on auto-fetches the total of receipted INR entries (matching invoice currency), excluding the un-receipted one', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={paymentsWithEntries} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Show advance/));
    await waitFor(() => expect(screen.getByDisplayValue('75000')).toBeTruthy());
  });

  it('flags receipted payments in a different currency instead of silently including or dropping them', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={paymentsWithEntries} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Show advance/));
    expect(await screen.findByText(/1 receipted payment.*different currency/)).toBeTruthy();
  });

  it('manual entry overrides the fetched value and is not silently clobbered by re-toggling', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={paymentsWithEntries} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Show advance/));
    const amountInput = await screen.findByDisplayValue('75000');
    fireEvent.change(amountInput, { target: { value: '30000' } });
    expect(await screen.findByText(/Entered manually/)).toBeTruthy();
    // Turn off then back on -- a genuine manual entry should not be
    // silently overwritten by an automatic re-fetch.
    fireEvent.click(screen.getByText(/Show advance/));
    fireEvent.click(screen.getByText(/Show advance/));
    expect(await screen.findByDisplayValue('30000')).toBeTruthy();
  });

  it('"Fetch from Payments" recomputes on demand even after a manual edit', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={paymentsWithEntries} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Show advance/));
    const amountInput = await screen.findByDisplayValue('75000');
    fireEvent.change(amountInput, { target: { value: '30000' } });
    fireEvent.click(await screen.findByText('↻ Fetch from Payments'));
    expect(await screen.findByDisplayValue('75000')).toBeTruthy();
  });

  it('with no receipted entries at all, fetches to zero rather than leaving a stale/manual figure unexplained', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Show advance/));
    await waitFor(() => expect(screen.getByPlaceholderText('0').value).toBe('0'));
  });
});
