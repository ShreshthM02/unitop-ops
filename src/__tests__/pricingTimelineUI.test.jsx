import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockDb = {
  from: (table) => ({
    select: () => ({
      eq: () => ({
        order: async () => ({
          data: table === 'cost_sheets'
            ? [{ version: 1, created_at: '2026-08-01T10:00:00Z', created_by: 'staff-1', is_final: false, note: 'Initial estimate', days:[], transports:[], slabs:[], monuments:[], local_handlers:[], extras:[] }]
            : [{ version: 1, created_at: '2026-08-01T14:00:00Z', created_by: 'staff-2', is_final: true, note: 'Client accepted', itinerary:[], hotels:[], slabs:[], monuments:[], includes:[], excludes:[] }],
        }),
      }),
    }),
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: PricingTimeline } = await import('../components/PricingTimeline.jsx');

const fakeQuery = { id: 'UTQ-2026-600' };
const staff = [{ id: 'staff-1', name: 'Priya' }, { id: 'staff-2', name: 'Ravi' }];

describe('PricingTimeline component', () => {
  it('shows a loading state, then real merged data with resolved staff names', async () => {
    render(<PricingTimeline query={fakeQuery} staff={staff}/>);
    expect(screen.getByText(/Loading pricing history/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Priya')).toBeTruthy());
    expect(screen.getByText('Ravi')).toBeTruthy();
    expect(screen.getByText('Initial estimate')).toBeTruthy();
    expect(screen.getByText('Client accepted')).toBeTruthy();
    expect(screen.getByText('★ Final')).toBeTruthy(); // only the quotation entry is final
  });

  it('shows an empty state when no pricing history exists yet', async () => {
    const emptyDb = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) };
    vi.doMock('../lib/supabase.js', () => ({ db: emptyDb, realtimeClient: null }));
    vi.resetModules();
    const { default: PT } = await import('../components/PricingTimeline.jsx');
    render(<PT query={fakeQuery} staff={staff}/>);
    await waitFor(() => expect(screen.getByText(/No pricing history yet/)).toBeTruthy());
  });
});
