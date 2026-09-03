import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { buildDownloadFilename } from '../lib/utils.js';

// Item 1: PDF and Word (and Excel, for Cost Sheet) used to compute their
// filenames as completely independent, differently-hardcoded strings --
// the actual complaint was that they disagreed with each other and
// neither reflected what's configured in Template Content settings.
// One shared buildDownloadFilename(), read once per document and reused
// for every export format, fixes both problems at once.

describe('buildDownloadFilename', () => {
  it('uses the real, already-generated number when one is passed (Invoice, Exchange Order)', () => {
    expect(buildDownloadFilename('Proforma Invoice', 'proforma', {}, {}, 'PI-2026-005')).toBe('Proforma Invoice - PI-2026-005');
  });

  it('computes from the configured Template Content pattern when no real number exists for this doc type', () => {
    const docSettings = { quotation: { prefix: 'QT', pattern: '{prefix}-{seq}-{group}', serial: 3 } };
    const result = buildDownloadFilename('Quotation', 'quotation', docSettings, { group: 'Smith Family' });
    expect(result).toBe('Quotation - QT-003-Smith_Family');
  });

  it('falls back to the stable tourfile/query identifier + group name when no pattern is configured at all', () => {
    const result = buildDownloadFilename('Quotation', 'quotation', {}, { id: 'UTQ-1', tourfile: 'TUR-2026-005', group: 'Smith Family' });
    expect(result).toBe('Quotation - TUR-2026-005 - Smith Family');
  });

  it('falls back to the query id before conversion, matching the same "smart identifier" the {id} pattern placeholder uses', () => {
    const result = buildDownloadFilename('Quotation', 'quotation', {}, { id: 'UTQ-1', group: 'Smith Family' });
    expect(result).toBe('Quotation - UTQ-1 - Smith Family');
  });

  it('a real number always wins over a configured pattern, even if both are present', () => {
    const docSettings = { proforma: { prefix: 'PI', pattern: '{prefix}-{seq}-{group}' } };
    const result = buildDownloadFilename('Proforma Invoice', 'proforma', docSettings, { group: 'Should Not Appear' }, 'PI-2026-005');
    expect(result).toBe('Proforma Invoice - PI-2026-005');
    expect(result).not.toContain('Should Not Appear');
  });
});

describe('Quotation: PDF and Word now genuinely produce the identical filename', () => {
  const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '', closingSignoff: '', monumentNote: '' };

  it('the PDF title and the Word download filename are the exact same string, not just similar', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', tourFileId: 'TUR-2026-020', groupName: 'Consistency Test' };
    const docSettings = { quotation: { prefix: 'QT', pattern: '{prefix}-{seq}-{group}', serial: 7 } };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}} docSettings={docSettings}/>);

    let capturedFilename = null;
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') { el.click = vi.fn(); Object.defineProperty(el, 'download', { get() { return this._d; }, set(v) { this._d = v; capturedFilename = v; } }); }
      return el;
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Word/));
      for (let i = 0; i < 40 && !capturedFilename; i++) await new Promise(r => setTimeout(r, 100));
    } finally {
      createElementSpy.mockRestore(); createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore();
    }
    // The configured pattern is what BOTH PDF and Word now use -- not
    // the old, independently-hardcoded shapes (attnCompany for PDF,
    // tourFileId+group for Word).
    expect(capturedFilename).toBe('Quotation - QT-007-Consistency_Test.docx');
    vi.doUnmock('../lib/supabase.js');
  });
});
