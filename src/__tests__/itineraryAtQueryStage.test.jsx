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

  it('does NOT leak the tour-file-only documents into the query stage', () => {
    render(<QueryDrawerWithQuote query={baseQuery} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    // These stay gated behind conversion -- widening Itinerary must not have
    // widened everything else with it.
    expect(screen.queryByText('Tax Invoice')).toBeNull();
    expect(screen.queryByText('Exchange Orders')).toBeNull();
    expect(screen.queryByText('Meal Plan')).toBeNull();
    expect(screen.queryByText('Tour Briefing Sheet')).toBeNull();
  });

  it('a converted tour file still offers the full document set including Itinerary', () => {
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Itinerary')).toBeTruthy();
    expect(screen.getByText('Tax Invoice')).toBeTruthy();
    expect(screen.getByText('Meal Plan')).toBeTruthy();
  });
});
