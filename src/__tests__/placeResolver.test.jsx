import { describe, it, expect } from 'vitest';
import {
  normalizePlaceName, canonicalName, editDistance, haversineKm,
  rankCandidates, resolvePlace, searchGazetteer, manualPlace, isValidCoordinate, MATCH,
} from '../lib/placeResolver.js';

const gaz = [
  { name:'Bodhgaya',   lat:24.696, lon:84.991, country:'India', admin1:'Bihar',       population:38000 },
  { name:'Varanasi',   lat:25.318, lon:82.974, country:'India', admin1:'Uttar Pradesh', population:1200000, alt:['Benares','Kashi'] },
  { name:'Aurangabad', lat:24.752, lon:84.374, country:'India', admin1:'Bihar',       population:102000 },
  { name:'Aurangabad', lat:19.876, lon:75.343, country:'India', admin1:'Maharashtra', population:1175000 },
  { name:'Sravasti',   lat:27.520, lon:82.030, country:'India', admin1:'Uttar Pradesh', population:12000 },
  { name:'Kesariya',   lat:26.336, lon:84.855, country:'India', admin1:'Bihar',       population:9000 },
  { name:'Lumbini',    lat:27.469, lon:83.276, country:'Nepal', admin1:'Lumbini',     population:8000 },
];

describe('name normalisation and known Indian spelling drift', () => {
  it('strips case, punctuation and diacritics', () => {
    expect(normalizePlaceName("Bodh-Gaya")).toBe('bodh gaya');
    expect(normalizePlaceName("Vārānasī")).toBe('varanasi');
  });
  it('folds the alternative names this business actually sees', () => {
    expect(canonicalName('Benares')).toBe('varanasi');
    expect(canonicalName('Kashi')).toBe('varanasi');
    expect(canonicalName('Bodh Gaya')).toBe('bodhgaya');
    expect(canonicalName('Shravasti')).toBe('sravasti');
    expect(canonicalName('Rajagriha')).toBe('rajgir');
  });
  it('measures near misses without exploding on long strings', () => {
    expect(editDistance('sravasti', 'shravasti')).toBe(1);
    expect(editDistance('bodhgaya', 'timbuktu')).toBeGreaterThan(4);
  });
  it('measures real distances', () => {
    expect(Math.round(haversineKm({lat:24.696,lon:84.991},{lat:25.318,lon:82.974}))).toBeGreaterThan(180);
  });
});

describe('matching', () => {
  it('finds an exact name', () => {
    const r = resolvePlace('Bodhgaya', gaz);
    expect(r.status).toBe('resolved');
    expect(r.match.name).toBe('Bodhgaya');
    expect(r.match.kind).toBe(MATCH.EXACT);
  });
  it('resolves a historic name through an alternative spelling', () => {
    expect(resolvePlace('Benares', gaz).match.name).toBe('Varanasi');
    expect(resolvePlace('Kashi', gaz).match.name).toBe('Varanasi');
  });
  it('tolerates a misspelling but flags it rather than pretending', () => {
    const r = resolvePlace('Sravasty', gaz);
    expect(r.match.name).toBe('Sravasti');
    expect(r.status).toBe('weak');
    expect(r.needsConfirmation).toBe(true);
  });
  it('reports honestly when nothing matches, instead of forcing a guess', () => {
    const r = resolvePlace('Atlantis', gaz);
    expect(r.status).toBe('unmatched');
    expect(r.match).toBeNull();
    expect(r.needsConfirmation).toBe(true);
  });
});

describe('context ranking: the itinerary answers most questions itself', () => {
  const bihar = [{ lat:24.696, lon:84.991 }, { lat:25.318, lon:82.974 }];

  it('picks the Bihar Aurangabad when the tour is already in Bihar', () => {
    // Maharashtra's is more than ten times bigger, so population alone would
    // get this wrong -- proximity has to outweigh it.
    const r = resolvePlace('Aurangabad', gaz, { context: bihar });
    expect(r.match.admin1).toBe('Bihar');
  });

  it('picks the Maharashtra one when the tour is in the west', () => {
    const r = resolvePlace('Aurangabad', gaz, { context: [{ lat:19.07, lon:72.87 }] });
    expect(r.match.admin1).toBe('Maharashtra');
  });

  it('asks when there is no context to decide by', () => {
    const r = resolvePlace('Aurangabad', gaz);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.length).toBeGreaterThan(1);
  });

  it('flags a match that sits absurdly far from the rest of the tour', () => {
    const r = resolvePlace('Lumbini', gaz, { context: [{ lat:8.5, lon:76.9 }] });
    expect(r.status).toBe('ambiguous');
    expect(r.reason).toMatch(/km from the rest/);
  });
});

describe('the user is never left helpless', () => {
  it('always returns the alternatives, even on a confident match', () => {
    // The interface must be able to show the working and accept a change,
    // not only when the resolver happens to be unsure.
    const r = resolvePlace('Aurangabad', gaz, { context: [{ lat:24.7, lon:85.0 }] });
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.map(c => c.admin1)).toContain('Maharashtra');
  });

  it('always explains why it chose what it chose', () => {
    expect(resolvePlace('Bodhgaya', gaz).reason).toBeTruthy();
    expect(resolvePlace('Aurangabad', gaz).reason).toBeTruthy();
    expect(resolvePlace('Nowhere', gaz).reason).toBeTruthy();
  });

  it('offers free-text search so someone who knows the answer can just find it', () => {
    const hits = searchGazetteer('auran', gaz);
    expect(hits.length).toBe(2);
    expect(searchGazetteer('kesa', gaz)[0].name).toBe('Kesariya');
  });

  it('can filter search by country for a cross-border itinerary', () => {
    expect(searchGazetteer('lum', gaz, { country:'Nepal' })[0].name).toBe('Lumbini');
    expect(searchGazetteer('lum', gaz, { country:'India' })).toEqual([]);
  });

  it('accepts a coordinate the user placed by hand, which always wins', () => {
    const m = manualPlace('A village with no entry anywhere', 25.1, 84.2);
    expect(m.source).toBe('manual');
    expect(isValidCoordinate(m.lat, m.lon)).toBe(true);
  });

  it('rejects nonsense coordinates rather than plotting them', () => {
    expect(isValidCoordinate(200, 0)).toBe(false);
    expect(isValidCoordinate('abc', 80)).toBe(false);
  });
});

describe('ranking mechanics', () => {
  it('never lets population beat a better name match', () => {
    const skewed = [
      { name:'Kesariya', lat:26.3, lon:84.8, population:9000 },
      { name:'Kesariyaji', lat:24.0, lon:73.9, population:900000 },
    ];
    expect(rankCandidates('Kesariya', skewed)[0].name).toBe('Kesariya');
  });
  it('returns nothing for an empty query rather than everything', () => {
    expect(rankCandidates('', gaz)).toEqual([]);
    expect(rankCandidates('   ', gaz)).toEqual([]);
  });
  it('handles an empty or missing gazetteer without throwing', () => {
    expect(rankCandidates('Bodhgaya', [])).toEqual([]);
    expect(resolvePlace('Bodhgaya', null).status).toBe('unmatched');
  });
});
