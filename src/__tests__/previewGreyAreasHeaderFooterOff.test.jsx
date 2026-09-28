import { describe, it, expect } from 'vitest';

// Item 14 (2026-09-28 amendments): when "Header + Footer on all pages" is
// OFF (and Print on Letterhead is also off), the live/print preview showed
// grey areas in Quotation and other documents, while the actual
// export/download always rendered correctly.
//
// Root cause: buildPaginatedLetterheadDocument has two branches --
//   (a) non-repeating (headerFooterAllPages=false, printOnLetterhead=false)
//       -> one flowing document, page breaks left to the browser, no
//          pre-computed pagination
//   (b/c) repeating -> real pagination, emitting one <div class="print-page">
//          per page
// PREVIEW_SCREEN_CSS (injected only for the on-screen preview, never for
// real print/PDF output) simulates a true A4 sheet by giving `body` a grey
// backdrop and painting `.print-page` on top of it as a white sheet. Branch
// (a) never produced any `.print-page` element, so the grey backdrop had
// nothing to paint white content on top of -- the reported "grey areas".
// The fix wraps branch (a)'s content in a `.print-page-flow` div that
// PREVIEW_SCREEN_CSS now also renders as a white A4-width sheet (growing
// with its content, since real page breaks for this branch aren't known
// until print time). Real print/PDF output is untouched either way, since
// @media screen never applies there.

describe('Item 14: preview no longer shows grey areas when Header+Footer-on-all-pages is off', () => {
  it('the non-repeating branch wraps its content in a .print-page-flow div', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test',
      bodyBlocks: ['<p>Some quotation content</p>'],
      headerFooterAllPages: false,
      printOnLetterhead: false,
    });
    expect(html).toContain('<div class="print-page-flow">');
    expect(html).toContain('Some quotation content');
    // the wrapper must actually contain the content, not just precede it
    const flowIdx = html.indexOf('<div class="print-page-flow">');
    const contentIdx = html.indexOf('Some quotation content');
    const bodyCloseIdx = html.indexOf('</body>');
    expect(flowIdx).toBeGreaterThan(-1);
    expect(contentIdx).toBeGreaterThan(flowIdx);
    expect(contentIdx).toBeLessThan(bodyCloseIdx);
  });

  it('the repeating branch (Header+Footer on, or Print on Letterhead) is unaffected -- still real .print-page divs, no .print-page-flow', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test',
      bodyBlocks: ['<p>content</p>'],
      headerFooterAllPages: true,
      printOnLetterhead: false,
    });
    expect(html).toContain('class="print-page"');
    expect(html).not.toContain('print-page-flow');
  });

  it('PREVIEW_SCREEN_CSS renders .print-page-flow as a white A4-width sheet on the grey backdrop', async () => {
    const { PREVIEW_SCREEN_CSS, PRINT_MARGIN } = await import('../lib/letterhead.js');
    expect(PREVIEW_SCREEN_CSS).toContain('.print-page-flow');
    expect(PREVIEW_SCREEN_CSS).toMatch(/\.print-page-flow\s*\{[^}]*width:\s*210mm/);
    expect(PREVIEW_SCREEN_CSS).toMatch(/\.print-page-flow\s*\{[^}]*background:\s*#fff/);
    expect(PREVIEW_SCREEN_CSS).toMatch(
      new RegExp(`\\.print-page-flow\\s*\\{[^}]*padding:\\s*${PRINT_MARGIN.top} ${PRINT_MARGIN.right} ${PRINT_MARGIN.bottom} ${PRINT_MARGIN.left}`)
    );
  });

  it('.print-page-flow uses min-height (grows with content), unlike .print-page\'s fixed measured height -- real page breaks in this branch are only decided by the browser at print time', async () => {
    const { PREVIEW_SCREEN_CSS } = await import('../lib/letterhead.js');
    const flowRule = PREVIEW_SCREEN_CSS.match(/\.print-page-flow\s*\{([^}]*)\}/)[1];
    expect(flowRule).toContain('min-height: 297mm');
    expect(flowRule).not.toMatch(/(?<!min-)height:\s*297mm/);
    // must not clip content the way .print-page's overflow:hidden does --
    // there's no known per-page split here to safely clip against.
    expect(flowRule).not.toContain('overflow: hidden');
  });

  it('the fix is screen-only -- .print-page-flow carries no styling outside the @media screen block, so real print/PDF output (which never sees @media screen) is unaffected', async () => {
    const { invoiceLetterheadCSS } = await import('../lib/letterhead.js');
    expect(invoiceLetterheadCSS).not.toContain('print-page-flow');
  });

  it('withPreviewStyles applied to a non-repeating document actually produces a visible white sheet selector, not just a grey body', async () => {
    const { buildPaginatedLetterheadDocument, withPreviewStyles } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test',
      bodyBlocks: ['<p>Quotation body text</p>'],
      headerFooterAllPages: false,
      printOnLetterhead: false,
    });
    const preview = withPreviewStyles(html);
    expect(preview).toContain('print-page-flow');
    expect(preview).toContain('@media screen');
    expect(preview).toContain('Quotation body text');
  });
});
