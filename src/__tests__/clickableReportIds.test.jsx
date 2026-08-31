import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// 1.10: wherever a Query ID or Tour File ID is shown, it should be
// clickable into the drawer. Reports resolve this generically -- any
// cell whose value matches the row's own query's id/tourFileId becomes
// clickable, driven by data (a __queryRef the report attaches per row),
// not by hardcoding which column name means "the ID" per report.

describe('Report ID/Tour File cells open the query drawer on click', () => {
  const queries = [
    { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', status: 'finance', date: '2026-08-01', cancelled: false },
    { id: 'UTQ-2', groupName: 'Group B', destination: 'Goa', status: 'new', date: '2026-08-02', cancelled: false },
  ];

  it('Active Pipeline: clicking the ID cell calls onOpenQuery with that row\u2019s query', async () => {
    const onOpenQuery = vi.fn();
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} onOpenQuery={onOpenQuery}/>);
    fireEvent.click(screen.getByText(/Active Pipeline/));
    await waitFor(() => expect(screen.getByText('TF-1')).toBeTruthy());
    fireEvent.click(screen.getByText('TF-1'));
    expect(onOpenQuery).toHaveBeenCalledTimes(1);
    expect(onOpenQuery.mock.calls[0][0].id).toBe('UTQ-1');
    fireEvent.click(screen.getByText('UTQ-2'));
    expect(onOpenQuery.mock.calls[1][0].id).toBe('UTQ-2');
  });

  it('Query Log: both Query ID and Tour File columns are independently clickable on the same row', async () => {
    const onOpenQuery = vi.fn();
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} onOpenQuery={onOpenQuery}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByText('UTQ-1')).toBeTruthy());
    fireEvent.click(screen.getByText('UTQ-1'));
    fireEvent.click(screen.getByText('TF-1'));
    expect(onOpenQuery).toHaveBeenCalledTimes(2);
    expect(onOpenQuery.mock.calls[0][0].id).toBe('UTQ-1');
    expect(onOpenQuery.mock.calls[1][0].id).toBe('UTQ-1');
  });

  it('non-ID cells (Group, Sector, Status) are never clickable', async () => {
    const onOpenQuery = vi.fn();
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} onOpenQuery={onOpenQuery}/>);
    fireEvent.click(screen.getByText(/Active Pipeline/));
    await waitFor(() => expect(screen.getByText('Group A')).toBeTruthy());
    fireEvent.click(screen.getByText('Group A'));
    expect(onOpenQuery).not.toHaveBeenCalled();
  });

  it('an aggregated report (Sector Performance, no single query per row) has no clickable cells at all', async () => {
    const onOpenQuery = vi.fn();
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} onOpenQuery={onOpenQuery}/>);
    fireEvent.click(screen.getByText(/Sector Performance/));
    await waitFor(() => expect(screen.getAllByText('Kerala').length).toBeGreaterThan(0));
    const cell = screen.getAllByText('Kerala').find(el => el.tagName !== 'OPTION');
    fireEvent.click(cell);
    expect(onOpenQuery).not.toHaveBeenCalled();
  });

  it('the __queryRef marker never leaks into the visible table as a column', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} onOpenQuery={()=>{}}/>);
    fireEvent.click(screen.getByText(/Active Pipeline/));
    await waitFor(() => expect(screen.getByText('TF-1')).toBeTruthy());
    expect(screen.queryByText('__queryRef')).toBeFalsy();
  });
});
