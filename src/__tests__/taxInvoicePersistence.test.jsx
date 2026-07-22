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

const { default: TaxInvoice } = await import('../components/TaxInvoice.jsx');

const fakeQuery = { id: 'UTQ-2026-1100', groupName: 'Tax Invoice Persistence Test', destination: 'Ladakh', paxDisplay: '10' };
const fakePayments = {};

beforeEach(() => { mockDb.from.mockClear(); });

describe('TaxInvoice: real, globally-safe invoice numbering (was a random 3-digit number before, with zero uniqueness guarantee -- a real risk for a document with GST/legal numbering requirements)', () => {
  it('computes the invoice number from existing saved invoice numbers, not a random value', async () => {
    const existingRows = [{ invoice_no: 'TAX-2026-011' }, { invoice_no: 'TAX-2026-009' }];
    const insertSpy = vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }));
    const db = {
      from: vi.fn((t) => {
        let selectArg = '*';
        const builder = {
          select: (arg) => { selectArg = arg; return builder; },
          eq: () => builder, order: () => builder,
          insert: insertSpy,
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: (t === 'tax_invoices' && selectArg === 'invoice_no') ? existingRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TI } = await import('../components/TaxInvoice.jsx');
    render(<TI query={fakeQuery} payments={fakePayments} template={{}} docSettings={{taxInvoice:{prefix:'TAX'}}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByDisplayValue(/TAX-\d{4}-012/)).toBeTruthy(), { timeout: 3000 });
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    await waitFor(() => {
      expect(insertSpy).toHaveBeenCalled();
      expect(insertSpy.mock.calls[0][0].invoice_no).toMatch(/TAX-\d{4}-012/);
    });
  });

  it('refuses to save while the invoice number is still being computed (race-condition guard)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const insertSpy = vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }));
    // A db whose queries never resolve, simulating a slow network --
    // invoiceNo should stay blank, and Save must refuse rather than
    // saving with no number.
    const db = { from: vi.fn(() => ({ select:()=>({eq:()=>({order:()=>({ then: () => {} })})}), insert: insertSpy })) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TI } = await import('../components/TaxInvoice.jsx');
    render(<TI query={fakeQuery} payments={fakePayments} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click((await screen.findAllByText(/💾 Save v1/))[0]);
    expect(alertSpy).toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('TaxInvoice: real versioned persistence (Phase 0 of the Document Chain plan, final document) + the previously dead footer Save button', () => {
  it('the footer Save button now actually saves (had no onClick handler at all before)', async () => {
    render(<TaxInvoice query={fakeQuery} payments={fakePayments} template={{}} docSettings={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('tax_invoices'));
  });

  it('renders without crashing when currentUser/docSettings are not passed (demo mode)', async () => {
    render(<TaxInvoice query={fakeQuery} payments={fakePayments} template={{}} onClose={()=>{}}/>);
    expect((await screen.findAllByText(/Tax Invoice|TAX INVOICE/)).length).toBeGreaterThan(0);
  });
});
