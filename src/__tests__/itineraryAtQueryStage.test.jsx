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
    expect(screen.getByText('Brief Itin.')).toBeTruthy();
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
    // Detailed Itinerary (the brochure) is also tour-file-only -- see the
    // test below for the boundary this enforces.
    expect(screen.queryByText('Detailed Itin.')).toBeNull();
  });

  it('a converted tour file still offers the full document set including Itinerary', () => {
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Brief Itin.')).toBeTruthy();
    expect(screen.getByText('Tax Invoice')).toBeTruthy();
    expect(screen.getByText('Meal Plan')).toBeTruthy();
  });
});

describe('Detailed Itinerary is reachable from the drawer at tour-file stage', () => {
  // Regression test: DetailedItinerary.jsx, its PlacePicker, and its
  // generated map all existed and worked, but this drawer -- the actual
  // day-to-day entry point -- never had a button for it. It was only
  // reachable from the separate Tour Files list view. Fixed by adding the
  // button here and wiring its panel event in UnitopApp.jsx.
  it('shows a Detailed Itin. button once a query has become a tour file', () => {
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    expect(screen.getByText('Detailed Itin.')).toBeTruthy();
  });

  it('dispatches the detailedItinerary panel event when clicked', () => {
    const handler = vi.fn();
    document.addEventListener('unitop-open', handler);
    render(<QueryDrawerWithQuote query={{ ...baseQuery, tourFileId: 'TUR-2026-001' }} {...props}/>);
    fireEvent.click(screen.getByText('📋 Docs'));
    fireEvent.click(screen.getByText('Detailed Itin.'));
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.panel).toBe('detailedItinerary');
    document.removeEventListener('unitop-open', handler);
  });
});
