import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import HistoryExportMenu from '../components/HistoryExportMenu.jsx';
import {
  periodText, vendorServiceSpec, vendorLedgerSpec, agentHistorySpec, agentLedgerSpecs,
  fleetServiceSpec, fleetExpenseSpec, specsToBodyBlocks, buildHistoryPdfHTML, buildHistoryWorkbook, historyFilename,
} from '../lib/historyExports.js';

const entryINR = (e) => parseFloat(e.amount) || 0;
const vendor = { id: 'v1', name: 'Hotel Grand' };
const vEntries = [
  { date: '2026-10-02', tourFileId: 'TF-1', clientName: 'Sharma', sector: 'Goa', paymentType: 'voucher', settled: false, amount: 5000, mode: 'Bank', ref: 'R1' },
  { date: '2026-10-05', tourFileId: 'TF-1', clientName: 'Sharma', sector: 'Goa', paymentType: 'cash', amount: 2000, mode: 'Cash', ref: '' },
  { date: '2026-10-09', tourFileId: 'TF-2', clientName: 'Verma', sector: 'Kerala', paymentType: 'settle', amount: 1000, mode: 'UPI', ref: 'U9' },
];
const readBook = async (specs) => {
  const wb = await buildHistoryWorkbook(specs);
  const buf = await wb.xlsx.writeBuffer();
  const ExcelJS = (await import('exceljs')).default;
  const out = new ExcelJS.Workbook(); await out.xlsx.load(buf); return out;
};
const cellText = (ws) => { const t = []; ws.eachRow((r) => r.eachCell((c) => t.push(String(c.value && c.value.result !== undefined ? c.value.result : c.value)))); return t.join('|'); };

describe('periodText', () => {
  it('describes presets and custom ranges', () => {
    expect(periodText({ preset: 'all' })).toBe('All time');
    expect(periodText({ preset: '3m' })).toBe('Last 3 months');
    expect(periodText({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' })).toMatch(/2026.*to.*2026/);
  });
});

describe('spec builders', () => {
  it('vendor ledger: one row per entry, status labels and a summary that matches the on-screen cards', () => {
    const sp = vendorLedgerSpec(vendor, vEntries, { preset: '3m' });
    expect(sp.rows).toHaveLength(3);
    expect(sp.rows.map((r) => r.status)).toEqual(['Payable', 'Paid', 'Paid']);
    expect(sp.summary).toEqual({ committed: 7000, paid: 3000, payable: 5000 });
    expect(sp.info.join(' ')).toContain('Last 3 months');
    expect(sp.totals.keys).toEqual(['amount']);
  });
  it('vendor service history keeps cancelled tours labelled and joins EO numbers', () => {
    const sp = vendorServiceSpec(vendor, [{ tourFileId: 'TF-1', groupName: 'G', sector: 'Goa', travelDate: '2026-10-01', role: 'Hotel', cancelled: true, eoNos: ['EO-1', 'EO-2'] }], { preset: 'all' });
    expect(sp.rows[0]).toMatchObject({ status: 'Cancelled', eos: 'EO-1, EO-2' });
  });
  it('agent query history computes value, received and balance in INR', () => {
    const q = [{ id: 'Q1', tourFileId: 'TF-1', groupName: 'G', destination: 'Goa', travelDate: '2026-10-01', status: 'confirmed' }];
    const pay = { Q1: { tourValue: '1000', roeUsed: '2', entries: [{ amount: 500 }] } };
    const sp = agentHistorySpec({ company: 'Uni Travel' }, q, pay, entryINR, { preset: 'all' });
    expect(sp.rows[0]).toMatchObject({ tourValue: 2000, received: 500, balance: 1500 });
  });
  it('agent ledger returns a per-tour sheet and a receipts sheet that add up', () => {
    const ledger = [
      { queryId: 'Q1', tourFileId: 'TF-1', group: 'G1', sector: 'Goa', travelDate: '2026-10-01', status: 'confirmed', tourVal: 3000, received: 1200, balance: 1800, entries: [{ date: '2026-10-02', amount: 700, mode: 'Bank', receipt: 'RC1' }, { date: '2026-10-03', amount: 500, mode: 'UPI', receipt: 'RC2' }] },
      { queryId: 'Q2', tourFileId: 'TF-2', group: 'G2', sector: 'Kerala', travelDate: '—', status: 'quoted', tourVal: 0, received: 0, balance: 0, entries: [] },
    ];
    const [tours, receipts] = agentLedgerSpecs({ company: 'Uni Travel' }, ledger, { preset: 'all' });
    expect(tours.rows).toHaveLength(2);
    expect(tours.rows[1].travelDate).toBe('');
    expect(receipts.rows.map((r) => r.receipt)).toEqual(['RC2', 'RC1']); // newest first
    expect(receipts.rows.reduce((s, r) => s + r.amount, 0)).toBe(1200);
  });
  it('fleet specs carry vehicle identity and the date range', () => {
    const v = { name: 'Tempo 12', regNo: 'DL1AB1234' };
    expect(fleetServiceSpec(v, [{ tourFileNo: 'TF-1', startDate: '2026-10-01', endDate: '2026-10-05', sector: 'Goa' }]).info[0]).toContain('DL1AB1234');
    const ex = fleetExpenseSpec(v, [{ date: '2026-10-02', particulars: 'Diesel', amount: '4500' }], '2026-10-01', '');
    expect(ex.rows[0].amount).toBe(4500);
    expect(ex.info[1]).toContain('Period:');
  });
});

describe('outputs', () => {
  it('PDF html has every column heading, the rows and a totals row; empty selections say so', () => {
    const sp = vendorLedgerSpec(vendor, vEntries, { preset: 'all' });
    const html = buildHistoryPdfHTML((o) => o.bodyBlocks.join(''), sp, 'x');
    expect(html).toContain('Amount (₹)');
    expect(html).toContain('TF-2');
    expect(html).toContain('₹8,000.00');
    expect(specsToBodyBlocks(vendorLedgerSpec(vendor, [], { preset: 'all' })).join('')).toContain('Nothing to show');
  });
  it('PDF html escapes user text', () => {
    const sp = vendorServiceSpec(vendor, [{ tourFileId: '<b>x</b>', role: 'R' }], { preset: 'all' });
    expect(specsToBodyBlocks(sp).join('')).not.toContain('<b>x</b>');
  });
  it('Excel: multi-sheet workbook with real numbers, SUM totals and frozen filtered headers', async () => {
    const ledger = [{ queryId: 'Q1', tourFileId: 'TF-1', group: 'G1', sector: 'Goa', travelDate: '2026-10-01', status: 'confirmed', tourVal: 3000, received: 1200, balance: 1800, entries: [{ date: '2026-10-02', amount: 1200, mode: 'Bank', receipt: 'RC1' }] }];
    const wb = await readBook(agentLedgerSpecs({ company: 'Uni Travel' }, ledger, { preset: 'all' }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Financial Ledger', 'Receipts']);
    const ws = wb.getWorksheet('Financial Ledger');
    expect(cellText(ws)).toContain('Uni Travel');
    expect(cellText(ws)).toContain('TF-1');
    expect(ws.views[0].state).toBe('frozen');
    expect(ws.autoFilter).toBeTruthy();
    let formula = false; ws.eachRow((r) => r.eachCell((c) => { if (c.value && c.value.formula && /SUM/.test(c.value.formula)) formula = true; }));
    expect(formula).toBe(true);
  }, 30000);
  it('file names are safe', () => {
    expect(historyFilename('Vendor', 'A/B: "C"', 'Financial Ledger')).toBe('Financial Ledger - A B C');
  });
});

describe('HistoryExportMenu', () => {
  it('PDF opens a print window with the document', async () => {
    const write = vi.fn();
    const win = { document: { write, close: vi.fn(), readyState: 'complete' }, print: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    render(<HistoryExportMenu kind="Vendor" name="Hotel Grand" what="Financial Ledger" getSpecs={() => vendorLedgerSpec(vendor, vEntries, { preset: 'all' })} />);
    fireEvent.click(screen.getByText(/Export/));
    fireEvent.click(screen.getByText('📕 PDF'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('TF-2');
    expect(write.mock.calls[0][0]).toContain('size: A4 landscape');
    open.mockRestore();
  });
  it('Excel downloads a .xlsx named after the record', async () => {
    let blob = null, name = '';
    const a = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b; return 'blob:x'; });
    const b = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const real = document.createElement.bind(document);
    const c = vi.spyOn(document, 'createElement').mockImplementation((t) => { const el = real(t); if (t === 'a') { el.click = vi.fn(() => { name = el.download; }); } return el; });
    render(<HistoryExportMenu kind="Vendor" name="Hotel Grand" what="Financial Ledger" getSpecs={() => vendorLedgerSpec(vendor, vEntries, { preset: 'all' })} />);
    fireEvent.click(screen.getByText(/Export/));
    fireEvent.click(screen.getByText('📊 Excel'));
    await vi.waitFor(() => expect(blob).toBeTruthy(), { timeout: 15000 });
    expect(name).toBe('Financial Ledger - Hotel Grand.xlsx');
    a.mockRestore(); b.mockRestore(); c.mockRestore();
  }, 30000);
});

describe('wiring: every history / ledger tab has the menu and exports what is on screen', () => {
  const src = (f) => fs.readFileSync(path.resolve(__dirname, '../components', f), 'utf8');
  it('vendors: service history and financial ledger use the period-filtered rows', () => {
    const s = src('VendorMaster.jsx');
    expect(s).toContain('vendorServiceSpec(selected,assignments,periodFilter)');
    expect(s).toContain('vendorLedgerSpec(selected,ledger,periodFilter)');
  });
  it('agents: query history and ledger use the period-filtered rows', () => {
    const s = src('AgentMaster.jsx');
    expect(s).toContain('agentHistorySpec(selected,filtered,payments,entryINR,periodFilter)');
    expect(s).toContain('agentLedgerSpecs(selected,ledger,periodFilter)');
  });
  it('fleet: service history and expense ledger (with its date range)', () => {
    const s = src('FleetMaster.jsx');
    expect(s).toContain('fleetServiceSpec(vehicle,');
    expect(s).toContain('fleetExpenseSpec(vehicle, shown, from, to)');
  });
});
