import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const blankTE = { queryId: 'UTQ-1', days: [{id:1,dayLabel:'Day 1',date:'2026-08-01',route:'Delhi'}], facilitators: [{id:1,vendorId:'',sector:''}], localHandlers: [{id:1,vendorId:'',sector:'',notes:''}], transporters: [{id:1,vendorId:'',sector:'',notes:''}], flights: [{id:1,date:'',type:'Flight',number:'',from:'',fromTime:'',to:'',toTime:''}], arrFlightDetails: '', depFlightDetails: '' };

const cancelledQuery = {
  id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test', status: 'operations', cancelled: true,
  manualWF: [], audit: [], remarks: [],
};

const baseProps = {
  onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{}, onToggleWF: ()=>{},
  onCancel: ()=>{}, onUpdateRemarks: ()=>{}, onUpdateQuery: ()=>{}, currentUser: { id:1, name:'Priya' },
  tourExecution: blankTE, costSheetExists: false, quotationExists: false, hasPayments: false,
};

describe('Drawer-level lockdown for cancelled tour files: Itinerary, Hotels, Others', () => {
  it('Day-wise Itinerary: fieldset is disabled, and the remove button is hidden', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={cancelledQuery} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.textContent).not.toContain('✕');
  });

  it('Day-wise Hotels: fieldset is disabled', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={cancelledQuery} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Hotels'));
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
  });

  it('Others: fieldset is disabled, and all remove buttons (transporter/facilitator/handler/flight) are hidden', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={cancelledQuery} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Others'));
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
    expect(fieldset.textContent).not.toContain('✕');
  });

  it('non-cancelled query: Itinerary fieldset is enabled and remove buttons are present (no regression)', () => {
    const activeQuery = { ...cancelledQuery, cancelled: false };
    render(<QueryDrawerWithQuote {...baseProps} query={activeQuery} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.disabled).toBe(false);
    expect(screen.getAllByText('✕').length).toBeGreaterThan(0);
  });

  it('Remarks remains fully usable on a cancelled query -- the one thing explicitly meant to stay live', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={cancelledQuery} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText(/💬 Remarks/));
    // No fieldset should wrap Remarks -- it should not be disabled
    const remarksFieldset = document.querySelector('fieldset');
    expect(remarksFieldset).toBeNull();
  });
});
