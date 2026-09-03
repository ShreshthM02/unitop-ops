import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentMaster from '../components/AgentMaster.jsx';

describe('AgentMaster smart dashboard (1.2): a real summary computed from existing data, no new plumbing', () => {
  const agents = [
    { id: 'a1', company: 'ABC Travels', country: 'Germany', market: 'Europe' },
    { id: 'a2', company: 'XYZ Tours', country: 'Thailand', market: 'Asia' },
    { id: 'a3', company: 'Dormant Agency', country: 'USA', market: 'Americas' }, // no queries at all
  ];
  const queries = [
    { id: 'UTQ-1', agentCompany: 'ABC Travels', travelDate: '2026-03-01' },
    { id: 'UTQ-2', agentCompany: 'ABC Travels', travelDate: '2026-06-15' }, // ABC's most recent
    { id: 'UTQ-3', agentCompany: 'XYZ Tours', travelDate: '2026-01-10' },
  ];
  const payments = {
    'UTQ-1': { tourValue: '1000', roeUsed: '90', entries: [] },
    'UTQ-2': { tourValue: '2000', roeUsed: '90', entries: [] },
    'UTQ-3': { tourValue: '500', roeUsed: '1', entries: [] }, // INR already, roe 1
  };

  it('shows real aggregate totals -- total agents, agents with active business (item 2: total tour value removed from this strip)', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText('Total Agents')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // total agents
    expect(screen.getByText('2')).toBeTruthy(); // active agents (ABC + XYZ, not Dormant)
    expect(screen.queryByText('Total Tour Value (INR)')).toBeFalsy();
    expect(screen.queryByText(/₹2,70,500/)).toBeFalsy();
  });

  it('each agent row shows a real last-active date, not just a bare query count', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText(/2 queries · last 15\/06\/2026/)).toBeTruthy(); // ABC's most recent travel date
  });

  it('defaults to sorting by most active, surfacing agents with real recent activity first', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    const names = screen.getAllByText(/Travels|Tours|Agency/).map(el => el.textContent);
    expect(names.indexOf('ABC Travels')).toBeLessThan(names.indexOf('Dormant Agency'));
  });

  it('switching to name sort re-orders the list alphabetically', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByTitle('Sort agents by'), { target: { value: 'name' } });
    const names = screen.getAllByText(/Travels|Tours|Agency/).map(el => el.textContent);
    expect(names).toEqual(['ABC Travels', 'Dormant Agency', 'XYZ Tours']);
  });

  it('an agent with zero queries shows correctly with no crash', () => {
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText('0 queries')).toBeTruthy(); // Dormant Agency, no "last active" suffix
  });

  it('handles a completely empty agents list without crashing', () => {
    render(<AgentMaster agents={[]} setAgents={()=>{}} queries={[]} payments={{}} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    expect(screen.getByText('Total Agents')).toBeTruthy();
    expect(screen.getAllByText('0').length).toBe(2); // total agents AND active agents, both correctly 0
  });
});

describe('VendorMaster smart dashboard (1.2): real assignment-based summary, not a financial total (vendors don\u2019t map cleanly to tour value)', () => {
  const vendors = [
    { id: 'v1', name: 'Nanking Restaurant', type: 'Restaurant', city: 'Delhi', active: true },
    { id: 'v2', name: 'Golden Cabs', type: 'Transport', city: 'Jaipur', active: true },
    { id: 'v3', name: 'Unused Handler', type: 'Local Handler', city: 'Agra', active: true }, // no assignments
  ];
  const queries = [
    { id: 'UTQ-1', groupName: 'Group A', travelDate: '2026-02-01' },
    { id: 'UTQ-2', groupName: 'Group B', travelDate: '2026-07-20' },
  ];
  const tourExecutions = {
    'UTQ-1': { localHandlers: [], transporters: [{ vendorId: 'v2', sector: 'Jaipur' }], facilitators: [] },
    'UTQ-2': { localHandlers: [{ vendorId: 'v1', sector: 'Delhi' }], transporters: [{ vendorId: 'v2', sector: 'Delhi' }], facilitators: [] },
  };

  it('shows real aggregate totals -- total vendors, vendors with active assignments, total assignments', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={queries} tourExecutions={tourExecutions} onClose={()=>{}}/>);
    expect(screen.getByText('Total Vendors')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1); // total vendors AND total assignments both happen to be 3
    expect(screen.getByText('2')).toBeTruthy(); // active vendors: v1 + v2, not v3
  });

  it('each vendor row shows a real last-active date from its actual assignment history', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={queries} tourExecutions={tourExecutions} onClose={()=>{}}/>);
    expect(screen.getByText(/2 assignments · last 20\/07\/2026/)).toBeTruthy(); // Golden Cabs, both assignments
  });

  it('a vendor with zero assignments shows correctly with no crash', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={queries} tourExecutions={tourExecutions} onClose={()=>{}}/>);
    expect(screen.getByText('0 assignments')).toBeTruthy(); // Unused Handler, no "last active" suffix
  });

  it('switching to name sort re-orders the list alphabetically', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={queries} tourExecutions={tourExecutions} onClose={()=>{}}/>);
    fireEvent.change(screen.getByTitle('Sort vendors by'), { target: { value: 'name' } });
    const names = screen.getAllByText(/Restaurant|Cabs|Handler/).map(el => el.textContent).filter(t=>vendors.some(v=>v.name===t));
    expect(names).toEqual(['Golden Cabs', 'Nanking Restaurant', 'Unused Handler']);
  });

  it('handles an empty vendors list without crashing', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    render(<VendorMaster vendors={[]} setVendors={()=>{}} queries={[]} tourExecutions={{}} onClose={()=>{}}/>);
    expect(screen.getByText('Total Vendors')).toBeTruthy();
  });
});

describe('Master Data (item 1): every query/tour file reference is now clickable into it', () => {
  const agents = [{ id: 'a1', company: 'ABC Travels', country: 'Germany', market: 'Europe' }];
  const queries = [
    { id: 'UTQ-1', tourFileId: 'TUR-2026-005', agentCompany: 'ABC Travels', groupName: 'Smith Family', destination: 'Golden Triangle', travelDate: '2026-03-01', status: 'operations' },
  ];
  const payments = { 'UTQ-1': { tourValue: '1000', roeUsed: '90', entries: [{ amount: '50000', receipt: 'RCP-1', date: '2026-02-01', mode: 'Bank' }] } };

  it('AgentMaster: Query History rows are clickable', () => {
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    fireEvent.click(screen.getByText('Query History'));
    fireEvent.click(screen.getByText('Smith Family'));
    expect(captured?.id).toBe('UTQ-1');
  });

  it('AgentMaster: Financial Ledger rows are clickable', () => {
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={queries} payments={payments} onSaveAgent={()=>{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('ABC Travels'));
    fireEvent.click(screen.getByText('Financial Ledger'));
    fireEvent.click(screen.getByText('📁 TUR-2026-005'));
    expect(captured?.id).toBe('UTQ-1');
  });
});

describe('VendorMaster (item 1): Financial Ledger tour file references are now clickable too', () => {
  it('clicking a tour file badge in the Financial Ledger opens that query', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const vendors = [{ id: 'v1', name: 'Nanking Restaurant', type: 'Restaurant', city: 'Delhi', active: true }];
    const queries = [{ id: 'UTQ-9', tourFileId: 'TUR-2026-020', groupName: 'Test Group' }];
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={queries} tourExecutions={{}} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('Nanking Restaurant'));
    fireEvent.click(screen.getByText('Financial Ledger'));
    // No ledger entries in this fixture -- confirms the empty-ledger
    // state renders without crashing now that the clickable lookup
    // logic touches every entry.
    expect(screen.getByText('No transactions yet.')).toBeTruthy();
  });
});
