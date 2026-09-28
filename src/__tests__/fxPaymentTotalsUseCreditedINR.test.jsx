import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentLedgerPanel from '../components/AgentLedgerPanel.jsx';

// Real, direct report (found first in the Travel Ops fork, then confirmed
// to exist in this app too): five screens summed incoming payment
// entries using the raw, entered .amount -- correct for an INR entry,
// but for a foreign-currency entry that's the FC face value (e.g. "1000"
// for USD 1000), not the actual INR the bank credited. Mixing an INR
// entry's real rupee amount with an FX entry's raw foreign-currency
// number and calling the sum "₹" silently overstates or understates
// every affected total. The fix everywhere is the same: use the shared
// entryINR(e) helper (already used correctly elsewhere in the app),
// which returns e.amount for an INR entry and e.amountINR -- the actual
// credited rupee figure -- for anything else.
//
// One shared fixture throughout: an INR entry of ₹50,000 and a USD
// entry whose face value is 1000 but was actually credited as
// ₹83,000. The old, buggy sum would read ₹51,000 (50000 + the raw
// USD "1000"); the correct sum is ₹133,000 (50000 + 83000).

const INR_ENTRY = { id: 'e1', type: 'advance', inCurrency: 'INR', amount: '50000', amountINR: null, date: '2026-08-01' };
const USD_ENTRY = { id: 'e2', type: 'balance', inCurrency: 'USD', amount: '1000', amountINR: '83000', date: '2026-08-02' };
const CORRECT_TOTAL = 133000;
const BUGGY_TOTAL = 51000;

describe('ReportsView: P&L Summary and Agent-wise Revenue use the credited INR amount, not the FX face value', () => {
  const queries = [{ id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', agentCompany: 'Test Agent', destination: 'Kerala', cancelled: false }];
  const payments = { 'UTQ-1': { tourValue: '200000', roeUsed: '1', entries: [INR_ENTRY, USD_ENTRY], outgoing: [] } };

  it('P&L Summary: Received (₹) reflects the credited INR total, not the buggy FX-mixed sum', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/P&L Summary/));
    await waitFor(() => expect(screen.getByText(CORRECT_TOTAL.toLocaleString())).toBeTruthy());
    expect(screen.queryByText(BUGGY_TOTAL.toLocaleString())).toBeNull();
  });

  it('Agent-wise Revenue: Received (₹) reflects the credited INR total, not the buggy FX-mixed sum', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    render(<ReportsView queries={queries} payments={payments} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Agent-wise Revenue/));
    await waitFor(() => expect(screen.getByText(CORRECT_TOTAL.toLocaleString())).toBeTruthy());
    expect(screen.queryByText(BUGGY_TOTAL.toLocaleString())).toBeNull();
  });
});

describe('AgentLedgerPanel: Total Received and per-tour-file Received use the credited INR amount', () => {
  it('shows the correct credited-INR total, not the buggy FX-mixed sum', () => {
    const agent = { id: 'a1', company: 'Test Agent', country: 'USA', contactName: 'John' };
    const queries = [{ id: 'UTQ-1', tourFileId: 'TF-1', agentId: 'a1', groupName: 'Test Group', destination: 'Kerala', travelDate: '2026-08-01', status: 'operations' }];
    const payments = { 'UTQ-1': { tourValue: '200000', roeUsed: '1', entries: [INR_ENTRY, USD_ENTRY], outgoing: [] } };
    render(<AgentLedgerPanel agent={agent} queries={queries} payments={payments} onClose={()=>{}}/>);
    expect(screen.getAllByText('₹ ' + CORRECT_TOTAL.toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.queryByText('₹ ' + BUGGY_TOTAL.toLocaleString())).toBeNull();
  });
});

describe('AgentMaster: the "Financial Ledger" tab uses the credited INR amount, not the FX face value', () => {
  it('shows the correct credited-INR total, not the buggy FX-mixed sum', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    const agent = { id: 'a1', company: 'Test Agent', country: 'USA', contacts: [] };
    const queries = [{ id: 'UTQ-1', tourFileId: 'TF-1', agentId: 'a1', agentCompany: 'Test Agent', groupName: 'Test Group', destination: 'Kerala', travelDate: '2026-08-01', status: 'operations' }];
    const payments = { 'UTQ-1': { tourValue: '200000', roeUsed: '1', entries: [INR_ENTRY, USD_ENTRY], outgoing: [] } };
    render(<AgentMaster agents={[agent]} setAgents={()=>{}} queries={queries} payments={payments} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}} initialSelectedId="a1"/>);
    fireEvent.click(screen.getByText('Financial Ledger'));
    expect(screen.getAllByText('₹ ' + CORRECT_TOTAL.toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.queryByText('₹ ' + BUGGY_TOTAL.toLocaleString())).toBeNull();
  });
});

describe('UnitopApp: the main "Payments" view uses the credited INR amount, not the FX face value', () => {
  function makeDb(tables) {
    return {
      from: (table) => {
        const builder = {
          select: () => builder, eq: () => builder, is: () => builder, order: () => builder,
          then: (res) => res({ data: tables[table] || [], error: null }),
        };
        return builder;
      },
    };
  }

  it('the "In: ₹" figure on a payments card reflects the credited INR total, not the buggy FX-mixed sum', async () => {
    const tables = {
      queries: [{ id: 'UTQ-1', tour_file_id: 'TF-1', group_name: 'Test Group', status: 'operations', cancelled: false }],
      query_audit: [], query_remarks: [], agents: [], staff_public: [], series: [],
      payments: [{ query_id: 'UTQ-1', tour_value: '200000', currency: 'INR', roe_used: '1', tour_value_inr: '200000' }],
      payment_incoming: [
        { id: 1, query_id: 'UTQ-1', type: 'advance', in_currency: 'INR', amount: '50000', amount_inr: null, date: '2026-08-01' },
        { id: 2, query_id: 'UTQ-1', type: 'balance', in_currency: 'USD', amount: '1000', amount_inr: '83000', date: '2026-08-02' },
      ],
      payment_outgoing: [], app_settings: [], signatures: [],
    };
    vi.doMock('../lib/supabase.js', () => ({ db: makeDb(tables), realtimeClient: null }));
    vi.resetModules();
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    render(<UnitopApp authUser={{ id: 'staff-1', name: 'Priya', role: 'admin' }} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Payments')).toBeTruthy());
    fireEvent.click(screen.getByText('Payments'));
    await waitFor(() => expect(screen.getByText(`In: ₹ ${CORRECT_TOTAL.toLocaleString()}`)).toBeTruthy());
    expect(screen.queryByText(`In: ₹ ${BUGGY_TOTAL.toLocaleString()}`)).toBeNull();
    vi.doUnmock('../lib/supabase.js');
  });
});
