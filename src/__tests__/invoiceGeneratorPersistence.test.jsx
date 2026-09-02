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

describe('InvoiceGenerator: real, pattern-based invoice numbering (per flavor)', () => {
  it('Pro-Forma computes its invoice number from docSettings.proforma\u2019s own persistent serial, not by parsing existing saved numbers', async () => {
    // Superseded design, not just a superficial test update: numbering
    // used to derive {seq} by parsing the trailing segment of every
    // existing invoice number (existingRows here) -- replaced with a
    // real persistent serial counter specifically because that parsing
    // approach can't survive an arbitrary user-configured pattern (a
    // {group}/{sector} segment can contain almost anything). This test
    // now confirms the NEW behavior directly: the number comes from
    // docSettings.proforma.serial and the configured pattern, and the
    // bump gets persisted via onSaveDocSettings -- existing saved
    // invoice numbers are irrelevant to what gets generated next.
    const db = {
      from: vi.fn(() => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InvoiceGenerator2 } = await import('../components/InvoiceGenerator.jsx');
    const onSaveDocSettings = vi.fn();
    render(<InvoiceGenerator2 query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}}
      docSettings={{ proforma: { prefix: 'PI', pattern: '{prefix}-{year}-{seq}', serial: 8 }, taxinvoice: { prefix: 'TI', serial: 1 } }}
      onSaveDocSettings={onSaveDocSettings} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue(`PI-${new Date().getFullYear()}-008`)).toBeTruthy());
    expect(onSaveDocSettings).toHaveBeenCalledWith(expect.objectContaining({ proforma: expect.objectContaining({ serial: 9 }) }));
    vi.doUnmock('../lib/supabase.js');
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

describe('InvoiceGenerator: Addressee vs Billed To -- kept as two separate blocks, Agent Master picker cascades from one into the other', () => {
  it('selecting an agent for Addressee fills Name/Company/City there, and cascades Company/Address/City/GSTIN into Billed To', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const select = await screen.findByDisplayValue('Select from Agent Master...');
    fireEvent.change(select, { target: { value: 'AGT-1' } });
    await waitFor(() => expect(screen.getByDisplayValue('Pee Suchint')).toBeTruthy());
    // Addressee's own City/Country field
    expect(screen.getAllByDisplayValue('Bangkok, Thailand').length).toBe(2); // Addressee + Billed To
    // Cascaded into Billed To, which has no contact-name field at all
    expect(screen.getByDisplayValue('99 Sukhumvit Rd')).toBeTruthy();
    expect(screen.queryByText('Contact Name')).toBeNull();
  });

  it('the two blocks stay independently editable after the cascade -- editing Billed To does not change Addressee', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const select = await screen.findByDisplayValue('Select from Agent Master...');
    fireEvent.change(select, { target: { value: 'AGT-1' } });
    await waitFor(() => expect(screen.getAllByDisplayValue('NCH Holidays').length).toBe(3)); // Addressee + Billed To + the <select> itself
    const billToCompanyInput = screen.getByText('Company / Agency / Client').parentElement.querySelector('input');
    fireEvent.change(billToCompanyInput, { target: { value: 'A Different Billing Entity Ltd.' } });
    // Addressee's own Company field (and the select showing the picked
    // agent) should be untouched -- 2 remaining matches, not the 3 from
    // before editing Billed To away from it.
    expect(screen.getAllByDisplayValue('NCH Holidays').length).toBe(2);
    expect(screen.getByDisplayValue('A Different Billing Entity Ltd.')).toBeTruthy();
  });

  it('"Custom" is available for an addressee not in Agent Master, and the always-visible fields below take manual entry either way', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const select = await screen.findByDisplayValue('Select from Agent Master...');
    fireEvent.change(select, { target: { value: '__custom__' } });
    const nameInput = screen.getByText('Name').parentElement.querySelector('input');
    fireEvent.change(nameInput, { target: { value: 'A Walk-in Client' } });
    expect(screen.getByDisplayValue('A Walk-in Client')).toBeTruthy();
  });
});

describe('InvoiceGenerator: Pro-Forma content fixes', () => {
  it('subject line does not duplicate "pax" when paxDisplay already includes it', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    // Pro-Forma RichTextEditor order: [0]=subject, [1]=openingLine, [2]=notes, [3]=signOff
    await waitFor(() => {
      expect(document.querySelectorAll('[contenteditable="true"]')[0]?.textContent).toMatch(/GROUP FROM/);
    });
    const subjectInput = document.querySelectorAll('[contenteditable="true"]')[0];
    expect(subjectInput.textContent).not.toMatch(/pax.*PAX|PAX.*pax/i);
    expect((subjectInput.textContent.match(/pax/gi) || []).length).toBeLessThanOrEqual(1);
  });

  it('opening line is editable and pre-filled from the template', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{ asDesiredLine: 'CUSTOM OPENING LINE' }} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => {
      expect(document.querySelectorAll('[contenteditable="true"]')[1]?.textContent).toBe('CUSTOM OPENING LINE');
    });
  });

  it('notes and sign-off are pre-filled from the template, not hardcoded', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{ notes: 'Template notes here', signOff: 'For Custom Co.' }} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => {
      const editors = document.querySelectorAll('[contenteditable="true"]');
      expect(editors[2]?.textContent).toBe('Template notes here');
      expect(editors[3]?.textContent).toBe('For Custom Co.');
    });
  });

  it('travel date is shown as an arrival-to-departure range in dd/mm/yyyy', async () => {
    const q = { ...fakeQuery, travelDate: '2026-09-01', travelDateTo: '2026-09-10' };
    render(<InvoiceGenerator query={q} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue('01/09/2026 to 10/09/2026')).toBeTruthy();
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
    expect(await screen.findByText(/📬 Billed To/)).toBeTruthy();
    expect(screen.getByText(/Tour Details/)).toBeTruthy();
  });
});

describe('InvoiceGenerator: line item Amount is always Qty x Rate, computed not typed', () => {
  it('changing Qty or Rate recomputes Amount automatically', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const qtyInput = await screen.findByDisplayValue('1');
    fireEvent.change(qtyInput, { target: { value: '4' } });
    const zeroInputs = await screen.findAllByDisplayValue('0');
    const rateInput = zeroInputs.find(el => !el.readOnly);
    fireEvent.change(rateInput, { target: { value: '250' } });
    expect(await screen.findByDisplayValue('1000')).toBeTruthy();
  });

  it('the Amount field is read-only', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const amountInput = await screen.findAllByDisplayValue('0');
    // rate and amount both show '0' initially -- find the readOnly one
    const readOnlyOne = amountInput.find(el => el.readOnly);
    expect(readOnlyOne).toBeTruthy();
  });
});

describe('InvoiceGenerator: currency dropdown defaults to USD', () => {
  it('shows a select with USD pre-selected, not a free-text field', async () => {
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const currencySelect = await screen.findByDisplayValue('USD');
    expect(currencySelect.tagName).toBe('SELECT');
  });
});

describe('InvoiceGenerator: RE line omitted entirely when the subject is blank', () => {
  it('does not render an empty "RE:" line', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    render(<InvoiceGenerator query={fakeQuery} payments={{}} proformaTemplate={{}} taxinvoiceTemplate={{}} docSettings={{}} agents={fakeAgents} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => {
      expect(document.querySelectorAll('[contenteditable="true"]')[0]?.textContent).toMatch(/GROUP FROM/);
    });
    const subjectInput = document.querySelectorAll('[contenteditable="true"]')[0];
    subjectInput.innerHTML = '';
    subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    expect(captured.html).not.toContain('RE:');
    window.open = realOpen;
  });
});

describe('InvoiceGenerator: Phase B -- Advance / Adjusted Payment auto-fetch from receipted incoming payments', () => {
  const paymentsWithEntries = {
    'UTQ-2026-1000': {
      entries: [
        { id: 1, type: 'advance', inCurrency: 'USD', amount: '50000', date: '2026-08-01', receipt: 'RCP-2026-001' },
        { id: 2, type: 'balance', inCurrency: 'USD', amount: '25000', date: '2026-08-10', receipt: 'RCP-2026-002' },
        { id: 3, type: 'advance', inCurrency: 'INR', amount: '500', date: '2026-08-05', receipt: 'RCP-2026-003' },
        // No receipt -- must not be counted, per direct instruction
        // ("only incoming payments which have a receipt get fetched").
        { id: 4, type: 'advance', inCurrency: 'USD', amount: '9999', date: '2026-08-12', receipt: '' },
      ],
    },
  };

  it('turning the section on auto-fetches the total of receipted entries matching the invoice currency (USD, the new default), excluding the un-receipted one', async () => {
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
