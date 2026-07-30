import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-3100', groupName: 'Feedback Batch Test Group' };
const fakeTemplate = {
  includes: [], excludes: [], monuments: [], showMonuments: true,
  greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: 'Monument Fees Heading',
  flightsHeading: 'Domestic Flights', trainsHeading: 'Domestic Trains', remarksHeading: 'Remarks',
};

function makeDb() {
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    }),
  };
}

async function renderQuotation() {
  const db = makeDb();
  vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
  vi.resetModules();
  const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
  render(<QuotationGenerator query={fakeQuery} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
}

describe('Quotation feedback batch (2026-07-30): 1.1-1.6', () => {
  it('1.2: itinerary table defaults to no Date column, and a checkbox reveals one', async () => {
    await renderQuotation();
    const dateHeaderBefore = Array.from(document.querySelectorAll('th')).some(th => th.textContent === 'Date');
    expect(dateHeaderBefore).toBe(false);
    const dateToggle = screen.getByText(/Show a Date column/);
    fireEvent.click(dateToggle.closest('label').querySelector('input'));
    const dateHeaderAfter = Array.from(document.querySelectorAll('th')).some(th => th.textContent === 'Date');
    expect(dateHeaderAfter).toBe(true);
  });

  it('1.2: B\'Fast column is now labeled Breakfast', async () => {
    await renderQuotation();
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.queryByText("B'Fast")).toBeNull();
  });

  it('1.3: Domestic Flights and Domestic Trains sections exist, off by default, each with an Add button once shown', async () => {
    await renderQuotation();
    expect(screen.getByText('✈ Domestic Flights')).toBeTruthy();
    expect(screen.getByText('🚆 Domestic Trains')).toBeTruthy();
    expect(screen.queryByText('+ Add Flight')).toBeNull();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    expect(screen.getByText('+ Add Flight')).toBeTruthy();
    fireEvent.click(screen.getByText(/Show domestic trains/).closest('label').querySelector('input'));
    expect(screen.getByText('+ Add Train')).toBeTruthy();
  });

  it('1.3: adding a flight entry and typing into it updates the field', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    const input = screen.getByPlaceholderText('e.g. Delhi / Varanasi — 6E 2134');
    fireEvent.change(input, { target: { value: 'Delhi / Varanasi — 6E 2134' } });
    expect(input.value).toBe('Delhi / Varanasi — 6E 2134');
  });

  it('1.4: Monument Fees section now renders after Accommodation and before Cost Per Person in the content tab', async () => {
    await renderQuotation();
    const labels = screen.getAllByText(/🏨 Accommodation|🏛 Monument Fees|💰 Cost Per Person/).map(el => el.textContent);
    expect(labels).toEqual(['🏨 Accommodation', '🏛 Monument Fees', '💰 Cost Per Person']);
  });

  it('1.5: Remarks section exists between Monument Fees and Cost Per Person, off by default', async () => {
    await renderQuotation();
    expect(screen.getByText('📝 Remarks')).toBeTruthy();
    const labels = screen.getAllByText(/🏛 Monument Fees|📝 Remarks|💰 Cost Per Person/).map(el => el.textContent);
    expect(labels).toEqual(['🏛 Monument Fees', '📝 Remarks', '💰 Cost Per Person']);
    fireEvent.click(screen.getByText(/Show remarks/).closest('label').querySelector('input'));
    const textarea = screen.getByPlaceholderText('Any additional notes for this quotation...');
    fireEvent.change(textarea, { target: { value: 'Please confirm by Friday.' } });
    expect(textarea.value).toBe('Please confirm by Friday.');
  });

  it('1.1: the paginated print HTML has real spacing between date/addressee/subject/greeting/opening line', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="Print Preview"]');
      expect(iframe.srcdoc).toContain('margin-top:8pt');
      expect(iframe.srcdoc).toContain('margin:14pt 0');
    });
  });

  it('new sections show up in the paginated print output in the right order when enabled', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Delhi / Varanasi — 6E 2134'), { target: { value: 'DEL-VNS 6E2134' } });
    fireEvent.click(screen.getByText(/Show remarks/).closest('label').querySelector('input'));
    fireEvent.change(screen.getByPlaceholderText('Any additional notes for this quotation...'), { target: { value: 'Confirm by Friday' } });
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const iframe = document.querySelector('iframe[title="Print Preview"]');
      const html = iframe.srcdoc;
      expect(html).toContain('Domestic Flights');
      expect(html).toContain('DEL-VNS 6E2134');
      const flightsIdx = html.indexOf('Domestic Flights');
      const accIdx = html.indexOf('Accommodation');
      expect(flightsIdx).toBeGreaterThan(-1);
      expect(accIdx).toBeGreaterThan(flightsIdx);
      const remarksIdx = html.indexOf('Confirm by Friday');
      const priceIdx = html.indexOf('Cost Per Person');
      expect(remarksIdx).toBeGreaterThan(-1);
      expect(priceIdx).toBeGreaterThan(remarksIdx);
    });
  });

  it('1.6: Template Content tab (TemplatesHub) has heading fields for Domestic Flights, Domestic Trains, and Remarks', async () => {
    vi.resetModules();
    const { default: TemplatesHub } = await import('../components/TemplatesHub.jsx');
    render(<TemplatesHub docTemplates={{}} onSaveDocTemplates={()=>{}} docSettings={{}} setDocSettings={()=>{}}/>);
    fireEvent.click(screen.getByText('✏ Template Content'));
    expect(screen.getByText('Domestic Flights Heading')).toBeTruthy();
    expect(screen.getByText('Domestic Trains Heading')).toBeTruthy();
    expect(screen.getByText('Remarks Heading')).toBeTruthy();
  });
});
