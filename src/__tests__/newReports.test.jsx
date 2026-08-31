import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('Exchange Order Register report', () => {
  it('lists every EO grouped to its latest version, joined against the vendor and the current tour file', async () => {
    const eoRows = [
      { id: 'r1', query_id: 'UTQ-1', vendor_id: 'v1', order_no: 'EO-2026-002', version: 1, is_final: false, content: { issueDate: '2026-08-01', tourNo: 'TF-1' } },
      { id: 'r2', query_id: 'UTQ-2', vendor_id: null, order_no: 'EO-2026-001', version: 1, is_final: false, content: { issueDate: '2026-07-15', tourNo: 'TF-2', drawnOn: 'Custom Hotel Ltd' } },
    ];
    const mockDb = { from: () => ({ select: () => ({ order: async () => ({ data: eoRows, error: null }) }) }) };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: ReportsView } = await import('../components/ReportsView.jsx');

    const queries = [
      { id: 'UTQ-1', tourFileId: 'TF-1-CURRENT', groupName: 'Group A', cancelled: false },
      { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', cancelled: false },
    ];
    const vendors = [{ id: 'v1', name: 'Hotel Taj' }];
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={vendors} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Exchange Order Register/));
    await waitFor(() => expect(screen.getByText('EO-2026-001')).toBeTruthy());
    expect(screen.getByText('EO-2026-002')).toBeTruthy();
    expect(screen.getByText('Hotel Taj')).toBeTruthy(); // resolved via vendor_id
    expect(screen.getByText('Custom Hotel Ltd')).toBeTruthy(); // fallback to drawnOn free text when no vendor_id
    expect(screen.getByText('01/08/2026')).toBeTruthy(); // dd/mm/yyyy
    expect(screen.getByText('TF-1-CURRENT')).toBeTruthy(); // live tour file id from the query, not the stale snapshot
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Nation-wise Master List report', () => {
  it('lists every query with a nationality set, including date of generation and status', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    const queries = [
      { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', nationality: 'German', date: '2026-08-01', status: 'finance', cancelled: false },
      { id: 'UTQ-2', groupName: 'Group B', nationality: '', date: '2026-08-02', status: 'new', cancelled: false }, // no nationality -- excluded
      { id: 'UTQ-3', groupName: 'Group C', nationality: 'Thai', date: '2026-08-03', status: 'new', cancelled: true },
    ];
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Nation-wise Master List/));
    await waitFor(() => expect(screen.getByText('German')).toBeTruthy());
    expect(screen.getByText('Thai')).toBeTruthy();
    expect(screen.getByText('01/08/2026')).toBeTruthy();
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    expect(screen.getAllByText('German').length + screen.getAllByText('Thai').length).toBe(2); // UTQ-2 (no nationality) excluded
  });
});
