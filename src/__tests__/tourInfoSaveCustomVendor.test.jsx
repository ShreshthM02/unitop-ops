import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ versions: [] }));
vi.mock('../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadQuotationVersions: vi.fn(async () => h.versions),
}));

import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';
import { entryServiceName, getServicesForDate } from '../lib/tourInfo.js';

const query = { id: 'UTQ-2026-060', tourFileId: 'TF-2026-060', groupName: 'G', status: 'operations', manualWF: [], audit: [], remarks: [], nights: 2, pax: 10, travelDate: '2026-10-01' };
const vendors = [
  { id: 'V1', name: 'Delhi Coaches', type: 'Transport', active: true },
  { id: 'V2', name: 'Raj Facilitators', type: 'Tour Facilitator', active: true },
];
const blankTE = { queryId: query.id, days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
const props = (over = {}) => ({
  query, onClose: () => {}, onConvert: () => {}, onAdvance: () => {}, onGenerateQuote: () => {},
  onToggleWF: () => {}, onCancel: () => {}, onUpdateRemarks: () => {}, currentUser: { id: 1, name: 'Test' },
  tourExecution: blankTE, vendors, onUpdateTourExecution: () => Promise.resolve({ error: null }), ...over,
});
beforeEach(() => { h.versions = []; });

// Stands in for UnitopApp: keeps the saved record in state and hands it back
// as the tourExecution prop, the way the real parent does after a save.
function Parent({ onUpdate, result = { error: null } }) {
  const [te, setTe] = useState(blankTE);
  return <QueryDrawerWithQuote {...props({ tourExecution: te, onUpdateTourExecution: (id, data, label) => { onUpdate(id, data, label); if (!result.error) setTe(data); return Promise.resolve(result); } })} />;
}

describe('Save bar on Itinerary, Hotels + Meals and Others', () => {
  it.each([
    ['Day-wise Itinerary', 'Save Itinerary', () => fireEvent.click(screen.getByText('+ Add Day'))],
    ['Hotels + Meals', 'Save Hotels + Meals', () => fireEvent.click(screen.getByText('+ Add row'))],
    ['Others', 'Save Others', () => fireEvent.click(screen.getByText('+ Add Transporter'))],
  ])('%s: Save is visible from the start, disabled until a change, then saves', async (tab, label, change) => {
    const onUpdate = vi.fn(() => Promise.resolve({ error: null }));
    render(<Parent onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText(tab));
    const btn = screen.getByText(`💾 ${label}`);
    expect(btn.disabled).toBe(true);
    change();
    expect(screen.getByText(`💾 ${label}`).disabled).toBe(false);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByText(`💾 ${label}`));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe(query.id);
    await waitFor(() => expect(screen.getByText('✓ All changes saved')).toBeTruthy());
  });

  it('shows a failure message (not "saved") when the save returns an error', async () => {
    const onUpdate = vi.fn();
    render(<Parent onUpdate={onUpdate} result={{ error: 'boom' }} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    fireEvent.click(screen.getByText('+ Add Day'));
    fireEvent.click(screen.getByText('💾 Save Itinerary'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(screen.queryByText('✓ All changes saved')).toBeNull();
    // the parent kept the old record, so the bar correctly still reads unsaved
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('a save made on one tab saves edits made on another tab too (one working copy)', () => {
    const onUpdate = vi.fn(() => Promise.resolve({ error: null }));
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    fireEvent.click(screen.getByText('+ Add Day'));
    fireEvent.click(screen.getByText('Hotels + Meals'));
    fireEvent.click(screen.getByText('💾 Save Hotels + Meals'));
    expect(onUpdate.mock.calls[0][1].days.length).toBe(1);
  });

  it('no Save bar on a cancelled tour file', () => {
    render(<QueryDrawerWithQuote {...props({ query: { ...query, cancelled: true } })} />);
    fireEvent.click(screen.getByText('Hotels + Meals'));
    expect(screen.queryByText('💾 Save Hotels + Meals')).toBeNull();
  });
});

describe('Custom (typed) vendor names in Others', () => {
  it('picking "Other" reveals a name box and saves customName with no vendorId', () => {
    const onUpdate = vi.fn(() => Promise.resolve({ error: null }));
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    fireEvent.click(screen.getByText('Others'));
    fireEvent.click(screen.getByText('+ Add Transporter'));
    expect(screen.queryByLabelText('Custom name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: 'Local Tempo Union' } });
    fireEvent.click(screen.getByText('💾 Save Others'));
    const t = onUpdate.mock.calls[0][1].transporters[0];
    expect(t.vendorId).toBe('');
    expect(t.customName).toBe('Local Tempo Union');
  });

  it('works for facilitators and local handlers too, and picking a real vendor clears the custom name', () => {
    const onUpdate = vi.fn(() => Promise.resolve({ error: null }));
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    fireEvent.click(screen.getByText('Others'));
    fireEvent.click(screen.getByText('+ Add Facilitator'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    const selects = screen.getAllByLabelText('Vendor');
    expect(selects.length).toBe(2);
    fireEvent.change(selects[0], { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: 'Ravi' } });
    fireEvent.change(screen.getAllByLabelText('Vendor')[0], { target: { value: 'V2' } });
    expect(screen.queryByLabelText('Custom name')).toBeNull();
    fireEvent.change(screen.getAllByLabelText('Vendor')[1], { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: 'Mohan Travels' } });
    fireEvent.click(screen.getByText('💾 Save Others'));
    const te = onUpdate.mock.calls[0][1];
    expect(te.facilitators[0].vendorId).toBe('V2');
    expect(te.facilitators[0].customName).toBeUndefined();
    expect(te.localHandlers[0].customName).toBe('Mohan Travels');
  });

  it('reopening a saved custom entry shows it in custom mode with the typed name', () => {
    const te = { ...blankTE, transporters: [{ id: 1, vendorId: '', customName: 'Local Tempo Union', startDate: '2026-10-01', endDate: '2026-10-02' }] };
    render(<QueryDrawerWithQuote {...props({ tourExecution: te })} />);
    fireEvent.click(screen.getByText('Others'));
    expect(screen.getByLabelText('Custom name').value).toBe('Local Tempo Union');
  });
});

describe('entryServiceName / Ground View resolution', () => {
  it('prefers the vendor name, falls back to the typed name, else empty', () => {
    expect(entryServiceName({ vendorId: 'V1' }, vendors)).toBe('Delhi Coaches');
    expect(entryServiceName({ vendorId: '', customName: '  Tempo  ' }, vendors)).toBe('Tempo');
    expect(entryServiceName({ vendorId: '' }, vendors)).toBe('');
    expect(entryServiceName({ vendorId: 'GONE', customName: 'Fallback' }, vendors)).toBe('Fallback');
  });
  it('a custom-named service shows for its dates on Ground View data', () => {
    const te = { transporters: [{ vendorId: '', customName: 'Tempo', startDate: '2026-10-01', endDate: '2026-10-02' }], facilitators: [], localHandlers: [] };
    expect(getServicesForDate(te, vendors, '2026-10-01').transporters.map(x => x.name)).toEqual(['Tempo']);
    expect(getServicesForDate(te, vendors, '2026-10-05').transporters).toEqual([]);
  });
});
