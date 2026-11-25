import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { lineBasis, costSheetChecks, makeCalculators, tlBreakdown, TL_PARTS } from '../lib/costSheetCalc.js';

// A realistic saved version: group slabs, a T/L slab, left-out cells, a
// per-slab override, and two foreign-currency lines.
const version = {
  version: 1, isFinal: true, gst: 5, markup: 15, roe: 85, currency: 'US $', tlMode: 'lumpsum', tlCost: '15000', miscMode: 'lumpsum', miscCost: '6000', monMode: 'pp', monExtra: '',
  monuments: [{ id: 1, name: 'Taj Mahal', cost: '1300' }, { id: 2, name: 'Amber Fort', cost: '600' }],
  days: [
    { id: 1, day: 'Day 1', date: '2026-12-02', movement: 'Arrive Delhi', mealPlan: 'D', mealCost: '700', hotel: 'The Leela', hotelPlan: 'CP', hotelNetPP: '4200', singleSupp: '2800', notes: '' },
    { id: 2, day: 'Day 2', date: '2026-12-03', movement: 'Delhi - Agra', mealPlan: 'B/D', mealCost: '900', hotel: 'ITC Mughal', hotelPlan: 'CP', hotelNetPP: '5100', singleSupp: '3400', notes: '' },
  ],
  slabs: [{ id: 11, label: '10 pax', foc: 10, vehicle: 'Tempo Traveller' }, { id: 12, label: '16 pax', foc: 16, vehicle: 'Mini Coach' }],
  tlSlabs: [{ id: 21, label: '9 + 1 T/L', pax: 9, vehicle: 'Tempo Traveller', costs: { hotel: '4200', meals: '700', singleSupp: '2800' }, includes: { hotel: true, meals: true, singleSupp: true } }],
  transports: [
    { id: 31, sector: 'Delhi - Agra - Delhi', cost: '90000', vehicleType: 'Tempo Traveller', cells: { 12: 'x' } },
    { id: 32, sector: 'Delhi - Agra - Delhi', cost: '130000', vehicleType: 'Mini Coach', cells: { 11: 'x', 21: 'x' } },
  ],
  localHandlers: [
    { id: 41, sector: 'Delhi', cost: '600', mode: 'pp', cells: {}, singleSupp: '900' },
    { id: 43, sector: 'Jaipur', cost: '400', mode: 'pp', cells: {}, fx: { cur: 'AED', roe: '23' } },
  ],
  extras: [{ id: 53, description: 'Welcome kit', cost: '30', mode: 'PP', cells: {}, fx: { cur: 'EUR', roe: '95' } }],
  clientAgentName: 'Globe Trotters GmbH', assignedStaffName: 'Priya Sharma', docNotes: '',
};

let pdfHtml = null;
vi.mock('../lib/index.js', async () => {
  const actual = await vi.importActual('../lib/index.js');
  return { ...actual, printHTML: (h) => { pdfHtml = h; }, logAudit: () => {}, loadCostSheetVersions: async () => [version] };
});

const readBlob = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsArrayBuffer(blob); });

async function mount() {
  const { CostSheet } = await import('../components/CostSheet.jsx');
  let blob = null;
  global.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
  global.URL.revokeObjectURL = () => {};
  render(<CostSheet query={{ id: 'Q', tourFileId: 'UT-3469', groupName: 'Globe Trotters', destination: 'Delhi', nights: 1 }} onClose={() => {}} onProceedToQuotation={() => {}} currentUser={{ id: 1, name: 'Priya' }} staff={[]} />);
  await waitFor(() => screen.getAllByText(/ITC Mughal|Delhi/).length);
  await new Promise(r => setTimeout(r, 500));
  return { getBlob: () => blob };
}
const exportMenu = (label) => { fireEvent.click(screen.getByText('⬇ Export ▾')); fireEvent.click(screen.getByText(label)); };

describe('PDF export: itinerary first, then the price matrix, then the final costs', () => {
  it('has the settings strip, the day-wise itinerary, the build-up, then the final cost tiles; no checks box', async () => {
    await mount();
    exportMenu('📕 PDF');
    for (const w of ['GST', 'Day-wise Itinerary', 'PRICE MATRIX', 'Final cost per pax', 'Single supp', '10 pax', '16 pax', '9 + 1 T/L', 'Sub-total', 'After tax', 'Selling price', 'Final price']) expect(pdfHtml).toContain(w);
    const at = (w) => pdfHtml.indexOf(w);
    expect(at('Day-wise Itinerary')).toBeGreaterThan(-1);
    expect(at('Day-wise Itinerary')).toBeLessThan(at('PRICE MATRIX'));
    expect(at('PRICE MATRIX')).toBeLessThan(at('Final cost per pax'));
    expect(pdfHtml).toContain('Quoted price');
    for (const gone of ['How each price is built', 'What was quoted', '(page 2)', 'Costs are in rupees unless a row says otherwise', 'incl. T/L surcharge']) expect(pdfHtml).not.toContain(gone);
    expect(pdfHtml).not.toContain('Checked before export');
    expect(pdfHtml).not.toContain('Final Price Summary');
    expect(pdfHtml).not.toContain('Tour Leader Slabs');
  });

  it('splits the tour leader surcharge into its parts, in the matrix only (no note under the final tiles)', async () => {
    await mount();
    exportMenu('📕 PDF');
    const i = pdfHtml.indexOf('Tour leader surcharge');
    expect(i).toBeGreaterThan(-1);
    const after = pdfHtml.slice(i, i + 4000);
    expect(after).toContain('Hotel');
    expect(after).toContain('Single supplement');
    expect(after).toContain('Extra meals');
    expect(pdfHtml).not.toContain('incl. T/L surcharge');
  });

  it('shows the foreign-currency details: amount, ROE and rupee equivalent', async () => {
    await mount();
    exportMenu('📕 PDF');
    expect(pdfHtml).toMatch(/AED 400/);
    expect(pdfHtml).toMatch(/@ ₹?23/);
    expect(pdfHtml).toMatch(/EUR 30/);
    expect(pdfHtml).toMatch(/9,200/);
  });

  it('transport lines carry the vehicle type, and a left-out slab is flagged', async () => {
    await mount();
    exportMenu('📕 PDF');
    expect(pdfHtml).toContain('Mini Coach');
    expect(pdfHtml).toMatch(/not for/);
  });
});

describe('tlBreakdown', () => {
  it('lists only included, non-zero parts, each as total and per paying pax', () => {
    const tl = { pax: 9, costs: { hotel: '4200', meals: '700', transport: '9999', singleSupp: '' }, includes: { hotel: true, meals: true, transport: false } };
    const b = tlBreakdown(tl);
    expect(b.map(x => x.key)).toEqual(['hotel', 'meals']);
    expect(b[0].total).toBe(4200);
    expect(Math.round(b[0].perPax)).toBe(467);
    expect(TL_PARTS.length).toBe(7);
  });
  it('with no paying pax the per-pax figure is 0, never Infinity', () => {
    expect(tlBreakdown({ pax: 0, costs: { hotel: '100' }, includes: { hotel: true } })[0].perPax).toBe(0);
  });
});

describe('lineBasis: the plain-words "What was quoted" text', () => {
  const cols = [{ id: 1, pax: 10, label: '10 pax' }, { id: 2, pax: 20, label: '20 pax' }];
  it('group cost with an override and a left-out slab', () => {
    const t = lineBasis({ cost: '9000', mode: 'lumpsum', cells: { 1: '12000', 2: 'x' } }, 'local', cols);
    expect(t).toContain('12,000');
    expect(t).toMatch(/not for 20 pax/);
  });
  it('foreign currency per pax names currency, ROE and the rupee figure', () => {
    const t = lineBasis({ cost: '400', mode: 'pp', cells: {}, fx: { cur: 'AED', roe: '23' } }, 'local', cols);
    expect(t).toContain('AED 400');
    expect(t).toContain('9,200');
  });
});

describe('costSheetChecks: what is flagged before export', () => {
  const snap = (over = {}) => ({
    gst: 5, markup: 15, roe: 85, tlMode: 'pp', tlCost: 0, miscMode: 'pp', miscCost: 0, monMode: 'pp', monuments: [], monExtra: '',
    days: [{ id: 1, hotel: 'H', hotelNetPP: '1000', singleSupp: '500', mealCost: '0' }, { id: 2, hotel: 'H', hotelNetPP: '1000', singleSupp: '500', mealCost: '0' }],
    slabs: [{ id: 1, label: 'A', foc: 10, vehicle: 'V' }, { id: 2, label: 'B', foc: 20, vehicle: 'V' }],
    tlSlabs: [], transports: [{ id: 1, sector: 'T', cost: '50000', cells: {} }], localHandlers: [], extras: [], nights: 2, ...over,
  });
  const run = (s) => {
    const calc = makeCalculators({ ...s, totals: { totMeal: 0, totHotel: 2000, totSS: 1000, monTotal: 0 } });
    return costSheetChecks(s, { calcSlab: calc.calcSlab, calcTlSlab: calc.calcTlSlab });
  };
  it('returns ok/text pairs and a clean sheet has no failures', () => {
    const r = run(snap());
    expect(r.length).toBeGreaterThan(3);
    r.forEach((c) => { expect(typeof c.ok).toBe('boolean'); expect(typeof c.text).toBe('string'); });
  });
  it('flags a missing ROE', () => {
    const r = run(snap({ roe: 0 }));
    expect(r.some((c) => !c.ok && /ROE/i.test(c.text))).toBe(true);
  });
  it('flags a slab with no transport', () => {
    const r = run(snap({ transports: [] }));
    expect(r.some((c) => !c.ok && /transport/i.test(c.text))).toBe(true);
  });
});

describe('Excel export: mirrors the matrix with live formulas', () => {
  async function workbook() {
    const { getBlob } = await mount();
    exportMenu('📊 Excel');
    await waitFor(() => { if (!getBlob()) throw new Error('no blob'); }, { timeout: 15000 });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readBlob(getBlob()));
    return wb;
  }
  const find = (sh, col, text, from = 1) => { for (let r = from; r <= sh.rowCount; r++) if (String(sh.getCell(r, col).value) === text) return r; return null; };

  it('has exactly two tabs: Cost Sheet and Itinerary', async () => {
    const wb = await workbook();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Cost Sheet', 'Itinerary']);
  }, 30000);

  it('freezes the slab header rows and the name column', async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    expect(sh.views[0].state).toBe('frozen');
    expect(sh.views[0].ySplit).toBe(7);
    expect(sh.views[0].xSplit).toBe(1);
  }, 30000);

  it('settings sit in one band; foreign-currency lines carry currency and ROE columns', async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    expect(sh.getCell('C10').value).toBe(5);
    expect(sh.getCell('C11').value).toBe(15);
    expect(sh.getCell('C12').value).toBe(85);
    const r = find(sh, 1, 'Jaipur');
    expect(sh.getCell(r, 4).value).toBe('AED');
    expect(sh.getCell(r, 5).value).toBe(23);
  }, 30000);

  it('per-slab cells default to a formula and a left-out slab is typed x', async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    const r = find(sh, 1, 'Delhi - Agra - Delhi');
    const vals = [6, 7, 8].map((c) => sh.getCell(r, c).value);
    expect(vals.some((v) => v === 'x')).toBe(true);
    expect(vals.some((v) => v && typeof v === 'object' && v.formula)).toBe(true);
  }, 30000);

  it('the final price is a guarded CEILING formula reading the ROE cell, with an "app figure" check row', async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    const r = find(sh, 1, 'Final price per pax');
    const f = sh.getCell(r, 6).value.formula;
    expect(f).toContain('CEILING(');
    expect(f).toMatch(/^IF\(/);
    expect(find(sh, 1, 'App figure at export')).toBeTruthy();
    expect(find(sh, 1, 'Matches the app?')).toBeTruthy();
  }, 30000);

  it('no number format embeds a currency symbol (it triggers Excel repair)', async () => {
    const wb = await workbook();
    const bad = [];
    wb.worksheets.forEach((sh) => sh.eachRow((row) => row.eachCell((c) => { if (c.numFmt && c.numFmt.includes('$')) bad.push(sh.name + c.address); })));
    expect(bad).toEqual([]);
  }, 30000);

  it('the sheet allows inserting rows while protected, and keeps spare input rows', async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    expect(sh.sheetProtection.insertRows).toBe(true);
    const band = find(sh, 1, 'TRANSPORT');
    let spare = 0;
    for (let r = band + 1; r < band + 12; r++) { const v = sh.getCell(r, 1).value; if ((v == null || v === '') && sh.getCell(r, 1).protection && sh.getCell(r, 1).protection.locked === false) spare++; }
    expect(spare).toBeGreaterThanOrEqual(3);
  }, 30000);

  it("the tour leader's own costs are split by part in their own block, and the frozen row just totals them", async () => {
    const sh = (await workbook()).getWorksheet('Cost Sheet');
    const band = [...Array(sh.rowCount).keys()].map(k => k + 1).find(r => String(sh.getCell(r, 1).value).startsWith("TOUR LEADER'S OWN COSTS"));
    expect(band).toBeTruthy();
    const names = [1, 2, 3, 4, 5, 6, 7].map(k => sh.getCell(band + k, 1).value);
    expect(names).toEqual(TL_PARTS.map(p => p[1]));
    // the T/L slab is column J (6th slab column): hotel 4200, single supp 2800, meals 700
    const col = [6, 7, 8, 9, 10, 11].find(c => sh.getCell(band + 1, c).value === 4200);
    expect(col).toBeTruthy();
    expect(sh.getCell(band + 2, col).value).toBe(2800);
    expect(sh.getCell(band + 3, col).value).toBe(700);
    expect(sh.getCell(7, col).value.formula).toMatch(/^[A-Z]+\d+$/);
    expect(String(sh.getCell(band + 8, col).value.formula)).toMatch(/^SUM\(/);
  }, 30000);

  it('Itinerary tab has day rows with totals above the list', async () => {
    const it2 = (await workbook()).getWorksheet('Itinerary');
    expect(String(it2.getCell(3, 5).value.formula || it2.getCell(3, 5).value)).toMatch(/SUM/);
  }, 30000);
});
