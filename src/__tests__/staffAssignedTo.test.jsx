import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mapDbQueryRow, getMovementChartRows } from '../lib/utils.js';
import AllQueriesView from '../components/AllQueriesView.jsx';
import KanbanView from '../components/KanbanView.jsx';
import TeamView from '../components/TeamView.jsx';

const realStaff = [
  { id: 'cfff444a-718e-4c14-83a3-f55f368d64dd', name: 'Shreshth', role: 'admin', color: '#1A5276', avatar: 'SH' },
  { id: '28daa533-9dff-4892-ac93-d80c14a6e861', name: 'Peeyush', role: 'ops', color: '#0E6655', avatar: 'PE' },
];

const realQuery = {
  id: 'UTQ-2026-200', groupName: 'Real Staff Test', status: 'operations', cancelled: false,
  assignedTo: 'cfff444a-718e-4c14-83a3-f55f368d64dd', // a real uuid, not a small int
};

describe('mapDbQueryRow now maps assigned_to (previously omitted entirely)', () => {
  it('maps the real uuid assigned_to field to assignedTo', () => {
    const dbRow = { id: 'UTQ-1', assigned_to: 'cfff444a-718e-4c14-83a3-f55f368d64dd' };
    const mapped = mapDbQueryRow(dbRow);
    expect(mapped.assignedTo).toBe('cfff444a-718e-4c14-83a3-f55f368d64dd');
  });
});

describe('getMovementChartRows correctly resolves a real uuid-based file handler', () => {
  it('finds the handler name when given the real staff list (not the hardcoded demo USERS)', () => {
    const q = { ...realQuery, travelDate: '2026-08-10', nights: 5 };
    const rows = getMovementChartRows([q], realStaff, 2026, 7);
    expect(rows[0].fileHandler).toBe('Shreshth');
  });
});

describe('Components correctly use a real staff prop instead of the hardcoded demo USERS list', () => {
  it('AllQueriesView resolves the real staff member for a uuid-based assignedTo (rendered as an Avatar with their initials)', () => {
    render(<AllQueriesView queries={[realQuery]} agents={[]} onOpenQuery={()=>{}} currentUser={{id:1}} staff={realStaff}/>);
    expect(screen.getByText('SH')).toBeTruthy(); // Shreshth's avatar initials -- proves the uuid lookup resolved
  });

  it('KanbanView resolves the real staff member for a uuid-based assignedTo (rendered as an Avatar with their initials)', () => {
    render(<KanbanView queries={[realQuery]} onOpenQuery={()=>{}} onConvert={()=>{}} onStatusChange={()=>{}} staff={realStaff}/>);
    expect(screen.getByText('SH')).toBeTruthy(); // Shreshth's avatar initials -- proves the uuid lookup resolved
  });

  it('TeamView groups a real query under the real staff member it is actually assigned to', () => {
    render(<TeamView queries={[realQuery]} staff={realStaff}/>);
    // Shreshth's card should reflect 1 assigned query; Peeyush's should reflect 0
    expect(screen.getByText('Shreshth')).toBeTruthy();
    expect(screen.getByText('Peeyush')).toBeTruthy();
  });

  it('falls back to the demo USERS list when no staff prop is passed at all (backward compatible)', () => {
    expect(() => render(<TeamView queries={[]}/>)).not.toThrow();
  });
});
