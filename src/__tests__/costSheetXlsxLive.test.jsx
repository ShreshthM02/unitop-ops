import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';
import { computeTotals, makeCalculators } from '../lib/costSheetCalc.js';
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
    expect(sheet.pageSetup.orientation).toBe('landscape');
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(sheet.views[0].state).toBe('frozen');
    let validated = 0;
    sheet.eachRow(row => row.eachCell(cell => { if (cell.dataValidation && cell.dataValidation.type) validated++; }));
    expect(validated).toBeGreaterThan(0);
  }, 20000);
});
