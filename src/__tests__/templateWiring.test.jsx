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

  it('Detailed offers its own editable closing line, empty by default -- not pre-filled with text that duplicates the template\u2019s own sign-off', () => {
    // Regression (two-part): closingText was originally hard-coded with no
    // field to change it at all; once a field was added, its default value
    // was accidentally the SAME sentence as the template's own
    // closingTagline default, so an itinerary that never touched this
    // field printed that sentence twice -- once as this field, once again
    // as the template's bold sign-off just below it. Confirmed against a
    // real exported PDF. Empty is the only default that cannot collide.
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    const field = screen.getByPlaceholderText('Tour ends as you leave footprints and take memories.');
    expect(field.value).toBe('');
    fireEvent.change(field, { target: { value: 'Safe travels, and see you again soon.' } });
    expect(screen.getByDisplayValue('Safe travels, and see you again soon.')).toBeTruthy();
  });

  it('Brief now offers its own closing line too, independent of Detailed\u2019s, also empty by default', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    // Starts on Brief by default -- its closing field is right there too.
    const briefField = screen.getByPlaceholderText('Tour ends as you leave footprints and take memories.');
    expect(briefField.value).toBe('');
    fireEvent.change(briefField, { target: { value: 'Brief-only sign-off.' } });
    fireEvent.click(screen.getByText('Detailed'));
    // Detailed still shows its own untouched (empty) default -- editing
    // Brief's did not leak into Detailed's.
    expect(screen.getByPlaceholderText('Tour ends as you leave footprints and take memories.').value).toBe('');
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

  it('removing an added stop reduces the leg-mode toggle count back down, not to zero -- the remaining single place still governs its own inter-day leg', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    const roadCountBefore = screen.getAllByText('Road').length;
    fireEvent.click(screen.getAllByText('+ Add another stop this day')[0]);
    expect(screen.getAllByText('Road').length).toBeGreaterThan(roadCountBefore);
    fireEvent.click(screen.getAllByLabelText('Remove stop 2')[0]);
    expect(screen.getAllByText('Road')).toHaveLength(roadCountBefore);
  });
});

describe('regression: switching flavor while already on Preview must never show the other flavor\u2019s stale content', () => {
  it('the preview is cleared immediately on flavor switch, not left showing the previous flavor until the new build resolves', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).not.toContain('Brief Itinerary');
    });
    fireEvent.click(screen.getByText('Detailed'));
    // Checked BEFORE any awaiting -- this is exactly the moment that used
    // to still show Brief's stale content while Detailed's build was still
    // in flight.
    const immediateDoc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
    expect(immediateDoc).not.toContain('Brief Itinerary');
  });
});

describe('regression: an untouched itinerary must not print its closing sentence twice', () => {
  it('a fresh itinerary\u2019s plain-letterhead output shows the template tagline exactly once, not the closing-line text duplicating it', async () => {
    render(<Itinerary query={fakeQuery} briefTemplate={{ closingTagline: 'TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES' }} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = document.querySelector('iframe')?.getAttribute('srcdoc') || '';
      const occurrences = (doc.match(/leave footprints and take memories/gi) || []).length;
      expect(occurrences).toBe(1);
    });
  });
});

describe('regression: Brief and Detailed must be visually distinguishable even with NO flavor-specific content at all', () => {
  // The real, confirmed root cause of "Detailed shows Brief's preview":
  // route/sightseeing/stay item TEXT is deliberately shared between
  // flavors (only per-item notes fork), and the document title passed to
  // buildPaginatedLetterheadDocument only ever set the invisible HTML
  // <title> tag, never anything rendered in the body. For an itinerary
  // that has not yet had any notes, remarks or closing text entered --
  // which is every itinerary the moment it is created -- the two
  // documents' visible bodies were genuinely, byte-for-byte identical.
  // This was never a flavor-selection bug; the correct flavor's content
  // was always being built. There was simply nothing on the page to show
  // it.
  it('a brand new itinerary (no notes, no remarks, no closing text touched) still shows a different heading per flavor', async () => {
    // Brief's heading default changed from the hardcoded "BRIEF ITINERARY"
    // to the plain, now-editable "ITINERARY" -- still a different string
    // from Detailed's own "DETAILED ITINERARY", so the two stay
    // distinguishable exactly as this test was built to confirm.
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('ITINERARY');
      expect(doc).not.toContain('DETAILED ITINERARY');
    });
    fireEvent.click(screen.getByText('Detailed'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('DETAILED ITINERARY');
    });
  });
});

describe('itinerary font pairing: scoped to Brief/Detailed only, not the shared .inv-title other document types rely on', () => {
  it('the Brief preview loads Fraunces/Karla and overrides the title font, scoped via extraHeadCSS', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('Fraunces');
      expect(doc).toContain('Karla');
      expect(doc).toMatch(/\.inv-title\s*\{\s*font-family:\s*'Fraunces'/);
    });
  });

  it('the Detailed plain document gets the same scoped override', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('Fraunces');
    });
  });
});

describe('regression: the day-title Suggest button must stay available after a title is set, not vanish forever the moment one exists', () => {
  it('shows Suggest on a fresh day with no title yet', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    expect(screen.getAllByText('\u2728 Suggest').length).toBeGreaterThan(0);
  });

  it('confirmed real cause: Suggest used to disappear once ANY title was typed, including a plain date string -- it must now stay visible', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    const titleField = screen.getAllByPlaceholderText('Day title e.g. Arrival at Delhi')[0];
    fireEvent.change(titleField, { target: { value: '23 Sep 2026' } });
    expect(screen.getAllByText('\u2728 Suggest').length).toBeGreaterThan(0);
  });

  it('clicking it after a title already exists overwrites with a fresh suggestion, not blocked', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    const titleField = screen.getAllByPlaceholderText('Day title e.g. Arrival at Delhi')[0];
    fireEvent.change(titleField, { target: { value: 'Some existing title' } });
    // With no items on the day, suggestDayTitle returns "" and updateDay is
    // never called -- clicking must not throw or otherwise misbehave even
    // when there's nothing to suggest.
    expect(() => fireEvent.click(screen.getAllByText('\u2728 Suggest')[0])).not.toThrow();
  });

  it('hidden entirely in read-only mode, title present or not', () => {
    render(<Itinerary query={fakeQuery} onClose={()=>{}} readOnly={true}/>);
    expect(screen.queryByText('\u2728 Suggest')).toBeNull();
  });
});

describe('regression: no default closing tagline text -- "TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES" was a pretext operators never asked for', () => {
  it('a fresh itinerary with no template override shows no tagline at all', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).not.toContain('TOUR ENDS AS YOU LEAVE FOOTPRINTS');
    });
  });

  it('an operator can still set their own tagline via Template Content -- the field itself was not removed', async () => {
    const { container } = render(<Itinerary query={fakeQuery} briefTemplate={{ closingTagline: 'A custom sign-off chosen by the operator' }} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('A custom sign-off chosen by the operator');
    });
  });
});

describe('regression: Brief\u2019s document heading is now editable via Template Content, defaulting to plain "ITINERARY"', () => {
  it('defaults to ITINERARY with no template override', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('ITINERARY');
    });
  });

  it('an operator-set docHeading overrides the default', async () => {
    const { container } = render(<Itinerary query={fakeQuery} briefTemplate={{ docHeading: 'YOUR JOURNEY' }} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('YOUR JOURNEY');
    });
  });

  it('Detailed\u2019s own heading is unaffected by Brief\u2019s docHeading override', async () => {
    const { container } = render(<Itinerary query={fakeQuery} briefTemplate={{ docHeading: 'YOUR JOURNEY' }} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Detailed'));
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('DETAILED ITINERARY');
      expect(doc).not.toContain('YOUR JOURNEY');
    });
  });
});

describe('regression: Brief\u2019s meal pills match the brochure\u2019s quiet cream/navy style, not the old yellow/amber', () => {
  it('a day with meals shows the new quiet colours, not the old yellow', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('#F2EEE6');
      expect(doc).not.toContain('#FEF3C7');
    });
  });
});

describe('regression: an untitled day\u2019s first route stands in as its headline, matching the brochure\u2019s own established pattern -- both flavors follow the same design now', () => {
  it('promotes the route to headline size/position when the day has no title, in the Brief preview', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    // Day 2, not Day 1 -- Day 1 has a default "Arrival" title pre-filled,
    // Day 2 starts genuinely empty.
    fireEvent.click(screen.getAllByText('+ Add Item \u25be')[1]);
    fireEvent.click(screen.getByText('Route / Movement'));
    const routeInputs = screen.getAllByPlaceholderText(/Leh.*Alchi.*Leh/);
    fireEvent.change(routeInputs[routeInputs.length - 1], { target: { value: 'Bodhgaya - Rajgir' } });
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('Bodhgaya \u2192 Rajgir'); // arrow, headline-promoted
      expect(doc).toContain('#8B1A1A'); // the route red
    });
  });

  it('does NOT promote the route when the day already has a title -- stays a small label with its own text as typed', async () => {
    const { container } = render(<Itinerary query={fakeQuery} onClose={()=>{}}/>);
    const titleField = screen.getAllByPlaceholderText('Day title e.g. Arrival at Delhi')[0];
    fireEvent.change(titleField, { target: { value: 'Arrival at Bodhgaya' } });
    fireEvent.click(screen.getAllByText('+ Add Item \u25be')[0]);
    fireEvent.click(screen.getByText('Route / Movement'));
    const routeInputs = screen.getAllByPlaceholderText(/Leh.*Alchi.*Leh/);
    fireEvent.change(routeInputs[routeInputs.length - 1], { target: { value: 'Bodhgaya - Rajgir' } });
    fireEvent.click(screen.getByText('\ud83d\udc41 Preview'));
    await waitFor(() => {
      const doc = container.querySelector('iframe')?.getAttribute('srcdoc') || '';
      expect(doc).toContain('Bodhgaya - Rajgir'); // untouched, plain hyphen
      expect(doc).not.toContain('Bodhgaya \u2192 Rajgir');
    });
  });
});
