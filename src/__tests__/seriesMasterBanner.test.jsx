import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Source-level guards for the decluttered master UI.
const drawer = readFileSync('src/components/QueryDrawerWithQuote.jsx', 'utf8');
const docs = readFileSync('src/components/SeriesDocuments.jsx', 'utf8');
describe('series master UI', () => {
  it('the Docs tab no longer carries a big master panel', () => { expect(drawer).not.toMatch(/SeriesMasterPanel/); });
  it('a small master banner sits in Tour Info and follows the series master pointer', () => {
    expect(drawer).toMatch(/data-testid="series-master-banner"/);
    expect(drawer).toMatch(/masterQueryId===query\.id/);
  });
  it('series documents no longer list the tour briefing sheet', () => { expect(docs).not.toMatch(/tourbriefing/); });
});
