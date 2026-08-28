import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn(() => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'x' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

describe('Tour Facilitator Report', () => {
  const queries = [
    { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', travelDate: '2026-08-01', nights: 5, cancelled: false },
    { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', destination: 'Rajasthan', travelDate: '2026-09-01', nights: 7, cancelled: false },
    { id: 'UTQ-3', tourFileId: 'TF-3', groupName: 'Cancelled Group', destination: 'Goa', cancelled: true },
  ];
  const vendors = [{ id: 'v1', name: 'Prithvi', type: 'Tour Facilitator' }, { id: 'v2', name: 'Anjali', type: 'Tour Facilitator' }];
  const tourExecutions = {
    'UTQ-1': { facilitators: [{ id: 1, vendorId: 'v1', sector: 'North Kerala' }] },
    'UTQ-2': { facilitators: [{ id: 1, vendorId: 'v2', sector: '' }, { id: 2, vendorId: '', sector: '' }] }, // second has no vendor assigned
    'UTQ-3': { facilitators: [{ id: 1, vendorId: 'v1', sector: '' }] }, // cancelled -- should be excluded
  };

  it('appears in the Operations category report list', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={vendors} tourExecutions={tourExecutions}/>);
    expect(screen.getByText(/Tour Facilitator Report/)).toBeTruthy();
  });

  it('lists each real facilitator assignment with the resolved vendor name, excluding cancelled tours and unassigned rows', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={vendors} tourExecutions={tourExecutions}/>);
    fireEvent.click(screen.getByText(/Tour Facilitator Report/));
    await waitFor(() => expect(screen.getByText('Prithvi')).toBeTruthy());
    expect(screen.getByText('Anjali')).toBeTruthy();
    // Only one Prithvi row should show -- the cancelled tour's assignment must not appear
    expect(screen.getAllByText('Prithvi').length).toBe(1);
    expect(screen.getByText('North Kerala')).toBeTruthy();
    expect(screen.getByText('TF-1')).toBeTruthy();
  });
});

describe('Payment Receipt: printing now logs to the audit trail (the one real gap found)', () => {
  it('calls logAudit when the receipt is actually printed from the review modal', async () => {
    const { default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', amount: '5000', inCurrency: 'INR', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-2026-001' }], outgoing: [] } };
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);

    // window.open is used by the existing receipt printer; stub it so the click doesn't actually open a window in the test environment
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } });
    mockDb.from.mockClear();
    fireEvent.click(screen.getByText(/🖨 Receipt/));
    expect(mockDb.from).not.toHaveBeenCalledWith('query_audit'); // opening the review modal alone must not print/log yet
    fireEvent.click(screen.getByText('🖨 Print'));
    expect(mockDb.from).toHaveBeenCalledWith('query_audit');
    openSpy.mockRestore();
  });
});

describe('Payment Receipt: A4 portrait, no separate company-name heading, restructured Received From block', () => {
  const query = {
    id: 'UTQ-1', clientName: 'Sharma Family', groupName: 'Sharma Kerala Tour', tourFileId: 'TF-1',
    agentCompany: 'ABC Travels', destination: 'Kerala', paxDisplay: '6',
    travelDate: '2026-09-01', travelDateTo: '2026-09-10',
  };
  const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', amount: '5000', inCurrency: 'USD', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-2026-001' }], outgoing: [] } };

  function openModalAndPrint({ toggleSignatureOff, toggleStampOn, editField } = {}) {
    let captured = {};
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: (html) => { captured.html = html; }, close: () => {} } });
    const { unmount } = render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText(/🖨 Receipt/));
    if (toggleSignatureOff) fireEvent.click(screen.getByText('Include client signature line'));
    if (toggleStampOn) fireEvent.click(screen.getByText('Apply digital stamp'));
    if (editField) fireEvent.change(screen.getByDisplayValue(editField.from), { target: { value: editField.to } });
    fireEvent.click(screen.getByText('🖨 Print'));
    openSpy.mockRestore();
    unmount(); // each call renders a fresh instance -- unmount so a second call in the same test doesn't leave two "🖨 Receipt" buttons in the DOM
    return captured.html;
  }

  let EnhancedPaymentTracker;
  beforeAll(async () => {
    ({ default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx'));
  });

  it('uses A4 portrait, not the old A5 page size', () => {
    const html = openModalAndPrint();
    expect(html).toMatch(/size:\s*A4\s+portrait/);
    expect(html).not.toContain('size:A5');
  });

  it('does not print the company name as a separate text heading -- the shared letterhead logo alone carries the brand', () => {
    // The old hand-rolled header had a dedicated `.lh-name` heading showing
    // the company name in large Playfair Display text directly under the
    // logo. The shared letterhead header (used by every other document)
    // has no such element -- just the logo and the small address lines.
    // The company name legitimately still appears once, in the small
    // footer disclaimer and the signature block -- this only checks the
    // old standalone heading class is gone.
    const html = openModalAndPrint();
    expect(html).not.toContain('lh-name');
  });

  it('does not leak unscoped table/th/td/tr rules into the shared letterhead’s own wrapper table', () => {
    // Every receipt-specific selector must be scoped under .rcpt -- a bare
    // `table{...}` etc would apply document-wide, including to the outer
    // .lh-doc wrapper table buildLetterheadDocument itself assembles the
    // page from.
    const html = openModalAndPrint();
    expect(html).not.toContain('\n  table{');
    expect(html).not.toContain('\n  th{');
    expect(html).not.toContain('\n  td{');
    expect(html).toContain('.rcpt table{');
    expect(html).toContain('.rcpt th{');
    expect(html).toContain('.rcpt td{');
  });

  it('Received From is pre-filled with Client / Agency, Tour Name | date range in dd/mm/yyyy, and Tour File No. | Sector | Pax as three distinct, editable lines -- and the headline does not duplicate the tour name shown below it', () => {
    const html = openModalAndPrint();
    // 1.3.1 Client / Agency -- client only, no groupName/tour-name fallback
    expect(html).toContain('Sharma Family / ABC Travels');
    expect((html.match(/Sharma Kerala Tour/g) || []).length).toBe(1); // appears once, not duplicated into the headline too
    // 1.3.2 Tour Name | {Arrival Date} - {Departure Date} in dd/mm/yyyy
    expect(html).toContain('Sharma Kerala Tour | 01/09/2026 - 10/09/2026');
    // 1.3.3 Tour File No. | Sector | Pax
    expect(html).toContain('TF-1 | Kerala | 6');
  });

  it('Received From fields are pre-filled but editable before printing', () => {
    const html = openModalAndPrint({ editField: { from: 'Sharma Family / ABC Travels', to: 'Edited Client Name' } });
    expect(html).toContain('Edited Client Name');
    expect(html).not.toContain('Sharma Family / ABC Travels');
  });

  it('receipt number is a row inside the payment-details table, not a standalone heading', () => {
    const html = openModalAndPrint();
    expect(html).toContain('<td>Receipt No.</td><td style="text-align:right;font-weight:600;color:#8B1A1A">RCP-2026-001</td>');
    expect(html).not.toContain('class="rcpt-no"');
  });

  it('shows amount as currency then amount, with no separate Currency row', () => {
    const html = openModalAndPrint();
    expect(html).toContain('USD 5,000.00');
    expect(html).not.toContain('<td>Currency</td>');
    expect(html).not.toContain('₹ 5,000.00'); // was hardcoded as INR regardless of the entry's real currency
  });

  it('client signature line and digital stamp are independent toggles, both off/on by default respectively', () => {
    const defaultHtml = openModalAndPrint();
    expect(defaultHtml).toContain('Client Signature');
    expect(defaultHtml).not.toContain('alt="Digital Stamp"');

    const softCopyHtml = openModalAndPrint({ toggleSignatureOff: true, toggleStampOn: true });
    expect(softCopyHtml).not.toContain('Client Signature');
    expect(softCopyHtml).toContain('alt="Digital Stamp"');
    expect(softCopyHtml).toContain('For Unitop'); // Unitop's own signature block always stays
  });
});

describe('Payment entries are amendable with version history, and P&L/summary now sum the real INR credited', () => {
  let EnhancedPaymentTracker;
  beforeAll(async () => {
    ({ default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx'));
  });

  it('editing an entry increments its version, records the prior snapshot in history, and describes the change for the audit trail', () => {
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', inCurrency: 'INR', amount: '5000', amountINR: '5000', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-2026-001', version: 1, history: [] }], outgoing: [] } };
    let captured = null;
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={(id,data,desc)=>{captured={id,data,desc};}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);

    fireEvent.click(screen.getByText('✏ Amend'));
    fireEvent.change(screen.getByDisplayValue('5000'), { target: { value: '5500' } });
    fireEvent.click(screen.getByText('Save Amendment'));

    expect(captured).toBeTruthy();
    const updatedEntry = captured.data.entries[0];
    expect(updatedEntry.amount).toBe('5500');
    expect(updatedEntry.version).toBe(2);
    expect(updatedEntry.history.length).toBe(1);
    expect(updatedEntry.history[0].amount).toBe('5000'); // prior value preserved in history
    expect(updatedEntry.history[0].editedBy).toBe('Priya');
    expect(captured.desc).toMatch(/amended/i);
    expect(captured.desc).toContain('5000');
    expect(captured.desc).toContain('5500');
  });

  it('an unchanged edit (Cancel, or Save with nothing altered) does not bump the version or touch history', () => {
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', inCurrency: 'INR', amount: '5000', amountINR: '5000', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-2026-001', version: 1, history: [] }], outgoing: [] } };
    let called = false;
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{called=true;}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText('✏ Amend'));
    fireEvent.click(screen.getByText('Save Amendment'));
    expect(called).toBe(false);
  });

  it('shows a version badge that opens the history modal once an entry has been amended', () => {
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{
      id: 1, type: 'advance', inCurrency: 'USD', amount: '1000', amountINR: '82000', date: '2026-08-01', mode: 'SWIFT', receipt: 'RCP-2026-001', version: 2,
      history: [{ version: 1, amount: '900', amountINR: '75000', inCurrency: 'USD', editedBy: 'Priya', editedAt: '2026-08-02T10:00:00.000Z' }],
    }], outgoing: [] } };
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    expect(screen.queryByText('v1')).toBeFalsy(); // no badge before any amendment happened in this render's initial state check
    fireEvent.click(screen.getByText('v2'));
    expect(screen.getByText('Edit History')).toBeTruthy();
    expect(screen.getByText(/900/)).toBeTruthy(); // the prior (v1) amount shows in the history panel
  });

  it('summary and P&L sum the real INR credited for foreign-currency entries, not the raw foreign amount, and exclude FC entries with no amountINR yet', () => {
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { tourValue: 10000, currency: 'US $', roeUsed: 90, entries: [
      { id: 1, type: 'advance', inCurrency: 'INR', amount: '50000', amountINR: '50000', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-1', version: 1, history: [] },
      { id: 2, type: 'second', inCurrency: 'USD', amount: '1000', amountINR: '84000', date: '2026-08-05', mode: 'SWIFT', receipt: 'RCP-2', version: 1, history: [] },
      { id: 3, type: 'third', inCurrency: 'USD', amount: '500', amountINR: '', date: '2026-08-10', mode: 'SWIFT', receipt: 'RCP-3', version: 1, history: [] }, // no amountINR yet -- must NOT count as ₹500
    ], outgoing: [] } };
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    // 50000 (INR) + 84000 (USD entry's real credited INR) = 134000; the third entry's raw USD 500 must not silently count as ₹500
    expect(screen.getByText(/134,000|1,34,000/)).toBeTruthy();
    expect(screen.queryByText(/^₹ 500$/)).toBeFalsy();
  });

  it('flags a foreign-currency entry with no amountINR set on the row itself', () => {
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', inCurrency: 'USD', amount: '500', amountINR: '', date: '2026-08-01', mode: 'SWIFT', receipt: 'RCP-1', version: 1, history: [] }], outgoing: [] } };
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    expect(screen.getByText(/INR amount not set/)).toBeTruthy();
  });
});
