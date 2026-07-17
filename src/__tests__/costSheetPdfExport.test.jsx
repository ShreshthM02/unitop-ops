import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const fakeQuery = { id: 'UTQ-2026-600', tourFileId: 'TF-600', groupName: 'PDF Rewrite Test Group', destination: 'Kerala', nights: 3, agentCompany: 'Test Foreign Agent Co', assignedTo: 'staff-1' };
const fakeStaff = [{ id: 'staff-1', name: 'Priya Sharma' }];

// Captures the actual HTML string passed to printHTML when Export PDF is
// clicked -- this is the only way to verify the real generated content,
// not just that the button exists.
async function exportAndCaptureHTML() {
  let capturedHTML = null;
  vi.doMock('../lib/index.js', async () => {
    const actual = await vi.importActual('../lib/index.js');
    return { ...actual, printHTML: (html) => { capturedHTML = html; } };
  });
  vi.resetModules();
  const { CostSheet } = await import('../components/CostSheet.jsx');
  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}} staff={fakeStaff}/>);
  return { capturedHTML: () => capturedHTML, screen };
}

describe('CostSheet PDF export: all 7 requested fixes', () => {
  it('#1: heading and tour details are center-aligned', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('text-align:center');
    // The title block specifically should be inside a centered wrapper
    const titleIdx = html.indexOf('COST SHEET');
    const beforeTitle = html.slice(Math.max(0, titleIdx - 200), titleIdx);
    expect(beforeTitle).toContain('text-align:center');
  });

  it('#2: "TL Cost" is now labeled "Tour Facilitator"', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('Tour Facilitator');
    expect(html).not.toContain('TL Cost:');
  });

  it('#3: monuments list appears when monuments are present, and is absent when there are none', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    // Fresh instance, no monuments added -- section should not appear.
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    expect(capturedHTML()).not.toContain('Monuments');

    // Now add one and confirm the section appears.
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    const nameInputs = document.querySelectorAll('input[placeholder="e.g. Taj Mahal entry"]');
    fireEvent.change(nameInputs[nameInputs.length-1], { target: { value: 'Taj Mahal' } });
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('Monuments');
    expect(html).toContain('Taj Mahal');
  });

  it('#4: Tour Facilitator, Misc Cost, and Monument settings show the actual cost value, not just the mode', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.change(screen.getByPlaceholderText('Total cost'), { target: { value: '5000' } });
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toMatch(/Tour Facilitator:.*5,000/);
  });

  it('#5: day-wise table includes an Alt Hotel column and a TOTALS row', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('Alt Hotel');
    expect(html).toContain('TOTALS');
  });

  it('#6: every section appears when data is present -- Transport, Local Handler, Extras', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('>Transport<'); // default cost sheet already has 1 transport row, and no emoji per item #6
    expect(html).toContain('Local Handler');
    expect(html).toContain('Extra Services');
  });

  it('#7: numeric column headers and their data cells use matching alignment', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    // Final Price Summary header row: "Transport" (a numeric column) should
    // render with text-align:right on the <th>, matching its <td> below.
    const theadMatch = html.match(/<th style="text-align:right">Transport<\/th>/);
    expect(theadMatch).toBeTruthy();
  });
});

describe('CostSheet PDF export: Tour Leader Slabs and Client/Agent + Assigned Staff info', () => {
  it('shows Client/Foreign Agent and Assigned Staff, pre-filled and reflecting edits', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    expect(screen.getByDisplayValue('Test Foreign Agent Co')).toBeTruthy();
    expect(screen.getByDisplayValue('Priya Sharma')).toBeTruthy();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('Test Foreign Agent Co');
    expect(html).toContain('Priya Sharma');
  });

  it('a T/L slab appears as its own row in the PDF Final Price Summary, with its real label', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    const labelInput = screen.getByDisplayValue('10 pax + 1 T/L');
    fireEvent.change(labelInput, { target: { value: 'Small Group PDF Test' } });
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('Small Group PDF Test');
  });
});

describe('CostSheet PDF export: follow-up fixes (T/L Facilitator distinction, emoji removal, spacing)', () => {
  it('#6: no emoji appear in any section title', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    const titleMatches = html.match(/<div class="inv-title"[^>]*>([^<]*)<\/div>/g) || [];
    titleMatches.forEach(title => {
      expect(title).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    });
  });

  it('#7: tables use table-layout:fixed with explicit column widths for even, consistent spacing', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('table-layout:fixed');
    expect(html).toContain('<colgroup>');
  });

  it('group slab table has no T/L Surcharge at all, and Tour Leader Slabs get a genuinely separate table with it', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    let html = capturedHTML();
    expect(html).toContain('Tour Facil');
    expect(html).not.toContain('T/L Surcharge'); // no T/L slabs added yet

    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    html = capturedHTML();
    expect(html).toContain('Tour Leader Slabs'); // its own section title
    expect(html).toContain('T/L Surcharge');
  });

  it('a T/L slab row shows the same Tour Facilitator cost as a group slab would (not the surcharge in that column)', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.change(screen.getByPlaceholderText('Total cost'), { target: { value: '6000' } });
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '6' } });
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    // Tour Facilitator: lumpsum 6000 / 6 pax = 1000, should appear as a
    // real number in the Tour Facil column for the T/L slab row too.
    expect(html).toMatch(/₹1,000/);
  });
});
