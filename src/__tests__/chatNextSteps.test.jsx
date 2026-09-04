import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  setConversationMemberAdmin, editChatMessage, deleteChatMessage, createGroupConversation, loadChatMessages,
} from '../lib/utils.js';

// Chat "next steps": group owner/admin role, message edit/delete, read
// receipts, timestamps, search within chat. The admin-role and edit/
// delete RLS itself was verified separately via direct database
// simulation (including catching a real bug: the original message RLS
// let ANY member edit/delete ANYONE's message, tightened to
// sender-only before this ever reached the UI) -- these tests cover
// the client-side wiring specifically.

function makeDb({ conversations = [], members = [], messages = [] } = {}) {
  const upsertCalls = [];
  const db = {
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
        upsert: async (row) => { upsertCalls.push({ table, row }); return { error: null }; },
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        then: (res) => res(resolve()),
      };
      return builder;
    },
  };
  db._upsertCalls = upsertCalls;
  return db;
}

describe('createGroupConversation: creator becomes the first admin', () => {
  it('the creator\u2019s membership row is inserted with is_admin true, others false', async () => {
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
    await createGroupConversation(db, 'Ops Team', 's1', ['s1', 's2']);
    const creatorRow = insertCalls.find(r => r.staff_id === 's1');
    const memberRow = insertCalls.find(r => r.staff_id === 's2');
    expect(creatorRow.is_admin).toBe(true);
    expect(memberRow.is_admin).toBe(false);
  });
});

describe('setConversationMemberAdmin', () => {
  it('upserts the real is_admin value for the real member', async () => {
    const db = makeDb();
    await setConversationMemberAdmin(db, 'c1', 's2', true);
    expect(db._upsertCalls[0]).toMatchObject({ table: 'chat_conversation_members', row: { conversation_id: 'c1', staff_id: 's2', is_admin: true } });
  });
});

describe('editChatMessage / deleteChatMessage', () => {
  it('edit sets real text, mentions, and edited_at', async () => {
    const db = makeDb();
    const { error } = await editChatMessage(db, 'm1', 'updated text', [{ type: 'staff', id: 's2', label: 'Amit' }]);
    expect(error).toBeNull();
    expect(db._upsertCalls[0].row).toMatchObject({ id: 'm1', text: 'updated text' });
    expect(db._upsertCalls[0].row.edited_at).toBeTruthy();
  });

  it('delete sets deleted_at, a real soft delete', async () => {
    const db = makeDb();
    const { error } = await deleteChatMessage(db, 'm1');
    expect(error).toBeNull();
    expect(db._upsertCalls[0].row.deleted_at).toBeTruthy();
  });
});

describe('loadChatMessages carries edit/delete state through', () => {
  it('maps edited_at and deleted_at correctly', async () => {
    const db = makeDb({ messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'hi', mentions: [], created_at: '2026-01-01', edited_at: '2026-01-02', deleted_at: null },
      { id: 'm2', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'gone', mentions: [], created_at: '2026-01-03', edited_at: null, deleted_at: '2026-01-04' },
    ] });
    const result = await loadChatMessages(db, 'c1');
    expect(result[0].editedAt).toBe('2026-01-02');
    expect(result[1].deletedAt).toBe('2026-01-04');
  });
});

describe('InAppChat UI: group admin role', () => {
  const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }, { id: 's3', name: 'Neha' }];

  it('an admin sees Remove and Make/Remove admin controls on other members; a non-admin does not', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [
        { conversation_id: 'c1', staff_id: 's1', is_admin: true, last_read_at: '2026-01-01' },
        { conversation_id: 'c1', staff_id: 's2', is_admin: false, last_read_at: '2026-01-01' },
      ],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    fireEvent.click(screen.getByText(/Members/));
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    expect(screen.getByText('Make admin')).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a non-admin member sees no Remove/Make admin controls at all', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [
        { conversation_id: 'c1', staff_id: 's1', is_admin: true, last_read_at: '2026-01-01' },
        { conversation_id: 'c1', staff_id: 's2', is_admin: false, last_read_at: '2026-01-01' },
      ],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s2',name:'Amit'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    fireEvent.click(screen.getByText(/Members/));
    await waitFor(() => expect(screen.getByText('Priya')).toBeTruthy());
    expect(screen.queryByText('Remove')).toBeFalsy();
    expect(screen.queryByText('Make admin')).toBeFalsy();
    expect(screen.queryByText('Remove admin')).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a real admin badge shows next to admin members', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', is_admin: true, last_read_at: '2026-01-01' }],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    fireEvent.click(screen.getByText(/Members/));
    await waitFor(() => expect(screen.getByText('Admin')).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('InAppChat UI: message edit/delete', () => {
  const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }];
  const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
  const members = [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }];

  it('shows Edit/Delete controls only on your own messages, not the other person\u2019s', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'my message', mentions: [], created_at: '2026-01-01T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', sender_id: 's2', sender_name: 'Amit', text: 'their message', mentions: [], created_at: '2026-01-01T10:01:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('my message')).toBeTruthy());
    const editIcons = screen.getAllByTitle('Edit');
    expect(editIcons).toHaveLength(1); // only my own message
    vi.doUnmock('../lib/supabase.js');
  });

  it('editing a message updates it immediately (optimistic) and shows an (edited) marker', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'original', mentions: [], created_at: '2026-01-01T10:00:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('original')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Edit'));
    const textarea = screen.getByDisplayValue('original');
    fireEvent.change(textarea, { target: { value: 'corrected text' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText(/corrected text/)).toBeTruthy());
    expect(screen.getByText('(edited)')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('deleting a message shows the real placeholder, not the original text', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'to be deleted', mentions: [], created_at: '2026-01-01T10:00:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('to be deleted')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('This message was deleted')).toBeTruthy());
    expect(screen.queryByText('to be deleted')).toBeFalsy();
    confirmSpy.mockRestore();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('InAppChat UI: timestamps on every message', () => {
  it('each message shows its own send time, not just the first in a run', async () => {
    const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
    const members = [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }];
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'first', mentions: [], created_at: '2026-01-01T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'second', mentions: [], created_at: '2026-01-01T10:05:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={[{id:'s1',name:'Priya'},{id:'s2',name:'Amit'}]} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('first')).toBeTruthy());
    // both messages (same sender, consecutive) each carry their own
    // timestamp span now, not just the first
    const timeEls = document.querySelectorAll('[style*="color: rgb(156, 163, 175)"]');
    expect(screen.getByText('second')).toBeTruthy(); // both real, distinct messages rendered
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('InAppChat UI: search within chat', () => {
  const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }];
  const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
  const members = [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }];

  it('filters messages to only those matching the search text', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'lets talk about the tour file', mentions: [], created_at: '2026-01-01T10:00:00Z' },
      { id: 'm2', conversation_id: 'c1', sender_id: 's2', sender_name: 'Amit', text: 'sounds good', mentions: [], created_at: '2026-01-01T10:01:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getAllByText(/lets talk/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText('🔍'));
    fireEvent.change(screen.getByPlaceholderText(/Search in this conversation/), { target: { value: 'tour file' } });
    await waitFor(() => expect(screen.queryByText(/sounds good/)).toBeFalsy());
    expect(screen.getAllByText(/lets talk/).length).toBeGreaterThan(0);
    vi.doUnmock('../lib/supabase.js');
  });

  it('search never surfaces a deleted message\u2019s original text', async () => {
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'secret plan', mentions: [], created_at: '2026-01-01T10:00:00Z', deleted_at: '2026-01-01T10:02:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('This message was deleted')).toBeTruthy());
    fireEvent.click(screen.getByText('🔍'));
    fireEvent.change(screen.getByPlaceholderText(/Search in this conversation/), { target: { value: 'secret' } });
    await waitFor(() => expect(screen.getByText(/No messages match/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('InAppChat UI: read receipts', () => {
  it('shows "Seen by X" when another member has read at or after the last message', async () => {
    const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
    const members = [
      { conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01T09:00:00Z' },
      { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01T10:10:00Z' }, // read AFTER the message
    ];
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'hello', mentions: [], created_at: '2026-01-01T10:00:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={[{id:'s1',name:'Priya'},{id:'s2',name:'Amit'}]} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText(/Seen by Amit/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows nothing when the other member has not read it yet', async () => {
    const conv = { id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' };
    const members = [
      { conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01T09:00:00Z' },
      { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01T09:30:00Z' }, // read BEFORE the message
    ];
    const db = makeDb({ conversations: [conv], members, messages: [
      { id: 'm1', conversation_id: 'c1', sender_id: 's1', sender_name: 'Priya', text: 'hello', mentions: [], created_at: '2026-01-01T10:00:00Z' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={[{id:'s1',name:'Priya'},{id:'s2',name:'Amit'}]} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    await waitFor(() => expect(screen.getByText('hello')).toBeTruthy());
    expect(screen.queryByText(/Seen by/)).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});
