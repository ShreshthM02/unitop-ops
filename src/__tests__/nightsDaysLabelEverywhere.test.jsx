import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { nightsDaysLabel, daysFromNights } from '../lib/utils.js';
import KanbanView from '../components/KanbanView.jsx';
import NewQueryModal from '../components/NewQueryModal.jsx';

// Direct instruction: nights and days must always be shown together
// explicitly (e.g. "3N/4D"), never one number alone, everywhere a
// tour's length appears in the app.

describe('nightsDaysLabel: the shared "3N/4D" formatter', () => {
  it('formats nights and its derived day count together', () => {
    expect(nightsDaysLabel(3)).toBe('3N/4D');
    expect(nightsDaysLabel(10)).toBe('10N/11D');
    expect(nightsDaysLabel('5')).toBe('5N/6D');
  });

  it('returns empty string when nights is unset, zero, or invalid -- callers render nothing rather than a broken label', () => {
    expect(nightsDaysLabel(0)).toBe('');
    expect(nightsDaysLabel(null)).toBe('');
    expect(nightsDaysLabel(undefined)).toBe('');
    expect(nightsDaysLabel('')).toBe('');
  });

  it('stays consistent with daysFromNights -- the "D" half of the label always matches what daysFromNights itself computes', () => {
    for (const n of [1, 3, 7, 10, 21]) {
      expect(nightsDaysLabel(n)).toBe(`${n}N/${daysFromNights(n)}D`);
    }
  });
});

describe('Kanban card: shows the explicit "3N/4D" label, not nights alone', () => {
  it('renders the combined label for a query with nights set', () => {
    const query = { id: 'q1', status: 'new_query', nights: 3, groupName: 'Test Group', assignedTo: null };
    render(<KanbanView queries={[query]} onOpenQuery={()=>{}} staff={[]} currentUser={{role:'admin'}}/>);
    expect(screen.getByText('3N/4D')).toBeInTheDocument();
    expect(screen.queryByText('3N')).not.toBeInTheDocument();
  });
});

describe('New Query form: shows the derived day count live as nights is typed', () => {
  it('shows nothing before anything is typed, and the full "3N/4D" label once nights is entered', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]} series={[]} queries={[]}/>);
    expect(screen.queryByText(/N\/\d+D/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. 3'), { target: { value: '3' } });
    expect(screen.getByText('3N/4D')).toBeInTheDocument();
  });
});
