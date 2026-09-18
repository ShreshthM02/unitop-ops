import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_DOC_TEMPLATES } from '../lib/constants.js';

// Direct request: the itinerary's optional Date column used to be a
// free-text field ("e.g. 12 Oct"); it should be a real date picker.

const fakeQuery = { id: 'UTQ-2026-900', groupName: 'Date Picker Test', destination: 'Kerala', nights: 3 };

function makeDb() {
  return {
    from: vi.fn(() => {
      const b = {
        select: () => b, eq: () => b, order: () => b,
        insert: vi.fn(async (row) => ({ data: [{ ...row, id: 'x' }], error: null })),
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

describe('Quotation itinerary Date column: a real date picker, not free text', () => {
  it('the Date column input is a native type="date" field once the column is switched on', async () => {
    await renderQuotation(DEFAULT_DOC_TEMPLATES.quotation);
    fireEvent.click(screen.getByText(/Show a Date column/).closest('label').querySelector('input'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
  });

  it('a chosen date prints formatted as dd/mm/yyyy, the app-wide convention', async () => {
    await renderQuotation(DEFAULT_DOC_TEMPLATES.quotation);
    fireEvent.click(screen.getByText(/Show a Date column/).closest('label').querySelector('input'));
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-10-12' } });
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = document.querySelector('iframe[title="Print Preview"]').srcdoc;
      expect(html).toContain('12/10/2026');
    });
  });
});
