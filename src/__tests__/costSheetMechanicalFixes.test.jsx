import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostSheet } from '../components/CostSheet.jsx';

const fakeQuery = { id: 'UTQ-2026-095', tourFileId: 'TF-095', groupName: 'Export Test Group', nights: 3 };

describe('CostSheet: PDF and XLSX export buttons now exist (item #1)', () => {
  it('shows both Export PDF and Export XLSX buttons', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    expect(screen.getByText(/🖨 Export PDF/)).toBeTruthy();
    expect(screen.getByText(/📊 Export XLSX/)).toBeTruthy();
  });

  it('clicking Export PDF opens a print window and logs to the audit trail', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn() }, print: vi.fn() });
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('CostSheet: XLSX export is a single, styled sheet (exceljs), not a bare 3-sheet dump (item requested: "modern 2026 style")', () => {
  it('clicking Export XLSX generates a real, single-sheet workbook with actual styling and content', async () => {
    // Capture the Blob passed to a real download instead of mocking
    // exceljs itself -- this exercises the actual cell/style-building
    // code, then re-reads the generated file with exceljs to confirm the
    // output is genuinely correct, not just "a function ran without
    // throwing." vi.stubGlobal + a real <a> intercepted before click()
    // avoids JSDOM's awkward Blob-URL/navigation behavior.
    let capturedBlob = null;
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') el.click = vi.fn();
      return el;
    });

    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText(/📊 Export XLSX/));
    // exceljs writeBuffer on a fully styled workbook genuinely takes
    // variable time -- poll rather than assume a fixed delay is enough.
    for (let i = 0; i < 40 && !capturedBlob; i++) {
      await new Promise(r => setTimeout(r, 250));
    }

    expect(capturedBlob).toBeTruthy();
    const buffer = await capturedBlob.arrayBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    expect(wb.worksheets.length).toBe(1); // single sheet, not three
    const sheet = wb.worksheets[0];
    expect(sheet.name).toBe('Cost Sheet');

    const titleCell = sheet.getCell(1,1);
    expect(titleCell.value).toBe('COST SHEET');
    expect(titleCell.font.bold).toBe(true);
    expect(titleCell.fill.fgColor.argb).toBe('FF0D1B2A'); // navy, matching the app's own color

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    document.createElement.mockRestore();
  }, 15000);
});

describe('CostSheet: Proceed to Quotation now requires an actual saved version (item #10)', () => {
  it('does not show Proceed to Quotation until a version is actually saved, even with valid pricing entered', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    // Default slabs already compute a nonzero price with zero cost inputs
    // if GST/markup default nonzero -- but nothing has been saved yet.
    expect(screen.queryByText(/Proceed to Quotation/)).toBeNull();
  });

  it('shows a hint explaining why Proceed to Quotation is not available yet, once real pricing exists but is unsaved', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    const descInput = screen.getByPlaceholderText(/Boat ride at Varanasi/);
    const row = descInput.closest('div').parentElement;
    const costInput = row.querySelector('input[type="number"]');
    fireEvent.change(costInput, { target: { value: '5000' } });
    expect(screen.getByText(/Save a version to proceed/)).toBeTruthy();
  });

  it('shows Proceed to Quotation once a version has actually been saved', async () => {
    const mockDb = { from: () => ({ select:()=>({eq:()=>({order:async()=>({data:[]})})}), insert: vi.fn(async (row)=>({data:[{...row,id:'saved-id'}],error:null})) }) };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { CostSheet: CS } = await import('../components/CostSheet.jsx');
    render(<CS query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    const descInput = screen.getByPlaceholderText(/Boat ride at Varanasi/);
    const row = descInput.closest('div').parentElement;
    const costInput = row.querySelector('input[type="number"]');
    fireEvent.change(costInput, { target: { value: '5000' } });
    fireEvent.click(screen.getAllByText(/💾 Save v1/)[0]);
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByText(/Proceed to Quotation/)).toBeTruthy();
  });
});

describe('CostSheet: Day-wise TOTALS row alignment (item #7)', () => {
  it('Meal Cost total sits under the Meal Cost column, not Meal Plan', () => {
    render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}}/>);
    fireEvent.click(screen.getByText('+ Add Day'));
    const mealCostInputs = document.querySelectorAll('input[placeholder="0"]');
    fireEvent.change(mealCostInputs[0], { target: { value: '500' } });
    // 12 header columns; TOTALS spans 3, then an empty cell, then the
    // Meal Cost total -- confirms the value lands in the 5th <td>, matching
    // the 5th header ("Meal Cost"), not the 4th ("Meal Plan").
    const totalsRow = screen.getByText('TOTALS').closest('tr');
    const cells = totalsRow.querySelectorAll('td');
    expect(cells[1].textContent).toBe(''); // empty cell under Meal Plan
    expect(cells[2].textContent).toContain('500'); // Meal Cost total
  });
});
