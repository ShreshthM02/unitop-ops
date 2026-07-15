import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VendorMaster from '../components/VendorMaster.jsx';
import { saveVendorToDB } from '../lib/utils.js';

const vendors = [
  { id: 'VND-001', name: 'Saura Hotel', type: 'Hotel', city: 'Agra', contactName: 'Manager', contactPhone: '111', contactEmail: '', gstin: '', notes: '', active: true },
  { id: 'VND-003', name: 'Prithvi', type: 'Tour Facilitator', contactPhone: '+91-9800000001', languages: 'English, Hindi', areas: 'Bodhgaya, Rajgir', active: true },
  { id: 'VND-005', name: 'Retired Guide', type: 'Tour Facilitator', contactPhone: '', languages: '', areas: '', active: false },
];

describe('VendorMaster: Tour Facilitator support', () => {
  it('lists active vendors by default, hiding inactive ones', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onClose={()=>{}}/>);
    expect(screen.getByText('Prithvi')).toBeTruthy();
    expect(screen.queryByText(/Retired Guide/)).toBeNull();
  });

  it('shows inactive vendors when "Show inactive" is checked', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Show inactive'));
    expect(screen.getByText(/Retired Guide/)).toBeTruthy();
  });

  it('filtering by "Tour Facilitator" type shows only facilitators, not other vendor types', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onClose={()=>{}}/>);
    const filterButtons = screen.getAllByText('Tour Facilitator');
    fireEvent.click(filterButtons[0].closest('button'));
    expect(screen.getByText('Prithvi')).toBeTruthy();
    expect(screen.queryByText('Saura Hotel')).toBeNull();
  });

  it('editing a Tour Facilitator vendor shows Languages/Areas fields; editing a Hotel does not', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Prithvi'));
    fireEvent.click(screen.getByText('✏ Edit'));
    expect(screen.getByText('Languages')).toBeTruthy();
    expect(screen.getByText('Areas / Cities Covered')).toBeTruthy();
  });

  it('editing a Hotel vendor does not show Languages/Areas fields', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Saura Hotel'));
    fireEvent.click(screen.getByText('✏ Edit'));
    expect(screen.queryByText('Languages')).toBeNull();
  });

  it('editing an existing vendor calls onSaveVendor with the updated record', () => {
    const onSaveVendor = vi.fn();
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onSaveVendor={onSaveVendor} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Prithvi'));
    fireEvent.click(screen.getByText('✏ Edit'));
    fireEvent.change(screen.getByDisplayValue('+91-9800000001'), { target: { value: '+91-9999999999' } });
    fireEvent.click(screen.getByText('Save Vendor'));
    expect(onSaveVendor).toHaveBeenCalledTimes(1);
    expect(onSaveVendor.mock.calls[0][0].contactPhone).toBe('+91-9999999999');
  });

  it('creating a new vendor calls onSaveVendor with the new record', () => {
    const onSaveVendor = vi.fn();
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} onSaveVendor={onSaveVendor} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Vendor'));
    const nameLabel = screen.getByText('Vendor Name');
    fireEvent.change(nameLabel.parentElement.querySelector('input'), { target: { value: 'New Vendor Co' } });
    fireEvent.click(screen.getByText('Save Vendor'));
    expect(onSaveVendor).toHaveBeenCalledTimes(1);
    expect(onSaveVendor.mock.calls[0][0].name).toBe('New Vendor Co');
  });
});

describe('saveVendorToDB', () => {
  it('upserts with correct snake_case field mapping, including the new languages/areas fields', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveVendorToDB(db, {
      id: 'VND-003', name: 'Prithvi', type: 'Tour Facilitator', city: '',
      contactName: '', contactPhone: '+91-1234567890', contactEmail: '', gstin: '', notes: '',
      languages: 'English, Hindi', areas: 'Bodhgaya', active: true,
    });
    expect(upsert).toHaveBeenCalledWith({
      id: 'VND-003', name: 'Prithvi', type: 'Tour Facilitator', city: '',
      contact_name: '', contact_phone: '+91-1234567890', contact_email: '', gstin: '', notes: '',
      languages: 'English, Hindi', areas: 'Bodhgaya', active: true,
    });
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveVendorToDB(db, { id: 'VND-999', name: 'X' })).resolves.toBeUndefined();
  });
});

describe('saveVendorToDB: languages/areas columns (the actual bug found in the live-schema audit)', () => {
  it('includes languages and areas in the save payload -- these columns were missing from the live table entirely, silently failing every vendor save until fixed directly in Supabase', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveVendorToDB(db, { id: 'VND-010', name: 'New Facilitator', type: 'Tour Facilitator', languages: 'English, Thai', areas: 'Bangkok' });
    const row = upsert.mock.calls[0][0];
    expect(row.languages).toBe('English, Thai');
    expect(row.areas).toBe('Bangkok');
  });
});

describe('VendorMaster: Service History now shows real tour assignments (the actual reported bug)', () => {
  const assignedVendor = { id: 'v1', name: 'Prithvi', type: 'Tour Facilitator', contactPhone: '', languages: 'English', areas: 'Kerala', active: true };
  const assignedQueries = [
    { id: 'UTQ-1', tourFileId: 'TF-1', groupName: 'Kerala Group', destination: 'Kerala', travelDate: '2026-08-01', status: 'operations', cancelled: false },
  ];
  const tourExecutions = { 'UTQ-1': { facilitators: [{ vendorId: 'v1', sector: 'North Kerala', notes: 'Confirmed for the trip' }] } };

  it('clicking a vendor and opening Service History shows the tour they are actually assigned to', () => {
    render(<VendorMaster vendors={[assignedVendor]} setVendors={()=>{}} queries={assignedQueries} payments={{}} tourExecutions={tourExecutions} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Prithvi'));
    fireEvent.click(screen.getByText('Service History'));
    expect(screen.getAllByText('Tour Facilitator').length).toBeGreaterThan(0);
    expect(screen.getByText(/TF-1/)).toBeTruthy();
    expect(screen.getByText(/Kerala Group/)).toBeTruthy();
    expect(screen.getByText('Confirmed for the trip')).toBeTruthy();
  });

  it('shows a clear empty state, not a blank screen, when nothing is assigned yet', () => {
    const unassignedVendor = { id: 'v2', name: 'Unassigned Person', type: 'Tour Facilitator', active: true };
    render(<VendorMaster vendors={[unassignedVendor]} setVendors={()=>{}} queries={[]} payments={{}} tourExecutions={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Unassigned Person'));
    fireEvent.click(screen.getByText('Service History'));
    expect(screen.getByText(/No tours assigned yet/)).toBeTruthy();
  });

  it('renders without crashing when payments/tourExecutions are not passed at all (defensive)', () => {
    expect(() => render(<VendorMaster vendors={[assignedVendor]} setVendors={()=>{}} queries={assignedQueries} onClose={()=>{}}/>)).not.toThrow();
  });
});
