import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const operationsQuery = {
  id: 'UTQ-2026-038', tourFileId: 'TF-2026-038', groupName: 'Mueller Reisen GmbH',
  status: 'operations', manualWF: [], audit: [], remarks: [], cancelled: false,
};

const baseProps = {
  query: operationsQuery, onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
  onCancel: ()=>{}, onUpdateRemarks: ()=>{}, onUpdateQuery: ()=>{}, currentUser: { id:1, name:'Test' },
  tourExecution: { facilitators: [], localHandlers: [], flights: [], days: [] },
};

describe('Workflow tracker: an "Operations" status query no longer falsely shows undone work as complete', () => {
  it('Vouchers Issued, Meal Plan Generated, and Services Tracked show as PENDING, not auto-done, with none of the real work actually done', () => {
    render(<QueryDrawerWithQuote {...baseProps} onToggleWF={()=>{}} costSheetExists={false} quotationExists={false} hasPayments={false}/>);
    fireEvent.click(screen.getByText(/12\/17|17/)); // open Progress tab
    expect(screen.getByText('Vouchers issued')).toBeTruthy();
    expect(screen.getByText('Meal plan generated')).toBeTruthy();
    expect(screen.getByText('Services status tracked')).toBeTruthy();
    // None of these three should show the misleading "auto" badge
    const stepRows = ['Vouchers issued', 'Meal plan generated', 'Services status tracked'].map(
      label => screen.getByText(label).closest('.wf-step')
    );
    stepRows.forEach(row => {
      expect(row.textContent).not.toContain('auto');
    });
  });

  it('Cost Sheet Prepared shows auto-done ONLY when a real cost sheet actually exists', () => {
    const { rerender } = render(<QueryDrawerWithQuote {...baseProps} onToggleWF={()=>{}} costSheetExists={false} quotationExists={false} hasPayments={false}/>);
    fireEvent.click(screen.getByText(/\/17/));
    let row = screen.getByText('Cost sheet prepared').closest('.wf-step');
    expect(row.textContent).not.toContain('auto');

    rerender(<QueryDrawerWithQuote {...baseProps} onToggleWF={()=>{}} costSheetExists={true} quotationExists={false} hasPayments={false}/>);
    row = screen.getByText('Cost sheet prepared').closest('.wf-step');
    expect(row.textContent).toContain('auto');
  });

  it('every step, including auto-detected ones, is clickable (the old code blocked clicking auto steps entirely)', () => {
    const onToggleWF = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onToggleWF={onToggleWF} costSheetExists={true} quotationExists={false} hasPayments={false}/>);
    fireEvent.click(screen.getByText(/\/17/));
    const costSheetRow = screen.getByText('Cost sheet prepared').closest('.wf-step');
    fireEvent.click(costSheetRow);
    expect(onToggleWF).toHaveBeenCalledWith(4); // Cost sheet prepared is step 4
  });

  it('clicking a pending step (e.g. Vouchers Issued) calls onToggle so it can be manually confirmed', () => {
    const onToggleWF = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} onToggleWF={onToggleWF} costSheetExists={false} quotationExists={false} hasPayments={false}/>);
    fireEvent.click(screen.getByText(/\/17/));
    const vouchersRow = screen.getByText('Vouchers issued').closest('.wf-step');
    fireEvent.click(vouchersRow);
    expect(onToggleWF).toHaveBeenCalledWith(10); // Vouchers issued is step 10
  });

  it('a step manually marked done shows "confirmed", not "auto" (the source is honestly labeled)', () => {
    const manuallyConfirmed = { ...operationsQuery, manualWF: [{ step: 10, done: true }] };
    render(<QueryDrawerWithQuote {...baseProps} query={manuallyConfirmed} onToggleWF={()=>{}} costSheetExists={false} quotationExists={false} hasPayments={false}/>);
    fireEvent.click(screen.getByText(/\/17/));
    const row = screen.getByText('Vouchers issued').closest('.wf-step');
    expect(row.textContent).toContain('confirmed');
    expect(row.textContent).not.toContain('auto');
  });

  it('the progress count only reflects steps that are genuinely done (auto with real data, or manually confirmed) -- not the old "12/17 just because status is operations" count', () => {
    render(<QueryDrawerWithQuote {...baseProps} onToggleWF={()=>{}} costSheetExists={false} quotationExists={false} hasPayments={false}/>);
    // Only steps 1 and 2 are unconditionally auto-true; nothing else has real data behind it
    expect(screen.getByText(/2\/17/)).toBeTruthy();
  });
});
