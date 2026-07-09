import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const cancelledQuery = {
  id: 'UTQ-2026-500', tourFileId: 'TF-2026-500', groupName: 'Cancelled Test Group',
  status: 'operations', cancelled: true, cancellationReason: 'Client postponed indefinitely',
  manualWF: [], audit: [{ by: 'Priya', at: '2026-08-01', action: 'CANCELLED — Reason: Client postponed indefinitely' }],
  remarks: [],
};

const baseProps = {
  query: cancelledQuery, onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
  onToggleWF: vi.fn(), onCancel: ()=>{}, onUpdateRemarks: ()=>{}, onUpdateQuery: ()=>{},
  currentUser: { id:1, name:'Priya' }, costSheetExists: false, quotationExists: false, hasPayments: false,
};

describe('Cancelled query drawer: locked down except recovery', () => {
  it('does not show the Cancel button (already cancelled) or the Edit Details button', () => {
    render(<QueryDrawerWithQuote {...baseProps}/>);
    expect(screen.queryByText(/✕ Cancel this/)).toBeNull();
    expect(screen.queryByText(/✏ Edit Tour Details/)).toBeNull();
  });

  it('shows the Recover button instead', () => {
    render(<QueryDrawerWithQuote {...baseProps}/>);
    expect(screen.getByText(/🔄 Recover this Tour File/)).toBeTruthy();
  });

  it('the workflow toggle is disabled for a cancelled query -- clicking a step does not call onToggleWF', () => {
    const onToggleWF = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onToggleWF={onToggleWF}/>);
    fireEvent.click(screen.getByText(/\/17/));
    const stepRow = document.querySelector('.wf-step');
    fireEvent.click(stepRow);
    expect(onToggleWF).not.toHaveBeenCalled();
  });

  it('a non-cancelled query still shows Edit Details and Cancel normally (no regression)', () => {
    const activeQuery = { ...cancelledQuery, cancelled: false };
    render(<QueryDrawerWithQuote {...baseProps} query={activeQuery}/>);
    expect(screen.getByText(/✏ Edit Tour Details/)).toBeTruthy();
    expect(screen.getByText(/✕ Cancel this/)).toBeTruthy();
    expect(screen.queryByText(/🔄 Recover this/)).toBeNull();
  });
});

describe('Cancelled query cards are actually clickable (the original reported bug)', () => {
  it('UnitopApp.jsx wires an onClick to open the drawer on the cancelled-query card', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf-8');
    const anchorIndex = src.indexOf('queries.filter(q=>q.cancelled).map(q=>(');
    expect(anchorIndex).toBeGreaterThan(-1);
    const nearbySlice = src.slice(anchorIndex, anchorIndex + 300);
    expect(nearbySlice).toContain('onClick={()=>setActiveQuery(q)}');
  });
});

describe('Recovery flow: reason required, moves to chosen stage, logs to audit', () => {
  it('clicking Recover opens the form with a reason field and stage selector', () => {
    render(<QueryDrawerWithQuote {...baseProps}/>);
    fireEvent.click(screen.getByText(/🔄 Recover this Tour File/));
    expect(screen.getByPlaceholderText(/Client reconfirmed/)).toBeTruthy();
    expect(screen.getByText('Move to stage')).toBeTruthy();
  });

  it('confirming without a reason is blocked with a warning, and onRecoverQuery is never called', () => {
    const onRecoverQuery = vi.fn();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<QueryDrawerWithQuote {...baseProps} onRecoverQuery={onRecoverQuery}/>);
    fireEvent.click(screen.getByText(/🔄 Recover this Tour File/));
    fireEvent.click(screen.getByText('Confirm Recovery'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('reason'));
    expect(onRecoverQuery).not.toHaveBeenCalled();
    window.alert.mockRestore();
  });

  it('confirming with a reason and a chosen stage calls onRecoverQuery with the right arguments', () => {
    const onRecoverQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onRecoverQuery={onRecoverQuery}/>);
    fireEvent.click(screen.getByText(/🔄 Recover this Tour File/));
    fireEvent.change(screen.getByPlaceholderText(/Client reconfirmed/), { target: { value: 'Client reconfirmed the booking' } });
    const stageSelect = screen.getByText('Move to stage').parentElement.querySelector('select');
    fireEvent.change(stageSelect, { target: { value: 'finance' } });
    fireEvent.click(screen.getByText('Confirm Recovery'));
    expect(onRecoverQuery).toHaveBeenCalledWith('UTQ-2026-500', 'Client reconfirmed the booking', 'finance');
  });

  it('the stage selector offers all pipeline stages, not just a fixed subset', () => {
    render(<QueryDrawerWithQuote {...baseProps}/>);
    fireEvent.click(screen.getByText(/🔄 Recover this Tour File/));
    const stageSelect = screen.getByText('Move to stage').parentElement.querySelector('select');
    const optionLabels = Array.from(stageSelect.options).map(o => o.textContent);
    expect(optionLabels).toContain('New Query');
    expect(optionLabels).toContain('Costing & Quote');
    expect(optionLabels).toContain('Operations');
    expect(optionLabels).toContain('Finance');
    expect(optionLabels).toContain('Completed');
  });
});
