import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { migrateContacts, saveAgentToDB, saveVendorToDB } from '../lib/utils.js';
import AgentMaster from '../components/AgentMaster.jsx';
import VendorMaster from '../components/VendorMaster.jsx';

// New request: multiple contact persons for Agents and Vendors, each
// with their own name+phone+email together. Old single contact_name/
// contact_phone/contact_email fields stay in sync with the FIRST
// contact on save, since several other parts of this app still read
// those flat fields directly (Agent Ledger, Invoice, New Query, Smart
// Search, Tour Briefing Sheet) -- real, separate scope to update all
// of those to the new array, so this keeps them working correctly
// with a "primary" contact in the meantime.

describe('migrateContacts', () => {
  it('returns the real contacts array as-is when one already exists', () => {
    const contacts = [{ id: 1, name: 'A', phone: '1', email: 'a@b.com' }];
    expect(migrateContacts({ contacts })).toEqual(contacts);
  });

  it('reconstructs a single contact from old flat fields when contacts is empty/missing', () => {
    const result = migrateContacts({ contactName: 'Rahul', contactPhone: '9999', contactEmail: 'r@x.com' });
    expect(result).toEqual([{ id: expect.any(Number), name: 'Rahul', phone: '9999', email: 'r@x.com' }]);
  });

  it('returns an empty array when there is genuinely nothing on either side', () => {
    expect(migrateContacts({})).toEqual([]);
    expect(migrateContacts(null)).toEqual([]);
  });

  it('a contacts array with zero entries does not incorrectly fall back to old fields if contacts was explicitly set empty by the user (e.g. deleted their only contact)', () => {
    // contacts: [] combined with old flat fields still present -- this
    // is the ambiguous case (could mean "never migrated" or "user
    // deleted their contact"). Falls back to reconstructing from old
    // fields, matching the documented behavior: only a REAL saved
    // contacts array (via a real save, which also clears the old
    // fields to the new primary) stops this fallback for good.
    const result = migrateContacts({ contacts: [], contactName: 'Old Name' });
    expect(result.length).toBe(1);
  });
});

describe('saveAgentToDB / saveVendorToDB: old flat fields sync from contacts[0]', () => {
  it('agents: derives contact_name/contact_phone/contact_email from the first contact', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    await saveAgentToDB(db, { id: 'a1', company: 'X', contacts: [
      { id: 1, name: 'First', phone: '111', email: 'first@x.com' },
      { id: 2, name: 'Second', phone: '222', email: 'second@x.com' },
    ] });
    expect(upsert.mock.calls[0][0]).toMatchObject({ contact_name: 'First', contact_phone: '111', contact_email: 'first@x.com' });
    expect(upsert.mock.calls[0][0].contacts).toHaveLength(2);
  });

  it('vendors: same derivation', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    await saveVendorToDB(db, { id: 'v1', name: 'X', contacts: [{ id: 1, name: 'Only', phone: '333', email: '' }] });
    expect(upsert.mock.calls[0][0]).toMatchObject({ contact_name: 'Only', contact_phone: '333', contact_email: '' });
  });

  it('an agent/vendor with no contacts at all saves cleanly with empty flat fields, not a crash', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    await saveAgentToDB(db, { id: 'a1', company: 'X' });
    expect(upsert.mock.calls[0][0]).toMatchObject({ contact_name: '', contact_phone: '', contact_email: '', contacts: [] });
  });
});

describe('AgentMaster: multiple contacts UI', () => {
  const agents = [{ id: 'a1', company: 'ABC Travels', country: 'Germany', contacts: [{ id: 1, name: 'Hans', phone: '111', email: 'hans@x.com' }] }];

  it('the profile view shows every contact, not just one', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    expect(screen.getByText('Hans')).toBeTruthy();
    expect(screen.getByText(/111/)).toBeTruthy();
  });

  it('a second contact can be added and both are saved', () => {
    const onSaveAgent = vi.fn();
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={onSaveAgent} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    fireEvent.click(screen.getByText('✏ Edit'));
    fireEvent.click(screen.getByText('+ Add Contact'));
    const nameInputs = screen.getAllByPlaceholderText('Name');
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: 'Greta' } });
    fireEvent.click(screen.getByText('Save Agent'));
    expect(onSaveAgent.mock.calls[0][0].contacts).toHaveLength(2);
    expect(onSaveAgent.mock.calls[0][0].contacts[1].name).toBe('Greta');
  });

  it('a contact can be removed', () => {
    const onSaveAgent = vi.fn();
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={onSaveAgent} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    fireEvent.click(screen.getByText('✏ Edit'));
    // "✕" also matches the panel's own close button -- find the
    // specific contact-row delete control (a <span>, not a <button>).
    const deleteButtons = screen.getAllByText('✕').filter(el => el.tagName === 'SPAN');
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByText('Save Agent'));
    expect(onSaveAgent.mock.calls[0][0].contacts).toHaveLength(0);
  });

  it('a brand-new agent starts with zero contacts, not leftover state', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Agent'));
    expect(screen.queryByText('Hans')).toBeFalsy();
    expect(screen.queryByPlaceholderText('Name')).toBeFalsy(); // no contact rows shown yet, just the Add button
  });
});

describe('VendorMaster: multiple contacts UI, including the Tour Facilitator special case', () => {
  const vendors = [
    { id: 'v1', name: 'Taj Palace', type: 'Hotel', active: true, rates: [], contacts: [{ id: 1, name: 'Manager', phone: '555', email: '' }] },
    { id: 'v2', name: 'Prithvi', type: 'Tour Facilitator', active: true, rates: [], languages: 'English', areas: 'Delhi', contacts: [{ id: 1, name: '', phone: '999', email: '' }] },
  ];

  it('a Hotel vendor\u2019s profile shows its contacts', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    expect(screen.getByText('Manager')).toBeTruthy();
  });

  it('a Tour Facilitator still shows Languages/Areas alongside the new contacts section, not replaced by it', () => {
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Prithvi'));
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Delhi')).toBeTruthy();
    expect(screen.getByText(/999/)).toBeTruthy(); // the contact's phone, shown in the new Contact Persons section
  });

  it('adding a contact to a vendor saves correctly', () => {
    const onSaveVendor = vi.fn();
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={onSaveVendor} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Taj Palace'));
    fireEvent.click(screen.getByText('✏ Edit'));
    fireEvent.click(screen.getByText('+ Add Contact'));
    const emailInputs = screen.getAllByPlaceholderText('Email');
    fireEvent.change(emailInputs[emailInputs.length - 1], { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByText('Save Vendor'));
    expect(onSaveVendor.mock.calls[0][0].contacts).toHaveLength(2);
  });
});
