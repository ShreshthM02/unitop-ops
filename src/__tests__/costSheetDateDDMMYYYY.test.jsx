import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Item 4: "in cost sheet, date is not rendering as dd/mm/yyyy." The
// day-wise Date column's editor is a native <input type="date">, which
// genuinely needs a raw ISO "YYYY-MM-DD" value (that's the only format the
// browser's own date picker accepts -- see the comment near
// dayDateFromTravelDate in CostSheet.jsx), so that field is correctly left
// alone. But the PRINTED/EXPORTED Cost Sheet (PDF and Excel) is read-only
// text, and was showing that same raw ISO string verbatim instead of the
// app-wide dd/mm/yyyy convention (formatDateSlash) used everywhere else in
// the app.

const clickExport = (label) => {
  fireEvent.click(screen.getByText('⬇ Export ▾'));
  fireEvent.click(screen.getByText(label));
};

const fakeQuery = { id: 'UTQ-2026-700', tourFileId: 'TF-700', groupName: 'Date Format Test Group', destination: 'Kerala', nights: 2, agentCompany: 'Test Agent Co', assignedTo: 'staff-1' };
const fakeStaff = [{ id: 'staff-1', name: 'Priya Sharma' }];

async function exportAndCaptureHTML() {
  let capturedHTML = null;
  vi.doMock('../lib/index.js', async () => {
    const actual = await vi.importActual('../lib/index.js');
    return {
      ...actual,
      printHTML: (html) => { capturedHTML = html; },
      logAudit: () => {},
    };
  });
  vi.resetModules();
  const { CostSheet } = await import('../components/CostSheet.jsx');
  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}} staff={fakeStaff}/>);
  return { capturedHTML: () => capturedHTML };
}

describe('CostSheet: Day-wise date column renders as dd/mm/yyyy in the printed PDF, not the raw ISO string', () => {
  it('a date typed into the first day row shows as 24/07/2026 in the exported PDF, not 2026-07-24', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
    fireEvent.change(dateInputs[0], { target: { value: '2026-07-24' } });
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('24/07/2026');
    // The raw ISO string legitimately appears elsewhere in the document
    // (an unrelated dated code comment baked into the shared stylesheet),
    // so check specifically within the Day-wise table's own body, not the
    // whole document.
    const dayTableIdx = html.indexOf('Day-wise Itinerary');
    const dayTableSnippet = html.slice(dayTableIdx, dayTableIdx + 3000);
    expect(dayTableSnippet).toContain('24/07/2026');
    expect(dayTableSnippet).not.toContain('2026-07-24');
  });

  it('an empty day date renders as blank, not throwing or printing "undefined"/"NaN"', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});
