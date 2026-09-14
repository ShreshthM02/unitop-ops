import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TeamView from '../components/TeamView.jsx';

// Real, direct request: team members grouped by role -- Operations
// first, then Sales, then Accounts, then Admin -- with the highest
// workload (queries currently assigned) shown first within each group,
// not a flat alphabetical list.

const staff = [
  { id: 1, name: 'Zara Admin', role: 'admin' },
  { id: 2, name: 'Amit Sales-Low', role: 'sales' },
  { id: 3, name: 'Priya Ops-High', role: 'ops' },
  { id: 4, name: 'Ben Accounts', role: 'accounts' },
  { id: 5, name: 'Deepa Sales-High', role: 'sales' },
  { id: 6, name: 'Omar Ops-Low', role: 'ops' },
];

// Amit (sales): 1 query. Priya (ops): 4 queries. Ben (accounts): 2 queries.
// Deepa (sales): 3 queries. Omar (ops): 1 query. Zara (admin): 0 queries.
const queries = [
  { id: 'q1', assignedTo: 2 },
  { id: 'q2', assignedTo: 3 }, { id: 'q3', assignedTo: 3 }, { id: 'q4', assignedTo: 3 }, { id: 'q5', assignedTo: 3 },
  { id: 'q6', assignedTo: 4 }, { id: 'q7', assignedTo: 4 },
  { id: 'q8', assignedTo: 5 }, { id: 'q9', assignedTo: 5 }, { id: 'q10', assignedTo: 5 },
  { id: 'q11', assignedTo: 6 },
];

describe('TeamView: role-grouped, workload-sorted order -- Ops, Sales, Accounts, Admin, highest workload first within each', () => {
  it('renders names in the exact expected order: Priya (ops,4) > Omar (ops,1) > Deepa (sales,3) > Amit (sales,1) > Ben (accounts,2) > Zara (admin,0)', () => {
    render(<TeamView queries={queries} staff={staff}/>);
    const names = screen.getAllByText(/^(Zara Admin|Amit Sales-Low|Priya Ops-High|Ben Accounts|Deepa Sales-High|Omar Ops-Low)$/).map(el => el.textContent);
    expect(names).toEqual([
      'Priya Ops-High', 'Omar Ops-Low',
      'Deepa Sales-High', 'Amit Sales-Low',
      'Ben Accounts',
      'Zara Admin',
    ]);
  });

  it('is NOT alphabetical -- Amit would come first alphabetically among all names, but should not here', () => {
    render(<TeamView queries={queries} staff={staff}/>);
    const names = screen.getAllByText(/^(Zara Admin|Amit Sales-Low|Priya Ops-High|Ben Accounts|Deepa Sales-High|Omar Ops-Low)$/).map(el => el.textContent);
    expect(names[0]).not.toBe('Amit Sales-Low');
    expect(names[0]).toBe('Priya Ops-High'); // ops role wins group order regardless of workload comparison to other groups
  });

  it('within the same role, higher workload sorts first even though it is alphabetically later', () => {
    render(<TeamView queries={queries} staff={staff}/>);
    const names = screen.getAllByText(/Ops-High|Ops-Low/).map(el => el.textContent);
    expect(names).toEqual(['Priya Ops-High', 'Omar Ops-Low']); // Priya (4) before Omar (1), not alphabetical (Omar < Priya)
  });
});
