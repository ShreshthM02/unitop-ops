import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1900', groupName: 'Status Test', nights: 3, tourFileId: 'TF-1900' };
function makeDb() {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({
          data: t === 'cost_sheets' ? [{ id: 'cs', version: 1, is_final: true, days: [{ day: 'Day 1', date: '2026-08-01', movement: 'X', hotel: 'Hotel Heritage', mealPlan: '' }], transports: [] }] : [],
          error: null,
        }),
      };
      return builder;
    }),
  };
}
async function open() {
  vi.resetModules();
  vi.doMock('../lib/supabase.js', () => ({ db: makeDb(), realtimeClient: null }));
  const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
  render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={() => {}} currentUser={{ id: 'x' }} />);
  await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet/)).toBeTruthy());
  fireEvent.click(screen.getByText('Hotels'));
}

describe('Tour Briefing Sheet: hotel status', () => {
  it('offers Available alongside the existing statuses, plus a write-your-own option', async () => {
    await open();
    const sel = screen.getByLabelText('Hotel status');
    const opts = [...sel.querySelectorAll('option')].map(o => o.textContent);
    expect(opts).toEqual(expect.arrayContaining(['Requested', 'Available', 'Confirmed', 'Waitlisted', 'Sold Out', 'Cancelled']));
    expect(opts.some(o => /Other/.test(o))).toBe(true);
  });
  it('Available can be selected', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Hotel status'), { target: { value: 'Available' } });
    expect(screen.getByLabelText('Hotel status').value).toBe('Available');
  });
  it('choosing Other shows a text box and the typed status is kept', async () => {
    await open();
    expect(screen.queryByLabelText('Custom hotel status')).toBeNull();
    fireEvent.change(screen.getByLabelText('Hotel status'), { target: { value: '__other__' } });
    fireEvent.change(screen.getByLabelText('Custom hotel status'), { target: { value: 'Tentative – awaiting rates' } });
    expect(screen.getByLabelText('Custom hotel status').value).toBe('Tentative – awaiting rates');
    expect(screen.getByLabelText('Hotel status').value).toBe('__other__');
  });
});
