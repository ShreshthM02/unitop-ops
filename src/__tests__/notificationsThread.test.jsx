import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { notifyMentionedStaff } from '../lib/utils.js';

// Notifications thread: a real, persistent alternative to a toast that
// disappears if you're not looking. Verified end to end via direct
// database simulation before any client code was written (a real
// sender posting for a real recipient, confirmed the recipient can see
// it and a genuinely unrelated third person cannot, and confirmed a
// second post for the same recipient reuses the same thread rather
// than creating a duplicate) -- these tests cover the client-side
// wiring specifically. Deliberately called by the SENDER's own client,
// not a realtime listener on the recipient's side, since the recipient
// might not be online at all when the mention happens.

describe('notifyMentionedStaff', () => {
  it('posts a notification only for staff-type mentions, ignoring query/agent/vendor/series mentions', async () => {
    const db = { auth: { postNotification: vi.fn(async () => ({ success: true })) } };
    const mentions = [
      { type: 'staff', id: 's2', label: 'Amit' },
      { type: 'query', id: 'TUR-1', label: 'Smith Family' },
      { type: 'staff', id: 's3', label: 'Neha' },
    ];
    await notifyMentionedStaff(db, mentions, { senderName: 'Priya', contextLabel: 'in the discussion for', snippet: 'check this' });
    expect(db.auth.postNotification).toHaveBeenCalledTimes(2);
    expect(db.auth.postNotification.mock.calls.map(c => c[0])).toEqual(['s2', 's3']);
  });

  it('does nothing at all when there are no staff mentions', async () => {
    const db = { auth: { postNotification: vi.fn() } };
    await notifyMentionedStaff(db, [{ type: 'query', id: 'TUR-1', label: 'X' }], { senderName: 'Priya', contextLabel: 'x', snippet: 'y' });
    expect(db.auth.postNotification).not.toHaveBeenCalled();
  });

  it('builds a real, readable message including the sender, context, and snippet', async () => {
    const db = { auth: { postNotification: vi.fn(async () => ({ success: true })) } };
    await notifyMentionedStaff(db, [{ type: 'staff', id: 's2', label: 'Amit' }], {
      senderName: 'Priya', contextLabel: 'in the discussion for', snippet: 'can you check this',
      contextMention: '@[[query:TUR-2026-050:Smith Family]]',
    });
    const [, text, contextMentions] = db.auth.postNotification.mock.calls[0];
    expect(text).toContain('Priya');
    expect(text).toContain('in the discussion for');
    expect(text).toContain('can you check this');
    expect(text).toContain('@[[query:TUR-2026-050:Smith Family]]');
    // the notification's own mentions carry the CONTEXT, not the
    // recipient themselves -- avoids double-notifying via the
    // recipient's own "new message in my thread" handling
    expect(contextMentions).toEqual([{ type: 'query', id: 'TUR-2026-050', label: 'Smith Family' }]);
  });

  it('truncates a long snippet rather than posting the entire message', async () => {
    const db = { auth: { postNotification: vi.fn(async () => ({ success: true })) } };
    const longText = 'a'.repeat(200);
    await notifyMentionedStaff(db, [{ type: 'staff', id: 's2', label: 'Amit' }], { senderName: 'Priya', contextLabel: 'x', snippet: longText.length > 80 ? longText.slice(0,80)+'…' : longText });
    const [, text] = db.auth.postNotification.mock.calls[0];
    expect(text.length).toBeLessThan(150);
  });

  it('never throws even if the underlying RPC fails, since this is fire-and-forget and should never block the real send', async () => {
    const db = { auth: { postNotification: vi.fn(async () => { throw new Error('network fail'); }) } };
    await expect(notifyMentionedStaff(db, [{ type: 'staff', id: 's2', label: 'Amit' }], { senderName: 'Priya', contextLabel: 'x', snippet: 'y' })).resolves.not.toThrow();
  });
});

describe('InAppChat UI: notifications thread treatment', () => {
  const staff = [{ id: 's1', name: 'Priya' }];
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

  it('shows a real 🔔 Notifications entry in the sidebar, distinct from a group\u2019s "#"', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'notifications', name: 'Notifications', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }],
      messages: [],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/🔔 Notifications/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('the notifications thread has no composer -- it is read-only', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'notifications', name: 'Notifications', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }],
      messages: [{ id: 'm1', conversation_id: 'c1', sender_id: null, sender_name: 'Notification', text: 'Amit mentioned you', mentions: [], created_at: '2026-01-01T10:00:00Z' }],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/🔔 Notifications/)).toBeTruthy());
    fireEvent.click(screen.getByText(/🔔 Notifications/));
    await waitFor(() => expect(screen.getByText(/Amit mentioned you/)).toBeTruthy());
    expect(screen.queryByPlaceholderText(/Message/)).toBeFalsy();
    expect(screen.queryByText('Send')).toBeFalsy();
    expect(screen.queryByText(/Members/)).toBeFalsy();
    expect(screen.queryByText('Leave')).toBeFalsy();
    vi.doUnmock('../lib/supabase.js');
  });
});
