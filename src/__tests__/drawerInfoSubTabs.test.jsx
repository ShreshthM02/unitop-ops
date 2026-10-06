import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const tourFileQuery = {
  id: 'UTQ-2026-050', tourFileId: 'TF-2026-050', groupName: 'Test Group', status: 'operations',
  manualWF: [], audit: [], remarks: [], nights: 5, pax: 10,
};

const vendors = [
  { id: 'VND-003', name: 'Prithvi', type: 'Tour Facilitator', active: true },
  { id: 'VND-020', name: 'Rajgir Handlers Co', type: 'Local Handler', active: true },
  { id: 'VND-030', name: 'Delhi Coaches', type: 'Transport', active: true },
];

const blankTE = { queryId: 'UTQ-2026-050', days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };

const baseProps = {
  query: tourFileQuery, onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
  onToggleWF: ()=>{}, onCancel: ()=>{}, onUpdateRemarks: ()=>{}, currentUser: { id:1, name:'Test' },
  tourExecution: blankTE, vendors,
};

describe('QueryDrawerWithQuote: Info sub-tabs', () => {
  it('shows the 4 sub-tab bar for a Tour File, defaulting to Tour Details', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    expect(screen.getAllByText('Tour Details').length).toBeGreaterThanOrEqual(2); // tab button + section header
    expect(screen.getByText('Day-wise Itinerary')).toBeTruthy();
    expect(screen.getByText('Hotels + Meals')).toBeTruthy();
    expect(screen.getByText('Others')).toBeTruthy();
  });

  it('does not show the sub-tab bar for a plain query (not yet a Tour File)', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={{...tourFileQuery, tourFileId: undefined}} onUpdateTourExecution={()=>{}}/>);
    expect(screen.queryByText('Day-wise Itinerary')).toBeNull();
  });

  it('Day-wise Itinerary: can add a day and it appears with editable fields', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    fireEvent.click(screen.getByText('+ Add Day'));
    expect(screen.getByDisplayValue('Day 1')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Delhi – Agra')).toBeTruthy();
  });

  it('Hotels + Meals: shows an empty state until a row is added, then hotel/rooming/meal fields', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Hotels + Meals'));
    expect(screen.getByText(/No hotel rows yet/)).toBeTruthy();

    fireEvent.click(screen.getByText('+ Add row'));
    expect(screen.getByPlaceholderText('Hotel name')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. 5 Twin, 1 Sgl')).toBeTruthy();
    expect(screen.getByLabelText('Breakfast')).toBeTruthy();
    expect(screen.getByLabelText('Lunch')).toBeTruthy();
    expect(screen.getByLabelText('Dinner')).toBeTruthy();
  });

  it('Others: Transporter is now a list (matches Local Handler), Facilitator, and Local Handler dropdowns sourced from vendors, filtered by type', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Others'));
    fireEvent.click(screen.getByText('+ Add Transporter'));
    expect(screen.getByText('Delhi Coaches')).toBeTruthy();
    fireEvent.click(screen.getByText('+ Add Facilitator'));
    expect(screen.getByText('Prithvi')).toBeTruthy();
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    expect(screen.getByText('Rajgir Handlers Co')).toBeTruthy();
  });

  it('Others: can add a domestic flight/train leg with separate from/to timing fields', () => {
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}}/>);
    fireEvent.click(screen.getByText('Others'));
    // Arrival and Departure now carry the same fields as a domestic leg, so
    // those two are always on screen: 2 legs x (from/to time) = 4 already.
    expect(document.querySelectorAll('input[type="time"]').length).toBe(4);
    fireEvent.click(screen.getByText('+ Add Leg'));
    expect(screen.getAllByPlaceholderText('No.').length).toBe(3);
    const timeInputs = document.querySelectorAll('input[type="time"]');
    expect(timeInputs.length).toBe(6); // the new leg adds fromTime and toTime, separately
  });

  it('Save button is always shown but disabled until a real change (dirty tracking), and calls onUpdateTourExecution with the query id, edited data, and an audit label', () => {
    const onUpdateTourExecution = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={onUpdateTourExecution}/>);
    fireEvent.click(screen.getByText('Others'));
    expect(screen.getByText('💾 Save Others').disabled).toBe(true); // nothing changed yet

    fireEvent.click(screen.getByText('+ Add Transporter'));
    fireEvent.click(screen.getByText('💾 Save Others'));
    expect(onUpdateTourExecution).toHaveBeenCalledTimes(1);
    expect(onUpdateTourExecution.mock.calls[0][0]).toBe('UTQ-2026-050');
    expect(onUpdateTourExecution.mock.calls[0][1].transporters.length).toBe(1);
    expect(onUpdateTourExecution.mock.calls[0][2]).toBeTruthy(); // audit label passed through
  });

  it('renders without crashing when vendors/tourExecution/onUpdateTourExecution are not passed', () => {
    expect(() => render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} currentUser={{id:1,name:'Test'}}/>)).not.toThrow();
  });
});

describe('QueryDrawerWithQuote: onUpdateQuery is now actually wired (previously silently did nothing)', () => {
  it('clicking Save Changes in Tour Details calls onUpdateQuery with the edited fields', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onUpdateTourExecution={()=>{}} onUpdateQuery={onUpdateQuery}/>);
    fireEvent.click(screen.getByText('✏ Edit Tour Details'));
    const groupInput = screen.getByDisplayValue('Test Group');
    fireEvent.change(groupInput, { target: { value: 'Updated Group Name' } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onUpdateQuery).toHaveBeenCalledTimes(1);
    expect(onUpdateQuery.mock.calls[0][0]).toBe('UTQ-2026-050');
    expect(onUpdateQuery.mock.calls[0][1].groupName).toBe('Updated Group Name');
  });
});
