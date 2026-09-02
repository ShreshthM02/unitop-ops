import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// #2 of the general backlog: quotations.confirmed_pax never flowed back
// into queries.pax_display -- the Final Price Sheet's confirmed pax count
// (the real, locked-in number once a version is marked final) stayed
// stranded on the quotation alone. Marking a version final should now
// push it onto the query's own paxDisplay, the field reports/documents
// actually read throughout the app.

const savedRow = {
  version: 1, is_final: false, final_price_entries: [{ paxPaying: '18', foc: '2', rate: '237' }],
  confirmed_pax: 20, tour_value: 4266, attn_name: 'Pee Suchint', attn_company: 'ABC Travels', attn_city: 'Bangkok',
  date: '2026-08-01', currency: 'US $', itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [],
  greeting: '', opening_line: '', closing_line: '', signoff: '',
};

function mockDb() {
  const db = { from: () => ({
    select: () => db.from(),
    eq: () => db.from(),
    order: () => db.from(),
    update: async () => ({ data: [], error: null }),
    insert: async (r) => ({ data: [{ ...r, id: 'x' }], error: null }),
    then: (resolve) => resolve({ data: [savedRow], error: null }),
  }) };
  return db;
}

describe('Marking a Quotation version final syncs its confirmed pax onto the query', () => {
  beforeEach(() => { vi.resetModules(); });
  const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

  it('calls onUpdateQuery with the Final Price Sheet’s confirmed pax count as paxDisplay', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb(), realtimeClient: null }));
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const onUpdateQuery = vi.fn();
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}} onUpdateQuery={onUpdateQuery}/>);

    await waitFor(() => expect(screen.getAllByText(/▾/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/^v\d+.*▾$/)[0]);
    await waitFor(() => expect(screen.getByTitle('Mark as final')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Mark as final'));

    expect(onUpdateQuery).toHaveBeenCalledWith('UTQ-1', { paxDisplay: '20 pax' });
    vi.doUnmock('../lib/supabase.js');
  });

  it('does not throw when onUpdateQuery is not provided (older callers stay safe)', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb(), realtimeClient: null }));
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getAllByText(/▾/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText(/^v\d+.*▾$/)[0]);
    await waitFor(() => expect(screen.getByTitle('Mark as final')).toBeTruthy());
    expect(() => fireEvent.click(screen.getByTitle('Mark as final'))).not.toThrow();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Quotation Word export now goes through the shared converter (wordExport.js retired)', () => {
  // Letterhead-toggle mechanics (margins, header/footer file counts,
  // page numbering, printOnLetterhead) are already covered generically
  // against buildDocxBlobFromBodyBlocks in wordExportRollout.test.jsx,
  // and section ordering is already covered for the PDF path in
  // quotationFeedbackBatch1.test.jsx -- since both paths now share the
  // exact same bodyBlocks array by construction (that's the point of
  // this refactor), re-testing either here would just be redundant.
  // This is a focused wiring-sanity check: does Quotation's own export
  // actually produce a real, non-trivial .docx via the shared path.
  beforeEach(() => { vi.resetModules(); });
  const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };

  it('Export > Word produces a real docx containing the quotation’s own content', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb(), realtimeClient: null }));
    const JSZip = (await import('jszip')).default;
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };

    let capturedBlob = null;
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { capturedBlob = blob; return 'blob:mock'; });
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') el.click = vi.fn();
      return el;
    });

    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
    fireEvent.click(screen.getByText(/⬇ Export/));
    fireEvent.click(screen.getByText(/Word/));
    for (let i = 0; i < 40 && !capturedBlob; i++) await new Promise(r => setTimeout(r, 100));

    expect(capturedBlob).toBeTruthy();
    expect(capturedBlob.size).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(await capturedBlob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml').async('string');
    expect(documentXml).toContain('Pee Suchint'); // the loaded quotation's own addressee name

    createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore(); createElementSpy.mockRestore();
    vi.doUnmock('../lib/supabase.js');
  });
});
