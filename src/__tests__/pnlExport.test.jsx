import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PnLExportButton } from '../lib/PnLExport.jsx';

// New P&L export document (PDF, Word, Excel). Deliberately does NOT
// live in the document drawer -- it's a standalone export button
// dropped into wherever the P&L data is already shown (the Payment
// Tracker's own P&L tab).

describe('PnLExportButton', () => {
  const query = { id: 'UTQ-1', tourFileId: 'TUR-2026-050', groupName: 'Smith Family', destination: 'Rajasthan', travelDate: '2026-10-01' };
  const payments = {
    entries: [{ amount: '150000', inCurrency: 'INR', type: 'advance', mode: 'NEFT/RTGS', date: '2026-09-01' }],
    outgoing: [
      { vendor: 'Hotel Saura', category: 'Hotel', amount: '60000', mode: 'NEFT/RTGS', date: '2026-09-15' },
      { vendor: 'Golden Cabs', category: 'Transport', amount: '20000', mode: 'Cash', date: '2026-09-16' },
    ],
  };

  it('renders a real Export P&L menu with PDF, Word, and Excel options', () => {
    render(<PnLExportButton query={query} payments={payments}/>);
    fireEvent.click(screen.getByText(/Export P&L/));
    expect(screen.getByText(/PDF/)).toBeTruthy();
    expect(screen.getByText(/Word/)).toBeTruthy();
    expect(screen.getByText(/Excel/)).toBeTruthy();
  });

  it('does not crash when there are genuinely zero payment records yet', () => {
    expect(() => render(<PnLExportButton query={query} payments={{}}/>)).not.toThrow();
  });

  it('PDF export builds a document titled with the real tour file number, and never crashes on a real click', async () => {
    const printSpy = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn(), title: '' }, focus: vi.fn(), print: vi.fn() });
    render(<PnLExportButton query={query} payments={payments}/>);
    fireEvent.click(screen.getByText(/Export P&L/));
    fireEvent.click(screen.getByText(/PDF/));
    await new Promise(r => setTimeout(r, 100));
    printSpy.mockRestore();
  });

  it('a query still awaiting conversion (no tourFileId) falls back to the Query ID in the title, matching the same smart {id} behavior used everywhere else', async () => {
    const preConversion = { id: 'UTQ-2', groupName: 'Test Group' };
    const printSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      const doc = { write: vi.fn((html) => { expect(html).toContain('P&L - Tour File No. UTQ-2'); }), close: vi.fn(), title: '' };
      return { document: doc, focus: vi.fn(), print: vi.fn() };
    });
    render(<PnLExportButton query={preConversion} payments={payments}/>);
    fireEvent.click(screen.getByText(/Export P&L/));
    fireEvent.click(screen.getByText(/PDF/));
    await new Promise(r => setTimeout(r, 100));
    printSpy.mockRestore();
  });

  it('Excel export does not crash and triggers a real download', async () => {
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<PnLExportButton query={query} payments={payments}/>);
    fireEvent.click(screen.getByText(/Export P&L/));
    fireEvent.click(screen.getByText(/Excel/));
    await new Promise(r => setTimeout(r, 1500));
    expect(clickSpy).toHaveBeenCalled();
    createElementSpy.mockRestore(); createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore();
  });
});
