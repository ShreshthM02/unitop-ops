import { describe, it, expect, vi } from 'vitest';
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
  it('calls logAudit when the Receipt button is clicked', async () => {
    const { default: EnhancedPaymentTracker } = await import('../components/EnhancedPaymentTracker.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const payments = { 'UTQ-1': { entries: [{ id: 1, type: 'advance', amount: '5000', inCurrency: 'INR', date: '2026-08-01', mode: 'NEFT', receipt: 'RCP-2026-001' }], outgoing: [] } };
    render(<EnhancedPaymentTracker query={query} payments={payments} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);

    // window.open is used by the existing receipt printer; stub it so the click doesn't actually open a window in the test environment
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } });
    mockDb.from.mockClear();
    fireEvent.click(screen.getByText(/🖨 Receipt/));
    expect(mockDb.from).toHaveBeenCalledWith('query_audit');
    openSpy.mockRestore();
  });
});
