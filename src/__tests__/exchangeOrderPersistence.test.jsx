import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

describe('ExchangeOrderGenerator: real versioned persistence (Phase 0 of the Document Chain plan)', () => {
  it('calls loadExchangeOrderVersions (via db.from("exchange_orders")) on mount', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('exchange_orders'));
  });

  it('clicking Save Version calls the exchange_orders insert with the current orders list', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click(await screen.findByText(/💾 Save v1/));
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='exchange_orders')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(insertCalls[0][0]).toHaveProperty('content');
      expect(insertCalls[0][0].content).toHaveProperty('orders');
    });
  });

  it('renders without crashing when currentUser is not passed (demo mode)', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/EXCHANGE ORDERS/)).toBeTruthy();
  });

  it('loading a previously saved version populates the orders list', async () => {
    const versionRows = [
      { version: 1, content: { orders: [{id:1,orderNo:41284,serviceType:'restaurant',drawnOn:'Test Restaurant',confirmed:false}] }, is_final: false },
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
    await waitFor(() => expect(screen.getByText(/Test Restaurant/)).toBeTruthy());
  });
});
