import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

const baseQuery = { id: 'UTQ-2026-700', groupName: 'Query Stage Group', destination: 'Kerala', nights: 3, status: 'New Query' };
const props = {
  onClose: () => {}, onUpdate: () => {}, currentUser: { id: 'x', name: 'T' },
  staff: [], payments: {}, costSheetExists: new Set(), quotationExists: new Set(),
};

describe('1.3 Itinerary is available at query stage, not only after tour-file conversion', () => {
  it('a plain query offers Itinerary alongside Cost Sheet and Quotation', () => {
    render(<QueryDrawerWithQuote query={baseQuery} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Cost Sheet')).toBeTruthy();
    expect(screen.getByText('Itinerary')).toBeTruthy();
    expect(screen.getByText('Quotation')).toBeTruthy();
  });

  // Updated 2026-09-29 (direct request): Uploads, Editor and Tour
  // Briefing Sheet no longer wait for conversion -- only Invoices and
  // Exchange Orders, which carry real GST/financial-voucher weight tied
  // to a confirmed booking, still do. See queryStageDocGating.test.jsx
  // for the fuller regression coverage of this change.
  it('does NOT leak the still-gated financial documents into the query stage, but does offer Uploads/Editor/Tour Briefing Sheet', () => {
    render(<QueryDrawerWithQuote query={baseQuery} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    // These stay gated behind conversion.
    expect(screen.queryByText('Invoices')).toBeNull();
    expect(screen.queryByText('Exchange Orders')).toBeNull();
    // These no longer are.
    expect(screen.getByText('Tour Briefing Sheet')).toBeTruthy();
    expect(screen.getByText('Editor')).toBeTruthy();
    expect(screen.getByText('Uploads')).toBeTruthy();
  });

  it('a converted tour file still offers the full document set including Itinerary', () => {
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Itinerary')).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
    expect(screen.getByText('Tour Briefing Sheet')).toBeTruthy();
  });
});

describe('Itinerary (both Brief and Detailed) is reachable from the drawer, at either stage', () => {
  // History: Brief and Detailed Itinerary were once two separate documents.
  // Detailed existed, worked, and was fully built (PlacePicker, generated
  // map, brochure export) but was reachable ONLY from the separate Tour
  // Files list view -- this drawer, the actual day-to-day entry point, had
  // no button for it at all. They have since been merged into one document
  // (Itinerary) with an internal Brief/Detailed flavor toggle, available at
  // query stage like Brief always was, so there is now exactly one button
  // to find rather than two -- see Itinerary.jsx for the merge itself.
  it('one Itinerary button reaches both flavors, at query stage', () => {
    const handler = vi.fn();
    document.addEventListener('unitop-open', handler);
    render(<QueryDrawerWithQuote query={baseQuery} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    fireEvent.click(screen.getByText('Itinerary'));
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.panel).toBe('itinerary');
    document.removeEventListener('unitop-open', handler);
  });

  it('the same one Itinerary button is present at tour-file stage too', () => {
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Itinerary')).toBeTruthy();
    // Only one Itinerary entry, not a separate Brief/Detailed pair.
    expect(screen.getAllByText('Itinerary')).toHaveLength(1);
  });
});
