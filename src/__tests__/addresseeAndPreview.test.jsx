import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildAddresseeBlock, ADDRESSEE_LABEL, withPreviewStyles, PREVIEW_SCREEN_CSS, PRINT_MARGIN } from '../lib/letterhead.js';
import { DocPreviewFrame } from '../lib/LetterheadControls.jsx';

describe('shared addressee block', () => {
  it('uses "Kind Attention:" -- the old "KIND ATTN:" wording is gone', () => {
    expect(ADDRESSEE_LABEL).toBe('Kind Attention:');
    const html = buildAddresseeBlock({ name: 'MR. OLIVER', company: 'UNI TRAVEL', city: 'TAIWAN' });
    expect(html).toContain('Kind Attention:');
    expect(html).not.toContain('KIND ATTN');
    expect(html).not.toContain('Kind Attn:');
  });

  it('stacks name, company and city on separate lines in that order', () => {
    const html = buildAddresseeBlock({ name: 'MR. OLIVER', company: 'UNI TRAVEL', city: 'TAIWAN' });
    const iName = html.indexOf('MR. OLIVER');
    const iCompany = html.indexOf('UNI TRAVEL');
    const iCity = html.indexOf('TAIWAN');
    expect(iName).toBeGreaterThan(-1);
    expect(iCompany).toBeGreaterThan(iName);
    expect(iCity).toBeGreaterThan(iCompany);
    // Not the old inline comma-joined form.
    expect(html).not.toContain('MR. OLIVER, UNI TRAVEL');
  });

  it('aligns the hanging indent with a table cell, not a hardcoded padding offset', () => {
    // Pro-forma used to fake this with padding-left:88pt, which only lined
    // up while the label happened to measure 88pt -- a longer label silently
    // broke it. The label cell must size itself instead.
    const html = buildAddresseeBlock({ name: 'A', company: 'B', city: 'C' });
    expect(html).toContain('display:table');
    expect(html).toContain('display:table-cell');
    expect(html).not.toMatch(/padding-left:\s*\d+pt/);
  });

  it('degrades cleanly when parts are missing', () => {
    expect(buildAddresseeBlock({})).toBe('');
    expect(buildAddresseeBlock({ name: 'SOLO' })).toContain('SOLO');
    const noCompany = buildAddresseeBlock({ name: 'N', city: 'C' });
    expect(noCompany).toContain('N');
    expect(noCompany).toContain('C');
  });
});

describe('preview fidelity: screen rendering reconstructs real page geometry', () => {
  it('renders each page as a true A4 sheet with the real print margin applied', () => {
    expect(PREVIEW_SCREEN_CSS).toContain('width: 210mm');
    expect(PREVIEW_SCREEN_CSS).toContain('height: 297mm');
    // The print path uses a 281mm content box because @page reserves the
    // 8mm top/bottom separately; on screen that margin has to be real padding.
    expect(PREVIEW_SCREEN_CSS).toContain(`padding: ${PRINT_MARGIN.top} ${PRINT_MARGIN.right} ${PRINT_MARGIN.bottom} ${PRINT_MARGIN.left}`);
  });

  it('separates pages visually so page breaks are legible', () => {
    expect(PREVIEW_SCREEN_CSS).toMatch(/margin: 0 auto 16px/);
    expect(PREVIEW_SCREEN_CSS).toContain('box-shadow');
  });

  it('is screen-only, so it can never alter real print output', () => {
    expect(PREVIEW_SCREEN_CSS.trim().startsWith('@media screen')).toBe(true);
  });

  it('withPreviewStyles injects into the document head without disturbing the body', () => {
    const doc = '<html><head><style>body{color:red}</style></head><body><div class="print-page">x</div></body></html>';
    const out = withPreviewStyles(doc);
    expect(out).toContain('@media screen');
    expect(out.indexOf('@media screen')).toBeLessThan(out.indexOf('</head>'));
    expect(out).toContain('<div class="print-page">x</div>');
    expect(out).toContain('body{color:red}');
  });

  it('withPreviewStyles still works on a fragment with no head', () => {
    const out = withPreviewStyles('<div class="print-page">x</div>');
    expect(out).toContain('@media screen');
    expect(out).toContain('print-page');
  });

  it('withPreviewStyles is a no-op on empty input rather than producing a bare stylesheet', () => {
    expect(withPreviewStyles('')).toBe('');
    expect(withPreviewStyles(null)).toBe(null);
  });
});

describe('DocPreviewFrame', () => {
  const doc = '<html><head></head><body><div class="print-page">page one</div></body></html>';

  it('renders the preview-styled document, not the raw print HTML', () => {
    render(<DocPreviewFrame html={doc}/>);
    const frame = screen.getByTitle('doc-preview');
    expect(frame.getAttribute('srcdoc')).toContain('@media screen');
    expect(frame.getAttribute('srcdoc')).toContain('page one');
  });

  it('accepts a custom title so documents with their own preview keep their selector', () => {
    render(<DocPreviewFrame html={doc} title="Print Preview"/>);
    expect(screen.getByTitle('Print Preview')).toBeTruthy();
  });

  it('lays the frame out at a fixed sheet-based width and scales it, rather than stretching to the panel', () => {
    render(<DocPreviewFrame html={doc}/>);
    const frame = screen.getByTitle('doc-preview');
    // 794px sheet (210mm @96dpi) + 24px gutters either side.
    expect(frame.style.width).toBe('842px');
    expect(frame.style.transform).toMatch(/^scale\(/);
    expect(frame.style.transformOrigin).toBe('0 0');
  });

  it('survives an environment without ResizeObserver', () => {
    const saved = global.ResizeObserver;
    // eslint-disable-next-line no-global-assign
    delete global.ResizeObserver;
    expect(() => render(<DocPreviewFrame html={doc}/>)).not.toThrow();
    global.ResizeObserver = saved;
  });
});
