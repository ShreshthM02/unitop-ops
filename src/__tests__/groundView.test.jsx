import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getRunningToursForDate } from '../lib/utils.js';

// Ground View: replaces the old destination-overlap tab. Answers the
// real operational question -- "what's physically happening today, for
// every tour that's running" -- rather than the old scheduling-only
// question of whose date ranges collide. Pulls ONLY from tour_execution
// (Tour Info), matching the existing single-source-of-truth rule
// getMovementChartRows already relies on -- never Cost Sheet's own day
// fields, which are a separate pricing draft.

describe('getRunningToursForDate', () => {
  const vendors = [{ id: 'v1', name: 'Rajesh Kumar' }, { id: 'v2', name: 'Amit Singh' }];

  it('includes a tour whose date range covers the chosen date', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'Smith Family', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [], facilitators: [] } };
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07');
    expect(result).toHaveLength(1);
    expect(result[0].query.id).toBe('q1');
    expect(result[0].dayIndex).toBe(3); // day 3 of the tour (5th, 6th, 7th)
    expect(result[0].totalDays).toBe(6); // nights + 1
  });

  it('excludes a tour whose date range does not cover the chosen date', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'Smith Family', status: 'operations', cancelled: false, travelDate: '2026-09-01', nights: 2 }];
    const te = { q1: { days: [], facilitators: [] } };
    expect(getRunningToursForDate(queries, te, vendors, '2026-09-07')).toHaveLength(0);
  });

  it('excludes a cancelled tour even if its dates cover the chosen date', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: true, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [], facilitators: [] } };
    expect(getRunningToursForDate(queries, te, vendors, '2026-09-07')).toHaveLength(0);
  });

  it('excludes a tour not yet in operations/finance (e.g. still a new query)', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'new_query', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [], facilitators: [] } };
    expect(getRunningToursForDate(queries, te, vendors, '2026-09-07')).toHaveLength(0);
  });

  it('resolves tour facilitator names from vendorId, never showing a raw id', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [], facilitators: [{ id: 1, vendorId: 'v1' }, { id: 2, vendorId: 'v2' }] } };
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07');
    expect(result[0].facilitatorNames).toEqual(['Rajesh Kumar', 'Amit Singh']);
  });

  it('prefers an explicit per-day date match over the positional index', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [
      { id: 1, dayLabel: 'Day 1', date: '2026-09-05', route: 'Delhi', hotelName: 'Hotel A' },
      { id: 2, dayLabel: 'Day 2', date: '2026-09-07', route: 'Agra', hotelName: 'Hotel B', mealPlan: 'MAP' }, // out of order on purpose
    ], facilitators: [] } };
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07');
    expect(result[0].dayInfo.route).toBe('Agra'); // matched by explicit date, not days[2] (which doesn't exist)
    expect(result[0].dayInfo.mealPlan).toBe('MAP');
  });

  it('falls back to positional index when no day has an explicit date set', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [
      { id: 1, dayLabel: 'Day 1', route: 'Delhi' },
      { id: 2, dayLabel: 'Day 2', route: 'Agra', mealPlan: 'MAP' },
      { id: 3, dayLabel: 'Day 3', route: 'Jaipur' },
    ], facilitators: [] } };
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07'); // day index 2 (0-based) = 3rd day
    expect(result[0].dayInfo.route).toBe('Jaipur');
  });

  it('returns dayInfo as null when no itinerary has been entered for that day at all', () => {
    const queries = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];
    const te = { q1: { days: [], facilitators: [] } };
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07');
    expect(result[0].dayInfo).toBeNull();
  });

  it('sorts multiple running tours by tour file id', () => {
    const queries = [
      { id: 'q2', tourFileId: 'TUR-2', groupName: 'B', status: 'operations', cancelled: false, travelDate: '2026-09-01', nights: 10 },
      { id: 'q1', tourFileId: 'TUR-1', groupName: 'A', status: 'operations', cancelled: false, travelDate: '2026-09-01', nights: 10 },
    ];
    const te = {};
    const result = getRunningToursForDate(queries, te, vendors, '2026-09-07');
    expect(result.map(r=>r.query.tourFileId)).toEqual(['TUR-1', 'TUR-2']);
  });

  it('handles a genuinely empty/invalid date without crashing', () => {
    expect(getRunningToursForDate([], {}, [], '')).toEqual([]);
    expect(getRunningToursForDate([], {}, [], null)).toEqual([]);
  });
});

describe('GanttView UI: Ground View tab', () => {
  const staff = [{ id: 's1', name: 'Priya' }];
  const vendors = [{ id: 'v1', name: 'Rajesh Kumar' }];
  const queries = [{ id: 'q1', tourFileId: 'TUR-2026-050', groupName: 'Smith Family', status: 'operations', cancelled: false, travelDate: '2026-09-05', nights: 5 }];

  it('defaults to today\u2019s date and shows running tours immediately, no extra clicks needed', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    // A tour running exactly today, using real relative dates so this
    // test doesn't silently rot as "today" moves forward in real usage.
    const runningToday = [{ id: 'q1', tourFileId: 'TUR-TODAY', groupName: 'Live Group', status: 'operations', cancelled: false, travelDate: todayStr, nights: 3 }];
    const tourExecutions = { q1: { days: [{ id: 1, dayLabel: 'Day 1', route: 'Delhi', hotelName: 'Hotel Test' }], facilitators: [{ id: 1, vendorId: 'v1' }] } };
    render(<GanttView queries={runningToday} onOpenQuery={()=>{}} staff={staff} vendors={vendors} tourExecutions={tourExecutions}/>);
    fireEvent.click(screen.getByText(/Ground View/));
    expect(screen.getByText('Live Group')).toBeTruthy();
    expect(screen.getByText(/TUR-TODAY/)).toBeTruthy();
    expect(screen.getByText('Rajesh Kumar')).toBeTruthy();
    expect(screen.getByText('Delhi')).toBeTruthy();
    expect(screen.getByText('Hotel Test')).toBeTruthy();
  });

  it('a tour with no itinerary entered yet shows a clear message, not a blank/broken card', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const q = [{ id: 'q1', tourFileId: 'TUR-1', groupName: 'X', status: 'operations', cancelled: false, travelDate: todayStr, nights: 2 }];
    render(<GanttView queries={q} onOpenQuery={()=>{}} staff={staff} vendors={vendors} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Ground View/));
    expect(screen.getByText(/No day-wise itinerary entered yet/)).toBeTruthy();
  });

  it('clicking a tour card opens that query via onOpenQuery', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const q = { id: 'q1', tourFileId: 'TUR-1', groupName: 'Click Target', status: 'operations', cancelled: false, travelDate: todayStr, nights: 2 };
    const onOpenQuery = vi.fn();
    render(<GanttView queries={[q]} onOpenQuery={onOpenQuery} staff={staff} vendors={vendors} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Ground View/));
    fireEvent.click(screen.getByText('Click Target'));
    expect(onOpenQuery).toHaveBeenCalledWith(q);
  });

  it('shows a genuine empty state when nothing is running on the chosen date', async () => {
    const { default: GanttView } = await import('../components/GanttView.jsx');
    render(<GanttView queries={[]} onOpenQuery={()=>{}} staff={staff} vendors={vendors} tourExecutions={{}}/>);
    fireEvent.click(screen.getByText(/Ground View/));
    expect(screen.getByText(/No tours running on this date/)).toBeTruthy();
  });
});
