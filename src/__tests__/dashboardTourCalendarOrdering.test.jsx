import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Items 1 & 2 of the 2026-09-28 amendments list, both in Dashboard's Tour
// Calendar widget.
//
// Item 1: "New This Week" showed "awaiting acknowledgement" as its
// subtitle, but the underlying count (and its drill-through, in
// UnitopApp's handleStatClick) is every query received in the last 7
// days regardless of current status -- including ones already moved on
// to Operations/Finance. The subtitle now says what the number actually
// is.
//
// Item 2: Tour Calendar's statusLabel used to key off raw pipeline
// status ("operations" -> "On Ground") with no date check at all, so
// every query sitting in Operations showed as "on ground" even when its
// real travel dates were a different month entirely. It now shares the
// same isTourOnGround predicate as the stat cards, and the list is
// ordered On Ground first, then Upcoming (soonest first), then
// Completed (most recently traveled first).

function daysFromToday(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0,10);
}

describe('Dashboard "New This Week" subtitle', () => {
  it('no longer claims every recent query is awaiting acknowledgement', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    const recentButInOps = { id: 'UTQ-1', status: 'operations', cancelled: false, date: new Date().toISOString().slice(0,10), groupName: 'Already In Ops' };
    render(<Dashboard queries={[recentButInOps]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.queryByText(/awaiting acknowledgement/i)).toBeNull();
    expect(screen.getByText(/received in the last 7 days/i)).toBeTruthy();
  });
});

describe('Dashboard Tour Calendar: status label uses real dates, and ordering follows On Ground -> Upcoming -> Completed', () => {
  it('a query in Operations status but with next-month dates is labelled Upcoming, not On Ground', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    const nextMonthInOps = { id: 'UTQ-2', tourFileId: 'TF-2', status: 'operations', cancelled: false, travelDate: daysFromToday(35), nights: 5, groupName: 'Next Month' };
    render(<Dashboard queries={[nextMonthInOps]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.queryByText('On Ground')).toBeNull();
  });

  it('orders On Ground first, then Upcoming chronologically, then Completed latest-first', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    const queries = [
      { id: 'A', tourFileId: 'TF-A', status: 'completed', cancelled: false, travelDate: daysFromToday(-60), nights: 3, groupName: 'Old Completed' },
      { id: 'B', tourFileId: 'TF-B', status: 'operations', cancelled: false, travelDate: daysFromToday(20), nights: 3, groupName: 'Far Upcoming' },
      { id: 'C', tourFileId: 'TF-C', status: 'operations', cancelled: false, travelDate: daysFromToday(-1), nights: 5, groupName: 'Actually On Ground' },
      { id: 'D', tourFileId: 'TF-D', status: 'completed', cancelled: false, travelDate: daysFromToday(-10), nights: 3, groupName: 'Recent Completed' },
      { id: 'E', tourFileId: 'TF-E', status: 'new_query', cancelled: false, travelDate: daysFromToday(5), nights: 3, groupName: 'Near Upcoming' },
    ];
    render(<Dashboard queries={queries} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    const names = screen.getAllByText(/—/).map(el => el.textContent);
    // On Ground (C) first, then Upcoming chronological (E before B), then
    // Completed latest-first (D before A).
    const order = names.map(n => queries.find(q => n.startsWith(q.groupName))?.id).filter(Boolean);
    expect(order).toEqual(['C', 'E', 'B', 'D', 'A']);
  });

  it('clicking a Tour Calendar row opens its drawer via onOpenQuery, same as Recent Queries -- real reported bug: rows had no click handler at all', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    const onOpenQuery = vi.fn();
    const query = { id: 'UTQ-9', tourFileId: 'TF-9', status: 'operations', cancelled: false, travelDate: daysFromToday(-1), nights: 5, groupName: 'Click Me' };
    render(<Dashboard queries={[query]} onOpenQuery={onOpenQuery} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    // The same query can legitimately appear in both the Recent Queries
    // and Tour Calendar widgets -- click the row that also shows the
    // Tour Calendar's own "On Ground" status badge, not just the first match.
    const row = screen.getByText('On Ground').closest('div[style*="cursor: pointer"]');
    fireEvent.click(row);
    expect(onOpenQuery).toHaveBeenCalledWith(expect.objectContaining({ id: 'UTQ-9' }));
  });
});
