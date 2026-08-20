import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Restructured 2026-08-20: each Exchange Order is now its own independently
// versioned document (order_no + version), not an array entry inside one
// tour-file-wide bundle. These tests cover the new shape: Generate New tab
// assigns a globally-unique order_no on save; Repository tab lists every
// EO for this tour file, grouped by order_no.

const mockDb = {
  from: vi.fn((table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'new-uuid-' + table }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');

const fakeQuery = { id: 'UTQ-2026-800', groupName: 'Exchange Order Persistence Test', tourFileId: 'TUR-800' };

beforeEach(() => { mockDb.from.mockClear(); });

describe('ExchangeOrderGenerator: per-order versioned persistence (restructured 2026-08-20)', () => {
  it('loads the tour file\'s Exchange Orders (via db.from("exchange_orders")) on mount', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('exchange_orders'));
  });

  it('saving a new order assigns a globally-unique order_no and inserts version 1', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.change(await screen.findByPlaceholderText('e.g. Nanking Restaurant'), { target: { value: 'Nanking Restaurant' } });
    fireEvent.click(screen.getByText('✓ Save Exchange Order'));
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='exchange_orders')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      const inserted = insertCalls[0][0];
      expect(inserted).toHaveProperty('order_no');
      expect(inserted.version).toBe(1);
      expect(inserted.content.drawnOn).toBe('Nanking Restaurant');
    });
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/EXCHANGE ORDERS/)).toBeTruthy();
  });

  it('Repository tab lists a previously saved Exchange Order grouped by its order_no', async () => {
    const versionRows = [
      { id:'row-1', order_no: 'EO-2026-001', query_id: fakeQuery.id, version: 1, is_final: false,
        content: { serviceType:'restaurant', drawnOn:'Test Restaurant', confirmed:false, issueDate:'', pax:'' } },
    ];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'exchange_orders' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: EOG } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<EOG query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Repository/));
    await waitFor(() => expect(screen.getByText('Test Restaurant')).toBeTruthy());
    expect(screen.getByText('EO-2026-001')).toBeTruthy();
  });
});
