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

describe('2.2/2.3: greeting+openingLine and closingLine+signoff merged into two rich-text fields', () => {
  it('migrateQuotationRichTextFields reconstructs greetingOpening/closingSignoff from a real old-shape saved row (verified against actual production data)', async () => {
    const { migrateQuotationRichTextFields, mapDbQuotationRow } = await import('../lib/utils.js');
    // Exact shape of a real, live quotation row confirmed directly
    // against the database before this migration -- greeting_opening/
    // closing_signoff are null, only the old 4 columns have content.
    const realOldRow = {
      version: 2, is_final: false,
      greeting: 'Greetings from Unitop Tours & Travel Pvt. Ltd.!',
      opening_line: 'As Desired, Please Find Itinerary & Quotation As Under.',
      closing_line: 'Kindly check & advise your acceptance, with exact date of journey & no. of Pax enabling us to go ahead for the necessary arrangement well in advance.\n\nHope you will find the above in order.',
      signoff: 'Thanks & Regards\n\nTour Deptt.\nUnitop Tours & Travel Pvt. Ltd.',
      greeting_opening: null, closing_signoff: null,
      itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [],
    };
    const mapped = mapDbQuotationRow(realOldRow);
    expect(mapped.greetingOpening).toContain('Greetings from Unitop Tours');
    expect(mapped.greetingOpening).toContain('As Desired, Please Find Itinerary');
    expect(mapped.closingSignoff).toContain('Kindly check');
    expect(mapped.closingSignoff).toContain('Hope you will find the above in order');
    expect(mapped.closingSignoff).toContain('Thanks &amp; Regards');
    expect(mapped.closingSignoff).toContain('Tour Deptt.');
  });

  it('a row already saved in the new shape is used as-is, not re-derived from the old columns', async () => {
    const { mapDbQuotationRow } = await import('../lib/utils.js');
    const newRow = {
      version: 3, is_final: false,
      greeting: 'Stale old value', opening_line: 'Stale old value',
      closing_line: 'Stale old value', signoff: 'Stale old value',
      greeting_opening: '<p>The real current content</p>', closing_signoff: '<p>Also real current content</p>',
      itinerary: [], hotels: [], slabs: [], monuments: [], includes: [], excludes: [],
    };
    const mapped = mapDbQuotationRow(newRow);
    expect(mapped.greetingOpening).toBe('<p>The real current content</p>');
    expect(mapped.closingSignoff).toBe('<p>Also real current content</p>');
  });

  it('escapes HTML-special characters correctly during reconstruction, so an ampersand in old content doesn\u2019t break the resulting markup', async () => {
    const { migrateQuotationRichTextFields } = await import('../lib/utils.js');
    const migrated = migrateQuotationRichTextFields({ greeting: 'Rock & Roll Tours', openingLine: 'A & B' });
    expect(migrated.greetingOpening).toContain('Rock &amp; Roll Tours');
    expect(migrated.greetingOpening).not.toContain('Rock & Roll');
  });

  it('mergeDocTemplates applies the same reconstruction to a saved TEMPLATE, not just a saved quotation row', async () => {
    const { mergeDocTemplates } = await import('../lib/utils.js');
    const { DEFAULT_DOC_TEMPLATES } = await import('../lib/constants.js');
    const savedOldShapeTemplate = {
      quotation: {
        greeting: 'Custom Greeting From Settings', openingLine: 'Custom Opening',
        closingLine: 'Custom Closing', signoff: 'Custom Signoff',
      },
    };
    const merged = mergeDocTemplates(DEFAULT_DOC_TEMPLATES, savedOldShapeTemplate);
    expect(merged.quotation.greetingOpening).toContain('Custom Greeting From Settings');
    expect(merged.quotation.closingSignoff).toContain('Custom Closing');
    expect(merged.quotation.closingSignoff).toContain('Custom Signoff');
  });
});

describe('QuotationGenerator: merged rich-text editing UI', () => {
  const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '<p>Default greeting</p>', closingSignoff: '<p>Default closing</p>', signoff: '', monumentNote: '' };

  it('shows one combined field for greeting+opening, not two separate ones', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb(), realtimeClient: null }));
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/Greeting & Opening/)).toBeTruthy());
    expect(screen.getByText('Greeting + opening line')).toBeTruthy();
    expect(screen.queryByText('Opening Line')).toBeFalsy(); // the old separate field label is gone
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows one combined field for closing+sign-off, not two separate ones', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb(), realtimeClient: null }));
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Closing paragraph + sign-off')).toBeTruthy());
    expect(screen.queryByText('Sign-off')).toBeFalsy(); // the old separate field label is gone
    vi.doUnmock('../lib/supabase.js');
  });
});
