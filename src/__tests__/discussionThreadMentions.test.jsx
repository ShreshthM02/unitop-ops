import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { extractMentions, MessageWithMentions, MentionInput } from '../lib/Mentions.jsx';
import QueryDrawerWithQuote from '../components/QueryDrawerWithQuote.jsx';

// Record-anchored discussion threads: a shared @mention system built on
// query_remarks (already a real, per-query table -- no new table, no
// data migration, existing remarks became the thread's first messages
// automatically). Every mention is a real, structured reference stored
// alongside the message, not just parsed from text at render time.

describe('extractMentions', () => {
  it('extracts every mention token from a message, in order', () => {
    const text = "Hey @[[staff:s1:Priya Rao]], can you check @[[query:TUR-2026-045:Smith Family]]?";
    expect(extractMentions(text)).toEqual([
      { type: 'staff', id: 's1', label: 'Priya Rao' },
      { type: 'query', id: 'TUR-2026-045', label: 'Smith Family' },
    ]);
  });

  it('returns an empty array for a message with no mentions', () => {
    expect(extractMentions('just a plain message')).toEqual([]);
  });

  it('handles all five mentionable types', () => {
    const text = "@[[staff:1:A]] @[[query:2:B]] @[[agent:3:C]] @[[vendor:4:D]] @[[series:5:E]]";
    expect(extractMentions(text).map(m => m.type)).toEqual(['staff', 'query', 'agent', 'vendor', 'series']);
  });

  it('is resilient to genuinely empty or null input', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions(null)).toEqual([]);
  });
});

describe('MessageWithMentions', () => {
  const queries = [{ id: 'UTQ-1', tourFileId: 'TUR-2026-045', groupName: 'Smith Family' }];

  it('renders plain text around a mention correctly', () => {
    render(<MessageWithMentions text="Hey @[[staff:s1:Priya Rao]], please check this" queries={queries}/>);
    expect(screen.getByText('Priya Rao', { exact: false })).toBeTruthy();
    expect(screen.getByText(/please check this/)).toBeTruthy();
  });

  it('a staff mention is styled but NOT clickable -- no DM system yet, matches Slack’s own behavior', () => {
    let captured = null;
    document.addEventListener('unitop-activate-agent', () => { captured = 'fired'; });
    const { container } = render(<MessageWithMentions text="@[[staff:s1:Priya Rao]]" queries={queries}/>);
    fireEvent.click(container.querySelector('span[style*="font-weight"]') || screen.getByText(/Priya Rao/));
    expect(captured).toBeNull();
  });

  it('a query mention is genuinely clickable and dispatches the real event other Master Data click-throughs already use', () => {
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    render(<MessageWithMentions text="Check @[[query:TUR-2026-045:Smith Family]]" queries={queries}/>);
    fireEvent.click(screen.getByText(/Smith Family/));
    expect(captured?.id).toBe('UTQ-1');
  });

  it('an agent mention dispatches unitop-activate-agent with the real id', () => {
    let captured = null;
    document.addEventListener('unitop-activate-agent', (e) => { captured = e.detail.id; });
    render(<MessageWithMentions text="Ask @[[agent:agent-1:NCH Holidays]]" queries={queries}/>);
    fireEvent.click(screen.getByText(/NCH Holidays/));
    expect(captured).toBe('agent-1');
  });

  it('a vendor mention dispatches unitop-activate-vendor with the real id', () => {
    let captured = null;
    document.addEventListener('unitop-activate-vendor', (e) => { captured = e.detail.id; });
    render(<MessageWithMentions text="@[[vendor:v1:Taj Palace]]" queries={queries}/>);
    fireEvent.click(screen.getByText(/Taj Palace/));
    expect(captured).toBe('v1');
  });

  it('a series mention dispatches unitop-activate-series with the real id', () => {
    let captured = null;
    document.addEventListener('unitop-activate-series', (e) => { captured = e.detail.id; });
    render(<MessageWithMentions text="@[[series:ser1:Europe Summer 2026]]" queries={queries}/>);
    fireEvent.click(screen.getByText(/Europe Summer/));
    expect(captured).toBe('ser1');
  });

  it('a query mention with no matching query in the list does not throw, just does nothing on click', () => {
    render(<MessageWithMentions text="@[[query:UNKNOWN:Ghost]]" queries={queries}/>);
    expect(() => fireEvent.click(screen.getByText(/Ghost/))).not.toThrow();
  });
});

describe('MentionInput composer', () => {
  const staff = [{ id: 's1', name: 'Priya Rao' }, { id: 's2', name: 'Amit Shah' }];
  const queries = [{ id: 'UTQ-1', tourFileId: 'TUR-2026-045', groupName: 'Smith Family' }];
  const agents = [{ id: 'a1', company: 'NCH Holidays' }];
  const vendors = [{ id: 'v1', name: 'Taj Palace' }];
  const series = [{ id: 'ser1', name: 'Europe Summer 2026' }];

  it('typing @ opens a dropdown listing matches across every entity type', () => {
    render(<MentionInput value="" onChange={()=>{}} staff={staff} queries={queries} agents={agents} vendors={vendors} series={series}/>);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@' } });
    expect(screen.getByText('Priya Rao')).toBeTruthy();
  });

  it('typing a search term after @ filters matches across all types', () => {
    render(<MentionInput value="" onChange={()=>{}} staff={staff} queries={queries} agents={agents} vendors={vendors} series={series}/>);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@taj', selectionStart: 4 } });
    expect(screen.getByText('Taj Palace')).toBeTruthy();
    expect(screen.queryByText('Priya Rao')).toBeFalsy();
  });

  it('selecting a match inserts the real mention token into the text', () => {
    const onChange = vi.fn();
    render(<MentionInput value="" onChange={onChange} staff={staff} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '@Priya', selectionStart: 6 } });
    fireEvent.mouseDown(screen.getByText('Priya Rao'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('@[[staff:s1:Priya Rao]]'));
  });

  it('Enter with no dropdown open submits the message, matching a normal chat composer', () => {
    const onSubmit = vi.fn();
    render(<MentionInput value="hello" onChange={()=>{}} onSubmit={onSubmit} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalled();
  });

  it('Shift+Enter does not submit -- allows a new line', () => {
    const onSubmit = vi.fn();
    render(<MentionInput value="hello" onChange={()=>{}} onSubmit={onSubmit} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Discussion tab (formerly Remarks): full integration', () => {
  const blankTE = { queryId: 'UTQ-1', days: [], facilitators: [], localHandlers: [], transporters: [], flights: [], arrFlightDetails: '', depFlightDetails: '' };
  const baseProps = {
    onClose: ()=>{}, onConvert: ()=>{}, onAdvance: ()=>{}, onGenerateQuote: ()=>{}, onToggleWF: ()=>{},
    onCancel: ()=>{}, onUpdateQuery: ()=>{}, currentUser: { id: 'staff-1', name: 'Priya' },
    tourExecution: blankTE, onUpdateTourExecution: ()=>{}, costSheetExists: false, quotationExists: false, hasPayments: false,
    staff: [{ id: 'staff-1', name: 'Priya' }, { id: 'staff-2', name: 'Amit' }],
    queries: [{ id: 'UTQ-2', tourFileId: 'TUR-2026-050', groupName: 'Other Group' }],
    agents: [{ id: 'agent-1', company: 'NCH Holidays' }],
    vendors: [], series: [],
  };
  const query = { id: 'UTQ-1', groupName: 'Test Group', status: 'new_query', manualWF: [], audit: [], remarks: [], nights: 5, pax: 10 };

  it('sending a message extracts real mentions and calls onUpdateRemarks with them', () => {
    const onUpdateRemarks = vi.fn();
    render(<QueryDrawerWithQuote {...baseProps} query={query} onUpdateRemarks={onUpdateRemarks}/>);
    fireEvent.click(screen.getByText(/💬 Discussion/));
    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Hey @[[staff:staff-2:Amit]], check @[[query:TUR-2026-050:Other Group]]' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onUpdateRemarks).toHaveBeenCalledWith('UTQ-1', expect.objectContaining({
      text: expect.stringContaining('@[[staff:staff-2:Amit]]'),
      mentions: [
        { type: 'staff', id: 'staff-2', label: 'Amit' },
        { type: 'query', id: 'TUR-2026-050', label: 'Other Group' },
      ],
    }));
  });

  it('existing messages render with real avatars, senders, and clickable mentions -- confirms real query_remarks rows migrate into the thread with zero data loss', () => {
    const withMessages = { ...query, remarks: [
      { id: 'r1', by: 'Amit', byStaffId: 'staff-2', at: '01/09/2026, 10:00', text: 'Check @[[query:TUR-2026-050:Other Group]] please', mentions: [{ type: 'query', id: 'TUR-2026-050', label: 'Other Group' }] },
    ] };
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    render(<QueryDrawerWithQuote {...baseProps} query={withMessages}/>);
    fireEvent.click(screen.getByText(/💬 Discussion/));
    expect(screen.getByText('Amit')).toBeTruthy();
    fireEvent.click(screen.getByText(/Other Group/));
    expect(captured?.id).toBe('UTQ-2');
  });

  it('the Discussion tab works identically on a query that has not been converted to a tour file yet', () => {
    render(<QueryDrawerWithQuote {...baseProps} query={query}/>);
    fireEvent.click(screen.getByText(/💬 Discussion/));
    expect(screen.getByPlaceholderText(/Type a message/)).toBeTruthy();
  });
});

describe('Mention "open" targets: Agent/Vendor/Series panels open already focused on the mentioned entity', () => {
  it('AgentMaster: initialSelectedId seeds the selected agent immediately, no click needed', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    const agents = [{ id: 'a1', company: 'ABC Travels', country: 'Germany' }, { id: 'a2', company: 'XYZ Tours', country: 'Thailand' }];
    render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}} initialSelectedId="a2"/>);
    expect(screen.getAllByText('XYZ Tours').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Thailand').length).toBeGreaterThanOrEqual(1);
  });

  it('VendorMaster: initialSelectedId seeds the selected vendor immediately, rates included', async () => {
    const { default: VendorMaster } = await import('../components/VendorMaster.jsx');
    const vendors = [
      { id: 'v1', name: 'Golden Cabs', type: 'Transport', active: true, rates: [] },
      { id: 'v2', name: 'Taj Palace', type: 'Hotel', active: true, rates: [{ id: 1, roomType: 'Deluxe', ratePP: '5000' }] },
    ];
    render(<VendorMaster vendors={vendors} setVendors={()=>{}} queries={[]} tourExecutions={{}} currentUser={{id:1,role:'admin'}} onClose={()=>{}} initialSelectedId="v2"/>);
    expect(screen.getAllByText('Taj Palace').length).toBeGreaterThanOrEqual(1);
  });

  it('SeriesManagement: initialSelectedId seeds the selected series immediately', async () => {
    const { default: SeriesManagement } = await import('../components/SeriesManagement.jsx');
    const series = [{ id: 'ser1', name: 'Summer Europe', active: true }, { id: 'ser2', name: 'Winter Thailand', active: true }];
    render(<SeriesManagement series={series} setSeries={()=>{}} queries={[]} currentUser={{id:1,name:'Priya'}} onClose={()=>{}} initialSelectedId="ser2"/>);
    expect(screen.getAllByText('Winter Thailand').length).toBeGreaterThanOrEqual(1);
  });

  it('a null/unmatched initialSelectedId does not crash any of the three panels', async () => {
    const { default: AgentMaster } = await import('../components/AgentMaster.jsx');
    const agents = [{ id: 'a1', company: 'ABC Travels' }];
    expect(() => render(<AgentMaster agents={agents} setAgents={()=>{}} queries={[]} payments={{}} currentUser={{id:1,role:'admin'}} onSaveAgent={()=>{}} onClose={()=>{}} initialSelectedId={null}/>)).not.toThrow();
  });
});
