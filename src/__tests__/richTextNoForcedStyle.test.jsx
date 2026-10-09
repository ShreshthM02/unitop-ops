import { describe, it, expect } from 'vitest';
import fs from 'fs';

const read = (f) => fs.readFileSync(f, 'utf8');

describe('rich-text fields are not wrapped in forced formatting', () => {
  it('Briefing opening line has no forced underline', () => {
    const s = read('src/components/TourBriefingSheet.jsx');
    expect(s).not.toMatch(/text-decoration:underline[^`]*\$\{intro\}/);
    expect(s).toMatch(/<div style="margin-bottom:10pt">\$\{intro\}<\/div>/);
  });
  it('Invoice subject, opening line and sign-off carry no forced bold/underline', () => {
    const s = read('src/components/InvoiceGenerator.jsx');
    expect(s).not.toMatch(/font-weight:(bold|700)[^`]*\$\{pInv\.(subject|openingLine|signOff)/);
    expect(s).not.toMatch(/text-decoration:underline[^`]*\$\{pInv\.subject/);
  });
});

describe('Login password toggle', () => {
  it('uses an SVG eye, not emoji', async () => {
    const s = read('src/components/LoginScreen.jsx');
    expect(s).not.toMatch(/🙈|👁/);
    expect(s).toMatch(/<svg/);
  });
});
