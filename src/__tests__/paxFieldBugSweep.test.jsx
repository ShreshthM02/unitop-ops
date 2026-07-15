import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

const queryWithPax = {
  id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', destination: 'Kerala',
  travelDate: '2026-08-01', nights: 5, paxDisplay: '18 pax (confirmed)', status: 'operations', cancelled: false,
};

describe('The q.pax bug: paxDisplay now actually shows up everywhere it is supposed to', () => {
  it('Kanban card shows the real pax count, not blank', async () => {
    const { default: KanbanView } = await import('../components/KanbanView.jsx');
    render(<KanbanView queries={[queryWithPax]} onOpenQuery={()=>{}} onAdvance={()=>{}} staff={[]}/>);
    expect(screen.getByText(/18 pax \(confirmed\) pax/)).toBeTruthy();
  });

  it('All Queries table shows the real pax count in its cell', async () => {
    const { default: AllQueriesView } = await import('../components/AllQueriesView.jsx');
    render(<AllQueriesView queries={[queryWithPax]} agents={[]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} staff={[]}/>);
    expect(screen.getByText('18 pax (confirmed)')).toBeTruthy();
  });

  it('Active Pipeline report shows the real pax value, not the never-existent q.pax', async () => {
    const { default: ReportsView } = await import('../components/ReportsView.jsx');
    const { fireEvent } = await import('@testing-library/react');
    render(<ReportsView queries={[queryWithPax]} payments={{}} currentUser={{id:1,role:'admin'}} vendors={[]} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Active Pipeline/));
    expect(screen.getByText('18 pax (confirmed)')).toBeTruthy();
  });

  it('ExchangeOrderGenerator seeds its own pax field from paxDisplay, not the never-existent query.pax', async () => {
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<ExchangeOrderGenerator query={queryWithPax} onClose={()=>{}}/>);
    const paxInput = document.querySelector('input[placeholder="e.g. 16 + 01"]');
    expect(paxInput.value).toBe('18 pax (confirmed)');
  });

  it('ProformaInvoice seeds its own pax field from paxDisplay, not the never-existent query.pax', async () => {
    const { default: ProformaInvoice } = await import('../components/ProformaInvoice.jsx');
    render(<ProformaInvoice query={queryWithPax} onClose={()=>{}}/>);
    expect(screen.getAllByDisplayValue('18 pax (confirmed)').length).toBeGreaterThan(0);
  });
});
