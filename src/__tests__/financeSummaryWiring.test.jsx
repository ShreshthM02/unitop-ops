import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

// The Finance tab's "Payment Summary" card (shown when opening a tour
// file's drawer and clicking the Finance tab) used to render three
// hardcoded demo figures ("$2,850" / "$2,100" / "$750") regardless of
// the query's actual payments record -- it was never wired to real data
// at all. These tests render the drawer with a real payments record and
// check the card reflects it.

const tourFileQuery = { id: 'UTQ-1', tourFileId: 'TF-2026-0001', groupName: 'Finance Summary Test', status: 'finance', manualWF: [], audit: [], remarks: [], assignedTo: 'staff-1' };
const staff = [{ id: 'staff-1', name: 'Priya', role: 'ops' }];
const baseProps = {
  query: tourFileQuery, onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{},
  onToggleWF:()=>{}, onCancel:()=>{}, onUpdateRemarks:()=>{}, onUpdateQuery:()=>{}, onRecoverQuery:()=>{},
  onForceMoveStage:()=>{}, tourExecution:{}, onUpdateTourExecution:()=>{}, vendors:[], staff,
  costSheetExists:false, quotationExists:false, hasPayments:true, currentUser:{id:'staff-1',name:'Priya'},
};

describe('Finance tab Payment Summary card is wired to the real payments record, not hardcoded demo values', () => {
  it('shows the real Tour Value (INR), Received, and Balance Due computed from the payments record', () => {
    const payments = {
      tourValue: 5000, currency: 'US $', roeUsed: 90, // Tour Value (INR) = 450,000
      entries: [
        { id: 1, type: 'advance', inCurrency: 'INR', amount: '400000', amountINR: '400000' },
      ],
      outgoing: [],
    };
    render(<QueryDrawerWithQuote {...baseProps} payments={payments}/>);
    fireEvent.click(screen.getByText('💰 Finance'));
    expect(screen.getByText(/₹ 4,50,000|₹ 450,000/)).toBeTruthy(); // Tour Value (INR)
    expect(screen.getByText(/₹ 4,00,000|₹ 400,000/)).toBeTruthy(); // Received
    expect(screen.getByText(/₹ 50,000/)).toBeTruthy();  // Balance Due
    expect(screen.queryByText('$2,850')).toBeFalsy();
    expect(screen.queryByText('$2,100')).toBeFalsy();
    expect(screen.queryByText('$750')).toBeFalsy();
  });

  it('sums the real INR credited for foreign-currency entries, not the raw foreign amount', () => {
    const payments = {
      tourValue: 5000, currency: 'US $', roeUsed: 90,
      entries: [
        { id: 1, type: 'advance', inCurrency: 'INR', amount: '100000', amountINR: '100000' },
        { id: 2, type: 'second', inCurrency: 'USD', amount: '1000', amountINR: '84000' },
        { id: 3, type: 'third', inCurrency: 'USD', amount: '500', amountINR: '' }, // no amountINR yet -- must not count as ₹500
      ],
      outgoing: [],
    };
    render(<QueryDrawerWithQuote {...baseProps} payments={payments}/>);
    fireEvent.click(screen.getByText('💰 Finance'));
    // 100000 + 84000 = 184000; the ₹500 USD entry with no amountINR must not be silently added
    expect(screen.getByText(/1,84,000|184,000/)).toBeTruthy();
  });

  it('does not crash and shows sensible zeros when the query has no payments record at all yet', () => {
    render(<QueryDrawerWithQuote {...baseProps} payments={undefined}/>);
    fireEvent.click(screen.getByText('💰 Finance'));
    expect(screen.getByText('Payment Summary')).toBeTruthy();
    expect(screen.getAllByText(/₹ 0/).length).toBeGreaterThan(0);
  });
});
