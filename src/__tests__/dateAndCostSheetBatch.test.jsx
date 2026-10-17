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
