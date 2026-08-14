import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TemplatesHub from '../components/TemplatesHub.jsx';
import ProformaInvoice from '../components/ProformaInvoice.jsx';
import TaxInvoice from '../components/TaxInvoice.jsx';
import MealPlanDocument from '../components/MealPlanDocument.jsx';
import TourBriefingSheet from '../components/TourBriefingSheet.jsx';
import Itinerary from '../components/Itinerary.jsx';
import { DEFAULT_DOC_TEMPLATES } from '../lib/constants.js';

const fakeQuery = {
  id: 'UTQ-2026-060', tourFileId: 'TF-2026-060', groupName: 'Template Test Group',
  clientName: 'Template Test Client', destination: 'Kerala', nights: 5, pax: 8,
  agentName: 'Test Agent', agentCompany: 'Test Co', agentCountry: 'UK',
};

describe('TemplatesHub save wiring (the actual bug)', () => {
  it('calling Save All actually invokes onSaveDocTemplates with the edited templates (previously never called)', () => {
    const onSaveDocTemplates = vi.fn();
    render(
      <TemplatesHub
        docTemplates={DEFAULT_DOC_TEMPLATES}
        onSaveDocTemplates={onSaveDocTemplates}
        docSettings={{}}
        setDocSettings={() => {}}
      />
    );
    fireEvent.click(screen.getByText('💾 Save All Settings'));
    expect(onSaveDocTemplates).toHaveBeenCalledTimes(1);
    const arg = onSaveDocTemplates.mock.calls[0][0];
    expect(arg.quotation).toBeTruthy();
    expect(arg.proforma).toBeTruthy();
  });

  it('editing a field in the generic Proforma template form and saving passes the edited value up', () => {
    const onSaveDocTemplates = vi.fn();
    render(
      <TemplatesHub
        docTemplates={DEFAULT_DOC_TEMPLATES}
        onSaveDocTemplates={onSaveDocTemplates}
        docSettings={{}}
        setDocSettings={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Proforma Invoice/));
    fireEvent.click(screen.getByText('✏ Template Content'));
    const bankNameInput = screen.getByDisplayValue('Punjab National Bank');
    fireEvent.change(bankNameInput, { target: { value: 'HDFC Bank' } });
    fireEvent.click(screen.getByText('💾 Save All Settings'));
    const saved = onSaveDocTemplates.mock.calls[0][0];
    expect(saved.proforma.bankName).toBe('HDFC Bank');
  });

  it('doc types without a schema (costsheet) still show the placeholder message', () => {
    render(
      <TemplatesHub
        docTemplates={DEFAULT_DOC_TEMPLATES}
        onSaveDocTemplates={() => {}}
        docSettings={{}}
        setDocSettings={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/Cost Sheet/));
    fireEvent.click(screen.getByText('✏ Template Content'));
    expect(screen.getByText(/designed in a dedicated session/)).toBeTruthy();
  });

  it('quotation keeps its bespoke includes/excludes list editor, not the generic form', () => {
    render(
      <TemplatesHub
        docTemplates={DEFAULT_DOC_TEMPLATES}
        onSaveDocTemplates={() => {}}
        docSettings={{}}
        setDocSettings={() => {}}
      />
    );
    fireEvent.click(screen.getByText('✏ Template Content'));
    expect(screen.getByText('Default Cost Includes')).toBeTruthy();
  });
});

describe('Documents actually apply their template prop', () => {
  it('ProformaInvoice uses a custom bank name from its template prop', async () => {
    const customTemplate = { ...DEFAULT_DOC_TEMPLATES.proforma, bankName: 'HDFC Bank' };
    const { container } = render(<ProformaInvoice query={fakeQuery} template={customTemplate} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      expect(html).toContain('HDFC Bank');
    });
    const html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('HDFC Bank');
    expect(html).not.toContain('Punjab National Bank');
  });

  it('TaxInvoice uses a custom footer note and place of supply from its template prop', async () => {
    const customTemplate = { footerNote: 'Custom jurisdiction note.', placeOfSupply: 'Mumbai (27)' };
    const { container } = render(<TaxInvoice query={fakeQuery} payments={{}} template={customTemplate} onClose={()=>{}}/>);
    expect(screen.getByDisplayValue('Mumbai (27)')).toBeTruthy();
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      expect(html).toContain('Custom jurisdiction note.');
    });
  });

  it('MealPlanDocument uses a custom default heading from its template prop', () => {
    render(<MealPlanDocument query={fakeQuery} template={{ defaultHeading: 'Custom Meal Heading' }} onClose={()=>{}}/>);
    expect(screen.getByDisplayValue('Custom Meal Heading')).toBeTruthy();
  });

  it('TourBriefingSheet uses custom opening line and footer text from its template prop', async () => {
    const customTemplate = { openingLine: 'Custom opening line.', footerText: 'Custom footer block.' };
    const { container } = render(<TourBriefingSheet query={fakeQuery} template={customTemplate} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      expect(html).toContain('Custom opening line.');
    });
    const html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('Custom footer block.');
  });

  it('Itinerary (Brief flavor, the default) uses briefTemplate for its closing tagline', async () => {
    const { container } = render(
      <Itinerary
        query={fakeQuery}
        briefTemplate={{ closingTagline: 'BRIEF TAGLINE' }}
        onClose={()=>{}}
      />
    );
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      expect(html).toContain('BRIEF TAGLINE');
    });
  });

  it('Itinerary (Detailed flavor) uses detailTemplate for its closing tagline', async () => {
    const { container } = render(
      <Itinerary
        query={fakeQuery}
        detailTemplate={{ closingTagline: 'DETAIL TAGLINE' }}
        onClose={()=>{}}
      />
    );
    fireEvent.click(screen.getByText('Detailed'));
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      expect(html).toContain('DETAIL TAGLINE');
    });
  });

  it('Detailed offers its own editable closing line, no longer a hard-coded sentence', () => {
    // Regression: closingText was previously hard-coded into buildBrochureHTML
    // with no field to change it -- every itinerary got the identical
    // sign-off regardless of destination or client.
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    const field = screen.getByDisplayValue('Tour ends as you leave footprints and take memories.');
    fireEvent.change(field, { target: { value: 'Safe travels, and see you again soon.' } });
    expect(screen.getByDisplayValue('Safe travels, and see you again soon.')).toBeTruthy();
  });

  it('Brief now offers its own closing line too, independent of Detailed\u2019s', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    // Starts on Brief by default -- its closing field is right there too.
    const briefField = screen.getByDisplayValue('Tour ends as you leave footprints and take memories.');
    fireEvent.change(briefField, { target: { value: 'Brief-only sign-off.' } });
    fireEvent.click(screen.getByText('Detailed'));
    // Detailed still shows the untouched default -- editing Brief's did not
    // leak into Detailed's.
    expect(screen.getByDisplayValue('Tour ends as you leave footprints and take memories.')).toBeTruthy();
    expect(screen.queryByDisplayValue('Brief-only sign-off.')).toBeNull();
  });

  it('each flavor offers its own Notes field, positioned above the closing line', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    expect(screen.getByText('Notes')).toBeTruthy();
    const notesField = screen.getByPlaceholderText('A note or reminder for this document');
    fireEvent.change(notesField, { target: { value: 'Confirm veg meal request.' } });
    expect(screen.getByDisplayValue('Confirm veg meal request.')).toBeTruthy();
    fireEvent.click(screen.getByText('Detailed'));
    expect(screen.queryByDisplayValue('Confirm veg meal request.')).toBeNull();
  });

  it('every document falls back to sensible hardcoded defaults when no template prop is passed', () => {
    expect(() => render(<ProformaInvoice query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<TaxInvoice query={fakeQuery} payments={{}} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<MealPlanDocument query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<TourBriefingSheet query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<Itinerary query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
  });

  it('the day block uses a number rail + divider, not a single flush-left column -- addresses a real "left-heavy" report', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    await waitFor(() => {
      const html = container.querySelector('iframe').getAttribute('srcdoc');
      // Day 1's zero-padded number rail, and meal badges right-aligned
      // within the content column rather than left-stacked underneath it.
      expect(html).toContain('01');
      expect(html).toContain('text-align:right');
    });
  });
});

describe('regression: a note attached under Detailed must not appear under Brief', () => {
  it('reproduces the equivalent of the exact reported scenario and confirms it does not happen', async () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    // Switch to Detailed, add a sightseeing item, and give it a note.
    fireEvent.click(screen.getByText('Detailed'));
    fireEvent.click(screen.getAllByText('+ Add Item ▾')[0]);
    fireEvent.click(screen.getByText('Sightseeing'));
    fireEvent.click(screen.getByText('+ Add note'));
    const detailedField = screen.getByPlaceholderText('Longer, client-facing note about this — e.g. history of a monument');
    fireEvent.change(detailedField, { target: { value: 'A long, client-facing paragraph about this monument.' } });
    expect(screen.getByDisplayValue('A long, client-facing paragraph about this monument.')).toBeTruthy();

    // Switch back to Brief -- the reported bug was this text showing up here.
    fireEvent.click(screen.getByText('Brief'));
    expect(screen.queryByDisplayValue('A long, client-facing paragraph about this monument.')).toBeNull();
  });

  it('the original failure mode is now structurally impossible -- Description is not a selectable item type at all', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getAllByText('+ Add Item ▾')[0]);
    expect(screen.queryByText('Description')).toBeNull();
  });
});

describe('cover photo can be chosen independently of Day 1\u2019s auto-derived image', () => {
  it('offers a Cover Photo picker for the Detailed flavor, not for Brief', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    expect(screen.getByText('Cover Photo')).toBeTruthy();
    fireEvent.click(screen.getByText('Brief'));
    expect(screen.queryByText('Cover Photo')).toBeNull();
  });
});

describe('multiple places per day, end to end through the real Itinerary component', () => {
  it('a day starts with one place slot, and "+ Add another stop" is available in Detailed', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    expect(screen.getAllByText('+ Add another stop this day').length).toBeGreaterThan(0);
  });

  it('adding a stop reveals a leg-mode toggle for the new slot', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    const addButtons = screen.getAllByText('+ Add another stop this day');
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByText('Road').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Flight').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Train').length).toBeGreaterThan(0);
  });

  it('a removed extra stop takes its leg-mode toggle with it, back to a single-place day', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    fireEvent.click(screen.getAllByText('+ Add another stop this day')[0]);
    fireEvent.click(screen.getAllByLabelText('Remove stop 2')[0]);
    expect(screen.queryByText('Road')).toBeNull();
  });
});
