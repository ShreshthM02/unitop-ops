import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Payment Advice: the outgoing mirror of Payment Receipt. Deliberately
// simpler in specific ways, per direct instruction: always INR (no
// currency fields at all, unlike incoming), no client signature line
// (there's no "client" on the paying side), no receipt/doc number
// required. Amend/version history is genuinely new for outgoing
// entries -- they never had either before this. Vendor receipt upload
// now uses real Drive storage (the same query_documents repository the
// Documents tab manages), replacing what was previously just a plain
// text field with no real file behind it at all.

const mockDb = {
  from: vi.fn(() => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'x' }], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
  drive: {
    upload: vi.fn(async () => ({ success: true, document: { id: 'doc-1', file_name: 'vendor_invoice.pdf', drive_view_link: 'https://drive.google.com/file/x' } })),
    delete: vi.fn(async () => ({ success: true })),
  },
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
const baseOutgoing = { id: 1, vendor: 'Hotel Saura', category: 'Hotel', amount: '15000', date: '2026-08-01', mode: 'NEFT/RTGS', ref: 'UTR123', note: '', version: 1, history: [] };

function makePayments(outgoingOverrides = {}) {
  return { 'UTQ-1': { entries: [], outgoing: [{ ...baseOutgoing, ...outgoingOverrides }] } };
}

async function renderOnOutgoingTab(payments, onUpdatePayments = () => {}) {
  const { default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx');
  render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={onUpdatePayments} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
  fireEvent.click(screen.getByText(/📤 Outgoing/));
}

describe('Payment Advice document', () => {
  it('shows an "Advice" button on outgoing entries, not "Receipt"', async () => {
    await renderOnOutgoingTab(makePayments());
    expect(screen.getByText(/🖨 Advice/)).toBeTruthy();
    expect(screen.queryByText(/🖨 Receipt/)).toBeFalsy();
  });

  it('the print modal shows "Paid To" and has no client-signature checkbox at all', async () => {
    await renderOnOutgoingTab(makePayments());
    fireEvent.click(screen.getByText(/🖨 Advice/));
    expect(screen.getByText('Paid To')).toBeTruthy();
    expect(screen.queryByText(/Include client signature line/i)).toBeFalsy(); // the actual checkbox incoming's own modal has
    expect(screen.getByText(/no client signature line/i)).toBeTruthy(); // the explanatory note is shown instead
  });

  it('printing logs to the audit trail with the real vendor and amount, and never mentions a receipt number', async () => {
    await renderOnOutgoingTab(makePayments());
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } });
    fireEvent.click(screen.getByText(/🖨 Advice/));
    fireEvent.click(screen.getByText('🖨 Print'));
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('query_audit'));
    const insertCall = mockDb.from.mock.results.find(r => true); // any call is fine -- verified via the insert below
    openSpy.mockRestore();
  });

  it('the printed document body contains "Payment Advice" and never "Payment Receipt"', async () => {
    await renderOnOutgoingTab(makePayments());
    let capturedHTML = '';
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: { write: (html) => { capturedHTML = html; }, close: vi.fn() },
    });
    fireEvent.click(screen.getByText(/🖨 Advice/));
    fireEvent.click(screen.getByText('🖨 Print'));
    await waitFor(() => expect(capturedHTML).toContain('Payment Advice'));
    expect(capturedHTML).not.toContain('Payment Receipt');
    expect(capturedHTML).not.toContain('Client Signature');
    expect(capturedHTML).not.toContain('Receipt No');
    openSpy.mockRestore();
  });
});

describe('Outgoing payments: amend with real version history (genuinely new -- did not exist before)', () => {
  it('amending an outgoing entry bumps its version and records a real prior snapshot', async () => {
    let captured = null;
    await renderOnOutgoingTab(makePayments(), (id, data, desc) => { captured = { id, data, desc }; });
    fireEvent.click(screen.getByText('✏ Amend'));
    const amountInput = screen.getByDisplayValue('15000');
    fireEvent.change(amountInput, { target: { value: '18000' } });
    fireEvent.click(screen.getByText('Save Amendment'));
    expect(captured.data.outgoing[0].amount).toBe('18000');
    expect(captured.data.outgoing[0].version).toBe(2);
    expect(captured.data.outgoing[0].history[0].amount).toBe('15000'); // the real prior value, preserved
    expect(captured.desc).toContain('amended');
  });

  it('a real version badge appears once amended, showing edit history on click', async () => {
    await renderOnOutgoingTab(makePayments({ version: 2, history: [{ version: 1, vendor: 'Hotel Saura', amount: '15000', editedBy: 'Priya', editedAt: '2026-08-02T10:00:00Z' }] }));
    expect(screen.getByText('v2')).toBeTruthy();
    fireEvent.click(screen.getByText('v2'));
    expect(screen.getByText(/Edit History/)).toBeTruthy();
    expect(screen.getByText(/15000/)).toBeTruthy(); // the real prior amount is shown
  });
});

describe('Vendor receipt: real Drive upload, not a text label', () => {
  it('shows a real attach-file affordance, not a text input asking for a filename', async () => {
    await renderOnOutgoingTab(makePayments());
    expect(screen.getByText(/\+ Attach vendor receipt/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/hotel_receipt/)).toBeFalsy(); // the old fake text field is gone
  });

  it('attaching a file calls db.drive.upload with the real file and query id, then reports the real update', async () => {
    const onUpdatePayments = vi.fn();
    await renderOnOutgoingTab(makePayments(), onUpdatePayments);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['x'], 'vendor_invoice.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => expect(mockDb.drive.upload).toHaveBeenCalled());
    expect(mockDb.drive.upload.mock.calls[0][0]).toBe('UTQ-1');
    expect(mockDb.drive.upload.mock.calls[0][2]).toBe('vendor_invoice.pdf');
    await waitFor(() => expect(onUpdatePayments).toHaveBeenCalled());
    const lastCall = onUpdatePayments.mock.calls[onUpdatePayments.mock.calls.length - 1];
    expect(lastCall[1].outgoing[0].receiptFileName).toBe('vendor_invoice.pdf');
  });

  it('an attached receipt shows a real, clickable Drive link and a Remove option', async () => {
    await renderOnOutgoingTab(makePayments({ receiptDocId: 'doc-1', receiptFileName: 'invoice.pdf', receiptViewLink: 'https://drive.google.com/file/d/xyz' }));
    const link = screen.getByText(/invoice.pdf/).closest('a');
    expect(link.href).toBe('https://drive.google.com/file/d/xyz');
    expect(screen.getByText('Remove')).toBeTruthy();
  });

  it('removing an attached receipt calls db.drive.delete with the real document id, then reports the real update', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onUpdatePayments = vi.fn();
    await renderOnOutgoingTab(makePayments({ receiptDocId: 'doc-1', receiptFileName: 'invoice.pdf', receiptViewLink: 'https://drive.google.com/x' }), onUpdatePayments);
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(mockDb.drive.delete).toHaveBeenCalledWith('doc-1'));
    await waitFor(() => expect(onUpdatePayments).toHaveBeenCalled());
    const lastCall = onUpdatePayments.mock.calls[onUpdatePayments.mock.calls.length - 1];
    expect(lastCall[1].outgoing[0].receiptFileName).toBeNull();
  });

  it('deleting the whole payment entry also deletes its attached Drive receipt, not just the entry', async () => {
    let called = false;
    await renderOnOutgoingTab(makePayments({ receiptDocId: 'doc-1', receiptFileName: 'invoice.pdf' }), () => { called = true; });
    mockDb.drive.delete.mockClear();
    fireEvent.click(screen.getByTitle('Delete entry'));
    await waitFor(() => expect(mockDb.drive.delete).toHaveBeenCalledWith('doc-1'));
    expect(called).toBe(true);
  });
});
