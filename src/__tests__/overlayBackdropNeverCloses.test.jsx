import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentLedgerPanel from '../components/AgentLedgerPanel.jsx';
import { CostSheet } from '../components/CostSheet.jsx';
import EnhancedPaymentTracker from '../components/EnhancedPaymentTracker.jsx';
import Itinerary from '../components/Itinerary.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';
import TourBriefingSheet from '../components/TourBriefingSheet.jsx';
import UserProfilePanel from '../components/UserProfilePanel.jsx';
import VendorLedgerPanel from '../components/VendorLedgerPanel.jsx';

// Real, direct report: "A mistaken click outside the overlay has bitten
// us many times during testing in the app. The window closes without
// saving progress and it seems very dangerous. Let the 'cross' button
// be the only source of closing a window." Found the same
// click-outside-to-close pattern identically repeated across eight
// separate overlay components -- all eight now ignore a backdrop
// click entirely; only their own explicit close control still works.

function clickBackdrop(container) {
  const overlay = container.querySelector('.overlay');
  fireEvent.click(overlay);
}

describe('No overlay closes on a backdrop click -- only its own explicit close control does', () => {
  it('Agent Ledger Panel', () => {
    const onClose = vi.fn();
    const { container } = render(<AgentLedgerPanel agent={{ id: 'a1', company: 'ABC Travels' }} queries={[]} payments={{}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cost Sheet', () => {
    const onClose = vi.fn();
    const { container } = render(<CostSheet query={{ id: 'UTQ-1', groupName: 'Test' }} onClose={onClose} onProceedToQuotation={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
    // Cost Sheet has several "✕" buttons (row-delete controls); the
    // header's own close button is always the first one in the DOM.
    fireEvent.click(screen.getAllByText('✕')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('Enhanced Payment Tracker', () => {
    const onClose = vi.fn();
    const { container } = render(<EnhancedPaymentTracker query={{ id: 'UTQ-1' }} payments={{}} onUpdatePayments={()=>{}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Itinerary', () => {
    const onClose = vi.fn();
    const { container } = render(<Itinerary query={{ id: 'UTQ-1', groupName: 'Test', nights: 3 }} briefTemplate={{}} onClose={onClose} currentUser={{id:'x'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Query Drawer', () => {
    const query = { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test', status: 'operations', cancelled: false };
    const onClose = vi.fn();
    const { container } = render(<QueryDrawerWithQuote query={query} onClose={onClose} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} onUpdateQuery={()=>{}} onRecoverQuery={()=>{}} staff={[]} currentUser={{id:1,name:'Priya',role:'admin'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tour Briefing Sheet', () => {
    const onClose = vi.fn();
    const { container } = render(<TourBriefingSheet query={{ id: 'UTQ-1', groupName: 'Test' }} template={{}} facilitators={[]} onClose={onClose} currentUser={{id:'x'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('User Profile Panel', () => {
    const onClose = vi.fn();
    const { container } = render(<UserProfilePanel currentUser={{ id: 1, name: 'Old Name', color: '#1A5276', role: 'ops' }} onClose={onClose} onSave={()=>{}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Vendor Ledger Panel', () => {
    const onClose = vi.fn();
    const { container } = render(<VendorLedgerPanel vendor={{ id: 'v1', name: 'Hotel Taj' }} queries={[]} allPayments={{}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });
});
