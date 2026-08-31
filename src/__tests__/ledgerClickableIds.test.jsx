import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentLedgerPanel from '../components/AgentLedgerPanel.jsx';
import VendorLedgerPanel from '../components/VendorLedgerPanel.jsx';

// Agent Ledger and Vendor Ledger are rendered by App.jsx as siblings of
// UnitopApp, not its children -- so they can't call setActiveQuery
// directly. Clicking an ID there dispatches a "unitop-activate-query"
// custom event, the same cross-tree bridge pattern this app's own
// "unitop-open" event already uses for document-panel buttons.

describe('Agent Ledger: Query ID and Tour File ID are clickable', () => {
  it('clicking either dispatches unitop-activate-query with the right query, and closes the ledger', () => {
    const query = { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', agentId: 'a1', destination: 'Kerala', status: 'finance' };
    const onClose = vi.fn();
    const listener = vi.fn();
    document.addEventListener('unitop-activate-query', listener);

    render(<AgentLedgerPanel agent={{ id: 'a1', company: 'ABC Travels' }} queries={[query]} payments={{}} onClose={onClose}/>);
    fireEvent.click(screen.getByText('UTQ-1'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.query.id).toBe('UTQ-1');
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('TF-1'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);

    document.removeEventListener('unitop-activate-query', listener);
  });
});

describe('Vendor Ledger: the Tour File badge is clickable', () => {
  it('clicking it dispatches unitop-activate-query with the resolved query, and closes the ledger', () => {
    const query = { id: 'UTQ-2', tourFileId: 'TF-2', groupName: 'Group B' };
    const onClose = vi.fn();
    const listener = vi.fn();
    document.addEventListener('unitop-activate-query', listener);

    const allPayments = { 'UTQ-2': { outgoing: [{ id: 1, vendor: 'Hotel Taj', vendorId: 'v1', amount: '5000', paymentType: 'voucher', date: '2026-08-01' }] } };
    render(<VendorLedgerPanel vendor={{ id: 'v1', name: 'Hotel Taj' }} queries={[query]} allPayments={allPayments} onClose={onClose}/>);
    fireEvent.click(screen.getByText('📁 TF-2'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.query.id).toBe('UTQ-2');
    expect(onClose).toHaveBeenCalledTimes(1);

    document.removeEventListener('unitop-activate-query', listener);
  });
});
