import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mapDbQueryRow, buildQuerySavePayload } from '../lib/utils.js';
import TeamView from '../components/TeamView.jsx';
import NewQueryModal from '../components/NewQueryModal.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

describe('reviewer_id round-trip', () => {
  it('mapDbQueryRow maps reviewer_id to reviewerId', () => {
    expect(mapDbQueryRow({ id: 'UTQ-1', reviewer_id: 'staff-2' }).reviewerId).toBe('staff-2');
  });
  it('buildQuerySavePayload only sends reviewer_id when it is a real uuid', () => {
    expect(buildQuerySavePayload({ id: 'UTQ-1', reviewerId: 'a1b2c3d4-0000-0000-0000-000000000000' }).reviewer_id).toBe('a1b2c3d4-0000-0000-0000-000000000000');
    expect(buildQuerySavePayload({ id: 'UTQ-1', reviewerId: '' }).reviewer_id).toBe(null);
    expect(buildQuerySavePayload({ id: 'UTQ-1' }).reviewer_id).toBe(null);
  });
});

describe('TeamView: Doer/Reviewer split into two separate lists per person', () => {
  const staff = [
    { id: 's1', name: 'Priya', role: 'sales' },
    { id: 's2', name: 'Amit', role: 'ops' },
  ];
  const queries = [
    { id: 'UTQ-1', clientName: 'Group A', status: 'new_query', assignedTo: 's1', reviewerId: 's2' },
    { id: 'UTQ-2', clientName: 'Group B', status: 'quotation_sent', assignedTo: 's1' }, // no reviewer
  ];

  it('shows what someone is working on, separate from what they are reviewing for someone else', () => {
    render(<TeamView queries={queries} staff={staff}/>);
    expect(screen.getAllByText('Working On').length).toBe(2);
    expect(screen.getAllByText('Reviewing').length).toBe(2);
    // Priya (s1) is the Doer on both -- both show under her "Working On"
    // Amit (s2) is the Reviewer on UTQ-1 only -- shows under his "Reviewing", not his "Working On"
    expect(screen.getByText(/2 working/)).toBeTruthy();
    expect(screen.getByText(/1 reviewing/)).toBeTruthy();
  });

  it('shows a clear empty state for a person with nothing to review', () => {
    render(<TeamView queries={queries} staff={staff}/>);
    expect(screen.getByText('Nothing to review')).toBeTruthy(); // Priya has nothing to review
  });

  it('shows a clear empty state for a person with nothing assigned', () => {
    render(<TeamView queries={[]} staff={staff}/>);
    expect(screen.getAllByText('Nothing currently assigned').length).toBe(2);
  });
});

describe('NewQueryModal: Reviewer is optional, assignable at creation, and excludes whoever is currently the Doer', () => {
  const staff = [
    { id: 's1', name: 'Priya', role: 'sales' },
    { id: 's2', name: 'Amit', role: 'ops' },
  ];

  it('defaults to "Not assigned"', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={staff} series={[]} queries={[]}/>);
    expect(screen.getByDisplayValue('Not assigned')).toBeTruthy();
  });

  it('a reviewer selection is included when the query is saved', () => {
    const onSave = vi.fn();
    render(<NewQueryModal onClose={()=>{}} onSave={onSave} nextId="UTQ-1" agents={[]} staff={staff} series={[]} queries={[]}/>);
    fireEvent.change(screen.getByDisplayValue('Not assigned'), { target: { value: 's2' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. COL Group, Smith Family'), { target: { value: 'Test Group' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. NCH Holidays'), { target: { value: 'Test Agency' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Golden Triangle, Buddhist Circuit'), { target: { value: 'Golden Triangle' } });
    fireEvent.click(screen.getByText(/Save & Acknowledge/));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ reviewerId: 's2' }));
  });
});

describe('QueryDrawerWithQuote: Reviewer assignable at any stage, not gated behind conversion to a tour file', () => {
  const staff = [
    { id: 's1', name: 'Priya', role: 'sales' },
    { id: 's2', name: 'Amit', role: 'ops' },
  ];
  const preConversionQuery = {
    id: 'UTQ-2026-060', groupName: 'Test Group', status: 'new_query', // still a plain query, NOT a tour file
    manualWF: [], audit: [], remarks: [], nights: 5, pax: 10, assignedTo: 's1',
  };
  const blankTE = { queryId: 'UTQ-2026-060', days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
  const baseProps = {
    onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
    onToggleWF: ()=>{}, onCancel: ()=>{}, onUpdateRemarks: ()=>{}, currentUser: { id:1, name:'Test' },
    tourExecution: blankTE, vendors: [], onUpdateTourExecution: ()=>{}, staff, series: [],
  };

  it('a reviewer can be assigned even though this query has not been converted to a tour file yet', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} query={preConversionQuery} onUpdateQuery={onUpdateQuery}/>);
    expect(screen.getByText('Reviewer')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Not assigned'), { target: { value: 's2' } });
    expect(onUpdateQuery).toHaveBeenCalledWith('UTQ-2026-060', { reviewerId: 's2' });
  });

  it('the current Doer never appears as a reviewer option, since someone should not review their own work', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={preConversionQuery} onUpdateQuery={()=>{}}/>);
    const reviewerSelect = screen.getByDisplayValue('Not assigned');
    const optionNames = Array.from(reviewerSelect.querySelectorAll('option')).map(o => o.textContent);
    expect(optionNames).not.toContain('Priya'); // Priya is the Doer here
    expect(optionNames).toContain('Amit');
  });

  it('picking "Not assigned" clears the reviewer', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} query={{...preConversionQuery, reviewerId:'s2'}} onUpdateQuery={onUpdateQuery}/>);
    fireEvent.change(screen.getByDisplayValue('Amit'), { target: { value: '' } });
    expect(onUpdateQuery).toHaveBeenCalledWith('UTQ-2026-060', { reviewerId: null });
  });
});
