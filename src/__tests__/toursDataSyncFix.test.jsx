import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

const convertedQuery = {
  id: 'UTQ-1', tourFileId: 'TF-1', clientName: 'Original Name', groupName: 'Original Name',
  destination: 'Kerala', travelDate: '2026-08-01', paxDisplay: '18 pax', status: 'operations',
  cancelled: false, fileType: 'GIT',
};

describe('Dashboard: "Tour Calendar" widget now reflects live query edits, not a frozen snapshot', () => {
  it('renders the tour using the CURRENT query fields, not a stale copy captured at conversion time', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    // Simulates the tour having been renamed/re-dated AFTER conversion --
    // the old bug would still show whatever the name/dates were at the
    // moment "Convert to Tour File" was first clicked.
    const editedQuery = { ...convertedQuery, clientName: 'Renamed After Edit', travelDate: '2026-09-15' };
    render(<Dashboard queries={[editedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getAllByText(/Renamed After Edit/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-09-15/).length).toBeGreaterThan(0);
  });

  it('"Tours On Ground" stat reflects real operations-status queries, not an always-empty frozen filter', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    render(<Dashboard queries={[convertedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getByText('Tours On Ground')).toBeTruthy();
    // The old bug always showed 0 here, regardless of real data, since
    // nothing ever set a tour's frozen status to "On Ground".
    const statCard = screen.getByText('Tours On Ground').closest('div');
    expect(statCard.parentElement.textContent).not.toContain('0currently running');
  });

  it('shows the FileTypeBadge on the Tour Calendar widget entries too', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    render(<Dashboard queries={[convertedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getAllByText('GIT').length).toBeGreaterThan(0);
  });

  it('does not crash or require a tours prop at all', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    expect(() => render(<Dashboard queries={[]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>)).not.toThrow();
  });
});

describe('SmartSearch: no more dead-end duplicate "tour" results', () => {
  it('does not require a tours prop, and does not throw', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    expect(() => render(<SmartSearch queries={[convertedQuery]} agents={[]} vendors={[]} onSelectQuery={()=>{}} onClose={()=>{}}/>)).not.toThrow();
  });
});

describe('GanttView: does not require a tours prop (it never actually used it)', () => {
  it('renders without a tours prop', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    expect(() => render(<GanttView queries={[convertedQuery]} onOpenQuery={()=>{}} staff={[]} vendors={[]} tourExecutions={{}}/>)).not.toThrow();
  });
});
