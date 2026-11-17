import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeCalculators, lineCostFor, withCells, appliedSlabIds } from '../lib/costSheetCalc.js';
import { calcCostSheetSlabFinalPrice, calcCostSheetTlSlabFinalPrice } from '../lib/utils.js';
import { CostSheet } from '../components/CostSheet.jsx';

const base = { gst: 5, markup: 15, roe: 85, tlMode: 'lumpsum', tlCost: '', miscMode: 'lumpsum', miscCost: '', monMode: 'pp', monuments: [], monExtra: '' };
const slabs = [{ id: 1, label: '10 pax', foc: 10 }, { id: 2, label: '20 pax', foc: 20 }];
const days = [{ mealCost: '500', hotelNetPP: '4000', singleSupp: '1500' }];

describe('per-slab cost lines: pricing', () => {
  it('a line with no per-slab figures prices the same as before (same cost on every slab)', () => {
    const snap = { ...base, days, slabs, transports: [{ id: 1, cost: '30000', slabs: [1, 2] }], localHandlers: [{ id: 1, cost: '600', mode: 'pp' }, { id: 2, cost: '10000', mode: 'lumpsum' }], extras: [{ id: 1, cost: '5000', mode: 'Lumpsum' }, { id: 2, cost: '200', mode: 'PP' }] };
    const { calcSlab } = makeCalculators({ ...snap, totals: undefined });
    const c = calcSlab(slabs[0]);
    expect(c.tptPP).toBe(3000);              // 30000 / 10
    expect(c.localPP).toBe(1600);            // 600 + 10000/10
    expect(c.extrasPP).toBe(700);            // 5000/10 + 200
  });

  it('an old transport (slab list, no cells) and its converted form price identically', () => {
    const old = { id: 1, cost: '30000', slabs: [2] };
    const conv = withCells(old, [1, 2], 'transport');
    expect(conv.cells).toEqual({ 1: 'x' });
    expect(conv.slabs).toBeUndefined();
    for (const id of [1, 2]) expect(lineCostFor(conv, id, 'transport')).toBe(lineCostFor(old, id, 'transport'));
    expect(appliedSlabIds(conv, [1, 2], 'transport')).toEqual([2]);
  });

  it('a different figure for one slab is used for that slab only; x leaves a slab out', () => {
    const t = { id: 1, cost: '30000', cells: { 2: '45000' } };
    const lh = { id: 2, cost: '600', mode: 'pp', cells: { 1: 'x' } };
    const snap = { ...base, days, slabs, transports: [t], localHandlers: [lh], extras: [] };
    const { calcSlab } = makeCalculators(snap);
    expect(calcSlab(slabs[0]).tptPP).toBe(3000);
    expect(calcSlab(slabs[1]).tptPP).toBe(2250);   // 45000 / 20
    expect(calcSlab(slabs[0]).localPP).toBe(0);    // left out of the 10 pax slab
    expect(calcSlab(slabs[1]).localPP).toBe(600);
  });

  it('Quotation prices (utils) agree with the Cost Sheet maths for per-slab figures, group and T/L slabs', () => {
    const tl = { id: 9, label: '8 + T/L', pax: 8, costs: { hotel: '8000' }, includes: { hotel: true } };
    const snap = { ...base, days, slabs, tlSlabs: [tl], transports: [{ id: 1, cost: '30000', cells: { 2: '45000', 9: 'x' } }], localHandlers: [{ id: 2, cost: '9000', mode: 'lumpsum', cells: { 9: '12000' } }], extras: [{ id: 3, cost: '300', mode: 'PP', cells: { 1: 'x' } }] };
    const { calcSlab, calcTlSlab } = makeCalculators(snap);
    for (const s of slabs) expect(calcCostSheetSlabFinalPrice(snap, s).finalFX).toBe(calcSlab(s).finalFX);
    expect(calcCostSheetTlSlabFinalPrice(snap, tl).finalFX).toBe(calcTlSlab(tl).finalFX);
    expect(calcTlSlab(tl).surchargePP).toBe(1000);  // 8000 / 8
  });
});

describe('Pricing matrix on screen', () => {
  const q = { id: 'UTQ-2026-777', tourFileId: 'TF-777', groupName: 'Matrix Test', nights: 3 };
  it('shows every slab as a column with its label, paying pax and vehicle fields', () => {
    render(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.getAllByLabelText('Slab label').length).toBe(5);
    expect(screen.getAllByLabelText('FOC (N paying)').length).toBe(5);
    expect(screen.getAllByLabelText('Vehicle (label only)').length).toBe(5);
  });
  it('typing in one slab\'s cell prices only that slab, "x" leaves one out', () => {
    render(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.change(screen.getAllByLabelText('Cost, same for every slab').pop(), { target: { value: '1000' } });
    const first = screen.getAllByLabelText(/pax \+ 1 FOC cost/)[0];
    fireEvent.change(first, { target: { value: 'x' } });
    expect(first.value).toBe('–');
    fireEvent.change(first, { target: { value: '' } });
    expect(first.value).toBe('');
  });
  it('the monument mode toggle now lives with Monuments / Activities, not in Settings', () => {
    render(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.getAllByText('Monument Fees Mode').length).toBe(1);
    const monHeading = screen.getByText(/Monuments \/ Activities/);
    const settingsHeading = screen.getByText('Settings');
    const label = screen.getByText('Monument Fees Mode');
    expect(monHeading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settingsHeading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
