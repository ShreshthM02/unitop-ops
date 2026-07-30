import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildQuotationDocxBlob } from '../lib/wordExport.js';

const baseQ = {
  attnName: 'John', attnCompany: 'Acme', attnCity: 'Bangkok', date: '1 Jan 2026', refLine: 'Test Ref',
  greeting: 'Hello!', openingLine: 'Please find as under.',
  itinerary: [{ day: 'Day 01', date: '', movement: 'Delhi arrival', bf: '', lunch: '', dinner: '' }],
  showItinDate: false,
  hotels: [{ place: 'Delhi', nights: '1', hotel: 'Hotel X' }],
  showFlights: true, flights: ['DEL-VNS 6E123'], flightsHeading: 'Domestic Flights',
  showTrains: false, trains: [], trainsHeading: 'Domestic Trains',
  showMonuments: true, monuments: [{ name: 'Taj', fee: '500' }], monumentNote: 'Monument Fees Heading',
  showRemarks: true, remarks: 'Confirm by Friday', remarksHeading: 'Remarks',
  currency: 'US $', slabs: [{ label: '10-14 Pax', price: '200' }],
  includes: ['Hotel accommodation'], excludes: ['Airfare'],
  closingLine: 'Thanks.', signoff: 'Regards\nTeam',
};

async function unzipDocx(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const read = (name) => zip.file(name)?.async('string');
  return {
    zip,
    document: await read('word/document.xml'),
    headerFiles: Object.keys(zip.files).filter((n) => n.startsWith('word/header')),
    footerFiles: Object.keys(zip.files).filter((n) => n.startsWith('word/footer')),
    readFile: read,
  };
}

describe('Quotation Word export (wordExport.js / wordLetterhead.js)', () => {
  it('produces a real, non-trivial .docx (zip) file', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: true, showStamp: true, printOnLetterhead: false });
    expect(blob.size).toBeGreaterThan(1000);
    const { document } = await unzipDocx(blob);
    expect(document).toBeTruthy();
  });

  it('includes all body sections in the same order as the PDF path: itinerary, flights, accommodation, monuments, remarks, price', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: true, showStamp: true, printOnLetterhead: false });
    const { document } = await unzipDocx(blob);
    const idx = (needle) => document.indexOf(needle);
    expect(idx('DEL-VNS')).toBeGreaterThan(-1);
    expect(idx('Monument Fees Heading')).toBeGreaterThan(-1);
    expect(idx('Confirm by Friday')).toBeGreaterThan(-1);
    // 1.3/1.4/1.5 ordering: flights -> accommodation -> monuments -> remarks -> price
    expect(idx('DEL-VNS')).toBeLessThan(idx('Hotel X'));
    expect(idx('Hotel X')).toBeLessThan(idx('Monument Fees Heading'));
    expect(idx('Monument Fees Heading')).toBeLessThan(idx('Confirm by Friday'));
    expect(idx('Confirm by Friday')).toBeLessThan(idx('Cost Per Person'));
  });

  it('1.2: an optional Date column appears in the itinerary table only when showItinDate is on', async () => {
    const withDate = { ...baseQ, showItinDate: true, itinerary: [{ day: 'Day 01', date: '12 Oct', movement: 'Delhi arrival', bf: '', lunch: '', dinner: '' }] };
    const blobOff = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: false, showStamp: false, printOnLetterhead: false });
    const blobOn = await buildQuotationDocxBlob(withDate, { headerFooterAllPages: true, showPageNum: false, showStamp: false, printOnLetterhead: false });
    const off = await unzipDocx(blobOff);
    const on = await unzipDocx(blobOn);
    expect(off.document).not.toContain('12 Oct');
    expect(on.document).toContain('12 Oct');
    expect(on.document.toUpperCase()).toContain('BREAKFAST');
  });

  it('printOnLetterhead=true: widens the physical margin to 6cm top / 4cm bottom and leaves header/footer blank of real content', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: false, showPageNum: true, showStamp: false, printOnLetterhead: true });
    const { document, headerFiles, footerFiles, readFile } = await unzipDocx(blob);
    // 60mm/40mm in twips (1mm = 56.6929 twips), matching DOCX_MARGIN_LETTERHEAD
    expect(document).toMatch(/<w:pgMar[^/]*w:top="3402"/);
    expect(document).toMatch(/<w:pgMar[^/]*w:bottom="2268"/);
    for (const name of headerFiles) {
      const content = await readFile(name);
      expect(content).not.toContain('Registered Office');
    }
    for (const name of footerFiles) {
      const content = await readFile(name);
      expect(content).not.toContain('Registered Office');
    }
  });

  it('printOnLetterhead=true still shows the page number, since it cannot be pre-printed on physical letterhead paper', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: false, showPageNum: true, showStamp: false, printOnLetterhead: true });
    const { footerFiles, readFile } = await unzipDocx(blob);
    let foundPageField = false;
    for (const name of footerFiles) {
      const content = await readFile(name);
      if (content.includes('PAGE')) foundPageField = true;
    }
    expect(foundPageField).toBe(true);
  });

  it('headerFooterAllPages=true: uses the normal 8mm/14mm margin and puts real content on the single repeating (default) header/footer', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: false, showStamp: false, printOnLetterhead: false });
    const { document, headerFiles, footerFiles, readFile } = await unzipDocx(blob);
    // 8mm in twips
    expect(document).toMatch(/<w:pgMar[^/]*w:top="454"/);
    expect(document).toContain('<w:titlePg w:val="false"/>');
    expect(headerFiles.length).toBe(1);
    expect(footerFiles.length).toBe(1);
    expect(await readFile(headerFiles[0])).toContain('Registered Office');
    // The footer carries the 4 badge images, not text -- check it actually
    // embeds image relationships rather than being blank.
    expect(await readFile(footerFiles[0])).toContain('<w:drawing>');
  });

  it('neither toggle on: real header/footer appear once (Word\'s own "different first page"), blank on every page after', async () => {
    const blob = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: false, showPageNum: false, showStamp: false, printOnLetterhead: false });
    const { document, readFile } = await unzipDocx(blob);
    expect(document).toContain('<w:titlePg/>');
    const defaultHeaderRel = document.match(/<w:headerReference w:type="default" r:id="(rId\d+)"\/>/)[1];
    const firstHeaderRel = document.match(/<w:headerReference w:type="first" r:id="(rId\d+)"\/>/)[1];
    expect(defaultHeaderRel).not.toBe(firstHeaderRel);
    // Both header1.xml and header2.xml exist; exactly one of them has the
    // real address block (the "first" one), the other is blank.
    const contents = await Promise.all(['word/header1.xml', 'word/header2.xml'].map(readFile));
    const withReal = contents.filter((c) => c.includes('Registered Office'));
    expect(withReal.length).toBe(1);
  });

  it('showStamp toggles the digital stamp image in the closing/signature block of the body', async () => {
    const withStamp = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: false, showStamp: true, printOnLetterhead: false });
    const withoutStamp = await buildQuotationDocxBlob(baseQ, { headerFooterAllPages: true, showPageNum: false, showStamp: false, printOnLetterhead: false });
    const withZip = await unzipDocx(withStamp);
    const withoutZip = await unzipDocx(withoutStamp);
    const mediaCount = (z) => Object.keys(z.zip.files).filter((n) => n.startsWith('word/media/')).length;
    expect(mediaCount(withZip)).toBeGreaterThan(mediaCount(withoutZip));
  });
});
