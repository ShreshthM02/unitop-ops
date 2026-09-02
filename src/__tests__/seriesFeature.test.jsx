import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mapDbSeriesRow, loadSeries, saveSeries, mapDbQueryRow, buildQuerySavePayload } from '../lib/utils.js';
import SeriesManagement from '../components/SeriesManagement.jsx';
import NewQueryModal from '../components/NewQueryModal.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

describe('mapDbSeriesRow / loadSeries', () => {
  it('maps every real series column to its app-object field', () => {
    const row = { id: 's1', name: 'Golden Triangle Winter', active: true, notes: 'n', created_by: 'staff-1', created_at: '2026-01-01', updated_at: '2026-01-02' };
    expect(mapDbSeriesRow(row)).toEqual({
      id: 's1', name: 'Golden Triangle Winter', active: true, notes: 'n',
      createdBy: 'staff-1', createdAt: '2026-01-01', updatedAt: '2026-01-02',
    });
  });

  it('loads and maps every series row, ordered by name', async () => {
    const db = { from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 's1', name: 'A', active: true }], error: null }) }) }) };
    const result = await loadSeries(db);
    expect(result).toEqual([{ id: 's1', name: 'A', active: true, notes: '', createdBy: undefined, createdAt: undefined, updatedAt: undefined }]);
  });

  it('returns an empty array, not a throw, when the load fails', async () => {
    const db = { from: () => { throw new Error('down'); } };
    expect(await loadSeries(db)).toEqual([]);
  });
});

describe('saveSeries', () => {
  it('upserts an existing series (has an id), keeping the same id', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    const result = await saveSeries(db, { id: 'existing-id', name: 'Renamed', active: false, notes: 'x' });
    expect(upsert.mock.calls[0][0]).toMatchObject({ id: 'existing-id', name: 'Renamed', active: false, notes: 'x' });
    expect(result.id).toBe('existing-id');
  });

  it('inserts a new series (no id) and returns the real DB-generated id', async () => {
    const insert = vi.fn(async () => ({ data: [{ id: 'new-id' }], error: null }));
    const db = { from: () => ({ insert }) };
    const result = await saveSeries(db, { name: 'New Series' });
    expect(insert.mock.calls[0][0]).toMatchObject({ name: 'New Series', active: true });
    expect(insert.mock.calls[0][0].id).toBeUndefined();
    expect(result.id).toBe('new-id');
  });
});

describe('queries.series_id round-trip', () => {
  it('mapDbQueryRow maps series_id to seriesId', () => {
    expect(mapDbQueryRow({ id: 'UTQ-1', series_id: 's1' }).seriesId).toBe('s1');
  });
  it('buildQuerySavePayload only sends series_id when it is a real uuid', () => {
    expect(buildQuerySavePayload({ id: 'UTQ-1', seriesId: 'a1b2c3d4-0000-0000-0000-000000000000' }).series_id).toBe('a1b2c3d4-0000-0000-0000-000000000000');
    expect(buildQuerySavePayload({ id: 'UTQ-1', seriesId: '' }).series_id).toBe(null);
    expect(buildQuerySavePayload({ id: 'UTQ-1' }).series_id).toBe(null);
  });
});

describe('SeriesManagement', () => {
  const series = [
    { id: 's1', name: 'Golden Triangle Winter', active: true, notes: '' },
    { id: 's2', name: 'Old Defunct Series', active: false, notes: '' },
  ];
  const queries = [
    { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Group A', seriesId: 's1', destination: 'Delhi' },
    { id: 'UTQ-2', groupName: 'Group B', seriesId: null },
  ];

  it('lists series with query counts, inactive ones visibly marked', async () => {
    render(<SeriesManagement series={series} setSeries={()=>{}} queries={queries} currentUser={{id:1}} onClose={()=>{}}/>);
    expect(screen.getByText('Golden Triangle Winter')).toBeTruthy();
    expect(screen.getByText('1 query')).toBeTruthy();
    expect(screen.getByText('INACTIVE')).toBeTruthy();
  });

  it('selecting a series shows its assigned queries, clickable into the drawer', async () => {
    const listener = vi.fn();
    document.addEventListener('unitop-activate-query', listener);
    render(<SeriesManagement series={series} setSeries={()=>{}} queries={queries} currentUser={{id:1}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Golden Triangle Winter'));
    expect(screen.getByText('TF-1')).toBeTruthy();
    fireEvent.click(screen.getByText('TF-1'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.query.id).toBe('UTQ-1');
    document.removeEventListener('unitop-activate-query', listener);
  });

  it('creating a new series calls saveSeries and adds it to the list', async () => {
    const mockDb = { from: () => ({ insert: async () => ({ data: [{ id: 'new-s' }], error: null }) }) };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { default: FreshSeriesManagement } = await import('../components/SeriesManagement.jsx');
    const setSeries = vi.fn();
    render(<FreshSeriesManagement series={[]} setSeries={setSeries} queries={[]} currentUser={{id:1}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Series'));
    fireEvent.change(screen.getByPlaceholderText(/Golden Triangle/), { target: { value: 'Test Series' } });
    fireEvent.click(screen.getByText('Save Series'));
    await waitFor(() => expect(setSeries).toHaveBeenCalled());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('NewQueryModal: Series + reference tour file pre-fill', () => {
  const activeSeries = [{ id: 's1', name: 'Golden Triangle Winter', active: true }];
  const inactiveSeries = [{ id: 's2', name: 'Old Series', active: false }];
  const referenceQuery = {
    id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Old Group', seriesId: 's1',
    sector: 'Golden Triangle', nights: 7, hotelCat: '5 Star', nationality: 'German',
    source: 'Agency', agentId: 'a1', agentCompany: 'ABC Travels', agentCountry: 'Germany', correspondent: 'Hans',
  };

  it('only shows active series in the picker', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2" agents={[]} staff={[]} series={[...activeSeries,...inactiveSeries]} queries={[]}/>);
    expect(screen.getByText('Golden Triangle Winter')).toBeTruthy();
    expect(screen.queryByText('Old Series')).toBeFalsy();
  });

  it('does not show the series section at all when there are no active series', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2" agents={[]} staff={[]} series={inactiveSeries} queries={[]}/>);
    expect(screen.queryByText(/Series \(optional\)/)).toBeFalsy();
  });

  it('reference search works independently of series -- no series needs to be selected at all', () => {
    const noSeriesQuery = { id: 'UTQ-3', tourFileId: 'TF-3', groupName: 'Unrelated Group' }; // no seriesId at all
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2" agents={[]} staff={[]} series={[]} queries={[noSeriesQuery]}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search by Tour File No/), { target: { value: 'TF-3' } });
    expect(screen.getByText(/TF-3/)).toBeTruthy();
  });

  it('reference search matches by Tour File No. or group name, across every tour file, whether or not it is in a series', () => {
    const otherSeriesQuery = { id: 'UTQ-3', tourFileId: 'TF-3', groupName: 'Some Other Group', seriesId: 's-other' };
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2" agents={[]} staff={[]} series={activeSeries} queries={[referenceQuery, otherSeriesQuery]}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search by Tour File No/), { target: { value: 'TF' } });
    expect(screen.getByText(/TF-1/)).toBeTruthy();
    expect(screen.getByText(/TF-3/)).toBeTruthy(); // matches even though it's a DIFFERENT series entirely
  });

  it('applying a reference pre-fills sector/hotel/nationality/source/agent, leaving group name and pax untouched', () => {
    render(<NewQueryModal onClose={()=>{}} onSave={()=>{}} nextId="UTQ-2" agents={[]} staff={[]} series={activeSeries} queries={[referenceQuery]}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search by Tour File No/), { target: { value: 'TF-1' } });
    fireEvent.click(screen.getByText(/TF-1/));
    expect(screen.getByDisplayValue('Golden Triangle')).toBeTruthy(); // sector
    expect(screen.getByDisplayValue('ABC Travels')).toBeTruthy(); // agent company
    // Group name field must still be empty -- never pre-filled from a reference
    expect(screen.getByPlaceholderText('e.g. COL Group, Smith Family').value).toBe('');
    // The reference is now shown as applied, with a way to clear it
    expect(screen.getByText('✕ Clear')).toBeTruthy();
  });
});

describe('QueryDrawerWithQuote: Series assignment in Tour Details', () => {
  const tourFileQuery = {
    id: 'UTQ-2026-050', tourFileId: 'TF-2026-050', groupName: 'Test Group', status: 'operations',
    manualWF: [], audit: [], remarks: [], nights: 5, pax: 10, seriesId: 's1',
  };
  const blankTE = { queryId: 'UTQ-2026-050', days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
  const seriesList = [
    { id: 's1', name: 'Golden Triangle Winter', active: true },
    { id: 's2', name: 'Other Active Series', active: true },
    { id: 's3', name: 'An Old Inactive Series', active: false },
  ];
  const baseProps = {
    query: tourFileQuery, onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{},
    onToggleWF: ()=>{}, onCancel: ()=>{}, onUpdateRemarks: ()=>{}, currentUser: { id:1, name:'Test' },
    tourExecution: blankTE, vendors: [], onUpdateTourExecution: ()=>{},
  };

  it('shows the currently assigned series selected, and every active series as an option', () => {
    render(<QueryDrawerWithQuote {...baseProps} series={seriesList} onUpdateQuery={()=>{}}/>);
    expect(screen.getByDisplayValue('Golden Triangle Winter')).toBeTruthy();
    expect(screen.getByText('Other Active Series')).toBeTruthy();
    expect(screen.queryByText('An Old Inactive Series')).toBeFalsy(); // not active and not the current assignment
  });

  it('still shows an inactive series as an option if the query is currently assigned to it (so the current value is never silently hidden)', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={{...tourFileQuery, seriesId: 's3'}} series={seriesList} onUpdateQuery={()=>{}}/>);
    expect(screen.getByText(/An Old Inactive Series/)).toBeTruthy();
  });

  it('changing the selection calls onUpdateQuery with the new seriesId', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} series={seriesList} onUpdateQuery={onUpdateQuery}/>);
    fireEvent.change(screen.getByDisplayValue('Golden Triangle Winter'), { target: { value: 's2' } });
    expect(onUpdateQuery).toHaveBeenCalledWith('UTQ-2026-050', { seriesId: 's2' });
  });

  it('picking "Not part of a series" calls onUpdateQuery with null', () => {
    const onUpdateQuery = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} series={seriesList} onUpdateQuery={onUpdateQuery}/>);
    fireEvent.change(screen.getByDisplayValue('Golden Triangle Winter'), { target: { value: '' } });
    expect(onUpdateQuery).toHaveBeenCalledWith('UTQ-2026-050', { seriesId: null });
  });
});
