import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

describe('CostSheet Phase 2: day count and starting slab derive from the query (Document Chain plan, docs/DATA_OWNERSHIP.md)', () => {
  it('a query with 10 nights gets exactly 10 day rows, matching this app\'s own observed convention (nights count = day-row count, not the generic nights+1)', () => {
    const query = { id: 'UTQ-2026-1300', groupName: 'Auto-init 10N Test', nights: 10, pax: '15–20' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('Day 10')).toBeTruthy();
    expect(screen.queryByDisplayValue('Day 11')).toBeNull();
  });

  it('a query with 5 nights gets exactly 5 day rows', () => {
    const query = { id: 'UTQ-2026-1301', groupName: 'Auto-init 5N Test', nights: 5 };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('Day 5')).toBeTruthy();
    expect(screen.queryByDisplayValue('Day 6')).toBeNull();
  });

  it('falls back to the old 4-row default when nights is not set (nothing to derive from)', () => {
    const query = { id: 'UTQ-2026-1302', groupName: 'No Nights Test' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('Day 4')).toBeTruthy();
    expect(screen.queryByDisplayValue('Day 5')).toBeNull();
  });

  it('a query with a confirmed single pax number gets one starting slab centered on that real number, not five generic range guesses', () => {
    const query = { id: 'UTQ-2026-1303', groupName: 'Confirmed Pax Test', pax: 17 };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('17 pax + 1 FOC')).toBeTruthy();
    expect(screen.queryByDisplayValue('15-19 pax + 1 FOC')).toBeNull();
  });

  it('falls back to the old 5-range slab defaults when pax is still a TBC range (a single guess could easily be wrong)', () => {
    const query = { id: 'UTQ-2026-1304', groupName: 'TBC Pax Test', pax: '15–20' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('15-19 pax + 1 FOC')).toBeTruthy();
    expect(screen.getByDisplayValue('35-39 pax + 2 FOC')).toBeTruthy();
  });

  it('falls back to the old 5-range slab defaults when pax is not set at all', () => {
    const query = { id: 'UTQ-2026-1305', groupName: 'No Pax Test' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('20-24 pax + 1 FOC')).toBeTruthy();
  });

  it('a small confirmed pax count (under 20) defaults to Mini Bus; a larger one defaults to Large Coach', () => {
    const smallQuery = { id: 'UTQ-2026-1306', groupName: 'Small Group', pax: 8 };
    const { unmount } = render(<CostSheet query={smallQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('8 pax + 1 FOC')).toBeTruthy();
    unmount();

    const largeQuery = { id: 'UTQ-2026-1307', groupName: 'Large Group', pax: 45 };
    render(<CostSheet query={largeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('45 pax + 1 FOC')).toBeTruthy();
  });
});

describe('CostSheet Phase 2: per-day dates auto-fill from a confirmed travel date', () => {
  it('computes each day\'s date as travelDate + its offset, kept as raw ISO (YYYY-MM-DD) since the field is a native input type="date"', () => {
    const query = { id: 'UTQ-2026-1500', groupName: 'Confirmed Date Test', nights: 3, travelDate: '2026-07-24' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('2026-07-24')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-07-25')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-07-26')).toBeTruthy();
  });

  it('leaves dates blank when travelDate is still TBC (a month/season string, not a confirmed date)', () => {
    const query = { id: 'UTQ-2026-1501', groupName: 'TBC Date Test', nights: 2, travelDate: 'August 2026' };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.getByDisplayValue('Day 1')).toBeTruthy();
    // No day should have an ISO date filled in
    expect(screen.queryByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)).toBeNull();
  });

  it('leaves dates blank when travelDate is not set at all', () => {
    const query = { id: 'UTQ-2026-1502', groupName: 'No Date Test', nights: 2 };
    render(<CostSheet query={query} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:'x'}}/>);
    expect(screen.queryByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)).toBeNull();
  });
});
