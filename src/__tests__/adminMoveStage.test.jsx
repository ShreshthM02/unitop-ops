import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const tourFileQuery = {
  id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Test Group', status: 'completed',
  cancelled: false, manualWF: [], audit: [], remarks: [],
};

const adminUser = { id: 1, name: 'Priya', role: 'admin' };
const opsUser = { id: 2, name: 'Ravi', role: 'ops' };

const baseProps = {
  query: tourFileQuery, onClose:()=>{}, onConvert:()=>{}, onAdvance:()=>{}, onGenerateQuote:()=>{}, onToggleWF:()=>{},
  onCancel:()=>{}, onUpdateRemarks:()=>{}, onUpdateQuery:()=>{}, onRecoverQuery:()=>{}, staff:[],
};

describe('Admin-only "Move to Any Stage" — visibility gated by real permission, not just role string', () => {
  it('shows the button for a user with the force_move_stage permission (admin by default)', () => {
    render(<QueryDrawerWithQuote {...baseProps} currentUser={adminUser} onForceMoveStage={()=>{}}/>);
    expect(screen.getByText(/Admin: Move to Any Stage/)).toBeTruthy();
  });

  it('does NOT show the button for a user without the permission (ops role)', () => {
    render(<QueryDrawerWithQuote {...baseProps} currentUser={opsUser} onForceMoveStage={()=>{}}/>);
    expect(screen.queryByText(/Admin: Move to Any Stage/)).toBeNull();
  });

  it('does not show for a plain query (not yet a tour file)', () => {
    const plainQuery = { ...tourFileQuery, tourFileId: undefined };
    render(<QueryDrawerWithQuote {...baseProps} query={plainQuery} currentUser={adminUser} onForceMoveStage={()=>{}}/>);
    expect(screen.queryByText(/Admin: Move to Any Stage/)).toBeNull();
  });

  it('does not show for a cancelled tour file (that has its own Recover flow instead)', () => {
    const cancelledQuery = { ...tourFileQuery, cancelled: true };
    render(<QueryDrawerWithQuote {...baseProps} query={cancelledQuery} currentUser={adminUser} onForceMoveStage={()=>{}}/>);
    expect(screen.queryByText(/Admin: Move to Any Stage/)).toBeNull();
    expect(screen.getByText(/Recover this Tour File/)).toBeTruthy();
  });
});

describe('Admin move: requires a reason, blocks a no-op move, calls through correctly', () => {
  it('opens the form and shows all pipeline stages as options', () => {
    render(<QueryDrawerWithQuote {...baseProps} currentUser={adminUser} onForceMoveStage={()=>{}}/>);
    fireEvent.click(screen.getByText(/Admin: Move to Any Stage/));
    expect(screen.getByText('Move to Any Stage (Admin Override)')).toBeTruthy();
    const select = screen.getByText('Move to stage').closest('div').parentElement.querySelector('select');
    const optionLabels = Array.from(select.options).map(o => o.textContent);
    expect(optionLabels.some(l => l.includes('New Query'))).toBe(true);
    expect(optionLabels.some(l => l.includes('Costing'))).toBe(true);
    expect(optionLabels.some(l => l.includes('Operations'))).toBe(true);
    expect(optionLabels.some(l => l.includes('Finance'))).toBe(true);
  });

  it('blocks confirming without a reason', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<QueryDrawerWithQuote {...baseProps} currentUser={adminUser} onForceMoveStage={()=>{}}/>);
    fireEvent.click(screen.getByText(/Admin: Move to Any Stage/));
    fireEvent.click(screen.getByText('Confirm Move'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('reason'));
    window.alert.mockRestore();
  });

  it('calls onForceMoveStage with query id, target stage, and reason when valid', () => {
    const onForceMoveStage = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} currentUser={adminUser} onForceMoveStage={onForceMoveStage}/>);
    fireEvent.click(screen.getByText(/Admin: Move to Any Stage/));
    fireEvent.change(screen.getByPlaceholderText(/Moved to Completed by mistake/), { target: { value: 'Accidentally advanced too far' } });
    const select = screen.getByText('Move to stage').closest('div').parentElement.querySelector('select');
    fireEvent.change(select, { target: { value: 'operations' } });
    fireEvent.click(screen.getByText('Confirm Move'));
    expect(onForceMoveStage).toHaveBeenCalledWith('UTQ-1', 'operations', 'Accidentally advanced too far');
  });
});

describe('handleForceMoveStage in UnitopApp.jsx: real permission check + distinct audit wording', () => {
  it('checks getPermissions(currentUser).force_move_stage before proceeding, not just trusting the UI', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf-8');
    const fnMatch = src.match(/const handleForceMoveStage = \(queryId, targetStatus, reason\) => \{[\s\S]*?\n  \};/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch[0]).toContain('getPermissions(currentUser).force_move_stage');
    expect(fnMatch[0]).toContain('ADMIN OVERRIDE');
    expect(fnMatch[0]).toContain('Reason: ${reason}');
    expect(fnMatch[0]).toContain('saveQueryToDB');
  });
});
