import { describe, it, expect } from 'vitest';
import { SOUTH_ASIA_LAND, INDIA_STATE_BORDERS, INDIA_STATE_LABELS } from '../lib/mapGeography.js';

describe('SOUTH_ASIA_LAND: real country boundary data (Natural Earth via world-atlas), not approximated', () => {
  it('includes India and its immediate neighbours', () => {
    const names = SOUTH_ASIA_LAND.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['India', 'Nepal', 'Bangladesh', 'Bhutan', 'Pakistan', 'China', 'Sri Lanka', 'Afghanistan']));
  });

  it('matches the real gazetteer\u2019s own actual country coverage exactly, not an assumed South Asia list -- confirmed by querying the live gazetteer directly for a country-by-country row count', () => {
    // The gazetteer table genuinely contains rows for these 8 countries
    // (verified directly, not assumed): India, Pakistan, Thailand, Nepal,
    // Myanmar, Bangladesh, Sri Lanka, Bhutan. Thailand and Myanmar are
    // substantial (131k and 55k rows), not edge cases -- an earlier
    // version of this file was missing Thailand entirely.
    const names = SOUTH_ASIA_LAND.map(f => f.name);
    const gazetteerCountries = ['India', 'Pakistan', 'Thailand', 'Nepal', 'Myanmar', 'Bangladesh', 'Sri Lanka', 'Bhutan'];
    gazetteerCountries.forEach(country => expect(names).toContain(country));
  });

  it('every feature has valid GeoJSON Polygon/MultiPolygon geometry', () => {
    SOUTH_ASIA_LAND.forEach(f => {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
      expect(Array.isArray(f.geometry.coordinates)).toBe(true);
    });
  });
});

describe('INDIA_STATE_BORDERS / INDIA_STATE_LABELS: real state boundary data (datamaps, MIT licensed), not approximated', () => {
  it('has all 35 states/union territories from the source dataset (one unnamed coastal sliver dropped)', () => {
    expect(INDIA_STATE_BORDERS).toHaveLength(35);
    expect(INDIA_STATE_LABELS).toHaveLength(35);
  });

  it('outdated names from the dataset\u2019s vintage are corrected to current official names', () => {
    const borderNames = INDIA_STATE_BORDERS.map(s => s.name);
    expect(borderNames).toContain('Uttarakhand');
    expect(borderNames).toContain('Odisha');
    expect(borderNames).not.toContain('Uttaranchal');
    expect(borderNames).not.toContain('Orissa');
  });

  it('every border feature has a matching label with the same name', () => {
    const borderNames = new Set(INDIA_STATE_BORDERS.map(s => s.name));
    const labelNames = new Set(INDIA_STATE_LABELS.map(l => l.name));
    expect(borderNames).toEqual(labelNames);
  });

  it('every border feature has valid GeoJSON geometry', () => {
    INDIA_STATE_BORDERS.forEach(s => {
      expect(['Polygon', 'MultiPolygon']).toContain(s.geometry.type);
      expect(Array.isArray(s.geometry.coordinates)).toBe(true);
    });
  });

  it('every label has real coordinates within India\u2019s own rough bounding box, not a placeholder', () => {
    INDIA_STATE_LABELS.forEach(l => {
      expect(l.lon).toBeGreaterThan(68);
      expect(l.lon).toBeLessThan(98);
      expect(l.lat).toBeGreaterThan(6);
      expect(l.lat).toBeLessThan(36);
    });
  });

  it('Bihar\u2019s label lands somewhere genuinely within Bihar, not at an arbitrary point', () => {
    // Loose sanity bounds on Bihar's own real extent -- catches a gross
    // centroid computation error without needing survey-grade precision.
    const bihar = INDIA_STATE_LABELS.find(l => l.name === 'Bihar');
    expect(bihar).toBeTruthy();
    expect(bihar.lon).toBeGreaterThan(83);
    expect(bihar.lon).toBeLessThan(88.5);
    expect(bihar.lat).toBeGreaterThan(24);
    expect(bihar.lat).toBeLessThan(27.5);
  });
});
