import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Restructured 2026-08-20: each Exchange Order is now its own independently
// versioned document (order_no + version), not an array entry inside one
// tour-file-wide bundle. These tests cover the new shape: Generate New tab
// assigns a globally-unique order_no on save; Repository tab lists every
// EO for this tour file, grouped by order_no.
//
// Phase D (2026-08-20) made "Drawn on" a real vendor picker instead of
// free text, and added vendor_id to the save payload -- so these tests
// now select a vendor via the <select>, not type into a text input.

const fakeVendors = [
  { id: 'VND-001', name: 'Nanking Restaurant', type: 'Restaurant', active: true },
];

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
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('exchange_orders'));
  });

  it('saving a new order assigns a globally-unique order_no, inserts version 1 with the selected vendor_id', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.change(await screen.findByDisplayValue('Select vendor...'), { target: { value: 'VND-001' } });
    fireEvent.click(screen.getByText('✓ Save Exchange Order'));
    await waitFor(() => {
      const insertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='exchange_orders')
        .map(r=>r.value.insert.mock.calls).flat();
      expect(insertCalls.length).toBeGreaterThan(0);
      const inserted = insertCalls[0][0];
      expect(inserted).toHaveProperty('order_no');
      expect(inserted.version).toBe(1);
      expect(inserted.vendor_id).toBe('VND-001');
      expect(inserted.content.drawnOn).toBe('Nanking Restaurant');
    });
  });

  it('Save is disabled until a vendor is selected', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const saveBtn = await screen.findByText('✓ Save Exchange Order');
    expect(saveBtn.disabled).toBe(true);
  });

  it('renders without crashing when currentUser and vendors are not passed (demo mode)', async () => {
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} onClose={()=>{}}/>);
    expect(await screen.findByText(/EXCHANGE ORDERS/)).toBeTruthy();
  });

  it('Repository tab lists a previously saved Exchange Order grouped by its order_no', async () => {
    const versionRows = [
      { id:'row-1', order_no: 'EO-2026-001', query_id: fakeQuery.id, vendor_id: 'VND-001', version: 1, is_final: false,
        content: { serviceType:'restaurant', drawnOn:'Test Restaurant', confirmed:false, settled:false, issueDate:'', pax:'' } },
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
    render(<EOG query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Repository/));
    await waitFor(() => expect(screen.getByText('Test Restaurant')).toBeTruthy());
    expect(screen.getByText('EO-2026-001')).toBeTruthy();
    expect(screen.getByText('Unsettled')).toBeTruthy();
  });

  it('opening a saved order missing newer fields (settled, pax, etc.) defaults them instead of leaving inputs uncontrolled', async () => {
    const versionRows = [
      { id:'row-1', order_no: 'EO-2026-050', query_id: fakeQuery.id, vendor_id: 'VND-001', version: 1, is_final: false,
        content: { serviceType:'restaurant', drawnOn:'Old Order Vendor' } }, // missing settled, confirmed, pax, etc. -- as a real pre-Phase-D row would be
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
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<EOG query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x'}}/>);
    fireEvent.click(await screen.findByText(/Repository/));
    fireEvent.click(await screen.findByText('EO-2026-050'));
    await waitFor(() => expect(screen.getAllByText('EO-2026-050').length).toBeGreaterThan(0));
    const controlledWarning = warnSpy.mock.calls.some(c => String(c[0]).includes('controlled input to be uncontrolled'));
    expect(controlledWarning).toBe(false);
    warnSpy.mockRestore();
  });
});

describe('ExchangeOrderGenerator: 2026-08-21 fixes', () => {
  it('saving a new order lands the user on the open editor, with the version control bar visible', async () => {
    // Stateful mock: insert has to actually persist so the subsequent
    // refreshList() + openOrder() the fix relies on can find the new row.
    let rows = [];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => { const row = { ...r, id: 'new-id-' + rows.length }; if (t === 'exchange_orders') rows.push(row); return { data: [row], error: null }; }),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'exchange_orders' ? rows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: EOG } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<EOG query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.change(await screen.findByDisplayValue('Select vendor...'), { target: { value: 'VND-001' } });
    fireEvent.click(screen.getByText('✓ Save Exchange Order'));
    await waitFor(() => expect(screen.getByText('← Back to Repository')).toBeTruthy());
    expect(screen.getByText('📤 Shareable')).toBeTruthy();
  });

  it('toggling Confirmed/Settled logs to the audit trail', async () => {
    const versionRows = [
      { id:'row-1', order_no: 'EO-2026-060', query_id: fakeQuery.id, vendor_id: 'VND-001', version: 1, is_final: false,
        content: { serviceType:'restaurant', drawnOn:'Nanking Restaurant', confirmed:false, settled:false, issueDate:'', pax:'' } },
    ];
    const inserts = [];
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => { inserts.push({ table: t, row: r }); return { data: [{ ...r, id: 'new-id' }], error: null }; }),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'exchange_orders' ? versionRows : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: EOG } = await import('../components/ExchangeOrderGenerator.jsx');
    render(<EOG query={fakeQuery} template={{}} vendors={fakeVendors} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.click(await screen.findByText(/Repository/));
    fireEvent.click(await screen.findByText('✓ Confirm'));
    await waitFor(() => {
      const auditInserts = inserts.filter(i => i.table === 'query_audit');
      expect(auditInserts.length).toBeGreaterThan(0);
    });
  });
});
