import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Avatar } from '../lib/helpers.jsx';

// Three real, direct fixes/additions requested together:
// 1. Agent profile gets a real Website field
// 2. Contact persons (agent or vendor) get a real Designation field
// 3. Avatar initials use real initials (first+last word), not the
//    first two raw characters of the full name string

describe('Avatar: real initials, not the first two characters of the name', () => {
  it('a two-word name shows first-letter-of-first + first-letter-of-last, not the first two raw characters', () => {
    render(<Avatar user={{ name: 'Priya Sharma', color: '#1A5276' }} />);
    expect(screen.getByText('PS')).toBeTruthy();
    expect(screen.queryByText('PR')).toBeFalsy(); // the old, wrong behavior
  });

  it('a three-word name uses first word + last word, not the middle name', () => {
    render(<Avatar user={{ name: 'Priya Rani Sharma', color: '#1A5276' }} />);
    expect(screen.getByText('PS')).toBeTruthy();
  });

  it('a single-word name falls back to its own first two letters, since there is no second word', () => {
    render(<Avatar user={{ name: 'Cher', color: '#1A5276' }} />);
    expect(screen.getByText('CH')).toBeTruthy();
  });

  it('a manually-set avatar (explicit initials override) still takes priority over the computed ones', () => {
    render(<Avatar user={{ name: 'Priya Sharma', avatar: 'XY', color: '#1A5276' }} />);
    expect(screen.getByText('XY')).toBeTruthy();
  });

  it('no name at all falls back to "U"', () => {
    render(<Avatar user={{ color: '#1A5276' }} />);
    expect(screen.getByText('U')).toBeTruthy();
  });
});

describe('Agent profile: real Website field', () => {
  it('shows a Website input in the edit form', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    render(<AgentMaster agents={[]} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Agent'));
    expect(screen.getByText('Website')).toBeTruthy();
  });

  it('shows the real website as a clickable link on the profile tab', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    const agent = { id: 'a1', company: 'Global Tours', country: 'USA', website: 'globaltours.com', active: true };
    render(<AgentMaster agents={[agent]} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Global Tours'));
    const link = screen.getByText('globaltours.com').closest('a');
    expect(link.href).toBe('https://globaltours.com/');
    expect(link.target).toBe('_blank');
  });
});

describe('Vendor profile: real Website field', () => {
  it('shows a Website input in the edit form', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[]} setVendors={()=>{}} queries={[]} payments={{}} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Vendor'));
    expect(screen.getByText('Website')).toBeTruthy();
  });
});

describe('Contact Persons: real Designation field (agent and vendor)', () => {
  it('agent: shows a Designation input alongside Name/Phone/Email for each contact', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    render(<AgentMaster agents={[]} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Agent'));
    fireEvent.click(screen.getByText('+ Add Contact'));
    const designationInput = screen.getByPlaceholderText('Designation');
    fireEvent.change(designationInput, { target: { value: 'Sales Manager' } });
    expect(screen.getByDisplayValue('Sales Manager')).toBeTruthy();
  });

  it('vendor: shows a Designation input alongside Name/Phone/Email for each contact', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[]} setVendors={()=>{}} queries={[]} payments={{}} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onSaveVendor={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New Vendor'));
    fireEvent.click(screen.getByText('+ Add Contact'));
    const designationInput = screen.getByPlaceholderText('Designation');
    fireEvent.change(designationInput, { target: { value: 'Front Office Manager' } });
    expect(screen.getByDisplayValue('Front Office Manager')).toBeTruthy();
  });
});

describe('saveAgentToDB / saveVendorToDB: website is genuinely persisted, not silently dropped', () => {
  it('saveAgentToDB includes website in the real payload sent to the database', async () => {
    const { saveAgentToDB } = await import('../lib/utils.js');
    let capturedPayload = null;
    const mockDb = { from: () => ({ upsert: async (payload) => { capturedPayload = payload; return { error: null }; } }) };
    await saveAgentToDB(mockDb, { id: 'a1', company: 'Test Co', website: 'testco.com', contacts: [] });
    expect(capturedPayload.website).toBe('testco.com');
  });

  it('saveVendorToDB includes website in the real payload sent to the database', async () => {
    const { saveVendorToDB } = await import('../lib/utils.js');
    let capturedPayload = null;
    const mockDb = { from: () => ({ upsert: async (payload) => { capturedPayload = payload; return { error: null }; } }) };
    await saveVendorToDB(mockDb, { id: 'v1', name: 'Test Hotel', website: 'testhotel.com', contacts: [] });
    expect(capturedPayload.website).toBe('testhotel.com');
  });
});

describe('Agent profile: real bug found and fixed -- editing an existing agent never updated the visible profile', () => {
  it('after saving an edit to an existing agent, the Profile tab shows the new website, not the stale old value', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    const agent = { id: 'a1', company: 'Global Tours', country: 'USA', website: '', active: true };
    render(<AgentMaster agents={[agent]} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={async (a)=>a} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Global Tours'));
    fireEvent.click(screen.getByText('✏ Edit'));
    fireEvent.change(screen.getByText('Website').nextSibling, { target: { value: 'globaltours.com' } });
    fireEvent.click(screen.getByText('Save Agent'));
    await waitFor(() => expect(screen.getByText('globaltours.com')).toBeTruthy());
  });
});

describe('UnitopApp data mapping: real bug found and fixed -- website was fetched from the database but silently dropped before reaching app state', () => {
  it('agent mapping in UnitopApp includes website, not just the fields it had before this feature', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');
    const agentMapStart = src.indexOf('setAgents(agData.map');
    const agentMapBody = src.slice(agentMapStart, agentMapStart + 900);
    expect(agentMapBody).toContain('website: a.website');
  });

  it('vendor mapping in UnitopApp includes website, not just the fields it had before this feature', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');
    const vendorMapStart = src.indexOf('setVendors(vData.map');
    const vendorMapBody = src.slice(vendorMapStart, vendorMapStart + 700);
    expect(vendorMapBody).toContain('website: v.website');
  });

  it('currentUser no longer recomputes avatar with the old, buggy slice(0,2) logic on every login', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');
    // Checks the real code pattern directly, not a naive string search
    // across the whole block -- the explanatory comment above this fix
    // legitimately mentions the old buggy pattern as prose, which a
    // broader search would incorrectly flag as still present.
    expect(src).not.toContain('avatar: authUser.name ? authUser.name.slice(0,2)');
    expect(src).toContain('avatar: authUser.avatar || null');
  });
});
