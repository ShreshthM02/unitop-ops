import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';
import EnhancedPaymentTracker from '../components/EnhancedPaymentTracker.jsx';
import AgentMaster from '../components/AgentMaster.jsx';
import VendorMaster from '../components/VendorMaster.jsx';

// Real audit finding: 11 of 17 defined permission types were shown as
// editable in User Management but never actually enforced anywhere --
// toggling them had zero effect on what a user could do. This tests
// the 10 that now have real, hidden-not-disabled enforcement (matching
// how the 6 already-working ones already behaved). queries_delete is
// the 11th -- confirmed via direct investigation that no delete-query
// feature exists anywhere in this app at all, so there is genuinely
// nothing to gate; not tested here for that reason, not an oversight.

const blankTE = { queryId: 'UTQ-1', days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
const drawerBaseProps = {
  onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
  onToggleWF: ()=>{}, onCancel: ()=>{}, onUpdateRemarks: ()=>{}, onUpdateQuery: ()=>{},
  tourExecution: blankTE, vendors: [], onUpdateTourExecution: ()=>{}, staff: [], series: [],
  costSheetExists: false, quotationExists: false, hasPayments: false, payments: {},
};
const fullPermsUser = { id:1, name:'Admin', role:'admin' };
const noPermsUser = { id:2, name:'Restricted',
  permissions: { cost_sheet:false, quotation:false, itinerary:false, invoices:false, exchange_orders:false, cancel_query:false } };

describe('QueryDrawerWithQuote: document buttons hidden per-permission, not just present for everyone', () => {
  const caseFileQuery = { id: 'UTQ-1', tourFileId: 'TUR-1', groupName: 'Test Group', status: 'operations', manualWF: [], audit: [], remarks: [], nights: 5, pax: 10 };

  it('a user with every relevant permission sees every document button', () => {
    render(<QueryDrawerWithQuote {...drawerBaseProps} query={caseFileQuery} currentUser={fullPermsUser}/>);
    fireEvent.click(screen.getByText(/📋 Docs/));
    expect(screen.getByText('Cost Sheet')).toBeTruthy();
    expect(screen.getByText('Itinerary')).toBeTruthy();
    expect(screen.getByText('Quotation')).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
    expect(screen.getByText('Exchange Orders')).toBeTruthy();
  });

  it('a user missing those specific permissions does not see those specific buttons', () => {
    render(<QueryDrawerWithQuote {...drawerBaseProps} query={caseFileQuery} currentUser={noPermsUser}/>);
    fireEvent.click(screen.getByText(/📋 Docs/));
    expect(screen.queryByText('Cost Sheet')).toBeFalsy();
    expect(screen.queryByText('Itinerary')).toBeFalsy();
    expect(screen.queryByText('Quotation')).toBeFalsy();
    expect(screen.queryByText('Invoices')).toBeFalsy();
    expect(screen.queryByText('Exchange Orders')).toBeFalsy();
  });

  it('doc types with no dedicated permission (Tour Briefing Sheet, Editor, Uploads) stay visible to everyone regardless', () => {
    render(<QueryDrawerWithQuote {...drawerBaseProps} query={caseFileQuery} currentUser={noPermsUser}/>);
    fireEvent.click(screen.getByText(/📋 Docs/));
    expect(screen.getByText('Tour Briefing Sheet')).toBeTruthy();
    expect(screen.getByText('Editor')).toBeTruthy();
    expect(screen.getByText('Uploads')).toBeTruthy();
  });

  it('the Cancel button is hidden when cancel_query is false, on an otherwise-active query', () => {
    render(<QueryDrawerWithQuote {...drawerBaseProps} query={caseFileQuery} currentUser={noPermsUser}/>);
    expect(screen.queryByText(/✕ Cancel this/)).toBeFalsy();
  });

  it('the Cancel button still shows when cancel_query is true', () => {
    render(<QueryDrawerWithQuote {...drawerBaseProps} query={caseFileQuery} currentUser={fullPermsUser}/>);
    expect(screen.getByText(/✕ Cancel this/)).toBeTruthy();
  });
});

describe('EnhancedPaymentTracker: incoming/outgoing gated independently, since someone could have one but not the other', () => {
  const query = { id: 'UTQ-1', groupName: 'Test Group' };

  it('a user with both permissions sees both record forms', () => {
    render(<EnhancedPaymentTracker query={query} payments={{}} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={fullPermsUser}/>);
    expect(screen.getByText('+ Record Incoming Payment')).toBeTruthy();
    fireEvent.click(screen.getByText(/📤 Outgoing/));
    expect(screen.getByText('+ Record Outgoing / Vendor Payment')).toBeTruthy();
  });

  it('a user with neither permission sees neither form, but can still view existing records', () => {
    const restricted = { id:2, name:'Restricted', permissions:{ payments_incoming:false, payments_outgoing:false } };
    render(<EnhancedPaymentTracker query={query} payments={{}} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={restricted}/>);
    expect(screen.queryByText('+ Record Incoming Payment')).toBeFalsy();
    fireEvent.click(screen.getByText(/📤 Outgoing/));
    expect(screen.queryByText('+ Record Outgoing / Vendor Payment')).toBeFalsy();
  });

  it('a user with ONLY payments_incoming sees the incoming form but not the outgoing one', () => {
    const incomingOnly = { id:3, name:'IncomingOnly', permissions:{ payments_incoming:true, payments_outgoing:false } };
    render(<EnhancedPaymentTracker query={query} payments={{}} onUpdatePayments={()=>{}} onClose={()=>{}} currentUser={incomingOnly}/>);
    expect(screen.getByText('+ Record Incoming Payment')).toBeTruthy();
    fireEvent.click(screen.getByText(/📤 Outgoing/));
    expect(screen.queryByText('+ Record Outgoing / Vendor Payment')).toBeFalsy();
  });
});

describe('AgentMaster: New/Edit gated by agents_edit', () => {
  const agents = [{ id: 'a1', company: 'ABC Travels', country: 'Germany' }];

  it('a user with agents_edit sees New and Edit', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={fullPermsUser} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText('+ New Agent')).toBeTruthy();
    fireEvent.click(screen.getByText('ABC Travels'));
    expect(screen.getByText('✏ Edit')).toBeTruthy();
  });

  it('a user without agents_edit sees neither', () => {
    const restricted = { id:2, name:'Restricted', permissions:{ agents_edit:false } };
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={restricted} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.queryByText('+ New Agent')).toBeFalsy();
    fireEvent.click(screen.getByText('ABC Travels'));
    expect(screen.queryByText('✏ Edit')).toBeFalsy();
  });
});

describe('VendorMaster: New/Edit gated by vendors_edit', () => {
  const vendors = [{ id: 'v1', name: 'Nanking Restaurant', type: 'Restaurant', city: 'Delhi', active: true }];

  it('a user with vendors_edit sees New and Edit', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={fullPermsUser} onClose={()=>{}}/>);
    expect(screen.getByText('+ New Vendor')).toBeTruthy();
    fireEvent.click(screen.getByText('Nanking Restaurant'));
    expect(screen.getByText('✏ Edit')).toBeTruthy();
  });

  it('a user without vendors_edit sees neither', () => {
    const restricted = { id:2, name:'Restricted', permissions:{ vendors_edit:false } };
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={restricted} onClose={()=>{}}/>);
    expect(screen.queryByText('+ New Vendor')).toBeFalsy();
    fireEvent.click(screen.getByText('Nanking Restaurant'));
    expect(screen.queryByText('✏ Edit')).toBeFalsy();
  });
});
