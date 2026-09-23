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
import DocumentEditor from '../components/DocumentEditor.jsx';
import ExchangeOrderGenerator from '../components/ExchangeOrderGenerator.jsx';
import InvoiceGenerator from '../components/InvoiceGenerator.jsx';
import QuotationGenerator from '../components/QuotationGenerator.jsx';
import AgentMaster from '../components/AgentMaster.jsx';
import InAppChat from '../components/InAppChat.jsx';
import SeriesManagement from '../components/SeriesManagement.jsx';
import { UserManagementPanel } from '../components/UserManagementPanel.jsx';
import VendorMaster from '../components/VendorMaster.jsx';
import SmartSearch from '../components/SmartSearch.jsx';

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

  // The following nine were missed in the first pass -- found only
  // because a real, direct report said Quotation still closed on a
  // backdrop click. Root cause: the original search looked for one
  // exact whitespace formatting of the click-outside code
  // (e=>e.target===e.currentTarget, no spaces); several of these used
  // a different formatting (e => e.target === e.currentTarget, with
  // spaces) or a ternary wrapper for their asTab/overlay dual mode,
  // neither of which matched that exact string. Re-checked this time
  // with a whitespace-agnostic pattern across every component, not a
  // literal string match.

  it('Document Editor', () => {
    const onClose = vi.fn();
    const { container } = render(<DocumentEditor query={{ id: 'UTQ-1', groupName: 'Test' }} onClose={onClose} currentUser={{id:1,name:'Priya'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Exchange Order Generator', () => {
    const onClose = vi.fn();
    const fakeVendors = [{ id: 'v1', name: 'Test Vendor', type: 'Hotel', active: true }];
    const fakeQuery = { id: 'UTQ-2026-800', groupName: 'Test', tourFileId: 'TUR-800' };
    const { container } = render(<ExchangeOrderGenerator query={fakeQuery} template={{}} vendors={fakeVendors} onClose={onClose} currentUser={{id:'x',name:'Test'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Invoice Generator', () => {
    const onClose = vi.fn();
    const fakeQuery = { id: 'UTQ-2026-500', groupName: 'Test' };
    const { container } = render(<InvoiceGenerator query={fakeQuery} payments={{}} agents={[]} taxinvoiceTemplate={{}} docSettings={{ taxinvoice: { prefix: 'GST', pattern: '{prefix}-{year}-{seq}', serial: 1 } }} initialFlavor="tax" onClose={onClose} currentUser={{id:'x'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Quotation Generator -- the exact one reported as still broken', () => {
    const onClose = vi.fn();
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };
    const { container } = render(<QuotationGenerator query={{ id: 'UTQ-1', groupName: 'Test' }} template={fakeTemplate} onClose={onClose} onSaved={()=>{}} currentUser={{id:'x',name:'Priya'}}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Agent Master (as a standalone overlay, not a tab)', () => {
    const onClose = vi.fn();
    const { container } = render(<AgentMaster agents={[]} setAgents={()=>{}} queries={[]} payments={{}} onSaveAgent={()=>{}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('In-App Chat (as a standalone overlay, not a tab)', () => {
    const onClose = vi.fn();
    const staff = [{ id: 's1', name: 'Priya' }];
    const { container } = render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Series Management (as a standalone overlay, not a tab)', () => {
    const onClose = vi.fn();
    const series = [{ id: 'ser1', name: 'Test Series' }];
    const { container } = render(<SeriesManagement series={series} setSeries={()=>{}} queries={[]} currentUser={{id:1,name:'Priya'}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('User Management Panel (as a standalone overlay, not a tab)', () => {
    const onClose = vi.fn();
    const { container } = render(<UserManagementPanel currentUser={{ id: 'staff-1', name: 'Shreshth', role: 'admin' }} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Vendor Master (as a standalone overlay, not a tab)', () => {
    const onClose = vi.fn();
    const { container } = render(<VendorMaster vendors={[]} setVendors={()=>{}} queries={[]} tourExecutions={{}} onClose={onClose}/>);
    clickBackdrop(container);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('In-App Chat: its own sub-modals also no longer close on a backdrop click', () => {
  const staff = [{ id: 's1', name: 'Priya' }];
  const baseProps = { currentUser:{id:'s1',name:'Priya'}, queries:[], staff, agents:[], vendors:[], series:[], onClose:()=>{} };

  it('the "New DM" picker', () => {
    render(<InAppChat {...baseProps}/>);
    fireEvent.click(screen.getByText('+ New'));
    fireEvent.click(screen.getByText('💬 New Direct Message'));
    const heading = screen.getByText('Start a Direct Message');
    fireEvent.click(heading.closest('div[style*="position:absolute"], div[style*="position: absolute"]'));
    // Still open: the picker's own heading is still there.
    expect(screen.getByText('Start a Direct Message')).toBeTruthy();
  });

  it('the "New Group" draft', () => {
    render(<InAppChat {...baseProps}/>);
    fireEvent.click(screen.getByText('+ New'));
    fireEvent.click(screen.getByText('👥 New Group'));
    const nameInput = screen.getByPlaceholderText('Group name');
    fireEvent.click(nameInput.closest('div[style*="position:absolute"], div[style*="position: absolute"]'));
    expect(screen.getByPlaceholderText('Group name')).toBeTruthy();
  });
});

describe('Deliberately UNCHANGED: view-only popups with no data entry still close on a backdrop click', () => {
  it('Smart Search: a fresh search costs nothing to redo, so backdrop-close stays intentional, standard search-palette behavior', () => {
    const onClose = vi.fn();
    render(<SmartSearch queries={[]} agents={[]} vendors={[]} series={[]} staff={[]} chatConversations={[]} currentUser={{role:'admin'}} onSelectQuery={()=>{}} onSelectStaff={()=>{}} onSelectChat={()=>{}} onClose={onClose}/>);
    const backdrop = document.querySelector('div[style*="0.6"]');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
