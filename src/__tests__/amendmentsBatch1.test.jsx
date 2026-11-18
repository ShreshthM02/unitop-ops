import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, NameWithBadges } from '../lib/helpers.jsx';
import KanbanView from '../components/KanbanView.jsx';
import GanttView from '../components/GanttView.jsx';

describe('Cancelled label', () => {
  it('a cancelled query reads Cancelled, never New Query', () => {
    render(<StatusBadge status="new_query" cancelled={true} />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.queryByText('New Query')).toBeNull();
  });
  it('a live query is unchanged', () => {
    render(<StatusBadge status="new_query" />);
    expect(screen.getByText('New Query')).toBeTruthy();
  });
});

describe('Name + symbols', () => {
  it('the symbols sit outside the part that truncates', () => {
    const { container } = render(<NameWithBadges name="A very long group name" fileType="GIT" seriesId="s1" />);
    const [nameEl, badgeEl] = container.firstChild.children;
    expect(nameEl.style.textOverflow).toBe('ellipsis');
    expect(badgeEl.style.flex).toContain('0 0 auto');
    expect(badgeEl.textContent).toContain('GIT');
  });
});

describe('Kanban order', () => {
  it('newest first within a column', () => {
    const qs = [
      { id: 'QRY-2026-010', date: '2026-10-01', status: 'new_query', groupName: 'Old' },
      { id: 'QRY-2026-012', date: '2026-11-10', status: 'new_query', groupName: 'Newest' },
      { id: 'QRY-2026-011', date: '2026-10-20', status: 'new_query', groupName: 'Mid' },
    ];
    render(<KanbanView queries={qs} onOpenQuery={() => {}} onMove={() => {}} />);
    const txt = document.body.textContent;
    expect(txt.indexOf('Newest')).toBeLessThan(txt.indexOf('Mid'));
    expect(txt.indexOf('Mid')).toBeLessThan(txt.indexOf('Old'));
  });
});

describe('Tour calendar: converted files only', () => {
  const mk = (id, tf) => ({ id, tourFileId: tf, status: 'operations', travelDate: new Date().toISOString().slice(0, 8) + '10', nights: 5, groupName: 'G' + id });
  it('a query without a tour file number is not shown', () => {
    render(<GanttView queries={[mk('q1', 'UT-3500'), mk('q2', '')]} onOpenQuery={() => {}} staff={[]} vendors={[]} tourExecutions={{}} />);
    expect(screen.getAllByText(/Gq1/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Gq2/).length).toBe(0);
  });
});
