import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportMenu } from '../lib/ExportMenu.jsx';
import { paginateBodyBlocks, invoiceLetterheadCSS } from '../lib/letterhead.js';
import { G } from '../lib/constants.js';

describe('2.1 ExportMenu: one button, formats inside', () => {
  it('renders a single dropdown button, not one button per format', () => {
    render(<ExportMenu G={G} actions={[
      { id:'pdf', label:'PDF', onSelect:()=>{} },
      { id:'word', label:'Word', onSelect:()=>{} },
      { id:'print', label:'Print', onSelect:()=>{} },
    ]}/>);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('📕 PDF')).toBeNull();
  });

  it('opens on click and lists every action', () => {
    render(<ExportMenu G={G} actions={[
      { id:'pdf', label:'PDF', icon:'📕', onSelect:()=>{} },
      { id:'word', label:'Word', icon:'📄', onSelect:()=>{} },
      { id:'print', label:'Print', icon:'🖨', onSelect:()=>{} },
    ]}/>);
    fireEvent.click(screen.getByText('⬇ Export ▾'));
    expect(screen.getByText('📕 PDF')).toBeTruthy();
    expect(screen.getByText('📄 Word')).toBeTruthy();
    expect(screen.getByText('🖨 Print')).toBeTruthy();
  });

  it('invokes the chosen action and closes', async () => {
    const onWord = vi.fn();
    render(<ExportMenu G={G} actions={[
      { id:'pdf', label:'PDF', icon:'📕', onSelect:()=>{} },
      { id:'word', label:'Word', icon:'📄', onSelect:onWord },
    ]}/>);
    fireEvent.click(screen.getByText('⬇ Export ▾'));
    fireEvent.click(screen.getByText('📄 Word'));
    expect(onWord).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('📄 Word')).toBeNull());
  });

  it('collapses to a plain button when only one format is available', () => {
    const onPdf = vi.fn();
    render(<ExportMenu G={G} actions={[{ id:'pdf', label:'PDF', icon:'📕', onSelect:onPdf }]}/>);
    expect(screen.queryByText('⬇ Export ▾')).toBeNull();
    fireEvent.click(screen.getByText('📕 PDF'));
    expect(onPdf).toHaveBeenCalled();
  });

  it('surfaces a failing export instead of swallowing it', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(()=>{});
    render(<ExportMenu G={G} actions={[
      { id:'word', label:'Word', onSelect:()=>{ throw new Error('boom'); } },
      { id:'pdf', label:'PDF', onSelect:()=>{} },
    ]}/>);
    fireEvent.click(screen.getByText('⬇ Export ▾'));
    fireEvent.click(screen.getByText('⬇ Word'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('boom')));
    alertSpy.mockRestore();
  });
});

describe('2.2 section heading spacing actually reaches the printed page', () => {
  it('gives headings a real top margin that outranks the paginator\'s margin reset', () => {
    const css = invoiceLetterheadCSS;
    // The reset that was silently cancelling h2 margin-top mid-page.
    expect(css).toContain('.print-page-content > * + * { margin-top: 0; }');
    // More specific rule (0,1,1) restoring it for section headings.
    expect(css).toMatch(/\.print-page-content > h2 \{ margin-top: 26pt; \}/);
    // ...but not for a heading that opens a page, which should sit flush.
    expect(css).toMatch(/\.print-page-content > h2:first-child \{ margin-top: 0; \}/);
  });
});

describe('pagination: a section heading is never stranded at the foot of a page', () => {
  const HEADING = '<h2>ACCOMMODATION</h2>';
  const table = (rows) => ({ type:'table', headerHTML:'<tr><th>Place</th></tr>', rowsHTML: rows });

  // Fixed-size stubs: every plain block 100px tall, table header 40px, each row 30px.
  const measureFn = () => 100;
  const tableMeasureFn = (_h, rowsHTML) => ({ headerHeightPx: 40, rowHeightsPx: rowsHTML.map(()=>30) });
  const opts = { pageContentHeightPx: 300, containerWidthPx: 800, measureFn, tableMeasureFn };

  it('pushes the heading to the next page when only the heading itself would fit', () => {
    const pages = paginateBodyBlocks([
      '<p>filler</p>', '<p>filler</p>',      // 200px used, 100px left
      HEADING,                                // heading alone fits (100px)...
      table(['<tr><td>a</td></tr>']),          // ...but header+row (70px) would not
    ], opts);
    const page1 = pages[0].join('');
    expect(page1).not.toContain('ACCOMMODATION');
    expect(pages[1].join('')).toContain('ACCOMMODATION');
  });

  it('keeps the heading on the current page when its content does fit alongside it', () => {
    const pages = paginateBodyBlocks([
      '<p>filler</p>',                         // 100px used, 200px left
      HEADING,                                 // 100px -> 100px left
      table(['<tr><td>a</td></tr>']),           // 70px fits
    ], opts);
    expect(pages[0].join('')).toContain('ACCOMMODATION');
    expect(pages).toHaveLength(1);
  });

  it('does not strand a heading before a plain (non-table) block either', () => {
    const pages = paginateBodyBlocks([
      '<p>filler</p>', '<p>filler</p>',        // 200px used, 100px left
      HEADING,                                  // fits alone...
      '<p>body</p>',                            // ...but its 100px body would not
    ], opts);
    expect(pages[0].join('')).not.toContain('ACCOMMODATION');
    expect(pages[1].join('')).toContain('ACCOMMODATION');
  });

  it('a trailing heading with nothing after it still places normally', () => {
    const pages = paginateBodyBlocks(['<p>filler</p>', HEADING], opts);
    expect(pages[0].join('')).toContain('ACCOMMODATION');
  });
});
