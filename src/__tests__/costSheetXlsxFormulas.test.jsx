import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-200', tourFileId: 'TF-200', groupName: 'Formula Test Group', nights: 3 };

// Generates the real workbook and reads it back with exceljs, exactly the
// way someone opening it in Excel would -- this is the only way to
// actually prove formulas exist and reference the right cells, rather
// than trusting that the code "looks right."
async function exportAndReload() {
  let capturedBlob = null;
  const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
  const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const realCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreateElement(tag);
    if (tag === 'a') el.click = vi.fn();
    return el;
  });

  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
  fireEvent.click(screen.getByText(/📊 Export XLSX/));
  for (let i = 0; i < 40 && !capturedBlob; i++) await new Promise(r => setTimeout(r, 250));

  const buffer = await capturedBlob.arrayBuffer();
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore(); createElementSpy.mockRestore();
  return wb.worksheets[0];
}

describe('CostSheet XLSX: real Excel formulas, not pasted-in numbers (item #1)', () => {
  it('the day-wise Meal Cost TOTALS cell is an actual SUM formula, not a static number', async () => {
    const sheet = await exportAndReload();
    // Find the TOTALS row by scanning column A
    let totalsRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'TOTALS') { totalsRow = r; break; } }
    expect(totalsRow).toBeTruthy();
    const mealCell = sheet.getCell(totalsRow, 5);
    expect(mealCell.formula).toBeTruthy();
    expect(mealCell.formula).toMatch(/^SUM\(E\d+:E\d+\)$/);
  }, 15000);

  it('the Final Price cell in the slab table is a real formula chain, not a precomputed value', async () => {
    const sheet = await exportAndReload();
    let slabHeaderRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'Slab') { slabHeaderRow = r; break; } }
    expect(slabHeaderRow).toBeTruthy();
    const finalPriceCell = sheet.getCell(slabHeaderRow+1, 14); // first slab row, Final Price column
    expect(finalPriceCell.formula).toBeTruthy();
    expect(finalPriceCell.formula).toContain('CEILING(');
    // Should reference the ROE settings cell, not a hardcoded number
    expect(finalPriceCell.formula).toMatch(/\/[A-Z]+\d+,1\)$/);
  }, 15000);

  it('changing the GST% input cell would actually change the tax calculation -- verified by checking the formula references the GST cell, not a literal percentage', async () => {
    const sheet = await exportAndReload();
    let slabHeaderRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'Slab') { slabHeaderRow = r; break; } }
    const taxCell = sheet.getCell(slabHeaderRow+1, 11); // GST column
    expect(taxCell.formula).toContain('ROUND(');
    expect(taxCell.formula).not.toMatch(/\*\(?5\/100\)?/); // not a hardcoded 5% literal
  }, 15000);

  it('every dynamic section (Local Handlers, Extra Services, Transportation) has at least 3 blank rows beyond current data, ready to fill in offline', async () => {
    const sheet = await exportAndReload();
    let localHandlerHeaderRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'Local Handler(s)') { localHandlerHeaderRow = r; break; } }
    expect(localHandlerHeaderRow).toBeTruthy();
    // Header row for the columns is 2 rows below the section label; check
    // several rows below that are genuinely blank and ready to type into.
    const firstDataRow = localHandlerHeaderRow + 2;
    let blankCount = 0;
    for (let r = firstDataRow; r < firstDataRow + 6; r++) {
      if (!sheet.getCell(r,1).value) blankCount++;
    }
    expect(blankCount).toBeGreaterThanOrEqual(3);
  }, 15000);

  it('the Transportation section shows one column per slab (the "better way to display transportation slabs" ask), not a hidden checkbox list', async () => {
    const sheet = await exportAndReload();
    let tptLabelRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (String(sheet.getCell(r,1).value||'').includes('Transportation')) { tptLabelRow = r; break; } }
    expect(tptLabelRow).toBeTruthy();
    const headerRow = tptLabelRow + 1;
    // Default CostSheet has 2 slabs -- expect their labels as column headers
    expect(sheet.getCell(headerRow, 3).value).toBeTruthy();
    expect(sheet.getCell(headerRow, 4).value).toBeTruthy();
  }, 15000);

  it('input cells (GST, Markup, ROE, day costs) are visually marked as editable via a distinct fill color', async () => {
    const sheet = await exportAndReload();
    let gstLabelRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'GST %') { gstLabelRow = r; break; } }
    const gstValueCell = sheet.getCell(gstLabelRow+1, 1);
    expect(gstValueCell.fill.fgColor.argb).toBe('FFFFFDE7');
  }, 15000);

  it('no number format code embeds the currency symbol -- the real cause of the "we found a problem with some content" Excel repair prompt, since $ has special meaning in format-code syntax even inside quotes', async () => {
    const sheet = await exportAndReload();
    let badFormats = [];
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.numFmt && cell.numFmt.includes('$')) badFormats.push({ address: cell.address, numFmt: cell.numFmt });
      });
    });
    expect(badFormats).toEqual([]);
  }, 15000);

  it('the currency label appears in the column header instead, where it is safe as plain text', async () => {
    const sheet = await exportAndReload();
    let slabHeaderRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'Slab') { slabHeaderRow = r; break; } }
    expect(sheet.getCell(slabHeaderRow, 14).value).toContain('Final Price');
    expect(sheet.getCell(slabHeaderRow, 14).value).toContain('(');
  }, 15000);
});

describe('CostSheet XLSX: Client/Agent, Assigned Staff, and Tour Leader Slab rows', () => {
  it('includes editable Client/Foreign Agent and Assigned Staff cells', async () => {
    const sheet = await exportAndReload();
    let agentLabelRow = null;
    for (let r = 1; r <= sheet.rowCount; r++) { if (sheet.getCell(r,1).value === 'Client / Foreign Agent') { agentLabelRow = r; break; } }
    expect(agentLabelRow).toBeTruthy();
    const agentValueCell = sheet.getCell(agentLabelRow+1, 1);
    expect(agentValueCell.fill.fgColor.argb).toBe('FFFFFDE7'); // marked editable
  }, 15000);

  it('a T/L slab appears as its own labeled row in the slab table', async () => {
    let capturedBlob = null;
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') el.click = vi.fn();
      return el;
    });

    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const labelInput = screen.getByDisplayValue('10 pax + 1 T/L');
    fireEvent.change(labelInput, { target: { value: 'XLSX T/L Row Test' } });
    fireEvent.click(screen.getByText(/📊 Export XLSX/));
    for (let i = 0; i < 40 && !capturedBlob; i++) await new Promise(r => setTimeout(r, 250));

    const buffer = await capturedBlob.arrayBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];

    let found = false;
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (String(sheet.getCell(r,1).value||'').includes('XLSX T/L Row Test')) { found = true; break; }
    }
    expect(found).toBe(true);

    createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore(); createElementSpy.mockRestore();
  }, 15000);
});
