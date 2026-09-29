import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VendorMaster from '../components/VendorMaster.jsx';
import { parseLanguagesList, vendorHasLanguage, allVendorLanguages } from '../lib/utils.js';

// Direct request (2026-09-29): make Tour Facilitators (vendors) searchable
// by language. vendors.languages is free text ("English, Thai, Mandarin"),
// never a real list before now -- parseLanguagesList/vendorHasLanguage/
// allVendorLanguages are the pure helpers behind both the general search
// box now also matching languages, and a dedicated language filter
// dropdown alongside the existing Type filter pills.

describe('parseLanguagesList', () => {
  it('splits, trims and dedupes a comma-separated languages string', () => {
    expect(parseLanguagesList('English, Thai,  Mandarin ,english')).toEqual(['English', 'Thai', 'Mandarin']);
  });
  it('returns an empty array for empty/null/undefined input', () => {
    expect(parseLanguagesList('')).toEqual([]);
    expect(parseLanguagesList(null)).toEqual([]);
    expect(parseLanguagesList(undefined)).toEqual([]);
  });
});

describe('vendorHasLanguage', () => {
  it('matches a language case-insensitively as a real token, not a raw substring', () => {
    const v = { languages: 'English, Thai' };
    expect(vendorHasLanguage(v, 'thai')).toBe(true);
    expect(vendorHasLanguage(v, 'THAI')).toBe(true);
    // "Thailand" is not a language this vendor speaks -- a naive
    // substring match on the languages string would wrongly say yes.
    expect(vendorHasLanguage(v, 'Thailand')).toBe(false);
  });
  it('an empty/no language filter matches every vendor', () => {
    expect(vendorHasLanguage({ languages: 'English' }, '')).toBe(true);
    expect(vendorHasLanguage({ languages: '' }, '')).toBe(true);
  });
  it('a vendor with no languages set never matches a real language filter', () => {
    expect(vendorHasLanguage({ languages: '' }, 'English')).toBe(false);
    expect(vendorHasLanguage({}, 'English')).toBe(false);
  });
});

describe('allVendorLanguages', () => {
  it('collects every distinct language across all vendors, alphabetically, deduped case-insensitively', () => {
    const vendors = [
      { languages: 'Thai, English' },
      { languages: 'english, Mandarin' },
      { type: 'Hotel' }, // no languages field at all -- must not throw
    ];
    expect(allVendorLanguages(vendors)).toEqual(['English', 'Mandarin', 'Thai']);
  });
});

const facilitators = [
  { id: 'v1', name: 'Priya Facilitator', type: 'Tour Facilitator', city: 'Delhi', active: true, languages: 'English, Hindi' },
  { id: 'v2', name: 'Somchai Facilitator', type: 'Tour Facilitator', city: 'Bangkok', active: true, languages: 'Thai, English' },
  { id: 'v3', name: 'Generic Hotel', type: 'Hotel', city: 'Agra', active: true, languages: '' },
];

const baseProps = { setVendors:()=>{}, queries:[], payments:{}, tourExecutions:{}, currentUser:{id:1,role:'admin'}, onSaveVendor:()=>{}, onClose:()=>{} };

describe('VendorMaster: language filter dropdown', () => {
  it('offers a dropdown of every distinct language found across vendors', () => {
    render(<VendorMaster vendors={facilitators} {...baseProps}/>);
    expect(screen.getByTitle('Filter by language spoken')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Thai')).toBeTruthy();
    expect(screen.getByText('Hindi')).toBeTruthy();
  });

  it('selecting a language shows only vendors who speak it', () => {
    render(<VendorMaster vendors={facilitators} {...baseProps}/>);
    fireEvent.change(screen.getByTitle('Filter by language spoken'), { target: { value: 'Thai' } });
    expect(screen.getByText('Somchai Facilitator')).toBeTruthy();
    expect(screen.queryByText('Priya Facilitator')).toBeFalsy();
    expect(screen.queryByText('Generic Hotel')).toBeFalsy();
  });

  it('"Any language" (the default) shows every vendor regardless of language', () => {
    render(<VendorMaster vendors={facilitators} {...baseProps}/>);
    expect(screen.getByText('Priya Facilitator')).toBeTruthy();
    expect(screen.getByText('Somchai Facilitator')).toBeTruthy();
    expect(screen.getByText('Generic Hotel')).toBeTruthy();
  });
});

describe('VendorMaster: plain search also matches language', () => {
  it('typing a language into the general search box finds facilitators who speak it', () => {
    render(<VendorMaster vendors={facilitators} {...baseProps}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search vendors/i), { target: { value: 'Hindi' } });
    expect(screen.getByText('Priya Facilitator')).toBeTruthy();
    expect(screen.queryByText('Somchai Facilitator')).toBeFalsy();
  });
});
