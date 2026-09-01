import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// Direct feedback: a single generic filter bar applied to every report
// alike was wrong -- filtering Agent-wise Revenue BY agent collapses its
// own point, Exchange Order Register showed Sector/Agent/Status controls
// that silently did nothing. Each report now declares its own relevant
// filters (report.filters); these tests check the bar only shows what's
// declared, and that a filter set while viewing one report doesn't
// silently keep affecting a DIFFERENT report that never showed a control
// for it.

const queries = [
  { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', agentCompany: 'ABC Travels', nationality: 'German', status: 'finance', date: '2026-08-01', cancelled: false, cancellationReason: '' },
  { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B', destination: 'Goa', agentCompany: 'XYZ Tours', nationality: 'Thai', status: 'new', date: '2026-08-15', cancelled: false, cancellationReason: '' },
];

describe('Each report shows only its own declared filters', () => {
  it('Agent-wise Revenue does not show an Agent filter (it would collapse the report to one row)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Agent-wise Revenue/));
    await waitFor(() => expect(screen.getAllByText('ABC Travels').length).toBeGreaterThan(0));
    expect(screen.queryByDisplayValue('Agent: All')).toBeFalsy();
    expect(screen.getByDisplayValue('Sector: All')).toBeTruthy(); // still gets a Sector filter
  });

  it('Sector Performance does not show a Sector filter, for the same reason', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Sector Performance/));
    await waitFor(() => expect(screen.getAllByText('Kerala').length).toBeGreaterThan(0));
    expect(screen.queryByDisplayValue('Sector: All')).toBeFalsy();
    expect(screen.getByDisplayValue('Agent: All')).toBeTruthy();
  });

  it('Exchange Order Register shows a Vendor filter, not Sector/Agent/Status (which it has no data for)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Exchange Order Register/));
    await waitFor(() => expect(screen.getByDisplayValue('Vendor: All')).toBeTruthy());
    expect(screen.queryByDisplayValue('Sector: All')).toBeFalsy();
    expect(screen.queryByDisplayValue('Agent: All')).toBeFalsy();
    expect(screen.queryByDisplayValue('Status: All')).toBeFalsy();
  });

  it('Tour Facilitator Report shows a Facilitator filter, not an Agent filter (facilitators aren’t tied to agents)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Tour Facilitator Report/));
    await waitFor(() => expect(screen.getByDisplayValue('Facilitator: All')).toBeTruthy());
    expect(screen.queryByDisplayValue('Agent: All')).toBeFalsy();
  });

  it('Nation-wise Master List shows a Nationality filter', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Nation-wise Master List/));
    await waitFor(() => expect(screen.getByDisplayValue('Nationality: All')).toBeTruthy());
  });

  it('Cancellation Report shows a Reason filter, not a Status filter (every row is already cancelled)', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Cancellation Report/));
    await waitFor(() => expect(screen.getByDisplayValue('Reason: All')).toBeTruthy());
    expect(screen.queryByDisplayValue('Status: All')).toBeFalsy();
  });
});

describe('A filter set on one report does not silently keep affecting a different report that never showed a control for it', () => {
  it('setting Sector while on Query Log, then switching to Sector Performance (no Sector control there), leaves Sector Performance unfiltered', async () => {
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Query Log/));
    await waitFor(() => expect(screen.getByDisplayValue('Sector: All')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('Sector: All'), { target: { value: 'Kerala' } });

    fireEvent.click(screen.getByText(/Sector Performance/));
    await waitFor(() => expect(screen.getAllByText('Kerala').length).toBeGreaterThan(0));
    // Goa must still be present -- the stale Sector=Kerala filter must not silently narrow this report, which shows no Sector control to explain why it would
    expect(screen.getAllByText('Goa').length).toBeGreaterThan(0);
  });
});

describe('Row-level filters (Facilitator, Vendor) actually narrow the report’s own output rows', () => {
  it('Facilitator filter narrows Tour Facilitator Report to just that facilitator’s rows', async () => {
    const vendors = [{ id: 'v1', name: 'Prithvi', type: 'Tour Facilitator' }, { id: 'v2', name: 'Anjali', type: 'Tour Facilitator' }];
    const tourExecutions = {
      'UTQ-1': { facilitators: [{ id: 1, vendorId: 'v1', sector: '' }] },
      'UTQ-2': { facilitators: [{ id: 2, vendorId: 'v2', sector: '' }] },
    };
    render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={vendors} tourExecutions={tourExecutions}/>);
    fireEvent.click(screen.getByText(/Tour Facilitator Report/));
    await waitFor(() => expect(screen.getAllByText('Prithvi').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Anjali').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByDisplayValue('Facilitator: All'), { target: { value: 'Prithvi' } });
    const anjaliCells = screen.queryAllByText('Anjali').filter(el => el.tagName !== 'OPTION');
    expect(anjaliCells.length).toBe(0);
  });
});
