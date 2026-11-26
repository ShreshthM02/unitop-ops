import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GanttView from '../components/GanttView.jsx';

const queries = [
  {
    id: 'UTQ-2026-100', tourFileId: 'TF-2026-100', status: 'operations', cancelled: false,
    travelDate: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-10`,
    nights: 5, agentCompany: 'Uni Travel', destination: 'Kashmir', pax: 21, notes: 'VIP group', assignedTo: 1,
  },
];

describe('GanttView: foreign agent shown subtly', () => {
  it('Gantt row label carries a small "via <agent>" line, bar hover and legend name the agent', () => {
    render(<GanttView queries={queries} tours={[]}/>);
    expect(screen.getByTestId('gantt-agent').textContent).toBe('via Uni Travel');
    expect(document.querySelector('[title*="via Uni Travel"]')).toBeTruthy();
  });
  it('no agent on the query means no extra line', () => {
    render(<GanttView queries={[{...queries[0], agentCompany: ''}]} tours={[]}/>);
    expect(screen.queryByTestId('gantt-agent')).toBeNull();
  });
});

describe('GanttView: Movement Chart tab', () => {
  it('adds a third "Movement Chart" tab alongside Gantt and Ground View (Overlap was replaced by Ground View, per direct request -- a real operational "what\'s happening today" view rather than a date-range collision chart)', () => {
    render(<GanttView queries={queries} tours={[]}/>);
    expect(screen.getByText('📅 Gantt')).toBeTruthy();
    expect(screen.getByText('📍 Ground View')).toBeTruthy();
    expect(screen.getByText('📋 Movement Chart')).toBeTruthy();
  });

  it('shows the current month\'s operations-stage tours in a table when the tab is selected', () => {
    render(<GanttView queries={queries} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    expect(screen.getByText('TF-2026-100')).toBeTruthy();
    expect(screen.getByText('Uni Travel')).toBeTruthy();
    expect(screen.getByText('Kashmir')).toBeTruthy();
  });

  it('shows an empty state when there are no active tours that month', () => {
    render(<GanttView queries={[]} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    expect(screen.getByText(/No active tours in/)).toBeTruthy();
  });

  it('Export > PDF generates a landscape document containing the same data as the on-screen table', async () => {
    const writeSpy = vi.fn();
    const mockWin = { document: { write: writeSpy, close: vi.fn(), readyState: 'complete' }, print: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);

    render(<GanttView queries={queries} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    fireEvent.click(screen.getByText('⬇ Export ▾'));
    fireEvent.click(screen.getByText('📕 PDF'));

    expect(openSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const html = writeSpy.mock.calls[0][0];
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('TF-2026-100');
    expect(html).toContain('Uni Travel');
    await vi.waitFor(() => expect(mockWin.print).toHaveBeenCalled());

    openSpy.mockRestore();
  });

  it('Export > Excel produces a workbook with the same rows, real dates and a frozen filtered header', async () => {
    let blob = null;
    const a = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:x'; });
    const b = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const real = document.createElement.bind(document);
    const c = vi.spyOn(document, 'createElement').mockImplementation((t) => { const el = real(t); if (t === 'a') el.click = vi.fn(); return el; });
    render(<GanttView queries={queries} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    fireEvent.click(screen.getByText('⬇ Export ▾'));
    fireEvent.click(screen.getByText('📊 Excel'));
    await vi.waitFor(() => expect(blob).toBeTruthy(), { timeout: 15000 });
    const buf = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsArrayBuffer(blob); });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Movement Chart');
    expect(ws).toBeTruthy();
    expect(String(ws.getCell(1, 1).value)).toMatch(/^Movement Chart — /);
    const text = []; ws.eachRow((row) => row.eachCell((cell) => text.push(String(cell.value && cell.value.result !== undefined ? cell.value.result : cell.value))));
    expect(text.join('|')).toContain('TF-2026-100');
    expect(text.join('|')).toContain('Uni Travel');
    expect(ws.views[0].state).toBe('frozen');
    expect(ws.autoFilter).toBeTruthy();
    a.mockRestore(); b.mockRestore(); c.mockRestore();
  }, 30000);

  it('does not crash when queries have no assignedTo match or missing fields', () => {
    const sparse = [{ id: 'UTQ-1', tourFileId: 'TF-1', status: 'operations', cancelled: false, travelDate: queries[0].travelDate, nights: 3 }];
    expect(() => {
      render(<GanttView queries={sparse} tours={[]}/>);
      fireEvent.click(screen.getByText('📋 Movement Chart'));
    }).not.toThrow();
  });
});

describe('printHTML: waits for the window to load before printing', () => {
  it('does not call print() immediately if the document is not yet readyState complete', async () => {
    const { printHTML } = await import('../lib/LetterheadControls.jsx');
    const printSpy = vi.fn();
    const mockWin = { document: { write: vi.fn(), close: vi.fn(), readyState: 'loading' }, print: printSpy, addEventListener: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);
    printHTML('<html></html>');
    // Not called synchronously -- waiting on load or the fallback timeout
    expect(printSpy).not.toHaveBeenCalled();
    expect(mockWin.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), expect.anything());
    openSpy.mockRestore();
  });

  it('calls print() promptly if the document is already readyState complete', async () => {
    const { printHTML } = await import('../lib/LetterheadControls.jsx');
    const printSpy = vi.fn();
    const mockWin = { document: { write: vi.fn(), close: vi.fn(), readyState: 'complete' }, print: printSpy };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);
    printHTML('<html></html>');
    // Prints once the (empty) page is confirmed drawn -- a moment later, not synchronously.
    await vi.waitFor(() => expect(printSpy).toHaveBeenCalled());
    openSpy.mockRestore();
  });
});
