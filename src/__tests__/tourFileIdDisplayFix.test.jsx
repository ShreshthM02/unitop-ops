import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../components/Dashboard.jsx';
import KanbanView from '../components/KanbanView.jsx';
import GanttView from '../components/GanttView.jsx';

describe('Once converted to a tour file, every view shows the tour file number, not the internal query id', () => {
  const convertedQuery = { id: 'UTQ-2026-999', tourFileId: 'TUR-2025-042', groupName: 'Converted Query Test', status: 'operations', destination: 'Kerala', manualWF: [], audit: [], remarks: [], cancelled: false, travelDate: new Date().toISOString().split('T')[0], nights: 3 };
  const unconvertedQuery = { id: 'UTQ-2026-998', groupName: 'Unconverted Query Test', status: 'new_query', destination: 'Goa', manualWF: [], audit: [], remarks: [] };

  it('Dashboard shows the tour file number once converted, not the query id', () => {
    render(<Dashboard queries={[convertedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.queryByText(/UTQ-2026-999/)).toBeNull();
    expect(screen.getByText(/TUR-2025-042/)).toBeTruthy();
  });

  it('Dashboard still shows the query id for a query not yet converted (nothing else to show)', () => {
    render(<Dashboard queries={[unconvertedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getByText(/UTQ-2026-998/)).toBeTruthy();
  });

  it('KanbanView shows the tour file number once converted, not the query id', () => {
    render(<KanbanView queries={[convertedQuery]} onOpenQuery={()=>{}} onAdvance={()=>{}} staff={[]}/>);
    expect(screen.queryByText(/UTQ-2026-999/)).toBeNull();
    expect(screen.getByText(/TUR-2025-042/)).toBeTruthy();
  });

  it('GanttView (calendar/timeline) shows the tour file number once converted, not the query id', () => {
    render(<GanttView queries={[convertedQuery]} tours={[]} onOpenQuery={()=>{}} staff={[]} vendors={[]} tourExecutions={{}}/>);
    expect(screen.queryByText(/UTQ-2026-999/)).toBeNull();
    expect(screen.getByText(/TUR-2025-042/)).toBeTruthy();
  });
});
