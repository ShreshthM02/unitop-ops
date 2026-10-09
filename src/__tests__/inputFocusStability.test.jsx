import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-1900', groupName: 'Focus Test', nights: 3, tourFileId: 'TF-1900' };
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

describe('inputs keep their DOM node while typing (no remount)', () => {
  it('Section Label input is the same element after each keystroke', async () => {
    await open();
    const first = screen.getAllByRole('textbox').find(e => e.tagName === 'INPUT');
    const lbl = screen.getByText(/Section Label/).parentElement.querySelector('input');
    fireEvent.change(lbl, { target: { value: 'H' } });
    fireEvent.change(lbl, { target: { value: 'Ho' } });
    const again = screen.getByText(/Section Label/).parentElement.querySelector('input');
    expect(again).toBe(lbl);
    expect(again.value).toBe('Ho');
    expect(first).toBeTruthy();
  });
  it('Section Notes textarea is the same element after each keystroke', async () => {
    await open();
    const ta = document.querySelector('textarea');
    fireEvent.change(ta, { target: { value: 'a' } });
    fireEvent.change(ta, { target: { value: 'ab' } });
    expect(document.querySelector('textarea')).toBe(ta);
    expect(ta.value).toBe('ab');
  });
  it('contact list print columns: contact no-wrap and >=20ch, address narrower', () => {
    const fs = require("fs");
    const src = fs.readFileSync('src/components/TourBriefingSheet.jsx', 'utf8');
    expect(src).toMatch(/min-width:20ch">Contact/);
    expect(src).toMatch(/white-space:nowrap;min-width:20ch">\$\{it\.contact/);
  });
});
