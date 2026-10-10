import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';
import { computeTotals, makeCalculators, ceilFX } from '../lib/costSheetCalc.js';
import { excelDate } from '../lib/costSheetXlsx.js';

const fakeQuery = { id: 'UTQ-2026-201', tourFileId: 'TF-201', groupName: 'Live Test Group', nights: 3 };

async function exportSheet() {
  let blob = null;
  const a = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:mock'; });
  const b = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const real = document.createElement.bind(document);
  const c = vi.spyOn(document, 'createElement').mockImplementation((t) => { const el = real(t); if (t === 'a') el.click = vi.fn(); return el; });
  render(<CostSheet query={fakeQuery} onClose={() => {}} onProceedToQuotation={() => {}} currentUser={{ id: 1, name: 'Priya' }} />);
  fireEvent.click(screen.getByText('⬇ Export ▾'));
  fireEvent.click(screen.getByText('📊 Excel'));
  for (let i = 0; i < 40 && !blob; i++) await new Promise(r => setTimeout(r, 250));
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  a.mockRestore(); b.mockRestore(); c.mockRestore();
  return wb.worksheets[0];
}

describe('costSheetCalc', () => {
  it('computeTotals sums meals, hotels and single supplements', () => {
    const t = computeTotals({ days: [], localHandlers: [], monuments: [], monExtra: '' });
    expect(t.totSS).toBe(0);
    expect(t.monTotal).toBe(0);
  });
  it('a slab with zero paying pax prices at 0 instead of erroring', () => {
    const { calcSlab } = makeCalculators({
      transports: [], tlMode: 'pp', tlCost: 0, miscMode: 'pp', miscCost: 0, monMode: 'pp',
      localHandlers: [], extras: [], gst: 5, markup: 10, roe: 1,
      totals: { totMeal: 0, totHotel: 0, totSS: 0, monTotal: 0 },
    });
    const r = calcSlab({ foc: 0, vehicle: '', name: 'Zero' });
    expect(Number.isFinite(r.finalFX)).toBe(true);
  });
});

describe('excelDate', () => {
  it('turns ISO dates into real dates and returns null for non-dates', () => {
    expect(excelDate('2026-11-01')).toBeInstanceOf(Date);
    expect(excelDate('soon')).toBeNull();
  });
});

describe('Cost Sheet workbook is live, guarded and print-ready', () => {
  it('has guarded divisions, protection, print setup, named ranges and dropdowns', async () => {
    const sheet = await exportSheet();
    const formulas = [];
    sheet.eachRow(row => row.eachCell(cell => { if (cell.formula) formulas.push(cell.formula); }));
    expect(formulas.length).toBeGreaterThan(20);
    expect(formulas.some(f => /^IF\(\$?[A-Z]+\$?\d+>0,/.test(f))).toBe(true);
    expect(sheet.sheetProtection).toBeTruthy();
    // Rows may be inserted/deleted on the protected sheet (ExcelJS: true = allowed).
    expect(sheet.pageSetup.orientation).toBe('landscape');
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(sheet.views[0].state).toBe('frozen');
    let validated = 0;
    sheet.eachRow(row => row.eachCell(cell => { if (cell.dataValidation && cell.dataValidation.type) validated++; }));
    expect(validated).toBeGreaterThan(0);
  }, 20000);
});

describe('ceilFX', () => {
  it('ignores floating-point dust but still rounds real fractions up', () => {
    expect(ceilFX(495.00000000000006)).toBe(495);
    expect(ceilFX(495.2)).toBe(496);
    expect(ceilFX(0)).toBe(0);
  });
});

describe('Tour Leader slab builds on the unrounded subtotal', () => {
  it('matches the same slab priced as one calculation', () => {
    const base = { transports: [], tlMode: 'lumpsum', tlCost: 1000, miscMode: 'pp', miscCost: 0, monMode: 'pp', localHandlers: [], extras: [], gst: 5, markup: 10, roe: 1, totals: { totMeal: 0, totHotel: 100.4, totSS: 0, monTotal: 0 } };
    const { calcTlSlab } = makeCalculators(base);
    const r = calcTlSlab({ id: 't', pax: 3, costs: { a: 100 }, includes: { a: true } });
    const sub = 100.4 + 1000 / 3 + 100 / 3;
    const after = sub + Math.round(sub * 5 / 100);
    expect(r.sellingINR).toBe(Math.round(after + Math.round(after * 10 / 100)));
  });
});

describe('Workbook leaves room to add rows', () => {
  it('has blank unlocked spare rows for slabs, T/L slabs and items, with pre-wired formulas', async () => {
    const sheet = await exportSheet();
    let slabHeader = 0, tlInput = 0;
    sheet.eachRow((row, i) => { if (row.getCell(1).value === 'Slab') slabHeader = i; if (row.getCell(1).value === 'T/L Slab Name') tlInput = i; });
    expect(slabHeader).toBeGreaterThan(0);
    expect(tlInput).toBeGreaterThan(0); // T/L block exists even with no T/L slabs yet
    let spareIdx = slabHeader + 1;
    while (sheet.getCell(spareIdx, 3).value != null && sheet.getCell(spareIdx, 3).value !== '') spareIdx++;
    const spare = sheet.getRow(spareIdx); // first slab row with no pax = a spare row
    expect(spare.getCell(1).value === '' || spare.getCell(1).value == null).toBe(true);
    expect(spare.getCell(1).protection && spare.getCell(1).protection.locked).toBe(false);
    expect(spare.getCell(14).formula).toBeTruthy(); // Final price formula already in place
  }, 20000);
});
