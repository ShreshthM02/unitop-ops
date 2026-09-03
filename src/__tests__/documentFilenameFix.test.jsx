import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// 8: every document's downloaded .docx filename used to be built from
// only the client/agent name, with no stable identifier at all -- two
// similarly-named clients (or a repeat client across different tours)
// produced indistinguishable filenames. Now every one leads with the
// Tour File ID (once converted) or Query ID, matching the same "smart
// identifier" the {id} document-numbering placeholder already uses,
// with the group name kept alongside for readability.

function mockDbForVersionlessDoc() {
  return { from: () => ({
    select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    insert: async (r) => ({ data: [{ ...r, id: 'x' }], error: null }),
    update: async () => ({ data: [], error: null }),
  }) };
}

async function captureDownloadedFilename(triggerExport) {
  const realCreateElement = document.createElement.bind(document);
  let capturedFilename = null;
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreateElement(tag);
    if (tag === 'a') { el.click = vi.fn(); Object.defineProperty(el, 'download', { get() { return this._d; }, set(v) { this._d = v; capturedFilename = v; } }); }
    return el;
  });
  const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock');
  const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  try {
    await triggerExport();
    for (let i = 0; i < 40 && !capturedFilename; i++) await new Promise(r => setTimeout(r, 100));
    return capturedFilename;
  } finally {
    // Guaranteed cleanup even if an assertion inside triggerExport throws
    // -- without this, a failed test leaves document.createElement
    // wrapped, and the NEXT test's spy wraps the wrapper, recursing
    // infinitely (exactly what happened here: one failed Itinerary
    // assertion cascaded into a stack overflow in the unrelated TBS test
    // that ran after it).
    createElementSpy.mockRestore(); createObjectURLSpy.mockRestore(); revokeObjectURLSpy.mockRestore();
  }
}

describe('Quotation download filename', () => {
  const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '', closingSignoff: '', monumentNote: '' };

  it('leads with the Tour File ID once converted, not just the client name', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbForVersionlessDoc(), realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', tourFileId: 'TUR-2026-005', groupName: 'Smith Family' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    const filename = await captureDownloadedFilename(async () => {
      await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Word/));
    });
    expect(filename).toBe('Quotation - TUR-2026-005 - Smith Family.docx');
    vi.doUnmock('../lib/supabase.js');
  });

  it('falls back to the Query ID before conversion', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbForVersionlessDoc(), realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const query = { id: 'UTQ-1', groupName: 'Smith Family' }; // no tourFileId yet
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    const filename = await captureDownloadedFilename(async () => {
      await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Word/));
    });
    expect(filename).toBe('Quotation - UTQ-1 - Smith Family.docx');
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Itinerary download filenames (both flavors)', () => {
  it('Brief Itinerary leads with the stable identifier', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbForVersionlessDoc(), realtimeClient: null }));
    vi.resetModules();
    const { default: Itinerary } = await import('../components/Itinerary.jsx');
    const query = { id: 'UTQ-2', tourFileId: 'TUR-2026-009', groupName: 'Golden Triangle Group', nights: 5 };
    render(<Itinerary query={query} briefTemplate={{}} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const filename = await captureDownloadedFilename(async () => {
      await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Brief Word/));
    });
    expect(filename).toBe('Brief Itinerary - TUR-2026-009 - Golden Triangle Group.docx');
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Tour Briefing Sheet download filename', () => {
  it('leads with the stable identifier', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbForVersionlessDoc(), realtimeClient: null }));
    vi.resetModules();
    const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
    const query = { id: 'UTQ-3', tourFileId: 'TUR-2026-011', groupName: 'Kerala Backwaters Group', nights: 3 };
    render(<TourBriefingSheet query={query} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    const filename = await captureDownloadedFilename(async () => {
      await waitFor(() => expect(screen.getByText(/⬇ Export/)).toBeTruthy());
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Word/));
    });
    expect(filename).toBe('Tour Briefing Sheet - TUR-2026-011 - Kerala Backwaters Group.docx');
    vi.doUnmock('../lib/supabase.js');
  });
});
