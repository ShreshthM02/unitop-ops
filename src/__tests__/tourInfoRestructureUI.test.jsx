import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// loadQuotationVersions normally hits Supabase; the drawer's Hotels + Meals
// tab syncs from it, so tests control exactly what "the quotation" is.
const h = vi.hoisted(() => ({ versions: [] }));
vi.mock('../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadQuotationVersions: vi.fn(async () => h.versions),
}));

import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';
import GanttView from '../components/GanttView.jsx';

const query = {
  id: 'UTQ-2026-050', tourFileId: 'TF-2026-050', groupName: 'Test Group', status: 'operations',
  manualWF: [], audit: [], remarks: [], nights: 2, pax: 10, travelDate: '2026-10-01',
};
const vendors = [{ id: 'VND-030', name: 'Delhi Coaches', type: 'Transport', active: true }];
const blankTE = { queryId: query.id, days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
const props = (over = {}) => ({
  query, onClose: () => {}, onConvert: () => {}, onAdvance: () => {}, onGenerateQuote: () => {},
  onToggleWF: () => {}, onCancel: () => {}, onUpdateRemarks: () => {}, currentUser: { id: 1, name: 'Test' },
  tourExecution: blankTE, vendors, onUpdateTourExecution: () => {}, ...over,
});
const threeDays = [
  { id: 1, dayLabel: 'Day 1', date: '2026-10-01', route: 'Delhi', notes: '' },
  { id: 2, dayLabel: 'Day 2', date: '2026-10-02', route: 'Agra', notes: '' },
  { id: 3, dayLabel: 'Day 3', date: '2026-10-03', route: 'Jaipur', notes: '' },
];
const routes = () => screen.getAllByTestId('itinerary-row').map(r => r.querySelector('input[placeholder="e.g. Delhi – Agra"]').value);

beforeEach(() => { h.versions = []; });

describe('Itinerary tab', () => {
  it('no longer has a Meals field (meals moved to Hotels + Meals)', () => {
    render(<QueryDrawerWithQuote {...props()} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    fireEvent.click(screen.getByText('+ Add Day'));
    expect(screen.queryByPlaceholderText(/Meals/)).toBeNull();
    expect(screen.getByLabelText('Notes')).toBeTruthy();
  });

  it('rows can be reordered with the ▼ button; dates stay in their slots and "Day N" labels renumber', () => {
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days: threeDays }, onUpdateTourExecution: onUpdate })} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    fireEvent.click(within(screen.getAllByTestId('itinerary-row')[0]).getByLabelText('Move down'));
    expect(routes()).toEqual(['Agra', 'Delhi', 'Jaipur']);
    fireEvent.click(screen.getByText('💾 Save Itinerary'));
    const saved = onUpdate.mock.calls[0][1].days;
    expect(saved.map(d => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(saved.map(d => d.dayLabel)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(saved.map(d => d.route)).toEqual(['Agra', 'Delhi', 'Jaipur']);
  });

  it('rows can be dragged by their handle onto another row', () => {
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days: threeDays } })} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    const rows = screen.getAllByTestId('itinerary-row');
    fireEvent.dragStart(within(rows[0]).getByLabelText('Drag to reorder'));
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    expect(routes()).toEqual(['Agra', 'Jaipur', 'Delhi']);
  });

  it('the first row cannot move up and the last cannot move down', () => {
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days: threeDays } })} />);
    fireEvent.click(screen.getByText('Day-wise Itinerary'));
    const rows = screen.getAllByTestId('itinerary-row');
    expect(within(rows[0]).getByLabelText('Move up').disabled).toBe(true);
    expect(within(rows[2]).getByLabelText('Move down').disabled).toBe(true);
  });
});

describe('Hotels + Meals tab', () => {
  const finalQuotation = {
    version: 2, isFinal: true,
    itinerary: [
      { day: 'Day 01', date: '2026-10-01', movement: 'Delhi', bf: '', lunch: 'Restaurant X', dinner: 'At Hotel' },
      { day: 'Day 02', date: '2026-10-02', movement: 'Agra', bf: 'At Hotel', lunch: '', dinner: 'At Hotel' },
      { day: 'Day 03', date: '2026-10-03', movement: 'Depart', bf: 'At Hotel', lunch: '', dinner: '' },
    ],
    hotels: [{ place: 'Delhi', nights: '1', hotel: 'Hotel Delhi' }, { place: 'Agra', nights: '1', hotel: 'Hotel Agra' }],
  };
  const openTab = () => fireEvent.click(screen.getByText('Hotels + Meals'));

  it('offers to sync from the quotation marked final, and pulls hotels + meals (rooming left blank)', async () => {
    h.versions = [{ version: 1, isFinal: false, itinerary: [], hotels: [] }, finalQuotation];
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    openTab();
    expect(await screen.findByText(/Quotation v2 \(final\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('↻ Sync from Quotation'));
    const [id, saved, label] = onUpdate.mock.calls[0];
    expect(id).toBe(query.id);
    expect(label).toMatch(/Quotation v2 \(final\)/);
    expect(saved.syncedFromQuotationVersion).toBe(2);
    expect(saved.hotelRows.map(r => r.hotelName)).toEqual(['Hotel Delhi', 'Hotel Agra', '']);
    expect(saved.hotelRows[0]).toMatchObject({ lunch: 'Restaurant X', dinner: 'At Hotel', rooms: '', date: '2026-10-01' });
    expect(screen.getAllByTestId('hotel-row')).toHaveLength(3);
    expect(screen.getByDisplayValue('Restaurant X')).toBeTruthy();
  });

  it('shows "In sync" once the synced version matches, and offers a re-sync', async () => {
    h.versions = [finalQuotation];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, hotelRows: [], syncedFromQuotationVersion: 2 } })} />);
    openTab();
    expect(await screen.findByText(/In sync with Quotation v2/)).toBeTruthy();
    expect(screen.getByText('↻ Re-sync')).toBeTruthy();
  });

  it('says so plainly when no quotation is marked final and falls back to the latest', async () => {
    h.versions = [{ ...finalQuotation, isFinal: false }];
    render(<QueryDrawerWithQuote {...props()} />);
    openTab();
    expect(await screen.findByText(/latest, none marked final yet/)).toBeTruthy();
  });

  it('re-sync keeps rooming typed earlier and rows added by hand', async () => {
    h.versions = [finalQuotation];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onUpdate = vi.fn();
    const hotelRows = [
      { id: 'qt-0', dayLabel: 'Day 01', date: '2026-10-01', hotelName: 'Hotel Delhi', rooms: '5 Twin, 1 Sgl', source: 'quotation' },
      { id: 'mine', dayLabel: 'Day 01', date: '2026-10-01', hotelName: 'Airport lounge', rooms: '', source: 'manual' },
    ];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, hotelRows, syncedFromQuotationVersion: 1 }, onUpdateTourExecution: onUpdate })} />);
    openTab();
    fireEvent.click(await screen.findByText('↻ Sync from Quotation'));
    expect(window.confirm).toHaveBeenCalled();
    const saved = onUpdate.mock.calls[0][1].hotelRows;
    expect(saved[0].rooms).toBe('5 Twin, 1 Sgl');
    expect(saved.find(r => r.id === 'mine')).toBeTruthy();
    window.confirm.mockRestore();
  });

  it('declining the confirmation changes nothing', async () => {
    h.versions = [finalQuotation];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onUpdate = vi.fn();
    const hotelRows = [{ id: 'qt-0', date: '2026-10-01', hotelName: 'Old', source: 'quotation' }];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, hotelRows }, onUpdateTourExecution: onUpdate })} />);
    openTab();
    fireEvent.click(await screen.findByText('↻ Sync from Quotation'));
    expect(onUpdate).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });

  it('+ Add row adds another row on the same day (a second hotel), which can then be removed', () => {
    const hotelRows = [{ id: 'a', dayLabel: 'Day 1', date: '2026-10-01', hotelName: 'First', source: 'manual' }];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days: threeDays, hotelRows } })} />);
    openTab();
    fireEvent.click(screen.getByText('+ Add row'));
    const rows = screen.getAllByTestId('hotel-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByLabelText('Date').value).toBe('2026-10-01'); // same day as the row above
    fireEvent.click(within(rows[1]).getByLabelText('Remove row'));
    expect(screen.getAllByTestId('hotel-row')).toHaveLength(1);
  });

  it('rows can be reordered with ▼ and by dragging', () => {
    const hotelRows = [
      { id: 'a', date: '2026-10-01', hotelName: 'AAA', source: 'manual' },
      { id: 'b', date: '2026-10-01', hotelName: 'BBB', source: 'manual' },
      { id: 'c', date: '2026-10-01', hotelName: 'CCC', source: 'manual' },
    ];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, hotelRows } })} />);
    openTab();
    const names = () => screen.getAllByTestId('hotel-row').map(r => within(r).getByLabelText('Hotel name').value);
    fireEvent.click(within(screen.getAllByTestId('hotel-row')[0]).getByLabelText('Move down'));
    expect(names()).toEqual(['BBB', 'AAA', 'CCC']);
    const rows = screen.getAllByTestId('hotel-row');
    fireEvent.dragStart(within(rows[2]).getByLabelText('Drag to reorder'));
    fireEvent.drop(rows[0]);
    expect(names()).toEqual(['CCC', 'BBB', 'AAA']);
  });

  it('choosing a day fills its date from the itinerary; all seven columns are editable and save', () => {
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days: threeDays }, onUpdateTourExecution: onUpdate })} />);
    openTab();
    fireEvent.click(screen.getByText('+ Add row'));
    const row = screen.getByTestId('hotel-row');
    fireEvent.change(within(row).getByLabelText('Day'), { target: { value: 'Day 2' } });
    expect(within(row).getByLabelText('Date').value).toBe('2026-10-02');
    fireEvent.change(within(row).getByLabelText('Hotel name'), { target: { value: 'Taj' } });
    fireEvent.change(within(row).getByLabelText('Rooming'), { target: { value: '5 Twin' } });
    fireEvent.change(within(row).getByLabelText('Breakfast'), { target: { value: 'At hotel' } });
    fireEvent.change(within(row).getByLabelText('Lunch'), { target: { value: 'Restaurant Y' } });
    fireEvent.change(within(row).getByLabelText('Dinner'), { target: { value: 'At hotel' } });
    fireEvent.click(screen.getByText('💾 Save Hotels + Meals'));
    expect(onUpdate.mock.calls[0][1].hotelRows[0]).toMatchObject({
      dayLabel: 'Day 2', date: '2026-10-02', hotelName: 'Taj', rooms: '5 Twin', breakfast: 'At hotel', lunch: 'Restaurant Y', dinner: 'At hotel', source: 'manual',
    });
  });

  it('a Tour File that has only the old per-day hotel/rooms still shows them (legacy rows)', () => {
    const days = [{ id: 1, dayLabel: 'Day 1', date: '2026-10-01', route: 'Delhi', hotelName: 'Old Hotel', rooms: '2 Twin', mealPlan: 'B/L-800/D' }];
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, days } })} />);
    openTab();
    expect(screen.getByDisplayValue('Old Hotel')).toBeTruthy();
    expect(screen.getByDisplayValue('2 Twin')).toBeTruthy();
    expect(screen.queryByDisplayValue(/800/)).toBeNull(); // the internal costing string never surfaces
  });
});

describe('Others tab', () => {
  const openOthers = () => fireEvent.click(screen.getByText('Others'));

  it('a new transporter / facilitator / local handler is prefilled with the tour dates and has start + end pickers', () => {
    render(<QueryDrawerWithQuote {...props()} />);
    openOthers();
    fireEvent.click(screen.getByText('+ Add Transporter'));
    expect(screen.getByLabelText('Start date').value).toBe('2026-10-01');
    expect(screen.getByLabelText('End date').value).toBe('2026-10-03'); // 2 nights
  });

  it('moving the start past the end drags the end along, so a window is never inverted', () => {
    render(<QueryDrawerWithQuote {...props()} />);
    openOthers();
    fireEvent.click(screen.getByText('+ Add Facilitator'));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-05' } });
    expect(screen.getByLabelText('End date').value).toBe('2026-10-05');
  });

  it('warns on an entry with no dates, since it will not show on Ground View', () => {
    const te = { ...blankTE, localHandlers: [{ id: 1, vendorId: '', sector: '', notes: '' }] };
    render(<QueryDrawerWithQuote {...props({ tourExecution: te })} />);
    openOthers();
    expect(screen.getByText(/No dates: won't show on Ground View/)).toBeTruthy();
  });

  it('dates are saved with the entry', () => {
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    openOthers();
    fireEvent.click(screen.getByText('+ Add Transporter'));
    fireEvent.click(screen.getByText('💾 Save Others'));
    expect(onUpdate.mock.calls[0][1].transporters[0]).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-03' });
  });

  it('Arrival and Departure use the same fields as a domestic leg, defaulting to the first and last day', () => {
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    openOthers();
    const numbers = screen.getAllByLabelText('Number'); // [arrival, departure]
    fireEvent.change(numbers[0], { target: { value: 'AI 101' } });
    fireEvent.change(numbers[1], { target: { value: 'AI 102' } });
    fireEvent.click(screen.getByText('💾 Save Others'));
    const saved = onUpdate.mock.calls[0][1];
    expect(saved.arrFlight).toMatchObject({ number: 'AI 101', type: 'Flight', date: '2026-10-01' });
    expect(saved.depFlight).toMatchObject({ number: 'AI 102', date: '2026-10-03' });
  });

  it('an old free-text arrival entry stays visible until the structured leg is filled', () => {
    render(<QueryDrawerWithQuote {...props({ tourExecution: { ...blankTE, arrFlightDetails: 'AI-101, 10:00 AM' } })} />);
    openOthers();
    expect(screen.getByText(/Earlier entry: AI-101, 10:00 AM/)).toBeTruthy();
  });

  it('Other Services: add one with dates and a rich-text editor, save it, remove it', () => {
    const onUpdate = vi.fn();
    render(<QueryDrawerWithQuote {...props({ onUpdateTourExecution: onUpdate })} />);
    openOthers();
    fireEvent.click(screen.getByText('+ Add Other Service'));
    const card = screen.getByTestId('other-service');
    expect(within(card).getByLabelText('Start date').value).toBe('2026-10-01');
    expect(card.querySelector('[contenteditable]')).toBeTruthy(); // the rich-text editor
    fireEvent.click(screen.getByText('💾 Save Others'));
    expect(onUpdate.mock.calls[0][1].otherServices).toHaveLength(1);
    fireEvent.click(within(screen.getByTestId('other-service')).getByLabelText('Remove service'));
    expect(screen.queryByTestId('other-service')).toBeNull();
  });
});

describe('Ground View shows Tour Info by date', () => {
  const gv = (te, date = '2026-10-02', vs = [{ id: 'v1', name: 'Rajesh' }, { id: 'v2', name: 'Amit' }]) => {
    render(<GanttView queries={[{ ...query, id: 'q1' }]} onOpenQuery={() => {}} staff={[]} vendors={vs} tourExecutions={{ q1: te }} />);
    fireEvent.click(screen.getByText(/Ground View/));
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: date } });
  };

  it("shows that date's hotel, rooming, meals, route and notes", () => {
    gv({ days: threeDays.map(d => d.id === 2 ? { ...d, notes: 'Early start' } : d), hotelRows: [
      { id: 'a', date: '2026-10-02', hotelName: 'Hotel Agra', rooms: '5 Twin', breakfast: 'At hotel', lunch: 'Restaurant Y', dinner: '' },
      { id: 'b', date: '2026-10-03', hotelName: 'Tomorrow Hotel' },
    ] });
    expect(screen.getByText('Agra')).toBeTruthy();
    expect(screen.getByText('Early start')).toBeTruthy();
    expect(screen.getByText(/Hotel Agra \(5 Twin\)/)).toBeTruthy();
    expect(screen.getByText('Breakfast: At hotel · Lunch: Restaurant Y')).toBeTruthy();
    expect(screen.queryByText(/Tomorrow Hotel/)).toBeNull();
  });

  it('a day with two hotels lists both', () => {
    gv({ days: threeDays, hotelRows: [
      { id: 'a', date: '2026-10-02', hotelName: 'Morning Hotel' }, { id: 'b', date: '2026-10-02', hotelName: 'Night Hotel' },
    ] });
    expect(screen.getAllByTestId('ground-hotel')).toHaveLength(2);
  });

  it('shows services only inside their dates, plus legs and other services; an undated service is hidden', () => {
    gv({
      days: threeDays,
      localHandlers: [{ id: 1, vendorId: 'v1', sector: 'Agra', notes: 'Meet at hotel', startDate: '2026-10-02', endDate: '2026-10-02' }],
      transporters: [{ id: 2, vendorId: 'v2' }], // no dates -> hidden
      flights: [{ id: 3, date: '2026-10-02', type: 'Train', number: '12002', from: 'NDLS', to: 'AGC' }],
      otherServices: [{ id: 4, startDate: '2026-10-02', endDate: '2026-10-02', detailsHtml: '<p><b>Cooking class</b></p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">' }],
    });
    expect(screen.getByText(/Rajesh \(Agra\) – Meet at hotel/)).toBeTruthy();
    expect(screen.queryByText(/Amit/)).toBeNull();
    expect(screen.getByText(/Train 12002 · NDLS → AGC/)).toBeTruthy();
    const other = screen.getByTestId('ground-other-service');
    expect(other.textContent).toContain('Cooking class');
    expect(other.innerHTML).not.toMatch(/script|onerror/i);
  });

  it('arrival and departure legs appear on their own dates only', () => {
    const te = { days: threeDays, arrFlight: { date: '2026-10-01', number: 'AI 101', from: 'BOM', to: 'DEL' }, depFlight: { date: '2026-10-03', number: 'AI 102' } };
    gv(te, '2026-10-01');
    expect(screen.getByText(/Flight AI 101 · BOM → DEL/)).toBeTruthy();
    expect(screen.queryByText(/AI 102/)).toBeNull();
  });
});
