import { describe, it, expect } from 'vitest';
import { formatSidebarClock } from '../lib/utils.js';

// Direct request (2026-09-29): a real-time clock under the sidebar's
// version number -- day, dd/mm/yyyy date, 24-hour hh:mm:ss time. The
// formatting itself is a pure function (formatSidebarClock), kept
// separate from the setInterval tick in UnitopApp so it's testable
// without faking a live clock inside a rendered component.

describe('formatSidebarClock', () => {
  it('formats a known date/time as "Weekday, dd/mm/yyyy · hh:mm:ss"', () => {
    // 2026-09-29 13:31:05 is a Tuesday.
    const d = new Date(2026, 8, 29, 13, 31, 5);
    expect(formatSidebarClock(d)).toBe('Tuesday, 29/09/2026 · 13:31:05');
  });

  it('zero-pads single-digit day, month, hour, minute and second', () => {
    // 2026-01-05 09:05:03 is a Monday.
    const d = new Date(2026, 0, 5, 9, 5, 3);
    expect(formatSidebarClock(d)).toBe('Monday, 05/01/2026 · 09:05:03');
  });

  it('uses real 24-hour time, never a 12-hour am/pm format', () => {
    const d = new Date(2026, 5, 15, 23, 59, 0); // 11:59 PM
    expect(formatSidebarClock(d)).toContain('23:59:00');
    expect(formatSidebarClock(d)).not.toMatch(/am|pm/i);
  });

  it('midnight renders as 00, not 24 or 12', () => {
    const d = new Date(2026, 5, 15, 0, 0, 0);
    expect(formatSidebarClock(d)).toContain('00:00:00');
  });

  it('accepts a raw timestamp/date-parseable value, not only a Date instance', () => {
    const d = new Date(2026, 2, 1, 8, 0, 0);
    expect(formatSidebarClock(d.getTime())).toBe(formatSidebarClock(d));
  });
});
