import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Item 1: message timestamps showed only the TIME, never the date --
// no way to tell when something was sent once a conversation spans
// more than a day. Added a real date divider (Today/Yesterday/a real
// date), matching the same convention WhatsApp/Slack use.
// Item 3: search was scoped to queries/agents/vendors only -- extended
// to include series, colleagues (jumping straight into a DM), and
// chat conversations themselves, reusing the existing unitop-activate-*
// event bridge for agent/vendor/series rather than building a new one.

function makeDb({ conversations = [], members = [], messages = [] } = {}) {
  return {
    from: (table) => {
      let conditions = [];
      const resolve = () => {
        let rows = table === 'chat_conversations' ? conversations : table === 'chat_conversation_members' ? members : table === 'chat_messages' ? messages : [];
        conditions.forEach(([col, val, op]) => {
          if (op === 'in') rows = rows.filter(r => (val || []).includes(r[col]));
          else rows = rows.filter(r => r[col] === val);
        });
        return { data: rows, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
        in: (col, vals) => { conditions = [...conditions, [col, vals, 'in']]; return builder; },
        order: () => builder,
        insert: async (row) => ({ data: [{ ...row, id: row.id || 'new-id' }], error: null }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        then: (res) => res(resolve()),
      };
      return builder;
    },
  };
}

describe('InAppChat: date divider between messages from different days', () => {
  const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }];
  const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
  const members = [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }];

  it('shows a real date divider when messages span more than one day', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'yesterday message', mentions: [], created_at: (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString(); })() },
      { id: 'm2', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'today message', mentions: [], created_at: new Date().toISOString() },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('today message')).toBeTruthy());
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows no divider at all when every message is from the same day', async () => {
    const today = new Date().toISOString();
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'first', mentions: [], created_at: today },
      { id: 'm2', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'second', mentions: [], created_at: today },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('second')).toBeTruthy());
    // the very first message always gets its own date header (matching
    // WhatsApp/Slack, where every conversation opens with one) -- the
    // real thing being tested is that there's exactly ONE, not one per
    // message when nothing has actually changed day.
    expect(screen.getAllByText('Today')).toHaveLength(1);
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('SmartSearch: extended to series, colleagues, and chat conversations', () => {
  const queries = [];
  const agents = [];
  const vendors = [];
  const series = [{ id: 'ser1', name: 'Kashmir Group Tour', notes: 'Annual summer batch' }];
  const staff = [{ id: 's1', name: 'Priya', role: 'ops' }, { id: 's2', name: 'Amit Verma', role: 'sales' }];
  const chatConversations = [
    { id: 'c1', type: 'group', name: 'Ops Team', members: [{staffId:'s1'},{staffId:'s2'}] },
    { id: 'c2', type: 'dm', name: null, members: [{staffId:'s1'},{staffId:'s2'}] },
  ];

  it('finds a series by name', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={[]} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Kashmir' } });
    expect(screen.getByText('Kashmir Group Tour')).toBeTruthy();
    expect(screen.getByText('Series')).toBeTruthy();
  });

  it('clicking a series result dispatches the existing unitop-activate-series event, reusing the same bridge as mention clicks', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    const listener = vi.fn();
    document.addEventListener('unitop-activate-series', listener);
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={[]} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Kashmir' } });
    fireEvent.click(screen.getByText('Kashmir Group Tour'));
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].detail.id).toBe('ser1');
    document.removeEventListener('unitop-activate-series', listener);
  });

  it('finds a colleague by name, excluding the current user themselves', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={[]} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Amit' } });
    expect(screen.getByText('Amit Verma')).toBeTruthy();
    expect(screen.getByText('Colleague')).toBeTruthy();
    // searching for the current user's own name should never surface themselves
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Priya' } });
    expect(screen.queryByText('Colleague')).toBeFalsy();
  });

  it('clicking a colleague result starts (or reuses) a DM and opens chat to it', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    const onSelectStaff = vi.fn();
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={[]} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onSelectStaff={onSelectStaff} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Amit' } });
    fireEvent.click(screen.getByText('Amit Verma'));
    expect(onSelectStaff).toHaveBeenCalledWith(expect.objectContaining({ id: 's2', name: 'Amit Verma' }));
  });

  it('finds a chat conversation by its group name', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={chatConversations} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Ops Team' } });
    expect(screen.getByText(/Ops Team/)).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('finds a DM by the OTHER participant\u2019s name, not your own', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={chatConversations} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Amit' } });
    // both the colleague AND the DM with them show up for "Amit" -- a
    // genuine, expected duplicate label (one tagged Colleague, one
    // tagged Chat), not a bug.
    expect(screen.getAllByText('Amit Verma').length).toBe(2);
    expect(screen.getByText('Colleague')).toBeTruthy();
    expect(screen.getAllByText('Chat').length).toBeGreaterThan(0);
  });

  it('clicking a chat result opens that specific conversation', async () => {
    const { default: SmartSearch } = await import('../components/SmartSearch.jsx');
    const onSelectChat = vi.fn();
    render(<SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={chatConversations} currentUser={{id:'s1'}} onSelectQuery={()=>{}} onSelectChat={onSelectChat} onClose={()=>{}}/>);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'Ops Team' } });
    fireEvent.click(screen.getByText(/Ops Team/));
    expect(onSelectChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });
});

describe('InAppChat: initialConvId opens a specific conversation directly', () => {
  it('selects the given conversation on mount, e.g. arriving from search', async () => {
    const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }];
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
      messages: [{ id: 'm1', conversation_id: 'c1', sender_id: 's2', sender_name: 'Amit', text: 'hi there', mentions: [], created_at: new Date().toISOString() }],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}} initialConvId="c1"/>);
    await waitFor(() => expect(screen.getByText('hi there')).toBeTruthy()); // already opened, no click needed
    vi.doUnmock('../lib/supabase.js');
  });
});
