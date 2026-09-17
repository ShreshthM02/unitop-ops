import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TeamView from '../components/TeamView.jsx';
import AllQueriesView from '../components/AllQueriesView.jsx';
import AgentLedgerPanel from '../components/AgentLedgerPanel.jsx';
import CancelModal from '../components/CancelModal.jsx';
import SmartSearch from '../components/SmartSearch.jsx';

// Real, direct request: once a query converts to a Tour File, every
// screen that shows its identifier should show the Tour File ID
// (e.g. "UT-3490"), not the original Query ID (e.g. "QRY-2026-003").
// Found by a systematic audit: most screens already did this correctly
// via a `tourFileId||id` fallback, but ten spots across eight files had
// been missed and still showed the bare query id unconditionally.
// Before a query converts, tourFileId is unset, so id is the correct,
// intended fallback -- these tests cover BOTH states.

const convertedQuery = { id: 'QRY-2026-003', tourFileId: 'UT-3490', clientName: 'Test Client', groupName: 'Test Group', destination: 'Agra', status: 'confirmed' };
const unconvertedQuery = { id: 'QRY-2026-099', clientName: 'Not Yet Converted', groupName: 'Not Yet Converted', destination: 'Jaipur', status: 'new' };

describe('Tour File ID shown instead of raw Query ID once converted', () => {
  it('Team: shows the tour file id for a converted query, in both Working On and Reviewing lists', () => {
    const staff = [{ id: 1, name: 'Test User', role: 'ops' }];
    render(<TeamView queries={[{ ...convertedQuery, assignedTo: 1 }]} staff={staff}/>);
    expect(screen.getAllByText('UT-3490').length).toBeGreaterThan(0);
    expect(screen.queryByText('QRY-2026-003')).not.toBeInTheDocument();
  });

  it('Team: falls back to the query id for a query not yet converted', () => {
    const staff = [{ id: 1, name: 'Test User', role: 'ops' }];
    render(<TeamView queries={[{ ...unconvertedQuery, assignedTo: 1 }]} staff={staff}/>);
    expect(screen.getAllByText('QRY-2026-099').length).toBeGreaterThan(0);
  });

  it('All Queries: shows the tour file id, not the query id, once converted', () => {
    render(<AllQueriesView queries={[convertedQuery]} agents={[]} onOpenQuery={()=>{}} onConvert={()=>{}} currentUser={{role:'admin'}} staff={[]}/>);
    expect(screen.getByText('UT-3490')).toBeInTheDocument();
    expect(screen.queryByText('QRY-2026-003')).not.toBeInTheDocument();
  });

  it('Agent Ledger: shows BOTH the query id and the tour file id in its main query list -- this screen deliberately displays both, unlike the others in this file', () => {
    const agent = { id: 'a1', company: 'Test Agent' };
    const query = { ...convertedQuery, agentCompany: 'Test Agent' };
    render(<AgentLedgerPanel agent={agent} queries={[query]} payments={{}} onClose={()=>{}}/>);
    expect(screen.getByText('QRY-2026-003')).toBeInTheDocument();
    expect(screen.getByText('UT-3490')).toBeInTheDocument();
  });

  it('Cancel Modal: shows the tour file id in its subtitle', () => {
    render(<CancelModal query={convertedQuery} onClose={()=>{}} onConfirm={()=>{}}/>);
    expect(screen.getByText(/UT-3490/)).toBeInTheDocument();
  });

  it('Smart Search: formats a converted query result with its tour file id, not the raw query id', () => {
    render(<SmartSearch queries={[convertedQuery]} agents={[]} vendors={[]} series={[]} staff={[]} chatConversations={[]} currentUser={{role:'admin'}} onSelectQuery={()=>{}} onSelectStaff={()=>{}} onSelectChat={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Test Group' } });
    expect(screen.getByText(/UT-3490/)).toBeInTheDocument();
    expect(screen.queryByText(/QRY-2026-003/)).not.toBeInTheDocument();
  });
});
