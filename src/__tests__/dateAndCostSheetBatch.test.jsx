import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { formatDMY, parseDMY } from '../lib/dateUtils.js';
import DateInput from '../lib/DateInput.jsx';
import { VEHICLE_TYPES } from '../lib/constants.js';
import { useDragReorder } from '../lib/useDragReorder.jsx';

describe('dd/mm/yyyy dates', () => {
  it('formats ISO as dd/mm/yyyy', () => { expect(formatDMY('2026-10-05')).toBe('05/10/2026'); expect(formatDMY('')).toBe(''); });
  it('parses day-first text', () => {
    expect(parseDMY('5/10/2026')).toBe('2026-10-05');
    expect(parseDMY('05-10-2026')).toBe('2026-10-05');
    expect(parseDMY('31/02/2026')).toBe('');
    expect(parseDMY('junk')).toBe('');
  });
  it('DateInput shows dd/mm/yyyy and emits ISO', () => {
    let got = null;
    const { container } = render(<DateInput value="2026-10-05" onChange={e => { got = e.target.value; }} />);
    const txt = container.querySelector('input:not([type="date"])');
    expect(txt.value).toBe('05/10/2026');
    fireEvent.change(txt, { target: { value: '17/10/2026' } });
    expect(got).toBe('2026-10-17');
  });
});

describe('Urbania', () => { it('is a vehicle type', () => { expect(VEHICLE_TYPES).toContain('Urbania'); }); });

function Harness() {
  const [l, setL] = useState(['a', 'b', 'c']);
  const dr = useDragReorder(setL);
  return <div>{l.map((x, i) => <div key={x} data-testid={'r' + i} {...dr.row(i, {})}><span {...dr.grip(i)}>⠿</span>{x}</div>)}</div>;
}
describe('useDragReorder', () => {
  it('moves a row on drop', () => {
    render(<Harness />);
    fireEvent.mouseDown(screen.getAllByTitle('Drag to reorder')[0]);
    fireEvent.dragStart(screen.getByTestId('r0'));
    fireEvent.dragOver(screen.getByTestId('r2'));
    fireEvent.drop(screen.getByTestId('r2'));
    expect([0, 1, 2].map(i => screen.getByTestId('r' + i).textContent)).toEqual(['⠿b', '⠿c', '⠿a']);
  });
});

import { hotelPropertyLabel } from '../lib/utils.js';
import TeamView from '../components/TeamView.jsx';
import KanbanView from '../components/KanbanView.jsx';
import { vi } from 'vitest';
describe('batch 2/3', () => {
  it('"Similar" ends the hotel label by default and can be cleared', () => {
    expect(hotelPropertyLabel('Saura', '', undefined)).toBe('Saura / Similar');
    expect(hotelPropertyLabel('Saura', 'Tulip', undefined)).toBe('Saura / Tulip / Similar');
    expect(hotelPropertyLabel('Saura', 'Tulip', '')).toBe('Saura / Tulip');
    expect(hotelPropertyLabel('Saura', '', 'or similar')).toBe('Saura / or similar');
  });
  it('Team rows open the file drawer', () => {
    const q = { id: 'QRY-1', tourFileId: 'TF-1', clientName: 'A', assignedTo: 'u1', status: 'operations' };
    const h = vi.fn(); document.addEventListener('unitop-activate-query', h);
    render(<TeamView queries={[q]} staff={[{ id: 'u1', name: 'Priya', role: 'sales' }]} />);
    fireEvent.click(screen.getByTestId('team-query-row'));
    expect(h).toHaveBeenCalled(); expect(h.mock.calls[0][0].detail.query.id).toBe('QRY-1');
    document.removeEventListener('unitop-activate-query', h);
  });
  it('Kanban cards are in ascending file-number order', () => {
    const qs = ['QRY-2026-010', 'QRY-2026-002', 'QRY-2026-009'].map(id => ({ id, status: 'new_query', groupName: 'G' + id, clientName: 'c', audit: [], remarks: [] }));
    const { container } = render(<KanbanView queries={qs} onOpenQuery={() => {}} onConvert={() => {}} staff={[]} />);
    const txt = container.textContent;
    expect(txt.indexOf('QRY-2026-002')).toBeLessThan(txt.indexOf('QRY-2026-009'));
    expect(txt.indexOf('QRY-2026-009')).toBeLessThan(txt.indexOf('QRY-2026-010'));
  });
});
