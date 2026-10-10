import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { mapFont, blocksToStyledDocx } from '../lib/wordStyled.js';
import { buildDocxBlobFromBodyBlocks } from '../lib/wordFromBlocks.js';

describe('Word export: styled converter', () => {
  it('maps the PDF fonts onto Word-safe ones', () => {
    expect(mapFont("'Inter', Arial, sans-serif")).toBe('Arial');
    expect(mapFont("'Playfair Display', Georgia, serif")).toBe('Georgia');
    expect(mapFont("'Lora', serif")).toBe('Georgia');
    expect(mapFont('')).toBe('Arial');
  });

  it('declines (returns null) when there is no layout engine, so the export falls back instead of failing', async () => {
    // jsdom has no layout: every rectangle is zero-sized.
    const out = await blocksToStyledDocx({ blocks: ['<div>x</div>'], css: '', widthPx: 688 });
    expect(out).toBeNull();
  });

  it('still produces a valid document through the fallback, with extraHeadCSS accepted', async () => {
    const blob = await buildDocxBlobFromBodyBlocks({
      bodyBlocks: ['<div style="font-weight:bold">Hello styled</div>', { type: 'table', headerHTML: '<tr><th>A</th></tr>', rowsHTML: ['<tr><td>1</td></tr>'] }],
      toggles: { headerFooterAllPages: true, showPageNum: true },
      extraHeadCSS: 'h2{color:red}',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('Hello styled');
    expect(xml).toContain('<w:tbl>');
  });
});
