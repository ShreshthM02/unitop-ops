import { describe, it, expect } from 'vitest';
import { paginateBodyBlocks, createMeasurementContext } from '../lib/letterhead.js';

// A fake measureFn lets the packing algorithm itself be tested without a
// real browser DOM (jsdom doesn't do real layout, so real heights aren't
// available in tests) -- we control exactly what height each block
// reports and verify the algorithm packs them correctly.
function fakeHeights(map) {
  return (html) => map[html] ?? 0;
}

describe('paginateBodyBlocks: the core packing algorithm, order-preserving, never reordered', () => {
  it('packs blocks that all fit within one page onto a single page', () => {
    const blocks = ['a', 'b', 'c'];
    const measureFn = fakeHeights({ a: 100, b: 100, c: 100 });
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn });
    expect(pages).toEqual([['a', 'b', 'c']]);
  });

  it('splits onto a new page once the running total would exceed the page height', () => {
    const blocks = ['a', 'b', 'c'];
    const measureFn = fakeHeights({ a: 400, b: 400, c: 400 });
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn });
    // a+b=800 fits; a+b+c=1200 doesn't -- c starts a new page
    expect(pages).toEqual([['a', 'b'], ['c']]);
  });

  it('preserves block order across pages -- content is never reordered', () => {
    const blocks = ['first', 'second', 'third', 'fourth'];
    const measureFn = fakeHeights({ first: 600, second: 600, third: 600, fourth: 600 });
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn });
    const flattened = pages.flat();
    expect(flattened).toEqual(blocks);
  });

  it('gives a single block taller than a whole page its own page, rather than looping or crashing', () => {
    const blocks = ['normal', 'huge', 'normal2'];
    const measureFn = fakeHeights({ normal: 200, huge: 5000, normal2: 200 });
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn });
    expect(pages).toEqual([['normal'], ['huge'], ['normal2']]);
  });

  it('handles an exact-fit boundary (block height exactly equals remaining space) by keeping it on the same page', () => {
    const blocks = ['a', 'b'];
    const measureFn = fakeHeights({ a: 500, b: 500 });
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn });
    expect(pages).toEqual([['a', 'b']]);
  });

  it('returns a single empty page for empty input, never zero pages', () => {
    const pages = paginateBodyBlocks([], { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn: fakeHeights({}) });
    expect(pages).toEqual([[]]);
  });

  it('handles many small blocks packing efficiently across several pages', () => {
    const blocks = Array.from({ length: 12 }, (_, i) => `block${i}`);
    const heightMap = {};
    blocks.forEach(b => { heightMap[b] = 100; });
    const measureFn = fakeHeights(heightMap);
    const pages = paginateBodyBlocks(blocks, { pageContentHeightPx: 350, containerWidthPx: 500, measureFn });
    // 350/100 = 3 per page (350 allows exactly 3*100=300, not 4*100=400)
    expect(pages.length).toBe(4);
    expect(pages[0]).toEqual(['block0', 'block1', 'block2']);
    expect(pages.flat()).toEqual(blocks);
  });
});

describe('paginateBodyBlocks: table-splitting (a {type:"table"} block splits its rows across pages, repeating the header)', () => {
  // A fake tableMeasureFn lets the splitting algorithm be tested without a
  // real browser DOM -- controls exactly what height the header and each
  // row report.
  function fakeTableHeights(headerHeightPx, rowHeightsMap) {
    return (headerHTML, rowsHTML) => ({
      headerHeightPx,
      rowHeightsPx: rowsHTML.map(r => rowHeightsMap[r] ?? 0),
    });
  }

  it('a table that fits entirely within one page stays as a single chunk', () => {
    const rows = ['<tr>1</tr>', '<tr>2</tr>', '<tr>3</tr>'];
    const tableMeasureFn = fakeTableHeights(50, { '<tr>1</tr>':100, '<tr>2</tr>':100, '<tr>3</tr>':100 });
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    const pages = paginateBodyBlocks([block], { pageContentHeightPx: 1000, containerWidthPx: 500, tableMeasureFn });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0]).toContain('<thead><tr>H</tr></thead>');
    expect(pages[0][0]).toContain('<tr>1</tr>');
    expect(pages[0][0]).toContain('<tr>2</tr>');
    expect(pages[0][0]).toContain('<tr>3</tr>');
  });

  it('a table too long for one page splits across pages, repeating the header in every chunk', () => {
    const rows = ['<tr>1</tr>', '<tr>2</tr>', '<tr>3</tr>', '<tr>4</tr>'];
    // header=50, each row=300 -> page (1000): chunk1 fits header+3rows=950, row4 overflows -> new page
    const tableMeasureFn = fakeTableHeights(50, { '<tr>1</tr>':300, '<tr>2</tr>':300, '<tr>3</tr>':300, '<tr>4</tr>':300 });
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    const pages = paginateBodyBlocks([block], { pageContentHeightPx: 1000, containerWidthPx: 500, tableMeasureFn });
    expect(pages).toHaveLength(2);
    // Both chunks repeat the header
    expect(pages[0][0]).toContain('<thead><tr>H</tr></thead>');
    expect(pages[1][0]).toContain('<thead><tr>H</tr></thead>');
    // Rows 1-3 on page 1, row 4 on page 2 -- order preserved, nothing lost or duplicated
    expect(pages[0][0]).toContain('<tr>1</tr>');
    expect(pages[0][0]).toContain('<tr>3</tr>');
    expect(pages[0][0]).not.toContain('<tr>4</tr>');
    expect(pages[1][0]).toContain('<tr>4</tr>');
  });

  it('a table starting mid-page (after earlier content) fills remaining space first, then continues on fresh pages', () => {
    const earlierBlock = '<div>intro</div>'; // consumes 400px
    const rows = ['<tr>1</tr>', '<tr>2</tr>', '<tr>3</tr>'];
    const tableMeasureFn = fakeTableHeights(50, { '<tr>1</tr>':300, '<tr>2</tr>':300, '<tr>3</tr>':300 });
    const measureFn = (html) => html === earlierBlock ? 400 : 0;
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    // page height 1000: after intro (400), remaining = 600. header(50)+row1(300)=350 fits,
    // +row2(300) would be 650 > 600 -- so chunk 1 only gets row1. Chunk 2 starts fresh page.
    const pages = paginateBodyBlocks([earlierBlock, block], { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn, tableMeasureFn });
    expect(pages).toHaveLength(2);
    expect(pages[0][0]).toBe(earlierBlock);
    expect(pages[0][1]).toContain('<tr>1</tr>');
    expect(pages[0][1]).not.toContain('<tr>2</tr>');
    expect(pages[1][0]).toContain('<tr>2</tr>');
    expect(pages[1][0]).toContain('<tr>3</tr>');
  });

  it('mixed content: plain block + table block + plain block stays in order, table splitting does not disrupt surrounding content', () => {
    const before = '<div>before</div>';
    const after = '<div>after</div>';
    const rows = ['<tr>1</tr>', '<tr>2</tr>'];
    const measureFn = (html) => (html === before || html === after) ? 100 : 0;
    const tableMeasureFn = fakeTableHeights(50, { '<tr>1</tr>':700, '<tr>2</tr>':700 });
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    const pages = paginateBodyBlocks([before, block, after], { pageContentHeightPx: 1000, containerWidthPx: 500, measureFn, tableMeasureFn });
    // before(100) + header(50) + row1(700) = 850, fits on page 1. row2 forces a new page.
    expect(pages[0][0]).toBe(before);
    expect(pages[0][1]).toContain('<tr>1</tr>');
    expect(pages[1][0]).toContain('<tr>2</tr>');
    // "after" comes after the table finishes, on whatever page has room
    const flatHTML = pages.flat().join('');
    const beforeIdx = flatHTML.indexOf('before');
    const row1Idx = flatHTML.indexOf('>1<');
    const row2Idx = flatHTML.indexOf('>2<');
    const afterIdx = flatHTML.indexOf('after');
    expect(beforeIdx).toBeLessThan(row1Idx);
    expect(row1Idx).toBeLessThan(row2Idx);
    expect(row2Idx).toBeLessThan(afterIdx);
  });

  it('a single row taller than a whole page still gets placed, rather than looping forever', () => {
    const rows = ['<tr>huge</tr>'];
    const tableMeasureFn = fakeTableHeights(50, { '<tr>huge</tr>': 5000 });
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    const pages = paginateBodyBlocks([block], { pageContentHeightPx: 1000, containerWidthPx: 500, tableMeasureFn });
    expect(pages).toHaveLength(1);
    expect(pages[0][0]).toContain('<tr>huge</tr>');
  });

  it('every emitted chunk is complete, valid, self-contained HTML with its own thead/tbody', () => {
    const rows = ['<tr>1</tr>', '<tr>2</tr>'];
    const tableMeasureFn = fakeTableHeights(50, { '<tr>1</tr>':900, '<tr>2</tr>':900 });
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: rows };
    const pages = paginateBodyBlocks([block], { pageContentHeightPx: 1000, containerWidthPx: 500, tableMeasureFn });
    pages.flat().forEach(chunk => {
      expect(chunk).toMatch(/^<table[^>]*><thead>.*<\/thead><tbody>.*<\/tbody><\/table>$/);
    });
  });

  it('an empty rowsHTML array places nothing -- no empty chunks emitted', () => {
    const block = { type: 'table', headerHTML: '<tr>H</tr>', rowsHTML: [] };
    const pages = paginateBodyBlocks([block], { pageContentHeightPx: 1000, containerWidthPx: 500, tableMeasureFn: fakeTableHeights(50, {}) });
    expect(pages).toEqual([[]]);
  });
});

describe('createMeasurementContext: the root-cause fix -- measurement must happen with the real print CSS applied, not the main app document', () => {
  it('injects the given CSS into an isolated iframe document, not the main document', () => {
    const cssText = '.test-marker-class { color: rgb(1, 2, 3); }';
    const { doc, cleanup } = createMeasurementContext(cssText);
    try {
      expect(doc).not.toBe(document); // isolated, not the main app document
      const styleTag = doc.querySelector('style');
      expect(styleTag).toBeTruthy();
      expect(styleTag.textContent).toContain('.test-marker-class');
      // The main document must NOT have received this style -- confirms
      // isolation, i.e. this can never leak into the running React app's
      // own styling while a print/preview is being built.
      expect(document.querySelector('style')?.textContent || '').not.toContain('test-marker-class');
    } finally {
      cleanup();
    }
  });

  it('the isolated document has its own body that elements can be appended to and measured against', () => {
    const { doc, cleanup } = createMeasurementContext('');
    try {
      expect(doc.body).toBeTruthy();
      const el = doc.createElement('div');
      doc.body.appendChild(el);
      expect(doc.body.contains(el)).toBe(true);
      doc.body.removeChild(el);
    } finally {
      cleanup();
    }
  });

  it('cleanup removes the iframe from the main document, leaving nothing behind', () => {
    const before = document.querySelectorAll('iframe').length;
    const { cleanup } = createMeasurementContext('');
    expect(document.querySelectorAll('iframe').length).toBe(before + 1);
    cleanup();
    expect(document.querySelectorAll('iframe').length).toBe(before);
  });
});

describe('bug fix: table blocks in the non-repeating path (previously stringified to literal "[object Object]")', () => {
  it('a {type:"table"} block renders as real table HTML, not "[object Object]", when header+footer-on-all-pages is off', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test',
      bodyBlocks: [
        '<p>Intro</p>',
        { type: 'table', headerHTML: '<tr><th>Col</th></tr>', rowsHTML: ['<tr><td>Row1</td></tr>', '<tr><td>Row2</td></tr>'] },
      ],
      headerFooterAllPages: false,
      printOnLetterhead: false,
    });
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('<thead><tr><th>Col</th></tr></thead>');
    expect(html).toContain('Row1');
    expect(html).toContain('Row2');
  });
});

describe('page number restored to "Page N of X" format (reversed from a previous round\'s request to show a bare number)', () => {
  it('non-repeating documents (rule a, browser decides pagination) use CSS counter(page)/counter(pages) -- the total page count is not known until print time, so this is the only available mechanism there', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test', bodyBlocks: ['<p>content</p>'],
      headerFooterAllPages: false, printOnLetterhead: false, showPageNum: true,
    });
    expect(html).toContain('"Page " counter(page) " of " counter(pages)');
  });

  it('repeating documents (rules b/c, real pagination) inject the actual "Page N of X" as real text per page -- reliable regardless of counter(pages) browser support, since the exact total is already known', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test', bodyBlocks: Array.from({length: 30}, (_,i) => `<p style="height:200px">Line ${i}</p>`),
      headerFooterAllPages: true, printOnLetterhead: false, showPageNum: true,
    });
    expect(html).toMatch(/Page \d+ of \d+/);
    // the CSS counter approach must NOT also be present here -- would double up
    expect(html).not.toContain('counter(page)');
  });

  it('showPageNum off produces neither the CSS counter rule nor injected text', async () => {
    const { buildPaginatedLetterheadDocument } = await import('../lib/letterhead.js');
    const html = await buildPaginatedLetterheadDocument({
      title: 'Test', bodyBlocks: ['<p>content</p>'],
      headerFooterAllPages: false, printOnLetterhead: false, showPageNum: false,
    });
    expect(html).not.toContain('counter(page)');
    expect(html).not.toMatch(/Page \d+ of \d+/);
  });
});

describe('bug fix: printOnLetterhead blank-space margins now match the 6cm top / 4cm bottom spec', () => {
  it('the header blank-space CSS is exactly 6cm, the footer exactly 4cm', async () => {
    const { invoiceLetterheadCSS } = await import('../lib/letterhead.js');
    expect(invoiceLetterheadCSS).toContain('.lh-header--blank { height: 6cm; }');
    expect(invoiceLetterheadCSS).toContain('.lh-footer--blank { height: 4cm; }');
  });
});
