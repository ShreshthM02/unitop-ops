import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as Lib from '../lib/index.js';
import FleetMaster from '../components/FleetMaster.jsx';

const { db, filterExpensesByRange, totalExpenses, formatINR, mapDbFleetVehicle, fleetVehicleToDb, fleetExpenseRowToDb, mapDbFleetExpenseRow, fleetServiceRowToDb,
  validateServiceRow, validateExpenseRow, vehicleFolderName, sortByDateDesc } = Lib;

describe('fleet lib: expense ledger maths', () => {
  const rows = [
    { id: 1, date: '2026-09-01', amount: 1000 }, { id: 2, date: '2026-09-15', amount: '2500.50' },
    { id: 3, date: '2026-10-01', amount: 500 }, { id: 4, date: '', amount: 99 },
  ];
  it('no filter keeps everything (including undated rows)', () => { expect(filterExpensesByRange(rows, '', '').length).toBe(4); });
  it('from/to are inclusive and drop undated rows once a filter is set', () => {
    expect(filterExpensesByRange(rows, '2026-09-15', '2026-10-01').map(r => r.id)).toEqual([2, 3]);
    expect(filterExpensesByRange(rows, '2026-09-16', '').map(r => r.id)).toEqual([3]);
    expect(filterExpensesByRange(rows, '', '2026-09-01').map(r => r.id)).toEqual([1]);
  });
  it('totals numbers and numeric strings, without float drift', () => {
    expect(totalExpenses(rows)).toBe(4099.5);
    expect(totalExpenses([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
    expect(totalExpenses([])).toBe(0);
    expect(totalExpenses([{ amount: 'abc' }])).toBe(0);
  });
  it('formats INR in Indian grouping', () => { expect(formatINR(1234567.5)).toBe('₹12,34,567.5'); });
  it('sorts newest first', () => { expect(sortByDateDesc(rows, 'date').map(r => r.id)).toEqual([3, 2, 1, 4]); });
});

describe('fleet lib: mapping and validation', () => {
  it('vehicle round-trips, blanks become null, capacity is an integer', () => {
    const v = mapDbFleetVehicle({ id: 'a', name: 'Tempo', owner: 'Unitop', reg_no: 'DL1', reg_date: '2020-01-02', model: 'T', colour: 'White', capacity: 12, drive_folder_id: 'f1' });
    expect(v).toMatchObject({ regNo: 'DL1', regDate: '2020-01-02', capacity: 12, driveFolderId: 'f1' });
    const d = fleetVehicleToDb({ ...v, owner: '', capacity: '14' });
    expect(d.owner).toBeNull(); expect(d.capacity).toBe(14);
    expect(d).not.toHaveProperty('drive_folder_id'); // never overwritten from the app side
    expect(fleetVehicleToDb({ id: 'x', name: ' T ', capacity: '' }).capacity).toBeNull();
    expect(fleetVehicleToDb({ id: 'x', name: ' T ' }).name).toBe('T');
  });
  it('expense row maps amount to a number', () => {
    expect(fleetExpenseRowToDb({ id: 'e', vehicleId: 'v', date: '2026-10-01', particulars: 'Diesel', amount: '1500.5', notes: '' })).toMatchObject({ vehicle_id: 'v', expense_date: '2026-10-01', amount: 1500.5, notes: null });
    expect(mapDbFleetExpenseRow({ id: 'e', vehicle_id: 'v', expense_date: '2026-10-01', particulars: 'D', amount: '99.50' }).amount).toBe(99.5);
  });
  it('service row maps both ways', () => {
    expect(fleetServiceRowToDb({ id: 's', vehicleId: 'v', tourFileNo: 'TF-1', startDate: '2026-10-01', endDate: '', sector: 'Agra', notes: '' })).toMatchObject({ tour_file_no: 'TF-1', end_date: null, sector: 'Agra' });
  });
  it('validation', () => {
    expect(validateServiceRow({})).toMatch(/at least/);
    expect(validateServiceRow({ tourFileNo: 'TF-1' })).toBe('');
    expect(validateServiceRow({ tourFileNo: 'TF-1', startDate: '2026-10-05', endDate: '2026-10-01' })).toMatch(/before/);
    expect(validateExpenseRow({ particulars: 'x', amount: 1 })).toMatch(/date/i);
    expect(validateExpenseRow({ date: '2026-10-01', amount: 1 })).toMatch(/particulars/i);
    expect(validateExpenseRow({ date: '2026-10-01', particulars: 'x' })).toMatch(/amount/i);
    expect(validateExpenseRow({ date: '2026-10-01', particulars: 'x', amount: '0' })).toBe('');
  });
  it('Drive folder is named after the vehicle', () => {
    expect(vehicleFolderName({ name: '  Innova 01 ' })).toBe('Innova 01');
    expect(vehicleFolderName({})).toBe('Untitled vehicle');
  });
});

// ── Component ──────────────────────────────────────────────────────────────
// A tiny in-memory PostgREST stand-in for the four fleet tables.
function fakeDb(seed) {
  const store = JSON.parse(JSON.stringify(seed));
  const from = vi.fn((table) => {
    const filters = [];
    const b = {
      select: () => b, order: () => b,
      eq: (c, v) => { filters.push([c, v]); return b; },
      upsert: async (row) => {
        const list = store[table] || (store[table] = []);
        const rows = Array.isArray(row) ? row : [row];
        rows.forEach(r => { const i = list.findIndex(x => x.id === r.id); if (i >= 0) list[i] = { ...list[i], ...r }; else list.push(r); });
        return { data: rows, error: null };
      },
      delete: async () => { store[table] = (store[table] || []).filter(r => !filters.every(([c, v]) => r[c] === v)); return { data: null, error: null }; },
      then: (resolve) => resolve({ data: (store[table] || []).filter(r => filters.every(([c, v]) => r[c] === v)), error: null }),
    };
    return b;
  });
  return { store, from };
}

const seed = () => ({
  fleet_vehicles: [{ id: 'v1', name: 'Innova 01', owner: 'Unitop', reg_no: 'DL 1Z 1234', reg_date: '2021-03-04', model: 'Crysta', colour: 'White', capacity: 7 }],
  fleet_service_history: [{ id: 's1', vehicle_id: 'v1', tour_file_no: 'TF-2026-010', start_date: '2026-09-01', end_date: '2026-09-05', sector: 'Golden Triangle', notes: 'ok' }],
  fleet_expenses: [
    { id: 'e1', vehicle_id: 'v1', expense_date: '2026-09-02', particulars: 'Diesel', amount: 3000, notes: '' },
    { id: 'e2', vehicle_id: 'v1', expense_date: '2026-10-02', particulars: 'Service', amount: 4500.5, notes: 'oil' },
  ],
  fleet_documents: [{ id: 'd1', vehicle_id: 'v1', file_name: 'RC.pdf', file_type: 'application/pdf', file_size: 2048, drive_view_link: 'https://drive/x', uploaded_by_name: 'Test', created_at: '2026-10-01T00:00:00Z' }],
});
const admin = { id: 1, name: 'Test', role: 'admin' };
let original, fake;
beforeEach(() => { original = { from: db.from, drive: db.drive }; fake = fakeDb(seed()); db.from = fake.from; window.confirm = vi.fn(() => true); });
afterEach(() => { db.from = original.from; db.drive = original.drive; });

const open = async () => {
  render(<FleetMaster asTab currentUser={admin} />);
  await waitFor(() => expect(screen.getByText('Innova 01')).toBeTruthy());
};
const pick = async (tab) => { fireEvent.click(screen.getByText('Innova 01')); if (tab) fireEvent.click(await screen.findByText(tab)); };

describe('FleetMaster', () => {
  it('lists vehicles and shows the profile fields', async () => {
    await open(); await pick();
    expect(screen.getByText('DL 1Z 1234')).toBeTruthy();
    expect(screen.getByText('Crysta · White')).toBeTruthy();
    for (const t of ['Profile', 'Service History', 'Expense Ledger', 'Documents']) expect(screen.getByText(t)).toBeTruthy();
  });

  it('adds a vehicle with all profile fields', async () => {
    await open();
    fireEvent.click(screen.getByText('+ Add Vehicle'));
    const set = (l, v) => fireEvent.change(screen.getByLabelText(new RegExp(`^${l}`)), { target: { value: v } });
    set('Vehicle Name', 'Tempo 02'); set('Vehicle Owner', 'Mr Sharma'); set('Registration Number', 'HR 55 0001');
    set('Registration Date', '2022-05-06'); set('Model', 'Traveller'); set('Colour', 'Silver'); set('Passenger Capacity', '14');
    fireEvent.click(screen.getByText('Save Vehicle'));
    await waitFor(() => expect(fake.store.fleet_vehicles.length).toBe(2));
    expect(fake.store.fleet_vehicles[1]).toMatchObject({ name: 'Tempo 02', owner: 'Mr Sharma', reg_no: 'HR 55 0001', reg_date: '2022-05-06', model: 'Traveller', colour: 'Silver', capacity: 14 });
  });

  it('requires a vehicle name', async () => {
    await open();
    fireEvent.click(screen.getByText('+ Add Vehicle'));
    fireEvent.click(screen.getByText('Save Vehicle'));
    expect(screen.getByRole('alert').textContent).toMatch(/name is required/i);
    expect(fake.store.fleet_vehicles.length).toBe(1);
  });

  it('renaming a vehicle renames its Drive folder', async () => {
    db.drive = { renameFleetFolder: vi.fn(async () => ({ success: true })) };
    await open(); await pick();
    fireEvent.click(screen.getByText('✏ Edit'));
    fireEvent.change(screen.getByLabelText(/^Vehicle Name/), { target: { value: 'Innova 01 (new)' } });
    fireEvent.click(screen.getByText('Save Vehicle'));
    await waitFor(() => expect(db.drive.renameFleetFolder).toHaveBeenCalledWith('v1', 'Innova 01 (new)'));
  });

  it('service history: lists, adds (manual), validates dates, deletes', async () => {
    await open(); await pick('Service History');
    expect(await screen.findByText('TF-2026-010')).toBeTruthy();
    fireEvent.click(screen.getByText('+ Add Service Entry'));
    const f = () => within(screen.getByTestId('fleet-row-form'));
    fireEvent.change(f().getByLabelText('Tour File No.'), { target: { value: 'TF-2026-020' } });
    fireEvent.change(f().getByLabelText('Start Date'), { target: { value: '2026-10-10' } });
    fireEvent.change(f().getByLabelText('End Date'), { target: { value: '2026-10-05' } });
    fireEvent.click(f().getByText('💾 Save'));
    expect(screen.getByRole('alert').textContent).toMatch(/before the start/);
    fireEvent.change(f().getByLabelText('End Date'), { target: { value: '2026-10-12' } });
    fireEvent.change(f().getByLabelText('Sector'), { target: { value: 'Rajasthan' } });
    fireEvent.change(f().getByLabelText('Notes'), { target: { value: 'AC bus' } });
    fireEvent.click(f().getByText('💾 Save'));
    await waitFor(() => expect(fake.store.fleet_service_history.length).toBe(2));
    expect(fake.store.fleet_service_history[1]).toMatchObject({ vehicle_id: 'v1', tour_file_no: 'TF-2026-020', sector: 'Rajasthan', notes: 'AC bus' });
    // newest start date first
    expect(screen.getAllByTestId('fleet-row')[0].textContent).toMatch(/TF-2026-020/);
    fireEvent.click(screen.getAllByLabelText('Delete service entry')[0]);
    await waitFor(() => expect(fake.store.fleet_service_history.length).toBe(1));
  });

  it('expense ledger: total, date-range filter, add and edit', async () => {
    await open(); await pick('Expense Ledger');
    await waitFor(() => expect(screen.getByTestId('fleet-expense-total').textContent).toBe('₹7,500.5'));
    fireEvent.change(screen.getByLabelText('Filter from date'), { target: { value: '2026-10-01' } });
    expect(screen.getByTestId('fleet-expense-total').textContent).toBe('₹4,500.5');
    expect(screen.getByText(/Total for selected dates/)).toBeTruthy();
    expect(screen.getByText(/All time: ₹7,500.5/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter to date'), { target: { value: '2026-10-01' } });
    expect(screen.getByTestId('fleet-expense-total').textContent).toBe('₹0');
    expect(screen.getByText('No expenses in this date range.')).toBeTruthy();
    fireEvent.click(screen.getByText('Clear'));

    fireEvent.click(screen.getByText('+ Add Expense'));
    const f = () => within(screen.getByTestId('fleet-row-form'));
    fireEvent.click(f().getByText('💾 Save'));
    expect(screen.getByRole('alert').textContent).toMatch(/date/i);
    fireEvent.change(f().getByLabelText('Date'), { target: { value: '2026-10-03' } });
    fireEvent.change(f().getByLabelText('Particulars'), { target: { value: 'Toll' } });
    fireEvent.change(f().getByLabelText('Amount (INR)'), { target: { value: '250' } });
    fireEvent.click(f().getByText('💾 Save'));
    await waitFor(() => expect(fake.store.fleet_expenses.length).toBe(3));
    expect(screen.getByTestId('fleet-expense-total').textContent).toBe('₹7,750.5');

    fireEvent.click(screen.getAllByLabelText('Edit expense')[0]); // newest = Toll
    fireEvent.change(within(screen.getByTestId('fleet-row-form')).getByLabelText('Amount (INR)'), { target: { value: '300' } });
    fireEvent.click(within(screen.getByTestId('fleet-row-form')).getByText('💾 Save'));
    await waitFor(() => expect(screen.getByTestId('fleet-expense-total').textContent).toBe('₹7,800.5'));
    expect(fake.store.fleet_expenses.length).toBe(3); // edited in place, not duplicated
  });

  it('documents: lists, uploads into the vehicle folder, deletes', async () => {
    db.drive = {
      uploadFleet: vi.fn(async () => ({ success: true, document: { id: 'd2', vehicle_id: 'v1', file_name: 'Insurance.pdf', file_type: 'application/pdf', file_size: 10, drive_view_link: 'https://drive/y' } })),
      delete: vi.fn(async () => ({ success: true })),
    };
    await open(); await pick('Documents');
    expect(await screen.findByText('RC.pdf')).toBeTruthy();
    expect(screen.getByText('Innova 01', { selector: 'b' })).toBeTruthy(); // folder name shown
    const file = new File(['%PDF'], 'Insurance.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('fleet-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(db.drive.uploadFleet).toHaveBeenCalled());
    expect(db.drive.uploadFleet.mock.calls[0].slice(0, 3)).toEqual(['v1', 'Innova 01', 'Insurance.pdf']);
    expect(await screen.findByText('Insurance.pdf')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => expect(db.drive.delete).toHaveBeenCalledWith('d2', 'fleet'));
    await waitFor(() => expect(screen.queryByText('Insurance.pdf')).toBeNull());
  });

  it('shows the upload error instead of failing silently', async () => {
    db.drive = { uploadFleet: vi.fn(async () => ({ success: false, error: 'Google Drive is not configured yet' })) };
    await open(); await pick('Documents');
    await screen.findByText('RC.pdf');
    fireEvent.change(screen.getByTestId('fleet-file-input'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/not configured/);
  });

  it('view-only users see no add/edit/upload controls', async () => {
    render(<FleetMaster asTab currentUser={{ id: 2, name: 'Viewer', role: 'ops', permissions: { vendors_edit: false } }} />);
    await waitFor(() => expect(screen.getByText('Innova 01')).toBeTruthy());
    expect(screen.queryByText('+ Add Vehicle')).toBeNull();
  });
});
