import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewQueryModal from '../components/NewQueryModal.jsx';
import KanbanView from '../components/KanbanView.jsx';

vi.mock('../lib/supabase.js', () => ({ db: { from: () => ({ select:()=>({eq:()=>({order:async()=>({data:[]})})}) }) }, realtimeClient: null }));

// Root-cause fix (2026-09-29 follow-up to v1.58.0): nextDocNumberAtomic
// added a real network round-trip before a new query/tour-file conversion
// commits to local state, and neither of these buttons ever disabled
// themselves while that round-trip was in flight -- a double-click could
// silently create a real, fully-valid DUPLICATE query, which is what
// showed up as "the Recent Queries widget is disturbed right after
// creating one query." These tests cover the visible half of the fix
// (the buttons); the authoritative guard lives in UnitopApp.jsx's
// newQueryInFlightRef / convertInFlightRef, which isn't unit-testable in
// isolation from the rest of that component.

describe('NewQueryModal: double-submit guard', () => {
  const fillRequired = () => {
    fireEvent.change(screen.getByPlaceholderText('e.g. NCH Holidays'), { target: { value: 'Acme Travels' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Golden Triangle, Buddhist Circuit'), { target: { value: 'Rajasthan' } });
  };

  it('calls onSave only once even if the Save button is clicked twice before the first call resolves', async () => {
    let resolveSave;
    const onSave = vi.fn(() => new Promise(res => { resolveSave = res; }));
    render(<NewQueryModal onClose={()=>{}} onSave={onSave} nextId="QRY-2026-001" agents={[]} staff={[]}/>);
    fillRequired();
    const saveBtn = screen.getByText('Save & Acknowledge ↗');
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn); // second click while the first save is still pending
    fireEvent.click(saveBtn); // and a third, for good measure
    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave();
    await waitFor(() => {}); // let the resolved promise's .finally run
  });

  it('disables the Save button and shows progress text while a save is in flight', async () => {
    let resolveSave;
    const onSave = vi.fn(() => new Promise(res => { resolveSave = res; }));
    render(<NewQueryModal onClose={()=>{}} onSave={onSave} nextId="QRY-2026-001" agents={[]} staff={[]}/>);
    fillRequired();
    fireEvent.click(screen.getByText('Save & Acknowledge ↗'));
    expect(await screen.findByText('Saving…')).toBeTruthy();
    expect(screen.getByText('Saving…').closest('button').disabled).toBe(true);
    resolveSave();
    await waitFor(() => expect(screen.getByText('Save & Acknowledge ↗')).toBeTruthy());
  });
});

describe('KanbanView: Convert to Tour File double-submit guard', () => {
  const baseQuery = { id: 'QRY-2026-001', groupName: 'Test Group', status: 'operations', tourFileId: null };

  it('calls onConvert only once for the same card even if clicked twice before the first call resolves', async () => {
    let resolveConvert;
    const onConvert = vi.fn(() => new Promise(res => { resolveConvert = res; }));
    render(<KanbanView queries={[baseQuery]} onOpenQuery={()=>{}} onConvert={onConvert} onStatusChange={()=>{}} staff={[]}/>);
    const btn = screen.getByText('📁 Convert to Tour File');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConvert).toHaveBeenCalledTimes(1);
    resolveConvert();
    await waitFor(() => {});
  });

  it('shows "Converting…" and disables the button while the conversion is in flight', async () => {
    let resolveConvert;
    const onConvert = vi.fn(() => new Promise(res => { resolveConvert = res; }));
    render(<KanbanView queries={[baseQuery]} onOpenQuery={()=>{}} onConvert={onConvert} onStatusChange={()=>{}} staff={[]}/>);
    fireEvent.click(screen.getByText('📁 Convert to Tour File'));
    expect(await screen.findByText('Converting…')).toBeTruthy();
    expect(screen.getByText('Converting…').disabled).toBe(true);
    resolveConvert();
    await waitFor(() => expect(screen.getByText('📁 Convert to Tour File')).toBeTruthy());
  });
});
