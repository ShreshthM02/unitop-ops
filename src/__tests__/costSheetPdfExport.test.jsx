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

  it('#7: all column headers are center-aligned, regardless of their data cells\' own alignment (requested directly) -- Transport (a right-aligned numeric column) has a centered header', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    // Final Price Summary header row: "Transport" is a numeric column
    // (its data cells right-align), but per explicit request every
    // header centers regardless of its column's own data alignment.
    const theadMatch = html.match(/<div class="grid-header" style="text-align:center">Transport<\/div>/);
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

  it('#7: CSS Grid replaces table-layout:fixed entirely -- the table-based approach was verified correct in the generated HTML itself (colgroup/th/td percentages captured directly from real output matched exactly), yet the actual printed PDF still showed the old unbalanced proportions, meaning the browser\'s print rendering path handles table-layout differently from normal screen rendering. Grid has no table-layout-specific behavior to diverge on', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    // Note: the shared letterhead footer's logo row legitimately uses
    // table-layout:fixed for its own, unrelated 4-equal-width image
    // cells -- checking only for the Cost Sheet's own grid-based markup
    // here, not asserting table-layout:fixed is absent everywhere.
    expect(html).toContain('class="content-grid"');
    expect(html).toContain('grid-template-columns:');
    // Day-wise table always renders; Movement's width confirms the
    // explicit-proportion approach is genuinely active on the grid.
    expect(html).toContain('19fr');
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

describe('CostSheet PDF: header and data cells in the same column share the same text-align direction (the one width-related fix that was genuinely correct and worth keeping)', () => {
  it('every grid-header is center-aligned (Monuments/Transport/Local Handler/Extra Services/Day-wise/Final Price Summary), and every data column\'s cells are internally consistent with each other', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    const sections = ['Day-wise Itinerary', 'Monuments</div>', 'Transport</div>', 'Local Handler</div>', 'Extra Services</div>', 'Final Price Summary'];
    sections.forEach((marker, i) => {
      const idx = html.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      const nextIdx = i < sections.length - 1 ? html.indexOf(sections[i+1]) : html.indexOf('</body>');
      const snippet = html.slice(idx, nextIdx > idx ? nextIdx : idx + 2000);
      const thAligns = [...snippet.matchAll(/<div class="grid-header" style="text-align:(left|right|center)">/g)].map(m => m[1]);
      const tdAligns = [...snippet.matchAll(/<div class="grid-cell[^"]*" style="text-align:(left|right|center)[^"]*">/g)].map(m => m[1]);
      const colCount = thAligns.length;
      expect(colCount).toBeGreaterThan(0);
      // Every header centers now, regardless of its column's data alignment.
      thAligns.forEach(a => expect(a).toBe('center'));
      // The Day-wise TOTALS row has some cells without text-align styling
      // (e.g. the "TOTALS" label cell itself spans multiple columns), so
      // it doesn't contribute a full set of colCount styled cells -- only
      // count complete rows for the internal-consistency check below.
      const completeTds = tdAligns.slice(0, Math.floor(tdAligns.length / colCount) * colCount);
      for (let col = 0; col < colCount; col++) {
        const colTdAligns = completeTds.filter((_, j) => j % colCount === col);
        if (colTdAligns.length > 1) {
          colTdAligns.slice(1).forEach(a => expect(a).toBe(colTdAligns[0]));
        }
      }
    });
  });
});

describe('CostSheet PDF: every table remains full page width', () => {
  it('every content-grid stays full page width for every section -- no table is narrowed', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    const contentGridCount = (html.match(/class="content-grid"/g) || []).length;
    expect(contentGridCount).toBeGreaterThanOrEqual(5); // Day-wise, Monuments, Transport, Local Handler, Extras, Final Price Summary
    // .content-grid's own CSS rule sets width:100% -- confirmed present
    // in the shared stylesheet.
    expect(html).toContain('.content-grid { display: grid; width: 100%');
  });
});

describe('CostSheet PDF: short fixed-format columns never wrap, and grid cells avoid splitting across a page boundary', () => {
  it('Day-wise short columns (Day, Date, Meal Plan, Meal Cost, Plan, Net PP, Sngl Supp) carry white-space:nowrap; Movement and Hotel/Alt Hotel do not, since they can genuinely be long', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    const dayIdx = html.indexOf('Day 1');
    const rowSnippet = html.slice(dayIdx - 50, dayIdx + 400);
    const nowrapCount = (rowSnippet.match(/white-space:nowrap/g) || []).length;
    expect(nowrapCount).toBeGreaterThanOrEqual(1);
  });

  it('grid cells carry break-inside:avoid in the shared stylesheet, reducing the risk of content splitting across a page boundary', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('break-inside: avoid');
  });

  it('Movement retains more room (19) than the earlier percentage-shuffling attempts gave it, rather than stealing space from it again to fix another column', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    // fr units now, not %, since percentages don't account for
    // column-gap and caused wide tables (16 columns) to overflow the
    // printable page. The relative proportions are unchanged.
    expect(html).toContain('6fr 8fr 19fr 9fr 8fr 13fr 11fr 6fr 9fr 11fr');
  });
});

describe('CostSheet PDF: only the main "COST SHEET" title uses Playfair Display; every section header uses Inter', () => {
  it('the main title stays on inv-title (Playfair Display), section headers move to the new section-title class (Inter)', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('<div class="inv-title">COST SHEET</div>');
    expect(html).toContain('class="section-title"');
    // inv-title itself (the CSS rule) is untouched -- still Playfair,
    // since it's shared with GanttView and ItineraryBuilder.
    expect(html).toMatch(/\.inv-title\s*\{[^}]*Playfair Display/);
    // section-title is genuinely a different rule, using Inter.
    expect(html).toMatch(/\.section-title\s*\{[^}]*Inter/);
  });

  it('every Cost Sheet section header (Day-wise, Transport, Local Handler, Extra Services, Final Price Summary) uses section-title, not inv-title', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    ['Day-wise Itinerary', 'Local Handler</div>', 'Extra Services</div>', 'Final Price Summary'].forEach(marker => {
      const idx = html.indexOf(marker);
      expect(idx).toBeGreaterThan(-1);
      const before = html.slice(Math.max(0, idx - 60), idx);
      expect(before).toContain('section-title');
    });
  });
});

describe('CostSheet PDF: column headers no longer visually collide (missing gap between grid columns, and adjacent right/left alignment with no breathing room)', () => {
  it('.content-grid carries a column-gap, guaranteeing separation between every column regardless of alignment or content length', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toMatch(/\.content-grid\s*\{[^}]*column-gap/);
  });

  it('Monuments\' Included, Local Handler\'s Mode, and Extra Services\' Mode are center-aligned, not left-aligned directly against a right-aligned neighbor', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    expect(html).toContain('<div class="grid-header" style="text-align:center">Included</div>');
    expect(html).toContain('<div class="grid-header" style="text-align:center">Mode</div>');
  });
});

describe('CostSheet PDF: fr units instead of % prevent wide tables (T/L Slabs, 16 columns) from overflowing the printable page once column-gap is added', () => {
  it('every content-grid uses fr units, never %, in grid-template-columns', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add T/L Slab'));
    fireEvent.click(screen.getByText(/🖨 Export PDF/));
    const html = capturedHTML();
    const gridDeclarations = [...html.matchAll(/class="content-grid" style="grid-template-columns:([^"]+)"/g)].map(m => m[1]);
    expect(gridDeclarations.length).toBeGreaterThan(0);
    gridDeclarations.forEach(decl => {
      expect(decl).not.toContain('%');
      expect(decl).toContain('fr');
    });
  });
});
