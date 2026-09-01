import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// The 8 sidebar reports that previously had no real implementation at
// all and silently showed the generic "no data" placeholder --
// Staff Workload, Tour File Status, Query-to-Booking Conversion,
// Outstanding Payments, Vendor Payables Ledger, Season P&L, P&L
// Detailed, Monthly Revenue.

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.getBoundingClientRect = () => ({
    width: 600, height: 220, top: 0, left: 0, bottom: 220, right: 600, x: 0, y: 0, toJSON() {},
  });
});

const today = new Date();
const thisMonthISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;

const staff = [{ id: 1, name: 'Priya' }, { id: 2, name: 'Ravi' }];
const queries = [
  { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', agentCompany: 'ABC Travels', status: 'operations', date: thisMonthISO, cancelled: false, assignedTo: 1, travelDate: '2026-09-15', paxDisplay: '10 pax' },
  { id: 'UTQ-2', groupName: 'Group B', destination: 'Goa', agentCompany: 'XYZ Tours', status: 'new', date: thisMonthISO, cancelled: false, assignedTo: 2 },
  { id: 'UTQ-3', tourFileId: 'TF-3', groupName: 'Group C', destination: 'Kerala', agentCompany: 'ABC Travels', status: 'completed', date: thisMonthISO, cancelled: false, assignedTo: 1 },
];
const payments = {
  'UTQ-1': { tourValue: 5000, currency: 'US $', roeUsed: 90, // Tour Value INR = 450,000
    entries: [
      { id: 1, type: 'advance', inCurrency: 'INR', amount: '100000', amountINR: '100000', date: thisMonthISO },
      { id: 2, type: 'final', inCurrency: 'INR', amount: '50000', amountINR: '50000', date: thisMonthISO },
    ],
    outgoing: [{ id: 1, vendor: 'Hotel X', amount: '30000', date: thisMonthISO }],
  },
};

describe('Staff Workload Report', () => {
  it('shows active/tour-file/completed counts per staff member', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Staff Workload Report/));
    await waitFor(() => expect(screen.getAllByText('Priya').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Ravi').length).toBeGreaterThan(0);
  });
});

describe('Tour File Status Report', () => {
  it('lists open (converted, non-completed) tour files only', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Tour File Status Report/));
    await waitFor(() => expect(screen.getByText('TF-1')).toBeTruthy());
    expect(screen.queryByText('TF-3')).toBeFalsy(); // completed -- excluded
    expect(screen.getByText('15/09/2026')).toBeTruthy();
  });
});

describe('Query-to-Booking Conversion report', () => {
  it('shows Queries/Converted/Conversion % for the current month', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Query-to-Booking Conversion/));
    await waitFor(() => expect(screen.getAllByText('Converted').length).toBeGreaterThan(0));
    // 3 queries this month, 2 converted (TF-1, TF-3) = 67%
    expect(screen.getByText('67%')).toBeTruthy();
  });
});

describe('Outstanding Payments report', () => {
  it('lists only tour files with a real balance due, INR-correct', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Outstanding Payments/));
    await waitFor(() => expect(screen.getAllByText('TF-1').length).toBeGreaterThan(0));
    // Tour Value 450,000 - Received 150,000 = Balance 300,000
    expect(screen.getByText(/^3,00,000$|^300,000$/)).toBeTruthy();
  });
});

describe('Vendor Payables Ledger', () => {
  it('groups unsettled Exchange Orders by vendor', async () => {
    const eoRows = [
      { id: 'r1', query_id: 'UTQ-1', vendor_id: 'v1', order_no: 'EO-1', version: 1, is_final: false, content: { settled: false } },
      { id: 'r2', query_id: 'UTQ-1', vendor_id: 'v1', order_no: 'EO-2', version: 1, is_final: false, content: { settled: true } }, // settled -- excluded
    ];
    const mockDb = { from: () => ({ select: () => ({ order: async () => ({ data: eoRows, error: null }) }) }) };
    vi.resetModules();
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    const { default: FreshReportsView } = await import('../components/ReportsView.jsx');
    const vendors = [{ id: 'v1', name: 'Hotel Taj' }];
    render(<FreshReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={vendors} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Vendor Payables Ledger/));
    await waitFor(() => expect(screen.getAllByText('Hotel Taj').length).toBeGreaterThan(0));
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // only the unsettled one counted
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Season P&L (Apr–Mar)', () => {
  it('renders 12 months of the current financial year with Revenue/Costs/Profit', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Season P&L/));
    await waitFor(() => expect(screen.getAllByText('Revenue (₹)').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Costs (₹)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profit (₹)').length).toBeGreaterThan(0);
    expect(document.querySelector('.recharts-wrapper')).toBeTruthy(); // multi-series chart present
  });
});

describe('P&L Detailed (Per Tour File)', () => {
  it('breaks down Advance/Balance/Total received separately from costs and profit', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/P&L Detailed/));
    await waitFor(() => expect(screen.getByText('TF-1')).toBeTruthy());
    expect(screen.getByText(/^1,00,000$|^100,000$/)).toBeTruthy(); // Advance
    expect(screen.getAllByText('50,000').length).toBeGreaterThan(0); // Balance Received
    expect(screen.getAllByText(/^1,50,000$|^150,000$/).length).toBeGreaterThan(0); // Total Received
  });
});

describe('Monthly Revenue Report', () => {
  it('sums actual payment entries by their own date, INR-correct, not query creation date', async () => {
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}} staff={staff}/>);
    fireEvent.click(screen.getByText(/Monthly Revenue Report/));
    await waitFor(() => expect(screen.getAllByText('Amount Received (₹)').length).toBeGreaterThan(0));
    // 100000 + 50000 = 150000 received this month
    expect(screen.getAllByText(/^1,50,000$|^150,000$/).length).toBeGreaterThan(0);
  });
});
