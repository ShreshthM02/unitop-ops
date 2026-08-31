import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportsView from '../components/ReportsView.jsx';

// The XLSX export button previously called loadXLSX()/saveBlob(), neither
// of which existed anywhere in the codebase -- clicking it threw
// immediately. Fixed to use the same ExcelJS pattern Cost Sheet's own
// (working) Excel export already uses. This proves the button now
// produces a real, readable workbook rather than just "doesn't throw."
async function exportAndReload(reportLabel) {
  let capturedBlob = null;
  const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
  const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const realCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreateElement(tag);
    if (tag === 'a') el.click = vi.fn();
    return el;
  });

  const queries = [
    { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', destination: 'Kerala', status: 'new', date: '2026-08-01', cancelled: false },
  ];
  render(<ReportsView queries={queries} payments={{}} currentUser={{id:1,name:'Priya',role:'admin'}} vendors={[]} tourExecutions={{}}/>);
  fireEvent.click(screen.getByText(reportLabel));
  fireEvent.click(screen.getByText('\ud83d\udce5 XLSX'));
  for (let i = 0; i < 40 && !capturedBlob; i++) await new Promise(r => setTimeout(r, 100));

  createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore(); createElementSpy.mockRestore();
  return capturedBlob;
}

describe('Reports XLSX export: fixed the real bug (loadXLSX/saveBlob did not exist anywhere -- clicking it threw)', () => {
  it('produces a real, loadable xlsx workbook with the report data', async () => {
    const blob = await exportAndReload(/Query Log/);
    expect(blob).toBeTruthy();
    const buffer = await blob.arrayBuffer();
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('Query ID');
    expect(sheet.getRow(2).getCell(1).value).toBe('UTQ-1');
  });
});
