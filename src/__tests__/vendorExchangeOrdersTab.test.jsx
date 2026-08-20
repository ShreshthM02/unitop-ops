import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Phase D (2026-08-20): Vendor Master's new "Exchange Orders" tab -- every
// EO issued against a vendor, across every tour file, with a Settled/
// Unsettled toggle. Deliberately carries no amount (see
// exchangeOrderPersistence.test.jsx and ExchangeOrderGenerator.jsx's
// emptyOrder() comment for why): the EO is a service voucher, not a
// financial transaction.

const vendor = { id: 'VND-001', name: 'Hotel Saura, Leh', type: 'Hotel', active: true };
const query = { id: 'UTQ-2026-1', tourFileId: 'TUR-2026-1', groupName: 'Ladakh Group' };

const unsettledRow = {
  id: 'row-1', order_no: 'EO-2026-001', query_id: query.id, vendor_id: vendor.id, version: 1, is_final: false,
  content: { serviceType: 'hotel', drawnOn: vendor.name, issueDate: '20/08/2026', confirmed: true, settled: false },
};
const settledRow = {
  id: 'row-2', order_no: 'EO-2026-002', query_id: query.id, vendor_id: vendor.id, version: 1, is_final: false,
  content: { serviceType: 'hotel', drawnOn: vendor.name, issueDate: '18/08/2026', confirmed: true, settled: true },
};

function makeDb(rows) {
  return {
    from: vi.fn((t) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: t === 'exchange_orders' ? rows : [], error: null }),
      };
      return builder;
    }),
  };
}

describe('VendorMaster: Exchange Orders tab', () => {
  it('loads and lists every Exchange Order issued to this vendor, unsettled first', async () => {
    const db = makeDb([settledRow, unsettledRow]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[vendor]} setVendors={()=>{}} queries={[query]} payments={{}} tourExecutions={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText(vendor.name));
    fireEvent.click(screen.getByText('Exchange Orders'));
    await waitFor(() => expect(screen.getByText('EO-2026-001')).toBeTruthy());
    expect(screen.getByText('EO-2026-002')).toBeTruthy();
    const rowTexts = screen.getAllByText(/EO-2026-00[12]/).map(el => el.textContent);
    expect(rowTexts.indexOf('EO-2026-001')).toBeLessThan(rowTexts.indexOf('EO-2026-002'));
    expect(screen.getByText('1 unsettled.')).toBeTruthy();
  });

  it('toggling Settle updates the row in place, not a new version', async () => {
    const db = makeDb([unsettledRow]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[vendor]} setVendors={()=>{}} queries={[query]} payments={{}} tourExecutions={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText(vendor.name));
    fireEvent.click(screen.getByText('Exchange Orders'));
    fireEvent.click(await screen.findByText('✓ Settle'));
    await waitFor(() => {
      const updateCalls = db.from.mock.results
        .filter((r,i)=>db.from.mock.calls[i][0]==='exchange_orders')
        .map(r=>r.value.update.mock.calls).flat();
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(updateCalls[0][0].content.settled).toBe(true);
    });
    const insertCalls = db.from.mock.results
      .filter((r,i)=>db.from.mock.calls[i][0]==='exchange_orders')
      .map(r=>r.value.insert.mock.calls).flat();
    expect(insertCalls.length).toBe(0);
  });

  it('shows a clear empty state when the vendor has no Exchange Orders yet', async () => {
    const db = makeDb([]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[vendor]} setVendors={()=>{}} queries={[query]} payments={{}} tourExecutions={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText(vendor.name));
    fireEvent.click(screen.getByText('Exchange Orders'));
    await waitFor(() => expect(screen.getByText(/No Exchange Orders issued to this vendor yet/)).toBeTruthy());
  });

  it('"Open" opens the Exchange Order panel landed directly on that order', async () => {
    const db = makeDb([unsettledRow]);
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[vendor]} setVendors={()=>{}} queries={[query]} payments={{}} tourExecutions={{}} docTemplates={{}} currentUser={{id:'x'}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText(vendor.name));
    fireEvent.click(screen.getByText('Exchange Orders'));
    fireEvent.click(await screen.findByText('✏ Open'));
    await waitFor(() => expect(screen.getAllByText('EO-2026-001').length).toBeGreaterThan(0));
    // The opened panel shows the order's own version/print controls, confirming it landed on the order, not an empty "new" form
    expect(screen.getByText('📤 Shareable')).toBeTruthy();
  });
});
