import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { cascadeItineraryDates, formatDateDayDMY, hotelPropertyLabel, mealPlanLabel, addDaysToIsoDate } from '../lib/utils.js';

// The 2026-09-28 amendments list, items 7-13, all in Quotation.

const fakeTemplate = {
  includes: [], excludes: [], monuments: [], showMonuments: true,
  greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: 'Monument Fees Heading',
  flightsHeading: 'Domestic Flights', trainsHeading: 'Domestic Trains', remarksHeading: 'Remarks',
};

function makeDb() {
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    }),
  };
}

async function renderQuotation(query = { id: 'UTQ-2026-9000', groupName: 'Amendments Test Group' }) {
  const db = makeDb();
  vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
  vi.resetModules();
  const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
  render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
}

describe('Item 7: Kind Attn auto-fetches from the query correspondent field', () => {
  it('pre-fills from query.correspondent when present', async () => {
    await renderQuotation({ id: 'UTQ-1', groupName: 'G', correspondent: 'Pee Suchint' });
    expect(screen.getByPlaceholderText(/Pee Suchint/).value).toBe('Pee Suchint');
  });
  it('leaves it blank when the query has no correspondent on file', async () => {
    await renderQuotation({ id: 'UTQ-1', groupName: 'G' });
    expect(screen.getByPlaceholderText(/Pee Suchint/).value).toBe('');
  });
});

describe('Item 8: itinerary Date column -- auto-fetch, format, and chronological cascade', () => {
  it('formatDateDayDMY renders "{day}, dd/mm/yyyy"', () => {
    expect(formatDateDayDMY('2026-10-12')).toBe('Mon, 12/10/2026');
  });
  it('addDaysToIsoDate rolls over month boundaries correctly', () => {
    expect(addDaysToIsoDate('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('cascadeItineraryDates fills later blank rows chronologically from the changed row', () => {
    const itin = [{ date: '' }, { date: '' }, { date: '' }];
    const result = cascadeItineraryDates(itin, 0, '2026-10-12');
    expect(result.map(r => r.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
  it('cascadeItineraryDates never overwrites a row that already has its own real date', () => {
    const itin = [{ date: '' }, { date: '2026-12-25' }, { date: '' }];
    const result = cascadeItineraryDates(itin, 0, '2026-10-12');
    expect(result.map(r => r.date)).toEqual(['2026-10-12', '2026-12-25', '2026-10-14']);
  });
  it('turning the Date column on auto-fetches the query\'s confirmed travel date into Day 1 and cascades the rest', async () => {
    await renderQuotation({ id: 'UTQ-1', groupName: 'G', travelDate: '2026-10-12' });
    fireEvent.click(screen.getByText(/Show a Date column/).closest('label').querySelector('input'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs[0].value).toBe('2026-10-12');
    expect(dateInputs[1].value).toBe('2026-10-13');
  });
  it('does not fetch a date when the query has no confirmed travel date yet (still "TBC")', async () => {
    await renderQuotation({ id: 'UTQ-1', groupName: 'G', travelDate: 'TBC' });
    fireEvent.click(screen.getByText(/Show a Date column/).closest('label').querySelector('input'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs[0].value).toBe('');
  });
  it('manually picking a date on a middle row cascades to later blank rows, still editable after', async () => {
    await renderQuotation({ id: 'UTQ-1', groupName: 'G' });
    fireEvent.click(screen.getByText(/Show a Date column/).closest('label').querySelector('input'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2026-11-01' } });
    const dateInputsAfter = document.querySelectorAll('input[type="date"]');
    expect(dateInputsAfter[1].value).toBe('2026-11-01');
    expect(dateInputsAfter[2].value).toBe('2026-11-02');
    // still editable afterward
    fireEvent.change(dateInputsAfter[2], { target: { value: '2026-12-25' } });
    expect(document.querySelectorAll('input[type="date"]')[2].value).toBe('2026-12-25');
  });
});

describe('Item 9: flight/train entries get an optional remark and the table has real column headers', () => {
  it('shows Day/Detail/Remark column headers once flights are shown', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Day', 'Detail', 'Remark']));
  });
  it('a new flight item has an editable remark field', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    const remarkInput = screen.getByPlaceholderText('Optional remark');
    fireEvent.change(remarkInput, { target: { value: 'Reconfirm 24h prior' } });
    expect(remarkInput.value).toBe('Reconfirm 24h prior');
  });
  it('same for trains', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic trains/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Train'));
    expect(screen.getByPlaceholderText('Optional remark')).toBeTruthy();
  });
});

describe('Item 10: accommodation shows "{hotel} / {alt hotel} / Similar"', () => {
  it('hotelPropertyLabel composes the display string correctly', () => {
    expect(hotelPropertyLabel('Saura', 'Golden Tulip')).toBe('Saura / Golden Tulip / Similar');
    expect(hotelPropertyLabel('Saura', '')).toBe('Saura / Similar');
    expect(hotelPropertyLabel('', '')).toBe('');
  });
  it('the editor has separate Hotel Name / Alt Hotel fields and shows a live preview of the composed label', async () => {
    await renderQuotation();
    fireEvent.change(screen.getByPlaceholderText('e.g. Saura'), { target: { value: 'Saura' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Golden Tulip'), { target: { value: 'The Golden Tulip' } });
    expect(screen.getByText('Saura / The Golden Tulip / Similar')).toBeTruthy();
  });
});

describe('Item 11: monument fees table has column headers, editable via a small edit button', () => {
  it('shows the default column headings', async () => {
    await renderQuotation();
    expect(screen.getByText('Monument / Activity')).toBeTruthy();
    expect(screen.getByText('Fee')).toBeTruthy();
  });
  it('the edit button turns the headings into editable inputs', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByTitle('Edit column headings'));
    const nameInput = screen.getByDisplayValue('Monument / Activity');
    fireEvent.change(nameInput, { target: { value: 'Entrance Fees' } });
    expect(nameInput.value).toBe('Entrance Fees');
  });
});

describe('Item 12: Remarks now sits below Cost Per Pax (Price Slabs), not above it', () => {
  it('Cost Per Person appears before Remarks in the content tab', async () => {
    await renderQuotation();
    const labels = screen.getAllByText(/💰 Cost Per Person|📝 Remarks/).map(el => el.textContent);
    expect(labels).toEqual(['💰 Cost Per Person', '📝 Remarks']);
  });
});

describe('Item 13: previously non-draggable lists (itinerary, hotels, monuments, flights, trains) are now draggable', () => {
  it('itinerary rows are draggable', async () => {
    await renderQuotation();
    const rows = document.querySelectorAll('tr[draggable="true"]');
    const itinRow = Array.from(rows).find(r => r.querySelector('input[placeholder*="Bangkok"]'));
    expect(itinRow).toBeTruthy();
  });
  it('hotel rows are draggable', async () => {
    await renderQuotation();
    const rows = document.querySelectorAll('tr[draggable="true"]');
    const hotelRow = Array.from(rows).find(r => r.querySelector('input[placeholder="e.g. Saura"]'));
    expect(hotelRow).toBeTruthy();
  });
  it('monument rows are draggable once the section is shown', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText('+ Add'));
    const rows = document.querySelectorAll('tr[draggable="true"]');
    const monRow = Array.from(rows).find(r => r.querySelector('input[placeholder="Monument name"]'));
    expect(monRow).toBeTruthy();
  });
  it('flight rows are draggable once shown', async () => {
    await renderQuotation();
    fireEvent.click(screen.getByText(/Show domestic flights/).closest('label').querySelector('input'));
    fireEvent.click(screen.getByText('+ Add Flight'));
    const rows = document.querySelectorAll('tr[draggable="true"]');
    const flightRow = Array.from(rows).find(r => r.querySelector('input[placeholder="Optional remark"]'));
    expect(flightRow).toBeTruthy();
  });
});
