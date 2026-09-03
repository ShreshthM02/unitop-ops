import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TemplatesHub from '../components/TemplatesHub.jsx';
import { DEFAULT_DOC_TEMPLATES } from '../lib/constants.js';
import { mergeDocTemplates } from '../lib/utils.js';

// ── 2.5: template merge + propagation ───────────────────────────────────
describe('2.5 mergeDocTemplates: field-level merge, not whole-object replace', () => {
  it('keeps default values for template fields the saved row never had', () => {
    const oldSaved = { quotation: { greeting: 'Custom greeting!' } };
    const merged = mergeDocTemplates(DEFAULT_DOC_TEMPLATES, oldSaved);
    expect(merged.quotation.greeting).toBe('Custom greeting!');
    // These were added after that hypothetical save -- must fall back, not vanish
    expect(merged.quotation.flightsHeading).toBe('Domestic Flights');
    expect(merged.quotation.trainsHeading).toBe('Domestic Trains');
    expect(merged.quotation.remarksHeading).toBe('Remarks');
  });

  it('leaves documents absent from the saved row entirely at their defaults', () => {
    const merged = mergeDocTemplates(DEFAULT_DOC_TEMPLATES, { quotation: { greeting: 'x' } });
    expect(merged.proforma).toEqual(DEFAULT_DOC_TEMPLATES.proforma);
    expect(merged.taxinvoice).toEqual(DEFAULT_DOC_TEMPLATES.taxinvoice);
  });

  it('tolerates null/undefined/garbage saved values without throwing', () => {
    expect(mergeDocTemplates(DEFAULT_DOC_TEMPLATES, null)).toEqual(DEFAULT_DOC_TEMPLATES);
    expect(mergeDocTemplates(DEFAULT_DOC_TEMPLATES, undefined)).toEqual(DEFAULT_DOC_TEMPLATES);
    expect(() => mergeDocTemplates(DEFAULT_DOC_TEMPLATES, 'nonsense')).not.toThrow();
  });
});

describe('2.5 TemplatesHub: picks up templates that arrive after mount', () => {
  const noop = () => {};

  it('re-seeds when the async doc_templates load resolves after this pane mounted', () => {
    const saved = mergeDocTemplates(DEFAULT_DOC_TEMPLATES, { proforma: { bankName: 'SAVED BANK' } });
    const { rerender } = render(<TemplatesHub docTemplates={DEFAULT_DOC_TEMPLATES} onSaveDocTemplates={noop} docSettings={{}} setDocSettings={noop}/>);
    rerender(<TemplatesHub docTemplates={saved} onSaveDocTemplates={noop} docSettings={{}} setDocSettings={noop}/>);
    fireEvent.click(screen.getByText('🧾 Proforma Invoice'));
    fireEvent.click(screen.getByText('✏ Template Content'));
    const input = screen.getByText('Bank Name').parentElement.querySelector('input, textarea');
    expect(input.value).toBe('SAVED BANK');
  });

  it('does NOT clobber edits already made in this session when a late load lands', () => {
    const saved = mergeDocTemplates(DEFAULT_DOC_TEMPLATES, { proforma: { bankName: 'SAVED BANK' } });
    const { rerender } = render(<TemplatesHub docTemplates={DEFAULT_DOC_TEMPLATES} onSaveDocTemplates={noop} docSettings={{}} setDocSettings={noop}/>);
    fireEvent.click(screen.getByText('🧾 Proforma Invoice'));
    fireEvent.click(screen.getByText('✏ Template Content'));
    const input = screen.getByText('Bank Name').parentElement.querySelector('input, textarea');
    fireEvent.change(input, { target: { value: 'USER TYPED THIS' } });
    rerender(<TemplatesHub docTemplates={saved} onSaveDocTemplates={noop} docSettings={{}} setDocSettings={noop}/>);
    expect(screen.getByText('Bank Name').parentElement.querySelector('input, textarea').value).toBe('USER TYPED THIS');
  });

  it('saving hands the parent the merged templates, so edits reach live documents', () => {
    const onSave = vi.fn();
    render(<TemplatesHub docTemplates={DEFAULT_DOC_TEMPLATES} onSaveDocTemplates={onSave} docSettings={{}} setDocSettings={noop}/>);
    fireEvent.click(screen.getByText('✏ Template Content'));
    const input = screen.getByText('Domestic Flights Heading').parentElement.querySelector('input, textarea');
    fireEvent.change(input, { target: { value: 'Internal Flights' } });
    fireEvent.click(screen.getByText('💾 Save All Settings'));
    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].quotation.flightsHeading).toBe('Internal Flights');
  });

  it('every schema-driven document exposes editable Template Content fields', () => {
    const docs = [
      ['🧾 Proforma Invoice', 'Bank Name'],
      ['🧾 Tax Invoice', 'Footer Note'],
      ['📄 Tour Briefing Sheet', 'Opening Line'],
      ['🗺 Brief Itinerary', 'Closing Tagline'],
      ['🎫 Exchange Order', 'Instruction Line'],
    ];
    for (const [sidebarLabel, fieldLabel] of docs) {
      const { unmount } = render(<TemplatesHub docTemplates={DEFAULT_DOC_TEMPLATES} onSaveDocTemplates={noop} docSettings={{}} setDocSettings={noop}/>);
      fireEvent.click(screen.getByText(sidebarLabel));
      fireEvent.click(screen.getByText('✏ Template Content'));
      const input = screen.getByText(fieldLabel).parentElement.querySelector('input, textarea');
      expect(input, `${sidebarLabel} -> ${fieldLabel} field missing`).toBeTruthy();
      expect(input.disabled, `${sidebarLabel} -> ${fieldLabel} is disabled`).toBeFalsy();
      expect(input.readOnly, `${sidebarLabel} -> ${fieldLabel} is readOnly`).toBeFalsy();
      fireEvent.change(input, { target: { value: 'typed value' } });
      expect(input.value, `${sidebarLabel} -> ${fieldLabel} did not accept input`).toBe('typed value');
      unmount();
    }
  });
});

// ── 2.3 / 2.4: Quotation section fixes ──────────────────────────────────
const fakeQuery = { id: 'UTQ-2026-3200', groupName: 'Batch 2 Test Group' };

function makeDb() {
  return {
    from: vi.fn(() => {
      const b = {
        select: () => b, eq: () => b, order: () => b,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (res) => res({ data: [], error: null }),
      };
      return b;
    }),
  };
}

async function renderQuotation(template) {
  vi.doMock('../lib/supabase.js', () => ({ db: makeDb(), realtimeClient: null }));
  vi.resetModules();
  const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
  render(<QuotationGenerator query={fakeQuery} template={template} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
}

describe('2.3 Quotation flights/trains: day/date field and no "undefined" headings', () => {
  it('each flight and train entry has its own day/date field alongside the detail field', async () => {
    await renderQuotation(DEFAULT_DOC_TEMPLATES.quotation);
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    const dayInput = screen.getByPlaceholderText('Day 02 / 12 Oct');
    const detailInput = screen.getByPlaceholderText('e.g. Delhi / Varanasi — 6E 2134');
    fireEvent.change(dayInput, { target: { value: 'Day 02' } });
    fireEvent.change(detailInput, { target: { value: 'DEL / VNS — 6E 2134' } });
    expect(dayInput.value).toBe('Day 02');
    expect(detailInput.value).toBe('DEL / VNS — 6E 2134');
  });

  it('a template missing the heading fields still prints real headings, never the word "undefined"', async () => {
    // Simulates a doc_templates row saved before batch 1 added these fields,
    // reaching the component without going through mergeDocTemplates.
    const stale = { ...DEFAULT_DOC_TEMPLATES.quotation };
    delete stale.flightsHeading; delete stale.trainsHeading; delete stale.remarksHeading;
    await renderQuotation(stale);
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    fireEvent.change(screen.getByPlaceholderText('Day 02 / 12 Oct'), { target: { value: 'Day 02' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Delhi / Varanasi — 6E 2134'), { target: { value: 'DEL/VNS' } });
    fireEvent.click(screen.getByText(/Show remarks/).closest('label').querySelector('input'));
    // Editor order in the form shifted after item 10's reorder (Greeting
    // & Opening moved to sit right after Subject) -- finding by DOM
    // position relative to the actual "Remarks" section heading instead
    // of a fragile hardcoded index, so this doesn't break again the next
    // time a field gets reordered.
    const remarksHeading = screen.getByText("📝 Remarks");
    const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    const editor = editors.find(el => remarksHeading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    editor.innerHTML = 'note';
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = document.querySelector('iframe[title="Print Preview"]').srcdoc;
      expect(html).not.toContain('undefined');
      expect(html).toContain('Domestic Flights');
      expect(html).toContain('Remarks');
    });
  });

  it('flights render as a Day + Details table in the print output', async () => {
    await renderQuotation(DEFAULT_DOC_TEMPLATES.quotation);
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    fireEvent.change(screen.getByPlaceholderText('Day 02 / 12 Oct'), { target: { value: 'Day 02' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Delhi / Varanasi — 6E 2134'), { target: { value: 'DEL/VNS 6E2134' } });
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = document.querySelector('iframe[title="Print Preview"]').srcdoc;
      expect(html).toContain('Flight Details');
      expect(html).toContain('Day 02');
      expect(html).toContain('DEL/VNS 6E2134');
    });
  });
});

describe('2.4 scroll position is preserved across section add/remove/toggle', () => {
  it('adding a flight, train, or include does not reset window scroll to the top', async () => {
    await renderQuotation(DEFAULT_DOC_TEMPLATES.quotation);
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    window.scrollTo(0, 800);
    Object.defineProperty(window, 'scrollY', { value: 800, writable: true, configurable: true });
    const scrollSpy = vi.spyOn(window, 'scrollTo');
    fireEvent.click(screen.getByText('+ Add Flight'));
    // The restore effect must fire with the saved offset, not 0.
    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith(0, 800);
    });
    scrollSpy.mockRestore();
  });
});
