import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FacilitatorMaster from '../components/FacilitatorMaster.jsx';
import { saveFacilitatorToDB } from '../lib/utils.js';

const seedFacilitators = [
  { id: 'FAC-001', name: 'Prithvi', phone: '+91-9800000001', email: '', languages: 'English, Hindi', areas: 'Bodhgaya, Rajgir', notes: '', active: true },
  { id: 'FAC-002', name: 'Ashutosh', phone: '+91-9800000002', email: '', languages: 'English, Thai', areas: 'Bodhgaya', notes: '', active: false },
];

describe('FacilitatorMaster', () => {
  it('lists active facilitators by default, hiding inactive ones', () => {
    render(<FacilitatorMaster facilitators={seedFacilitators} setFacilitators={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText('Prithvi')).toBeTruthy();
    expect(screen.queryByText('Ashutosh')).toBeNull();
  });

  it('shows inactive facilitators when "Show inactive" is checked', () => {
    render(<FacilitatorMaster facilitators={seedFacilitators} setFacilitators={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Show inactive'));
    expect(screen.getByText(/Ashutosh/)).toBeTruthy();
  });

  it('creating a new facilitator calls onSaveFacilitator with the new record', () => {
    const onSaveFacilitator = vi.fn();
    render(<FacilitatorMaster facilitators={seedFacilitators} setFacilitators={()=>{}} onSaveFacilitator={onSaveFacilitator} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Facilitator'));
    // "Name" is the first field in the form (gridColumn 1/-1, right under the "New Facilitator" heading)
    const nameLabel = screen.getByText('Name');
    const nameInput = nameLabel.parentElement.querySelector('input');
    fireEvent.change(nameInput, { target: { value: 'New Guide' } });
    fireEvent.click(screen.getByText('Save Facilitator'));
    expect(onSaveFacilitator).toHaveBeenCalledTimes(1);
    expect(onSaveFacilitator.mock.calls[0][0].name).toBe('New Guide');
  });

  it('editing an existing facilitator calls onSaveFacilitator with the updated record, preserving its id', () => {
    const onSaveFacilitator = vi.fn();
    render(<FacilitatorMaster facilitators={seedFacilitators} setFacilitators={()=>{}} onSaveFacilitator={onSaveFacilitator} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Prithvi'));
    fireEvent.click(screen.getByText('✏ Edit'));
    const phoneInput = screen.getByDisplayValue('+91-9800000001');
    fireEvent.change(phoneInput, { target: { value: '+91-9999999999' } });
    fireEvent.click(screen.getByText('Save Facilitator'));
    expect(onSaveFacilitator).toHaveBeenCalledTimes(1);
    const saved = onSaveFacilitator.mock.calls[0][0];
    expect(saved.id).toBe('FAC-001');
    expect(saved.phone).toBe('+91-9999999999');
  });

  it('search filters by name or area', () => {
    render(<FacilitatorMaster facilitators={seedFacilitators} setFacilitators={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText('Search facilitators...'), { target: { value: 'prithvi' } });
    expect(screen.getByText('Prithvi')).toBeTruthy();
  });
});

describe('saveFacilitatorToDB', () => {
  it('upserts the facilitator with correct field mapping', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveFacilitatorToDB(db, { id: 'FAC-010', name: 'Test Person', phone: '123', email: 'a@b.com', languages: 'English', areas: 'Delhi', notes: 'n', active: true });
    expect(upsert).toHaveBeenCalledWith({
      id: 'FAC-010', name: 'Test Person', phone: '123', email: 'a@b.com',
      languages: 'English', areas: 'Delhi', notes: 'n', active: true,
    });
  });

  it('defaults active to true when not explicitly false', async () => {
    const upsert = vi.fn(async () => ({ data: [], error: null }));
    const db = { from: () => ({ upsert }) };
    await saveFacilitatorToDB(db, { id: 'FAC-011', name: 'X' });
    expect(upsert.mock.calls[0][0].active).toBe(true);
  });

  it('does not throw when the db call fails', async () => {
    const db = { from: () => ({ upsert: async () => { throw new Error('fail'); } }) };
    await expect(saveFacilitatorToDB(db, { id: 'FAC-012', name: 'X' })).resolves.toBeUndefined();
  });
});
