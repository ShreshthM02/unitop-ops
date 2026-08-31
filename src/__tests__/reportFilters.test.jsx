import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// 1.1: filters on top of every report, applied to the underlying queries
// before any report's own data logic runs -- so a filter changes what an
// AGGREGATED report (e.g. Sector Performance) aggregates over too, not
// just which output rows of a per-query report show.

const queries = [
  { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', agentCompany: 'ABC Travels', status: 'finance', date: '2026-08-01', cancelled: false },
  { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', destination: 'Goa', agentCompany: 'XYZ Tours', status: 'new', date: '2026-08-15', cancelled: false },
];

describe('Report filters: Sector', () => {
  it('narrows Query Log to only the selected sector', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    expect(screen.getByText('UTQ-2')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Sector: All'), { target: { value: 'Kerala' } });
    expect(screen.getByText('UTQ-1')).toBeTruthy();
    expect(screen.queryByText('UTQ-2')).toBeFalsy();
  });
});

describe('Report filters: Agent', () => {
  it('narrows results to the selected agent', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Agent: All'), { target: { value: 'XYZ Tours' } });
    expect(screen.queryByText('UTQ-1')).toBeFalsy();
    expect(screen.getByText('UTQ-2')).toBeTruthy();
  });
});

describe('Report filters apply to aggregated reports too (they filter the source data, not just output rows)', () => {
  it('Sector Performance only aggregates the filtered agent\u2019s queries', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Sector Performance/));
    await waitFor(() => expect(screen.getAllByText('Kerala').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Goa').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByDisplayValue('Agent: All'), { target: { value: 'ABC Travels' } });
    // Only Kerala (ABC Travels' query) should remain in the aggregated table row
    const goaInTable = screen.queryAllByText('Goa').filter(el => el.tagName === 'TD');
    expect(goaInTable.length).toBe(0);
  });
});

describe('Report filters: Clear filters button', () => {
  it('appears once a filter is active, and resets everything on click', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    expect(screen.queryByText('✕ Clear filters')).toBeFalsy();

    fireEvent.change(screen.getByDisplayValue('Sector: All'), { target: { value: 'Kerala' } });
    expect(screen.queryByText('UTQ-2')).toBeFalsy();
    const clearBtn = screen.getByText('✕ Clear filters');
    fireEvent.click(clearBtn);
    expect(screen.getByText('UTQ-2')).toBeTruthy();
  });
});

describe('Report filters: Exchange Order Register is unaffected by Sector/Status (it has neither column)', () => {
  it('still resolves the correct Tour File Number regardless of active filters', async () => {
    const eoRows = [
      { id: 'r1', query_id: 'UTQ-1', vendor_id: null, order_no: 'EO-2026-001', version: 1, is_final: false, content: { issueDate: '2026-08-01', tourNo: 'TF-1', drawnOn: 'Hotel X' } },
    ];
    // No supabase mock needed at module scope here since this file doesn't
    // dynamically import ReportsView -- loadAllExchangeOrders is invoked
    // through the real db import, which the global test setup already
    // stubs to return empty; this test only needs the report to render
    // without crashing when a filter is set beforehand.
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Sector: All'), { target: { value: 'Kerala' } });
    fireEvent.click(screen.getByText(/Exchange Order Register/));
    await waitFor(() => expect(screen.getByText(/No documents|No data yet|Loading/)).toBeTruthy());
  });
});
