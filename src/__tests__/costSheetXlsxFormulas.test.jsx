import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

// The workbook is a working spreadsheet: a "Cost Sheet" tab (settings + one
// price table where slabs are added) and one tab per list. These tests
// generate the real file and read it back with exceljs, exactly the way
// someone opening it in Excel would.
const clickExport = (label) => {
  fireEvent.click(screen.getByText('⬇ Export ▾'));
  fireEvent.click(screen.getByText(label));
};

const fakeQuery = { id: 'UTQ-2026-200', tourFileId: 'TF-200', groupName: 'Formula Test Group', nights: 3 };

async function exportWorkbook(beforeExport) {
  let capturedBlob = null;
  const a = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
  const b = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const realCreateElement = document.createElement.bind(document);
  const c = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreateElement(tag);
    if (tag === 'a') el.click = vi.fn();
    return el;
  });
  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
  if (beforeExport) beforeExport();
  clickExport('📊 Excel');
  for (let i = 0; i < 40 && !capturedBlob; i++) await new Promise(r => setTimeout(r, 250));
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await capturedBlob.arrayBuffer());
  a.mockRestore(); b.mockRestore(); c.mockRestore();
  return wb;
}

const findRow = (sheet, col, text) => {
  for (let r = 1; r <= sheet.rowCount; r++) if (sheet.getCell(r, col).value === text) return r;
  return null;
};

describe('CostSheet XLSX: real Excel formulas, not pasted-in numbers', () => {
  it('the Itinerary totals are SUM formulas that sit ABOVE the list, so the list can grow', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Itinerary');
    const totalsRow = findRow(sheet, 1, 'TOTALS');
    const firstDataRow = findRow(sheet, 1, 'Day') + 1;
    expect(totalsRow).toBeLessThan(firstDataRow);
    expect(sheet.getCell(totalsRow, 5).formula).toMatch(/^SUM\(E\d+:E\d+\)$/);
  }, 20000);

  it('the Final Price cell is a guarded formula chain reading the ROE cell, never a literal', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    const f = sheet.getCell(hdr + 1, 16).formula;
    expect(f).toContain('CEILING(');
    expect(f).toMatch(/\/\$?[A-Z]+\$?\d+,1\),0\)$/);
    expect(f).toMatch(/^IF\(\$?[A-Z]+\$?\d+>0,/);
  }, 20000);

  it('GST is read from the settings cell, not hardcoded', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    const f = sheet.getCell(hdr + 1, 13).formula;
    expect(f).toContain('ROUND(');
    expect(f).not.toMatch(/\*\(?5\/100\)?/);
  }, 20000);

  it('slab rows divide by paying pax only behind an IF guard (no #DIV/0!)', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    for (const col of [5, 8, 9, 10, 11]) expect(sheet.getCell(hdr + 1, col).formula).toMatch(/IF\(\$C\d+>0,/);
  }, 20000);
});

describe('CostSheet XLSX: easy to add to', () => {
  it('the price table has 30 ready slab rows, unlocked, with formulas already in place', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    const last = hdr + 30;
    expect(sheet.getCell(last, 3).protection.locked).toBe(false);
    expect(sheet.getCell(last, 16).formula).toBeTruthy();
  }, 20000);

  it('every list has its own tab with 60+ ready input rows and no data below to collide with', async () => {
    const wb = await exportWorkbook();
    for (const [name, firstRow] of [['Transport', 5], ['Monuments', 5], ['Local Handlers', 5], ['Extra Services', 5], ['Itinerary', 7]]) {
      const sh = wb.getWorksheet(name);
      expect(sh.getCell(firstRow + 59, 1).protection.locked).toBe(false);
      expect(sh.getCell(firstRow + 59, 1).fill.fgColor.argb).toBe('FFFFFDE7');
    }
  }, 20000);

  it('Transport lines say which slabs they apply to in words, and a slab-name list is provided to copy from', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Transport');
    const hdr = findRow(sheet, 1, 'Sector / Description');
    expect(String(sheet.getCell(hdr, 3).value)).toContain('Applies to');
    expect(sheet.getCell(hdr + 1, 6).value).toBe('All');
    expect(sheet.getCell(hdr + 2, 6).formula).toContain("'Cost Sheet'!");
  }, 20000);

  it('a T/L slab is an ordinary row in the same table, with its own cost in a distinct column and a surcharge column', async () => {
    const wb = await exportWorkbook(() => {
      fireEvent.click(screen.getByText('+ Add T/L Slab'));
      fireEvent.change(screen.getByDisplayValue('10 pax + 1 T/L'), { target: { value: 'XLSX T/L Row Test' } });
    });
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    expect(String(sheet.getCell(hdr, 4).value)).toContain("Tour Leader's own cost");
    expect(sheet.getCell(hdr, 11).value).toBe('T/L surcharge');
    let found = false;
    for (let r = hdr + 1; r <= hdr + 30; r++) if (sheet.getCell(r, 1).value === 'XLSX T/L Row Test') found = true;
    expect(found).toBe(true);
  }, 20000);
});

describe('CostSheet XLSX: presentation', () => {
  it('input cells (GST, Markup, ROE, client/agent) share the yellow input fill', async () => {
    const wb = await exportWorkbook();
    const sheet = wb.getWorksheet('Cost Sheet');
    const gstRow = findRow(sheet, 1, 'GST %');
    expect(sheet.getCell(gstRow + 1, 1).fill.fgColor.argb).toBe('FFFFFDE7');
    const agentRow = findRow(sheet, 6, 'Client / Foreign Agent');
    expect(sheet.getCell(agentRow + 1, 6).fill.fgColor.argb).toBe('FFFFFDE7');
  }, 20000);

  it('no number format embeds a currency symbol (the cause of the Excel repair prompt); the currency is in the header instead', async () => {
    const wb = await exportWorkbook();
    const bad = [];
    wb.worksheets.forEach((sh) => sh.eachRow((row) => row.eachCell((cell) => { if (cell.numFmt && cell.numFmt.includes('$')) bad.push(sh.name + cell.address); })));
    expect(bad).toEqual([]);
    const sheet = wb.getWorksheet('Cost Sheet');
    const hdr = findRow(sheet, 1, 'Slab name');
    expect(sheet.getCell(hdr, 16).value).toContain('Final Price');
  }, 20000);
});
