import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderOpen } from './helpers/matrix.js';
import { makeCalculators, lineCostFor, withCells, appliedSlabIds, ssBuild } from '../lib/costSheetCalc.js';
import { calcCostSheetSlabFinalPrice, calcCostSheetTlSlabFinalPrice, calcCostSheetSingleSupplementFX } from '../lib/utils.js';
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
    renderOpen(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.getAllByLabelText('Slab label').length).toBe(5);
    expect(screen.getAllByLabelText('FOC (N paying)').length).toBe(5);
    expect(screen.getAllByLabelText('Vehicle (label only)').length).toBe(5);
  });
  it('typing in one slab\'s cell prices only that slab, "x" leaves one out', () => {
    renderOpen(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.change(screen.getAllByLabelText('Cost, same for every slab').pop(), { target: { value: '1000' } });
    const first = screen.getAllByLabelText(/pax \+ 1 FOC cost/)[0];
    fireEvent.change(first, { target: { value: 'x' } });
    expect(first.value).toBe('–');
    fireEvent.change(first, { target: { value: '' } });
    expect(first.value).toBe('');
  });
  it('the monument mode toggle now lives with Monuments / Activities, not in Settings', () => {
    renderOpen(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.getAllByText('Monument Fees Mode').length).toBe(1);
    const monHeading = screen.getByText(/Monuments \/ Activities/);
    const settingsHeading = screen.getByText('Settings');
    const label = screen.getByText('Monument Fees Mode');
    expect(monHeading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settingsHeading.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

import { explodeLines } from '../lib/costSheetXlsx.js';
import { matrixSpans } from '../lib/costSheetCalc.js';

describe('Excel export: per-slab figures become ordinary "Applies to" rows that add up to the same prices', () => {
  const entries = [{ src: { id: 1 }, name: '10 pax' }, { src: { id: 2 }, name: '15 pax' }, { src: { id: 3 }, name: '20 pax' }];
  it('one figure for every slab stays a single "All" row', () => {
    const rows = explodeLines([{ cost: '600', mode: 'pp', cells: {} }], 'local', entries, () => 'Jaipur');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ applies: 'All', cost: 600 });
  });
  it('a different figure for one slab, and a left-out slab, give one row per figure naming its slabs', () => {
    const line = { sector: 'Agra', cost: '18000', mode: 'lumpsum', singleSupp: '900', cells: { 1: '21000', 3: 'x' } };
    const rows = explodeLines([line], 'local', entries, (l) => l.sector);
    expect(rows.map(r => [r.cost, r.applies])).toEqual([[21000, '10 pax'], [18000, '15 pax']]);
    expect(rows.map(r => r.first)).toEqual([true, false]);   // single supplement is counted once
  });
  it('the rows reproduce the app\'s per-pax figure for every slab', () => {
    const line = { cost: '18000', mode: 'lumpsum', cells: { 1: '21000', 3: 'x' } };
    const slabs = [{ id: 1, foc: 10 }, { id: 2, foc: 15 }, { id: 3, foc: 20 }];
    const { calcSlab } = makeCalculators({ ...base, days, slabs, transports: [], localHandlers: [line], extras: [] });
    const rows = explodeLines([line], 'local', entries, () => 'x');
    slabs.forEach((s, i) => {
      const fromRows = rows.filter(r => r.applies === 'All' || r.applies.split(', ').includes(entries[i].name)).reduce((a, r) => a + r.cost / s.foc, 0);
      expect(Math.round(fromRows)).toBe(calcSlab(s).localPP);
    });
  });
});

describe('PDF / Story view: neighbouring slabs with the same whole cost join into one block', () => {
  it('joins equal neighbours, keeps a different slab apart, and marks left-out slabs', () => {
    const cols = [{ id: 1, pax: 10 }, { id: 2, pax: 10 }, { id: 3, pax: 10 }, { id: 4, pax: 10 }];
    const spans = matrixSpans({ cost: '9000', mode: 'lumpsum', cells: { 3: '12000', 4: 'x' } }, 'local', cols);
    expect(spans.map(s => [s.span, s.none ? 'none' : s.total])).toEqual([[2, 9000], [1, 12000], [1, 'none']]);
    expect(spans[0].pp).toBe(900);
    expect(spans[1].custom).toBe(true);
  });
  it('slabs with the same total but different paying pax are NOT joined (the per-pax figure differs)', () => {
    const spans = matrixSpans({ cost: '9000', mode: 'lumpsum', cells: {} }, 'local', [{ id: 1, pax: 10 }, { id: 2, pax: 20 }]);
    expect(spans).toHaveLength(2);
  });
});

describe('Foreign-currency cost line (FX)', () => {
  const sl = [{ id: 1, label: '10 pax', foc: 10 }, { id: 2, label: '20 pax', foc: 20 }];
  const mk = (extra) => makeCalculators({ ...base, days, slabs: sl, transports: [], localHandlers: [], extras: [extra] });
  it('a line with no fx prices exactly as before', () => {
    expect(mk({ id: 1, cost: '5000', mode: 'Lumpsum', cells: {} }).calcSlab(sl[0]).extrasPP).toBe(500);
  });
  it('EUR 1000 at ROE 95 adds Rs 95,000 as a group cost, divided by paying pax', () => {
    const c = mk({ id: 1, cost: '1000', mode: 'Lumpsum', cells: {}, fx: { cur: 'EUR', roe: '95' } });
    expect(c.calcSlab(sl[0]).extrasPP).toBe(9500);
    expect(c.calcSlab(sl[1]).extrasPP).toBe(4750);
  });
  it('a per-slab figure on an fx line is in the same foreign currency', () => {
    const c = mk({ id: 1, cost: '1000', mode: 'Lumpsum', cells: { 2: '2000' }, fx: { cur: 'EUR', roe: '95' } });
    expect(c.calcSlab(sl[1]).extrasPP).toBe(9500);
  });
  it('a missing ROE never zeroes the line (treated as rupees until filled)', () => {
    expect(lineCostFor({ cost: '700', cells: {}, fx: { cur: 'EUR', roe: '' } }, 1, 'extra')).toBe(700);
  });
  it('Quotation maths (utils) agree', () => {
    const snap = { ...base, days, slabs: sl, transports: [{ id: 1, cost: '400', cells: {}, fx: { cur: 'AED', roe: '23' } }], localHandlers: [], extras: [] };
    const { calcSlab } = makeCalculators(snap);
    expect(calcCostSheetSlabFinalPrice(snap, sl[0]).finalFX).toBe(calcSlab(sl[0]).finalFX);
    expect(calcSlab(sl[0]).tptPP).toBe(920);
  });
  it('PDF block names the foreign amount, ROE and rupee equivalent', () => {
    const spans = matrixSpans({ cost: '1000', mode: 'Lumpsum', cells: {}, fx: { cur: 'EUR', roe: '95' } }, 'extra', [{ id: 1, pax: 10 }]);
    expect(spans[0].total).toBe(95000);
    expect(spans[0].orig).toBe(1000);
  });
  it('Excel rows carry rupees and say which currency/ROE the label came from', () => {
    const entries = [{ src: { id: 1 }, name: '10 pax' }];
    const rows = explodeLines([{ sector: 'Jaipur', cost: '400', mode: 'lumpsum', cells: {}, fx: { cur: 'AED', roe: '23' } }], 'local', entries, (l) => l.sector);
    expect(rows[0].cost).toBe(9200);
    expect(rows[0].label).toBe('Jaipur [AED @ 23]');
  });
});

describe('FX control on screen', () => {
  const q = { id: 'UTQ-2026-778', tourFileId: 'TF-778', groupName: 'Fx Test', nights: 3 };
  it('is a small FX button; choosing a currency shows ROE, and the line shows the chip', () => {
    renderOpen(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    const btn = screen.getAllByLabelText('Foreign currency').pop();
    expect(btn.textContent).toBe('FX');
    fireEvent.click(btn);
    fireEvent.change(screen.getByLabelText('Quoted currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('ROE for this line'), { target: { value: '95' } });
    expect(screen.getAllByLabelText('Foreign currency').pop().textContent).toBe('EUR @ 95');
  });
});

describe('Single supplement column, collapsed sections, merged build-up', () => {
  const q = { id: 'UTQ-2026-779', tourFileId: 'TF-779', groupName: 'SS Test', nights: 3 };
  it('every matrix section starts collapsed, and adding a row opens its section', () => {
    render(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.queryByText('+ Add Transport')).toBeNull();
    expect(screen.getAllByText(/▸ Transport/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText(/▸ Transport/)[0]);
    expect(screen.getByText('+ Add Transport')).toBeTruthy();
  });
  it('the old separate Final Price Summary tables are gone; the story ends the matrix', () => {
    render(<CostSheet query={q} onClose={() => {}} onProceedToQuotation={() => {}} />);
    expect(screen.queryByText('Final Price Summary')).toBeNull();
    ['Sub-total per paying pax', 'GST 5%', 'After tax', 'Markup 15%', 'Selling price (₹)'].forEach(t => expect(screen.getByText(t)).toBeTruthy());
  });
  it('a local handler single supplement is typed on its own row and priced with the day-wise one', () => {
    const snap = { ...base, days: [{ mealCost: '', hotelNetPP: '4000', singleSupp: '1500' }], slabs, transports: [], extras: [], localHandlers: [{ id: 1, cost: '', mode: 'pp', singleSupp: '500', cells: {} }, { id: 2, cost: '', mode: 'pp', singleSupp: '10', cells: {}, fx: { cur: 'EUR', roe: '95' } }] };
    const { totals } = { totals: undefined };
    expect(ssBuild(1500 + 500 + 950, 5, 15, 85)).toMatchObject({ sub: 2950, tax: 148, finalFX: expect.any(Number) });
    expect(calcCostSheetSingleSupplementFX(snap)).toBe(ssBuild(1500 + 500 + 950, 5, 15, 85).finalFX);
  });
});
