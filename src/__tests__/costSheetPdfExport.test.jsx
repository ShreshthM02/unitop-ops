import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { openMatrixSections } from './helpers/matrix.js';

// The Cost Sheet's separate "Export PDF" / "Export XLSX" footer buttons were
// consolidated into the shared ExportMenu dropdown (one Export button, the
// formats inside it). These tests still verify exactly what they did before
// -- the generated PDF HTML and XLSX workbook -- they just have to open the
// menu to reach the format, the same way a user now does.
const clickExport = (label) => {
  fireEvent.click(screen.getByText('\u2b07 Export \u25be'));
  fireEvent.click(screen.getByText(label));
};


const fakeQuery = { id: 'UTQ-2026-600', tourFileId: 'TF-600', groupName: 'PDF Rewrite Test Group', destination: 'Kerala', nights: 3, agentCompany: 'Test Foreign Agent Co', assignedTo: 'staff-1' };
const fakeStaff = [{ id: 'staff-1', name: 'Priya Sharma' }];

// Captures the actual HTML string passed to printHTML when Export PDF is
// clicked -- this is the only way to verify the real generated content,
// not just that the button exists.
async function exportAndCaptureHTML() {
  let capturedHTML = null;
  vi.doMock('../lib/index.js', async () => {
    const actual = await vi.importActual('../lib/index.js');
    return {
      ...actual,
      printHTML: (html) => { capturedHTML = html; },
      // Stub the audit write. exportPDF calls logAudit right after
      // printHTML, and with no Supabase env configured under test that
      // issues a real fetch to `undefined/rest/v1/query_audit`, which
      // rejects. Nothing awaits it, so it surfaces as an unhandled
      // rejection that vitest attributes to whichever test happens to be
      // running when it lands -- which is exactly why this file failed
      // intermittently on unrelated assertions under parallel load, and
      // passed when run alone. The export path itself was never at fault.
      logAudit: () => {},
    };
  });
  vi.resetModules();
  const { CostSheet } = await import('../components/CostSheet.jsx');
  render(<CostSheet query={fakeQuery} onClose={()=>{}} onProceedToQuotation={()=>{}} currentUser={{id:1,name:'Priya'}} staff={fakeStaff}/>);
  openMatrixSections();
  return { capturedHTML: () => capturedHTML, screen };
}

describe('CostSheet PDF export: all 7 requested fixes', () => {
  it('#1: heading and tour details are center-aligned', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('text-align:center');
    // The title block specifically should be inside a centered wrapper
    const titleIdx = html.indexOf('COST SHEET');
    const beforeTitle = html.slice(Math.max(0, titleIdx - 200), titleIdx);
    expect(beforeTitle).toContain('text-align:center');
  });

  it('#2: "TL Cost" is now labeled "Tour Facilitator"', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('Tour Facilitator');
    expect(html).not.toContain('TL Cost:');
  });

  it('#5: day-wise table includes an Alt Hotel column and a TOTALS row', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('Alt Hotel');
    expect(html).toContain('TOTALS');
  });

});

describe('CostSheet PDF export: Tour Leader Slabs and Client/Agent + Assigned Staff info', () => {
  it('shows Client/Foreign Agent and Assigned Staff, pre-filled and reflecting edits', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    expect(screen.getByDisplayValue('Test Foreign Agent Co')).toBeTruthy();
    expect(screen.getByDisplayValue('Priya Sharma')).toBeTruthy();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('Test Foreign Agent Co');
    expect(html).toContain('Priya Sharma');
  });

  it('an added slab appears in the PDF with its real label', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Slab'));
    const labelInput = screen.getByDisplayValue('New Slab');
    fireEvent.change(labelInput, { target: { value: 'Small Group PDF Test' } });
    clickExport('📕 PDF');
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
    clickExport('📕 PDF');
    const html = capturedHTML();
    const titleMatches = html.match(/<div class="inv-title"[^>]*>([^<]*)<\/div>/g) || [];
    titleMatches.forEach(title => {
      expect(title).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    });
  });

  it('#7: CSS Grid replaces table-layout:fixed entirely -- the table-based approach was verified correct in the generated HTML itself (colgroup/th/td percentages captured directly from real output matched exactly), yet the actual printed PDF still showed the old unbalanced proportions, meaning the browser\'s print rendering path handles table-layout differently from normal screen rendering. Grid has no table-layout-specific behavior to diverge on', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
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

  it('a slab with a tour leader surcharge shows it split by part, separate from the Tour Facilitator cost', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.change(screen.getByPlaceholderText('Total cost'), { target: { value: '6000' } });
    fireEvent.change(screen.getAllByLabelText('FOC (N paying)')[0], { target: { value: '6' } });
    fireEvent.change(screen.getAllByLabelText('Hotel (tour leader)')[0], { target: { value: '3000' } });
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toMatch(/₹1,000/);                 // Tour Facilitator 6000 / 6
    expect(html).toContain('Tour leader surcharge');
    expect(html).not.toContain('incl. T/L surcharge');
    expect(html).toMatch(/Hotel[\s\S]{0,400}₹500/);
  });
});

describe('CostSheet PDF: short fixed-format columns never wrap, and grid cells avoid splitting across a page boundary', () => {

  it('grid cells carry break-inside:avoid in the shared stylesheet, reducing the risk of content splitting across a page boundary', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('break-inside: avoid');
  });

  it('Movement retains more room (19) than the earlier percentage-shuffling attempts gave it, rather than stealing space from it again to fix another column', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
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
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('<div class="inv-title">COST SHEET</div>');
    expect(html).toContain('class="section-title"');
    // inv-title itself (the CSS rule) is untouched -- still Playfair,
    // since it's shared with GanttView and ItineraryBuilder.
    expect(html).toMatch(/\.inv-title\s*\{[^}]*Playfair Display/);
    // section-title is genuinely a different rule, using Inter.
    expect(html).toMatch(/\.section-title\s*\{[^}]*Inter/);
  });

});

describe('CostSheet PDF: column headers no longer visually collide (missing gap between grid columns, and adjacent right/left alignment with no breathing room)', () => {
  it('.content-grid carries a column-gap, guaranteeing separation between every column regardless of alignment or content length', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toMatch(/\.content-grid\s*\{[^}]*column-gap/);
  });

  it('Monuments\' Included column header is center-aligned, not left-aligned directly against a right-aligned neighbor', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Monument / Activity'));
    fireEvent.click(screen.getByText('+ Add Local Handler'));
    fireEvent.click(screen.getByText('+ Add Extra Service'));
    clickExport('📕 PDF');
    const html = capturedHTML();
    expect(html).toContain('<div class="grid-header" style="text-align:center">Included</div>');
  });
});

describe('CostSheet PDF: fr units instead of % prevent wide tables (T/L Slabs, 16 columns) from overflowing the printable page once column-gap is added', () => {
  it('every content-grid uses fr units, never %, in grid-template-columns', async () => {
    const { capturedHTML } = await exportAndCaptureHTML();
    fireEvent.click(screen.getByText('+ Add Slab'));
    clickExport('📕 PDF');
    const html = capturedHTML();
    const gridDeclarations = [...html.matchAll(/class="content-grid" style="grid-template-columns:([^"]+)"/g)].map(m => m[1]);
    expect(gridDeclarations.length).toBeGreaterThan(0);
    gridDeclarations.forEach(decl => {
      expect(decl).not.toContain('%');
      expect(decl).toContain('fr');
    });
  });
});

