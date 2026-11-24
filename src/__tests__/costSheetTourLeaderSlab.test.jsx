import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderOpen } from './helpers/matrix.js';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-500', tourFileId: 'TF-500', groupName: 'TL Slab Redesign Test', nights: 3 };

import { migrateTlSlabs, surchargeOf, tlBreakdown, makeCalculators } from '../lib/costSheetCalc.js';
import { calcCostSheetSlabFinalPrice, calcCostSheetTlSlabFinalPrice } from '../lib/utils.js';
import { openMatrixSections } from './helpers/matrix.js';

// One kind of slab. The tour leader surcharge is an optional, collapsed section
// that applies to any slab; it shows a value only for a slab that uses it.
describe('One kind of slab: a single "+ Add Slab", no separate T/L slab', () => {
  it('has no "+ Add T/L Slab" button and no T/L note', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.queryByText('+ Add T/L Slab')).toBeNull();
    expect(screen.queryByText(/For when no FOC policy applies/)).toBeNull();
    expect(screen.getByText('+ Add Slab')).toBeTruthy();
  });

  it('the tour leader surcharge section starts collapsed, saying none is used', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const row = screen.getByText(/Tour leader surcharge ·/);
    expect(row.textContent).toContain('▸');
    expect(row.textContent).toContain('none used');
    expect(screen.queryByLabelText('Hotel (tour leader)')).toBeNull();
  });

  it('opened, it has an input per part for every slab, and nothing is tinted yellow', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const slabCount = document.querySelectorAll('th [aria-label="Slab label"]').length;
    expect(screen.getAllByLabelText('Hotel (tour leader)').length).toBe(slabCount);
    expect(document.body.innerHTML).not.toMatch(/#FFF9E6|#fff9e6|F5D97A/i);
  });

  it('"+ Add Slab" adds one more column, and removing one leaves the others', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const before = document.querySelectorAll('th [aria-label="Slab label"]').length;
    fireEvent.click(screen.getByText('+ Add Slab'));
    expect(document.querySelectorAll('th [aria-label="Slab label"]').length).toBe(before + 1);
    const added = screen.getByDisplayValue('New Slab');
    fireEvent.click(added.closest('th').querySelector('[aria-label="Remove slab"]'));
    expect(document.querySelectorAll('th [aria-label="Slab label"]').length).toBe(before);
  });
});

describe('Surcharge on any slab: correct math (spread over that slab\'s paying pax only)', () => {
  it('typing a hotel cost on a slab shows its surcharge per paying pax in the section row', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const slabLabel = document.querySelector('th [aria-label="Slab label"]');
    const th = slabLabel.closest('th');
    const paxInput = th.querySelector('input[aria-label="FOC (N paying)"]');
    fireEvent.change(paxInput, { target: { value: '12' } });
    const col = Array.from(th.parentElement.children).indexOf(th);
    const hotel = screen.getAllByLabelText('Hotel (tour leader)')[0];
    fireEvent.change(hotel, { target: { value: '12000' } });
    const secRow = screen.getByText(/Tour leader surcharge ·/).closest('tr');
    expect(secRow.children[col].textContent).toContain('1,000');
  });

  it('shows "Set paying pax" instead of a bad number when pax is missing', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const th = document.querySelector('th [aria-label="Slab label"]').closest('th');
    fireEvent.change(th.querySelector('input[aria-label="FOC (N paying)"]'), { target: { value: '0' } });
    fireEvent.change(screen.getAllByLabelText('Hotel (tour leader)')[0], { target: { value: '5000' } });
    expect(screen.getByText(/Set paying pax/)).toBeTruthy();
  });

  it('a slab with no surcharge prices exactly as it always did', () => {
    const base = { transports: [], tlMode: 'pp', tlCost: 0, miscMode: 'pp', miscCost: 0, monMode: 'pp', localHandlers: [], extras: [], gst: 5, markup: 10, roe: 1, totals: { totMeal: 0, totHotel: 1000, totSS: 0, monTotal: 0 } };
    const { calcSlab } = makeCalculators(base);
    const plain = calcSlab({ id: 1, foc: 10 });
    const withEmpty = calcSlab({ id: 1, foc: 10, tlCosts: { hotel: '' }, tlIncludes: { hotel: true } });
    expect(withEmpty.finalFX).toBe(plain.finalFX);
    expect(plain.surchargePP).toBe(0);
  });

  it('the surcharge adds total / paying pax before GST and markup, and skips parts marked x', () => {
    const base = { transports: [], tlMode: 'pp', tlCost: 0, miscMode: 'pp', miscCost: 0, monMode: 'pp', localHandlers: [], extras: [], gst: 5, markup: 10, roe: 1, totals: { totMeal: 0, totHotel: 0, totSS: 0, monTotal: 0 } };
    const { calcSlab } = makeCalculators(base);
    const r = calcSlab({ id: 1, foc: 12, tlCosts: { hotel: '12000', meals: '999' }, tlIncludes: { hotel: true, meals: false } });
    expect(r.surchargeTotal).toBe(12000);
    expect(r.surchargePP).toBe(1000);
    expect(r.sub).toBe(1000);
    expect(r.sellingINR).toBe(Math.round(1050 + Math.round(1050 * 10 / 100)));
  });
});

describe('Older saved cost sheets: T/L slabs fold into the one list with identical prices', () => {
  const snap = {
    gst: 5, markup: 10, roe: 85, currency: 'US $', tlMode: 'lumpsum', tlCost: 15000, miscMode: 'pp', miscCost: 300, monMode: 'pp', monExtra: '', monuments: [],
    days: [{ id: 1, hotelNetPP: '4000', mealCost: '500', singleSupp: '2000' }],
    transports: [{ id: 31, cost: '90000', cells: { 21: 'x' } }, { id: 32, cost: '60000', cells: { 11: 'x' } }],
    localHandlers: [], extras: [],
  };
  const slabs = [{ id: 11, label: '10 pax', foc: 10, vehicle: 'Coach' }];
  const tl = [{ id: 21, label: '9 + 1 T/L', pax: 9, vehicle: 'Coach', costs: { hotel: '4000', meals: '500', transport: '' }, includes: { hotel: true, meals: true, transport: true } }];

  it('keeps ids, makes pax the slab pax, and moves the costs into the slab', () => {
    const merged = migrateTlSlabs(slabs, tl);
    expect(merged.map(x => x.id)).toEqual([11, 21]);
    expect(merged[1]).toMatchObject({ label: '9 + 1 T/L', foc: 9, tlCosts: { hotel: '4000', meals: '500' } });
    expect(surchargeOf(merged[1]).total).toBe(4500);
    expect(tlBreakdown(merged[1]).map(x => x.key)).toEqual(['hotel', 'meals']);
    expect(migrateTlSlabs(slabs, undefined)).toEqual(slabs);
  });

  it('every merged slab prices exactly as the old T/L calculation did (screen maths and quotation maths)', () => {
    const merged = migrateTlSlabs(slabs, tl);
    const totals = { totMeal: 500, totHotel: 4000, totSS: 2000, monTotal: 0 };
    const { calcSlab, calcTlSlab } = makeCalculators({ ...snap, totals });
    expect(calcSlab(merged[1]).finalFX).toBe(calcTlSlab(tl[0]).finalFX);
    expect(calcSlab(merged[1]).sellingINR).toBe(calcTlSlab(tl[0]).sellingINR);
    expect(calcCostSheetSlabFinalPrice(snap, merged[1]).finalFX).toBe(calcCostSheetTlSlabFinalPrice(snap, tl[0]).finalFX);
    expect(calcCostSheetSlabFinalPrice(snap, merged[0]).finalFX).toBe(calcCostSheetSlabFinalPrice(snap, slabs[0]).finalFX);
  });
});

describe('CostSheet: scroll anchoring disabled on the main content area (mitigates the "jumps to top" report when adding a slab)', () => {
  it('the fieldset has minHeight:0 -- the actual root cause fix. Without it, a flex:1 child in a column layout never shrinks to fit its container and never actually scrolls itself, silently pushing all scrolling onto the outer 100vh wrapper instead, which is what made the scroll position unstable when content was added', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const fieldset = document.querySelector('fieldset');
    expect(fieldset.style.minHeight).toBe('0px');
    expect(fieldset.style.overflowAnchor).toBe('none');
  });

  it('the outer panel wrapper no longer has its own overflow:auto competing with the fieldset for scroll responsibility', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const fieldset = document.querySelector('fieldset');
    const outer = fieldset.closest('div[style*="height: 100vh"]') || Array.from(document.querySelectorAll('div')).find(d => d.style.height === '100vh');
    expect(outer).toBeTruthy();
    expect(outer.style.overflowY).toBe('hidden');
  });

  it('directly restores fieldset scroll position after adding a slab -- the definitive fix, verified live in the browser to survive after two prior CSS-based theories did not', () => {
    renderOpen(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    const fieldset = document.querySelector('fieldset');
    Object.defineProperty(fieldset, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(fieldset, 'clientHeight', { value: 600, configurable: true });
    fieldset.scrollTop = 2000;
    expect(fieldset.scrollTop).toBe(2000);
    fireEvent.click(screen.getByText('+ Add Slab'));
    expect(fieldset.scrollTop).toBe(2000);
  });
});
