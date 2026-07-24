import { describe, it, expect } from 'vitest';
import { paginateBodyBlocks } from '../lib/letterhead.js';

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
