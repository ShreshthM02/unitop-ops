import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isTourOnGround } from '../lib/utils.js';

// Real, direct report: a tour file dated for a different month (the
// example given was November) was showing up in "Tours On Ground"
// today, and also in the wrong month's Tour Calendar. Root cause: the
// stat only ever checked status === "operations", never whether the
// tour's actual travel dates included today at all. Found duplicated a
// SECOND time in UnitopApp's own drill-through view for this same
// stat, with an even wider (and also date-blind) status scope. Both
// now share one function, isTourOnGround, which requires today to
// genuinely fall within [travelDate, travelDate + nights].

function daysFromToday(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0,10);
}

describe('isTourOnGround: requires real dates, not just pipeline status', () => {
  it('a tour dated for next month is NOT on ground today, even in Operations status', () => {
    const nextMonthTour = { status: 'operations', cancelled: false, travelDate: daysFromToday(35), nights: 5 };
    expect(isTourOnGround(nextMonthTour)).toBe(false);
  });

  it('a tour dated for a month ago is NOT on ground today', () => {
    const lastMonthTour = { status: 'operations', cancelled: false, travelDate: daysFromToday(-35), nights: 5 };
    expect(isTourOnGround(lastMonthTour)).toBe(false);
  });

  it('a tour whose date range genuinely includes today IS on ground', () => {
    const currentTour = { status: 'operations', cancelled: false, travelDate: daysFromToday(-2), nights: 5 };
    expect(isTourOnGround(currentTour)).toBe(true);
  });

  it('a tour on its exact departure day (start + nights) still counts as on ground', () => {
    const lastDayTour = { status: 'operations', cancelled: false, travelDate: daysFromToday(-5), nights: 5 };
    expect(isTourOnGround(lastDayTour)).toBe(true);
  });

  it('a tour with no travelDate at all (still TBC) is never on ground, even in Operations status', () => {
    const tbcTour = { status: 'operations', cancelled: false, nights: 5 };
    expect(isTourOnGround(tbcTour)).toBe(false);
  });

  it('a cancelled tour is never on ground, regardless of its dates', () => {
    const cancelledTour = { status: 'operations', cancelled: true, travelDate: daysFromToday(0), nights: 5 };
    expect(isTourOnGround(cancelledTour)).toBe(false);
  });

  it('a tour in Finance status with current dates still counts (both stages were already included, now with a real date check)', () => {
    const financeTour = { status: 'finance', cancelled: false, travelDate: daysFromToday(-1), nights: 3 };
    expect(isTourOnGround(financeTour)).toBe(true);
  });
});

describe('Dashboard "Tours On Ground" stat: the exact reported scenario', () => {
  it('a tour dated for next month does not inflate the on-ground count, even in Operations status', async () => {
    const { default: Dashboard } = await import('../components/Dashboard.jsx');
    const nextMonthTour = { id: 'UTQ-2026-500', tourFileId: 'TF-500', status: 'operations', cancelled: false, travelDate: daysFromToday(35), nights: 5, groupName: 'Next Month Tour' };
    render(<Dashboard queries={[nextMonthTour]} onOpenQuery={()=>{}} currentUser={{id:1,role:'admin'}} onStatClick={()=>{}}/>);
    const statCard = screen.getByText('Tours On Ground').closest('div');
    expect(statCard.parentElement.textContent).toContain('0currently running');
  });
});
