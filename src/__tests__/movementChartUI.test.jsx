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

describe('GanttView: Movement Chart tab', () => {
  it('adds a third "Movement Chart" tab alongside Gantt and Overlap', () => {
    render(<GanttView queries={queries} tours={[]}/>);
    expect(screen.getByText('📅 Gantt')).toBeTruthy();
    expect(screen.getByText('⚡ Overlap')).toBeTruthy();
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

  it('"Download PDF" generates a landscape document containing the same data as the on-screen table', () => {
    const writeSpy = vi.fn();
    const mockWin = { document: { write: writeSpy, close: vi.fn(), readyState: 'complete' }, print: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);

    render(<GanttView queries={queries} tours={[]}/>);
    fireEvent.click(screen.getByText('📋 Movement Chart'));
    fireEvent.click(screen.getByText('🖨 Download PDF'));

    expect(openSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const html = writeSpy.mock.calls[0][0];
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('TF-2026-100');
    expect(html).toContain('Uni Travel');
    expect(mockWin.print).toHaveBeenCalled();

    openSpy.mockRestore();
  });

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
    expect(mockWin.addEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    openSpy.mockRestore();
  });

  it('calls print() immediately if the document is already readyState complete', async () => {
    const { printHTML } = await import('../lib/LetterheadControls.jsx');
    const printSpy = vi.fn();
    const mockWin = { document: { write: vi.fn(), close: vi.fn(), readyState: 'complete' }, print: printSpy };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWin);
    printHTML('<html></html>');
    expect(printSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
