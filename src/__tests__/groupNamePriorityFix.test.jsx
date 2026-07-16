import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// This is the exact real-world scenario found via live Supabase data
// (UTQ-2026-037): group_name was updated to "UTT Golden Triangle" via
// editing, and correctly saved -- but client_name still held an old,
// unrelated value ("Golden Triangle Tour") that was never editable
// through any UI in the app. Views checking clientName first showed the
// stale value forever, regardless of how many times groupName was
// updated -- looking exactly like "changes aren't persisting," when the
// save was actually working correctly the whole time.
const mismatchedQuery = {
  id: 'UTQ-2026-037', tourFileId: 'TF-037', groupName: 'UTT Golden Triangle', clientName: 'Golden Triangle Tour',
  destination: 'Golden Triangle', travelDate: '2026-08-01', paxDisplay: '20 pax', status: 'operations', cancelled: false,
};

describe('groupName vs clientName priority: groupName (the only actually-editable field) must always win', () => {
  it('Dashboard "Tour Calendar" widget shows the updated groupName, not the stale clientName', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    render(<Dashboard queries={[mismatchedQuery]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getAllByText(/UTT Golden Triangle/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Golden Triangle Tour')).toBeNull();
  });

  it('GanttView Gantt bar label shows the updated groupName, not the stale clientName', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    render(<GanttView queries={[mismatchedQuery]} onOpenQuery={()=>{}} staff={[]} vendors={[]} tourExecutions={{}}/>);
    expect(screen.getAllByText(/UTT Golden Triangle/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Golden Triangle Tour')).toBeNull();
  });

  it('the drawer\'s own header shows the updated groupName, not the stale clientName', async () => {
    const { default: QueryDrawerWithQuote } = await import('../components/QueryDrawerWithQuote.jsx');
    const props = {
      query: { ...mismatchedQuery, manualWF: [], audit: [], remarks: [] },
      onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{}, onToggleWF:()=>{},
      onCancel:()=>{}, onUpdateRemarks:()=>{}, onUpdateQuery:()=>{}, currentUser:{id:1,name:'Priya',role:'admin'}, staff:[],
    };
    render(<QueryDrawerWithQuote {...props}/>);
    expect(screen.getAllByText(/UTT Golden Triangle/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Golden Triangle Tour')).toBeNull();
  });

  it('Kanban and All Queries continue to show groupName correctly (no regression from before)', async () => {
    const { default: KanbanView } = await import('../components/KanbanView.jsx');
    const { default: AllQueriesView } = await import('../components/AllQueriesView.jsx');
    const { unmount } = render(<KanbanView queries={[mismatchedQuery]} onOpenQuery={()=>{}} onAdvance={()=>{}} staff={[]}/>);
    expect(screen.getAllByText(/UTT Golden Triangle/).length).toBeGreaterThan(0);
    unmount();
    render(<AllQueriesView queries={[mismatchedQuery]} agents={[]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} staff={[]}/>);
    expect(screen.getAllByText(/UTT Golden Triangle/).length).toBeGreaterThan(0);
  });
});
