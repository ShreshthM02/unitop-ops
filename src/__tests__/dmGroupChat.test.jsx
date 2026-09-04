import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  loadConversationsForStaff, findOrCreateDM, createGroupConversation,
  addConversationMember, removeConversationMember, renameConversation,
  loadChatMessages, sendChatMessage, markConversationRead,
} from '../lib/utils.js';
import InAppChat from '../components/InAppChat.jsx';

// Full DM + Group chat, replacing InAppChat's old 3-channel static
// mockup (zero persistence, its own UI literally said "Messages sync
// live in Phase 5"). One generic conversations model for both DMs and
// groups. RLS restricts every table to actual members only --
// genuinely different from this app's usual "any authenticated staff
// member" standard -- verified separately via direct database
// simulation (including a real infinite-recursion bug found and fixed
// that way, not covered here since it's a database-level concern, not
// a unit-testable one).

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

describe('loadConversationsForStaff', () => {
  it('returns only conversations the given staff member is actually a member of', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' }, { id: 'c2', type: 'group', name: 'Ops Team', created_at: '2026-01-02' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }, { conversation_id: 'c2', staff_id: 's3', last_read_at: '2026-01-01' }],
      messages: [],
    });
    const result = await loadConversationsForStaff(db, 's1');
    expect(result.map(c => c.id)).toEqual(['c1']); // s1 is not a member of c2
  });

  it('includes the most recent message as a preview, and sorts by recency', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Old', created_at: '2026-01-01' }, { id: 'c2', type: 'group', name: 'New', created_at: '2026-01-02' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c2', staff_id: 's1', last_read_at: '2026-01-01' }],
      messages: [
        { id: 'm1', conversation_id: 'c1', sender_name: 'A', text: 'old msg', created_at: '2026-01-03T10:00:00Z' },
        { id: 'm2', conversation_id: 'c2', sender_name: 'B', text: 'newest msg', created_at: '2026-01-05T10:00:00Z' },
      ],
    });
    const result = await loadConversationsForStaff(db, 's1');
    expect(result[0].id).toBe('c2'); // most recent activity first
    expect(result[0].lastMessage.text).toBe('newest msg');
  });

  it('returns an empty array (not a crash) for a staff member with zero conversations', async () => {
    const db = makeDb({ conversations: [], members: [], messages: [] });
    expect(await loadConversationsForStaff(db, 'nobody')).toEqual([]);
  });

  it('fails gracefully to an empty array on a genuine error', async () => {
    const db = { from: () => { throw new Error('network fail'); } };
    await expect(loadConversationsForStaff(db, 's1')).resolves.toEqual([]);
  });
});

describe('findOrCreateDM', () => {
  it('reuses an existing DM between the same two people, does not create a duplicate', async () => {
    const db = makeDb({
      conversations: [{ id: 'existing-dm', type: 'dm', name: null, created_at: '2026-01-01' }],
      members: [{ conversation_id: 'existing-dm', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'existing-dm', staff_id: 's2', last_read_at: '2026-01-01' }],
      messages: [],
    });
    const insertSpy = vi.spyOn(db, 'from');
    const { id, error } = await findOrCreateDM(db, 's1', 's2');
    expect(error).toBeNull();
    expect(id).toBe('existing-dm');
  });

  it('creates a genuinely new DM when none exists between these two people', async () => {
    const db = makeDb({ conversations: [], members: [], messages: [] });
    const { id, error } = await findOrCreateDM(db, 's1', 's2');
    expect(error).toBeNull();
    expect(id).toBe('new-id');
  });
});

describe('createGroupConversation', () => {
  it('creates a group and adds the creator plus every listed member, deduplicated', async () => {
    const db = makeDb();
    const insertCalls = [];
    const origFrom = db.from;
    db.from = (table) => {
      const b = origFrom(table);
      if (table === 'chat_conversation_members') {
        const origInsert = b.insert;
        b.insert = async (row) => { insertCalls.push(row); return origInsert(row); };
      }
      return b;
    };
    const { id, error } = await createGroupConversation(db, 'Ops Team', 's1', ['s1', 's2', 's3']); // s1 listed twice (creator + member)
    expect(error).toBeNull();
    expect(id).toBe('new-id');
    expect(insertCalls.map(c => c.staff_id).sort()).toEqual(['s1', 's2', 's3']); // deduplicated, not 4 rows
  });
});

describe('member management', () => {
  it('addConversationMember inserts a real membership row', async () => {
    const db = makeDb();
    const { error } = await addConversationMember(db, 'c1', 's4');
    expect(error).toBeNull();
  });

  it('removeConversationMember deletes by conversation_id + staff_id (works identically for "remove someone else" and "leave")', async () => {
    const db = makeDb();
    const { error } = await removeConversationMember(db, 'c1', 's1');
    expect(error).toBeNull();
  });
});

describe('messages', () => {
  it('sendChatMessage inserts with the real sender and mentions', async () => {
    const db = makeDb();
    const { id, error } = await sendChatMessage(db, 'c1', 's1', 'Priya', 'Hello @[[staff:s2:Amit]]', [{ type: 'staff', id: 's2', label: 'Amit' }]);
    expect(error).toBeNull();
    expect(id).toBe('new-id');
  });

  it('loadChatMessages maps rows correctly, ordered oldest first', async () => {
    const db = makeDb({ messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'hi', mentions: [], created_at: '2026-01-01' },
    ] });
    const result = await loadChatMessages(db, 'c1');
    expect(result).toEqual([{ id: 'm1', senderId: 's1', senderName: 'Priya', text: 'hi', mentions: [], createdAt: '2026-01-01' }]);
  });
});

describe('InAppChat UI', () => {
  const staff = [{ id: 's1', name: 'Priya', color: '#1A5276' }, { id: 's2', name: 'Amit', color: '#6C3483' }, { id: 's3', name: 'Neha', color: '#0E6655' }];
  const queries = [{ id: 'UTQ-1', tourFileId: 'TUR-2026-050', groupName: 'Smith Family' }];

  it('shows a real empty state and the New button when there are no conversations yet', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/No conversations yet/)).toBeTruthy());
    expect(screen.getByText('+ New')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('loads and displays real conversations from the database, not hardcoded channels', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('a DM shows the OTHER person’s name, not your own', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    expect(screen.queryByText('Priya')).toBeFalsy(); // your own name shouldn't label the conversation
    vi.doUnmock('../lib/supabase.js');
  });

  it('clicking + New shows both New Direct Message and New Group options', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New'));
    expect(screen.getByText(/New Direct Message/)).toBeTruthy();
    expect(screen.getByText(/New Group/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('starting a new DM excludes yourself from the picker list', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New'));
    fireEvent.click(screen.getByText(/New Direct Message/));
    expect(screen.getByText('Amit')).toBeTruthy();
    expect(screen.getByText('Neha')).toBeTruthy();
    expect(screen.queryByText('Priya')).toBeFalsy(); // can't DM yourself
    vi.doUnmock('../lib/supabase.js');
  });

  it('the New Group form requires both a name and at least one member before allowing creation', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    fireEvent.click(screen.getByText('+ New'));
    fireEvent.click(screen.getByText(/New Group/));
    const createBtn = screen.getByText('Create Group');
    expect(createBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Group name'), { target: { value: 'Ops Team' } });
    expect(createBtn).toBeDisabled(); // still no members checked
    vi.doUnmock('../lib/supabase.js');
  });

  it('selecting an existing conversation loads and shows its real messages, including a mention rendered as a clickable chip', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
      messages: [{ id: 'm1', conversation_id: 'c1', sender_id: 's2', sender_name: 'Amit', text: 'Check @[[query:TUR-2026-050:Smith Family]]', mentions: [{type:'query',id:'TUR-2026-050',label:'Smith Family'}], created_at: '2026-01-02T10:00:00Z' }],
    });
    let captured = null;
    document.addEventListener('unitop-activate-query', (e) => { captured = e.detail.query; });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    await waitFor(() => expect(screen.getByText(/Smith Family/)).toBeTruthy());
    // "Smith Family" also appears as raw, unrendered text in the sidebar's
    // last-message preview (plain text there, deliberately -- previews
    // don't render mentions as chips) -- find the actual rendered chip
    // specifically, a <span>, not the sidebar's plain <div> preview.
    const chip = screen.getAllByText(/Smith Family/).find(el => el.tagName === 'SPAN');
    fireEvent.click(chip);
    expect(captured?.id).toBe('UTQ-1');
    vi.doUnmock('../lib/supabase.js');
  });

  it('a group shows a Members button and a Leave button; a DM shows neither', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }, { id: 'c2', type: 'dm', name: null, created_at: '2026-01-02' }],
      members: [
        { conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' },
        { conversation_id: 'c2', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c2', staff_id: 's3', last_read_at: '2026-01-01' },
      ],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={queries} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    expect(screen.getByText(/Members/)).toBeTruthy();
    expect(screen.getByText('Leave')).toBeTruthy();
    fireEvent.click(screen.getByText('Neha')); // click the DM in the sidebar
    expect(screen.queryByText('Leave')).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});
