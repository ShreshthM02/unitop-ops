import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatDateDMY } from '../lib/utils.js';
import NewQueryModal from '../components/NewQueryModal.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

vi.mock('../lib/supabase.js', () => ({ db: { from: () => ({ select:()=>({eq:()=>({order:async()=>({data:[]})})}) }) }, realtimeClient: null }));

describe('formatDateDMY', () => {
  it('converts a yyyy-mm-dd date to dd-mm-yyyy', () => {
    expect(formatDateDMY('2026-08-15')).toBe('15-08-2026');
  });
  it('returns non-date strings unchanged (e.g. a month name for TBC dates)', () => {
    expect(formatDateDMY('December 2026')).toBe('December 2026');
  });
  it('handles empty/null/undefined without throwing', () => {
    expect(formatDateDMY('')).toBe('');
    expect(formatDateDMY(null)).toBe('');
    expect(formatDateDMY(undefined)).toBe('');
  });
});

describe('Date range validation: To can never be before From', () => {
  it('NewQueryModal: the To date input has min set to the current From value', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    fireEvent.click(screen.getByText('Dates confirmed'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    const fromInput = dateInputs[0];
    fireEvent.change(fromInput, { target: { value: '2026-08-15' } });
    const toInput = dateInputs[1];
    expect(toInput.min).toBe('2026-08-15'); // To is now constrained to not be before From
  });

  it('NewQueryModal: the From date input gets max set once a To value exists', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-1" agents={[]} staff={[]}/>);
    fireEvent.click(screen.getByText('Dates confirmed'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-08-20' } }); // set To first
    expect(dateInputs[0].max).toBe('2026-08-20'); // From is now constrained to not be after To
  });
});

describe('Assigned To is now editable in the query edit form (was missing entirely)', () => {
  const tourFileQuery = { id: 'UTQ-2026-700', tourFileId: 'TF-2026-700', groupName: 'Test', status: 'operations', manualWF: [], audit: [], remarks: [], assignedTo: 'staff-1' };
  const staff = [{ id: 'staff-1', name: 'Priya', role: 'sales' }, { id: 'staff-2', name: 'Ravi', role: 'ops' }];

  it('shows an Assigned To dropdown when editing, populated from the real staff list', () => {
    render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} onUpdateQuery={()=>{}} staff={staff} currentUser={{id:'staff-1',name:'Priya'}}/>);
    fireEvent.click(screen.getByText('✏ Edit Tour Details'));
    expect(screen.getByText('Assigned To')).toBeTruthy();
    expect(screen.getByText('Priya')).toBeTruthy();
    expect(screen.getByText('Ravi')).toBeTruthy();
  });

  it('changing Assigned To and saving calls onUpdateQuery with the new value', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote query={tourFileQuery} onClose={()=>{}} onConvert={()=>{}} onAdvance={()=>{}} onGenerateQuote={()=>{}} onToggleWF={()=>{}} onCancel={()=>{}} onUpdateRemarks={()=>{}} onUpdateQuery={onUpdateQuery} staff={staff} currentUser={{id:'staff-1',name:'Priya'}}/>);
    fireEvent.click(screen.getByText('✏ Edit Tour Details'));
    const selects = document.querySelectorAll('select');
    const assignedToSelect = Array.from(selects).find(s => Array.from(s.options).some(o => o.textContent === 'Ravi'));
    fireEvent.change(assignedToSelect, { target: { value: 'staff-2' } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onUpdateQuery).toHaveBeenCalledTimes(1);
    expect(onUpdateQuery.mock.calls[0][1].assignedTo).toBe('staff-2');
  });
});

describe('Cost Sheet: extra misc monument cost starts blank (placeholder "0"), not a real pre-filled zero', () => {
  it('the input starts empty and shows "0" only as placeholder hint text', async () => {
    const { CostSheet } = await import('../components/CostSheet.jsx');
    render(<CostSheet query={{ id: 'UTQ-2026-800', groupName: 'Test' }} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const input = screen.getByPlaceholderText('Extra misc monument');
    expect(input.value).toBe(''); // blank, not "0"
    expect(input.placeholder).toBe('Extra misc monument');
  });
});
