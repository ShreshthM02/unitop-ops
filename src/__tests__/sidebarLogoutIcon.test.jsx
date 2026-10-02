import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Real, reported bug: "the logout button doesn't show up properly, it
// might be a font problem." It wasn't a sizing/CSS issue -- the sidebar's
// sign-out control used the "⏻" character (U+23FB POWER SYMBOL), which
// Inter (the only font loaded throughout the app -- see index.html) does
// not include a glyph for, so it rendered as a blank/missing-glyph box
// instead of an icon. Replaced with an inline SVG, which renders
// identically regardless of which font is active.

const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');

describe('Sidebar sign-out control no longer depends on a font glyph', () => {
  it('no longer renders the "⏻" character anywhere', () => {
    expect(src).not.toContain('⏻');
  });

  it('renders an inline SVG icon for "Sign out" instead, wired to the same logout handler', () => {
    expect(src).toMatch(/title="Sign out"[\s\S]{0,400}db\.auth\.logout\(\)[\s\S]{0,200}<svg/);
  });
});
