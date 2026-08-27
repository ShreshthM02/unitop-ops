import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Tour Briefing Sheet QA round 2 (2026-08-27): print-sections dropdown+
// checkbox+drag, "At Hotel" default meal text (Tour Briefing Sheet only,
// not Quotation, which shares the extraction function), tab reorder,
// Other Services restructured into named multi-item groups, date pickers
// added where missing, and a universal per-section editable label
// (replacing hardcoded headings and removing yellow highlighting).

const mockDb = {
  from: vi.fn(() => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');
const fakeQuery = { id: 'UTQ-2026-2200', groupName: 'QA Round 2 Test' };

const renderTBS = () => render(<TourBriefingSheet query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);

describe('1: Print Sections is a dropdown with checkboxes, not pill buttons', () => {
  it('is collapsed by default, showing a summary count', async () => {
    renderTBS();
    expect(await screen.findByText(/Print Sections \(\d+\/\d+\)/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('clicking it opens a list of real checkboxes, one per section', async () => {
    renderTBS();
    fireEvent.click(await screen.findByText(/Print Sections/));
    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan (5);
    expect(checkboxes[0].checked).toBe(true);
  });

  it('unchecking a section toggles it off', async () => {
    renderTBS();
    fireEvent.click(await screen.findByText(/Print Sections/));
    const hotelsMatches = await screen.findAllByText('Hotels');
    const hotelsLabel = hotelsMatches.map(el => el.closest('label')).find(Boolean);
    const checkbox = hotelsLabel.querySelector('input[type="checkbox"]');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});

describe('2: "At Hotel" replaces "Included" as the pre-filled meal text (Tour Briefing Sheet only)', () => {
  it('a Cost Sheet pull into Meal Plan uses "At Hotel", not "Included"', async () => {
    const finalCS = { id: 'cs-1', version: 2, is_final: true, days: [{ day: 'Day 1', movement: 'DEL-SXR', mealPlan: 'B/L/D' }] };
    const db = {
      from: vi.fn((t) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
          update: vi.fn(async () => ({ data: [], error: null })),
          then: (resolve) => resolve({ data: t === 'cost_sheets' ? [finalCS] : [], error: null }),
        };
        return builder;
      }),
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TBS } = await import('../components/TourBriefingSheet.jsx');
    render(<TBS query={fakeQuery} template={{}} facilitators={[]} onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => expect(screen.getByText(/Pulled from Cost Sheet v2/)).toBeTruthy());
    fireEvent.click(screen.getByText('Meal Plan'));
    expect(await screen.findAllByDisplayValue('At Hotel')).toBeTruthy();
    expect(screen.queryByDisplayValue('Included')).toBeNull();
  });

  it('the extraction library itself still returns "Included" for Quotation, which shares it', async () => {
    const { extractItineraryFromCostSheetDays } = await import('../lib/utils.js');
    const result = extractItineraryFromCostSheetDays([{ day: 'Day 1', movement: 'X', mealPlan: 'B' }]);
    expect(result[0].breakfast).toBe('Included');
  });
});

describe('3: tabs are ordered meta -> programme -> hotels -> flights -> trains -> transport -> guides -> others -> mealplan -> contacts', () => {
  it('Programme appears immediately after Header/Meta, before Hotels', async () => {
    renderTBS();
    const tabBar = (await screen.findByText('Hotels')).parentElement;
    const labels = Array.from(tabBar.children).map(el => el.textContent);
    expect(labels.indexOf('Programme')).toBeLessThan(labels.indexOf('Hotels'));
    expect(labels.indexOf('Hotels')).toBeLessThan(labels.indexOf('Flights'));
    expect(labels.indexOf('Other Services')).toBeLessThan(labels.indexOf('Meal Plan'));
    expect(labels.indexOf('Meal Plan')).toBeLessThan(labels.indexOf('Contact List'));
  });
});

describe('4: Other Services is restructured into named, addable multi-item sections', () => {
  const openOthers = async () => {
    renderTBS();
    fireEvent.click(await screen.findByText('Other Services'));
  };

  it('has a Section Label field (not a fixed "Other Services:" heading) and day/date/description fields, no Type or Status', async () => {
    await openOthers();
    expect(await screen.findByDisplayValue('Other Services')).toBeTruthy();
    expect(screen.getByText('Day')).toBeTruthy();
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.queryByText('Service Type')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
  });

  it('"+ Add Section" creates a second, independently labeled group', async () => {
    await openOthers();
    fireEvent.click(await screen.findByText('+ Add Section'));
    const labelInputs = screen.getAllByDisplayValue(/Other Services|Section 2/);
    expect(labelInputs.length).toBe(2);
    fireEvent.change(labelInputs[1], { target: { value: 'Monuments' } });
    expect(screen.getByDisplayValue('Monuments')).toBeTruthy();
    expect(screen.getByDisplayValue('Other Services')).toBeTruthy();
  });

  it('each group prints as its own labeled table when it has content', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    await openOthers();
    const descInput = screen.getByText('Description').parentElement.querySelector('input');
    fireEvent.change(descInput, { target: { value: 'Taj Mahal entry fee' } });
    fireEvent.click(await screen.findByText('+ Add Section'));
    const labelInputs = screen.getAllByDisplayValue(/Other Services|Section 2/);
    fireEvent.change(labelInputs[1], { target: { value: 'Monuments' } });
    const descInputs2 = screen.getAllByText('Description').map(el => el.parentElement.querySelector('input'));
    fireEvent.change(descInputs2[1], { target: { value: 'City tour by private car' } });
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    expect(captured.html).toContain('>Other Services:<');
    expect(captured.html).toContain('>Monuments:<');
    expect(captured.html).toContain('Taj Mahal entry fee');
    expect(captured.html).toContain('City tour by private car');
    window.open = realOpen;
  });
});

describe('5: date pickers added to Flights, Trains, and Contacts', () => {
  it('Flights date field is type="date"', async () => {
    renderTBS();
    fireEvent.click(await screen.findByText('Flights'));
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });

  it('Trains date field is type="date"', async () => {
    renderTBS();
    fireEvent.click(await screen.findByText('Trains'));
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });

  it('Contacts date field is type="date"', async () => {
    renderTBS();
    fireEvent.click(await screen.findByText('Contact List'));
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
  });
});

describe('6: every section has an editable Section Label defaulting to its tab title, no yellow highlighting', () => {
  const tabs = [
    ['Hotels', 'hotels', 'Hotels'],
    ['Flights', 'flights', 'Flights'],
    ['Trains', 'trains', 'Trains'],
    ['Transport', 'transport', 'Transport'],
    ['Tour Facilitators', 'guides', 'Tour Facilitators'],
    ['Programme', 'programme', 'Programme'],
    ['Meal Plan', 'mealplan', 'Meal Plan'],
    ['Contact List', 'contacts', 'Contact List'],
  ];

  tabs.forEach(([tabLabel, id, expectedDefault]) => {
    it(`${tabLabel} tab has a Section Label input defaulting to "${expectedDefault}"`, async () => {
      renderTBS();
      fireEvent.click(await screen.findByText(tabLabel));
      expect(await screen.findByDisplayValue(expectedDefault)).toBeTruthy();
    });
  });

  it('no section heading uses the old yellow background in print output', async () => {
    let captured = {};
    const realOpen = window.open;
    window.open = () => ({ document: { write: (html) => { captured.html = html; }, close: () => {} }, print: () => {} });
    renderTBS();
    fireEvent.click(await screen.findByText('Flights'));
    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } });
    const sectorInputs = screen.getAllByRole('textbox');
    fireEvent.change(sectorInputs[sectorInputs.length - 3] || sectorInputs[0], { target: { value: 'DEL-BOM' } });
    fireEvent.click(screen.getAllByText(/⬇ Export/)[0]);
    fireEvent.click(await screen.findByText('📕 PDF'));
    await waitFor(() => expect(captured.html).toBeTruthy());
    expect(captured.html).not.toContain('#FFE135');
    window.open = realOpen;
  });
});
