import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TemplatesHub from '../components/TemplatesHub.jsx';
import ProformaInvoice from '../components/ProformaInvoice.jsx';
import TaxInvoice from '../components/TaxInvoice.jsx';
import MealPlanDocument from '../components/MealPlanDocument.jsx';
import TourBriefingSheet from '../components/TourBriefingSheet.jsx';
import ItineraryBuilder from '../components/ItineraryBuilder.jsx';
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
  it('ProformaInvoice uses a custom bank name from its template prop', () => {
    const customTemplate = { ...DEFAULT_DOC_TEMPLATES.proforma, bankName: 'HDFC Bank' };
    const { container } = render(<ProformaInvoice query={fakeQuery} template={customTemplate} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    const html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('HDFC Bank');
    expect(html).not.toContain('Punjab National Bank');
  });

  it('TaxInvoice uses a custom footer note and place of supply from its template prop', () => {
    const customTemplate = { footerNote: 'Custom jurisdiction note.', placeOfSupply: 'Mumbai (27)' };
    const { container } = render(<TaxInvoice query={fakeQuery} payments={{}} template={customTemplate} onClose={()=>{}}/>);
    expect(screen.getByDisplayValue('Mumbai (27)')).toBeTruthy();
    fireEvent.click(screen.getByText('👁 Preview'));
    const html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('Custom jurisdiction note.');
  });

  it('MealPlanDocument uses a custom default heading from its template prop', () => {
    render(<MealPlanDocument query={fakeQuery} template={{ defaultHeading: 'Custom Meal Heading' }} onClose={()=>{}}/>);
    expect(screen.getByDisplayValue('Custom Meal Heading')).toBeTruthy();
  });

  it('TourBriefingSheet uses custom opening line and footer text from its template prop', () => {
    const customTemplate = { openingLine: 'Custom opening line.', footerText: 'Custom footer block.' };
    const { container } = render(<TourBriefingSheet query={fakeQuery} template={customTemplate} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('👁 Preview'));
    const html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('Custom opening line.');
    expect(html).toContain('Custom footer block.');
  });

  it('ItineraryBuilder uses briefTemplate in Outlined mode and detailTemplate in Detailed mode', () => {
    const { container } = render(
      <ItineraryBuilder
        query={fakeQuery}
        briefTemplate={{ closingTagline: 'BRIEF TAGLINE' }}
        detailTemplate={{ closingTagline: 'DETAIL TAGLINE' }}
        onClose={()=>{}}
      />
    );
    fireEvent.click(screen.getByText('👁 Preview'));
    let html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('BRIEF TAGLINE');

    fireEvent.click(screen.getByText('📝 Content'));
    fireEvent.click(screen.getByText('📖 Detailed'));
    fireEvent.click(screen.getByText('👁 Preview'));
    html = container.querySelector('iframe').getAttribute('srcdoc');
    expect(html).toContain('DETAIL TAGLINE');
  });

  it('every document falls back to sensible hardcoded defaults when no template prop is passed', () => {
    expect(() => render(<ProformaInvoice query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<TaxInvoice query={fakeQuery} payments={{}} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<MealPlanDocument query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<TourBriefingSheet query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
    expect(() => render(<ItineraryBuilder query={fakeQuery} onClose={()=>{}}/>)).not.toThrow();
  });
});
