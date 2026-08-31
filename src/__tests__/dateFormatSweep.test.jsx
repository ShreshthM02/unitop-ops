import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatDateSlash } from '../lib/utils.js';
import KanbanView from '../components/KanbanView.jsx';

describe('formatDateSlash', () => {
  it('renders an ISO date as dd/mm/yyyy', () => {
    expect(formatDateSlash('2026-08-15')).toBe('15/08/2026');
  });
  it('leaves a non-ISO placeholder (TBC, a month name) unchanged', () => {
    expect(formatDateSlash('TBC')).toBe('TBC');
    expect(formatDateSlash('December 2026')).toBe('December 2026');
  });
  it('handles empty/null/undefined without throwing', () => {
    expect(formatDateSlash('')).toBe('');
    expect(formatDateSlash(null)).toBe('');
    expect(formatDateSlash(undefined)).toBe('');
  });
});

describe('Kanban card shows the travel date as dd/mm/yyyy, not the raw ISO string', () => {
  it('shows 01/09/2026, not 2026-09-01', () => {
    const queries = [{ id: 'UTQ-1', groupName: 'Group A', destination: 'Kerala', status: 'operations', travelDate: '2026-09-01', cancelled: false }];
    render(<KanbanView queries={queries} onOpenQuery={()=>{}} onConvert={()=>{}} staff={[]}/>);
    expect(screen.getByText('01/09/2026')).toBeTruthy();
    expect(screen.queryByText('2026-09-01')).toBeFalsy();
  });
});
