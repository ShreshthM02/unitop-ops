import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const queryWithPax = {
  id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', destination: 'Kerala',
  travelDate: '2026-08-01', nights: 5, paxDisplay: '18 pax', status: 'operations', cancelled: false,
};

describe('The q.pax bug: paxDisplay now actually shows up everywhere it is supposed to', () => {
  it('Kanban card shows the real pax count, not blank, and not doubled up as "pax pax"', async () => {
    const { default: KanbanView } = await import('../components/KanbanView.jsx');
    render(<KanbanView queries={[queryWithPax]} onOpenQuery={()=>{}} onAdvance={()=>{}} staff={[]}/>);
    expect(screen.getByText('18 pax')).toBeTruthy();
    expect(screen.queryByText(/pax pax/)).not.toBeInTheDocument();
  });

  it('All Queries table shows the real pax count in its cell', async () => {
    const { default: AllQueriesView } = await import('../components/AllQueriesView.jsx');
    render(<AllQueriesView queries={[queryWithPax]} agents={[]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} staff={[]}/>);
    expect(screen.getByText('18 pax')).toBeTruthy();
  });

  it('Active Pipeline report shows the real pax value, not the never-existent q.pax', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    const { fireEvent } = await import('@testing-library/react');
    render(<ReportsView queries={[queryWithPax]} payments={{}} currentUser={{id:1,role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Active Pipeline/));
    expect(screen.getByText('18 pax')).toBeTruthy();
  });

  it('ExchangeOrderGenerator seeds its own pax field from paxDisplay, not the never-existent query.pax', async () => {
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<ExchangeOrderGenerator query={queryWithPax} onClose={()=>{}}/>);
    expect(await screen.findByDisplayValue('18 pax')).toBeTruthy();
  });

  it('InvoiceGenerator seeds its own pax field from paxDisplay, not the never-existent query.pax', async () => {
    const { default: InvoiceGenerator } = await import('../components/InvoiceGenerator.jsx');
    render(<InvoiceGenerator query={queryWithPax} payments={{}} agents={[]} onClose={()=>{}}/>);
    expect(await screen.findByDisplayValue('18 pax')).toBeTruthy();
  });

  // Two more instances of the exact same bug, found on a direct report
  // that Dashboard's own Tour Calendar widget was ALSO showing
  // "18 pax pax" -- neither was caught in the original sweep above.

  it('Dashboard "Tour Calendar" widget shows the real pax count, not doubled up as "pax pax"', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    render(<Dashboard queries={[{ ...queryWithPax, status: 'new_query' }]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getByText(/18 pax/)).toBeTruthy();
    expect(screen.queryByText(/pax pax/)).not.toBeInTheDocument();
  });

  it('Exchange Order Generator\'s own saved-order Repository list shows the real pax count, not doubled up as "pax pax"', async () => {
    const fakeVendors = [{ id: 'VND-001', name: 'Test Vendor', type: 'Restaurant', active: true }];
    const versionRows = [
      { id:'row-1', order_no: 'EO-2026-060', query_id: queryWithPax.id, vendor_id: 'VND-001', version: 1, is_final: false,
        content: { serviceType:'restaurant', drawnOn:'Nanking Restaurant', confirmed:false, settled:false, issueDate:'2026-08-01', pax:'18 pax' } },
    ];
    const db = {
      from: vi.fn(() => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: versionRows, error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: EOG } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<EOG query={queryWithPax} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click(await screen.findByText(/Repository/));
    expect(await screen.findByText(/18 pax/)).toBeTruthy();
    expect(screen.queryByText(/pax pax/)).not.toBeInTheDocument();
    vi.doUnmock('../lib/supabase.js');
  });
});
