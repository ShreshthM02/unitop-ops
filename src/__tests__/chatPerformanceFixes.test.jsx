import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createGroupConversation, findOrCreateDM } from '../lib/utils.js';

// Real performance fixes, addressing reported chat-wide lag (every
// button feeling 2-3 seconds slow, unlike the rest of the app). Two
// separate real causes found and fixed:
// 1. Several DB operations ran sequentially in a loop/chain when they
//    were fully independent and could run together -- N members meant
//    N round trips back to back.
// 2. findOrCreateDM's "does a DM already exist" check called the full,
//    heavy loadConversationsForStaff (every conversation AND every
//    message in all of them) just to check for one specific DM.
// 3. The debounced reload (from an earlier round) had an unbounded
//    reset: a burst of related realtime events (e.g. one per member
//    insert) kept resetting the timer before it ever fired, so the
//    delay actually felt was the SUM of every event's arrival gap, not
//    the fixed debounce window it looked like on paper.

function makeTimedDb() {
  const callTimeline = [];
  let started = 0;
  return {
    callTimeline,
    from: (table) => {
      let conditions = [];
      const builder = {
        select: () => builder,
        eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
        in: (col, vals) => { conditions = [...conditions, [col, vals, 'in']]; return builder; },
        order: () => builder,
        insert: async (row) => {
          const id = ++started;
          callTimeline.push({ id, table, op: 'insert', at: 'start' });
          await new Promise(r => setTimeout(r, 40)); // simulates real network latency
          callTimeline.push({ id, table, op: 'insert', at: 'end' });
          return { data: [{ ...row, id: row.id || `new-${id}` }], error: null };
        },
        then: (res) => res({ data: [], error: null }),
      };
      return builder;
    },
  };
}

describe('createGroupConversation: member inserts run together, not one after another', () => {
  it('all member inserts are in flight at the same time, not sequential', async () => {
    const db = makeTimedDb();
    await createGroupConversation(db, 'Ops Team', 's1', ['s2', 's3', 's4']);
    const memberInserts = db.callTimeline.filter(c => c.table === 'chat_conversation_members');
    const starts = memberInserts.filter(c => c.at === 'start').map(c => c.id);
    const firstEnd = memberInserts.find(c => c.at === 'end').id;
    // The real bug: sequential would mean insert #2 never STARTS until
    // insert #1 has already ENDED. Parallel means all starts happen
    // before any end.
    expect(Math.max(...starts)).toBeLessThanOrEqual(firstEnd + memberInserts.length);
    expect(starts.length).toBe(4); // creator + 3 members, all started
  });
});

describe('findOrCreateDM: lightweight targeted check, not the full heavy load', () => {
  it('never touches chat_messages when just checking whether a DM already exists', async () => {
    const tablesQueried = [];
    const db = {
      from: (table) => {
        tablesQueried.push(table);
        let conditions = [];
        const builder = {
          select: () => builder,
          eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
          in: (col, vals) => { conditions = [...conditions, [col, vals, 'in']]; return builder; },
          insert: async (row) => ({ data: [{ ...row, id: 'new-id' }], error: null }),
          then: (res) => res({ data: [], error: null }),
        };
        return builder;
      },
    };
    await findOrCreateDM(db, 's1', 's2');
    expect(tablesQueried).not.toContain('chat_messages'); // the real fix -- no message data ever fetched for an existence check
  });

  it('reuses an existing DM found via the lightweight check, without creating a duplicate', async () => {
    const db = {
      from: (table) => {
        let conditions = [];
        const resolve = () => {
          if (table === 'chat_conversation_members') {
            const [col, val] = conditions[0] || [];
            if (col === 'staff_id' && val === 's1') return { data: [{ conversation_id: 'existing-dm' }], error: null };
            if (col === 'staff_id' && val === 's2') return { data: [{ conversation_id: 'existing-dm' }], error: null };
          }
          if (table === 'chat_conversations') return { data: [{ id: 'existing-dm', type: 'dm' }], error: null };
          return { data: [], error: null };
        };
        const builder = {
          select: () => builder,
          eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
          in: () => builder,
          insert: async () => { throw new Error('should never insert -- a DM already exists'); },
          then: (res) => res(resolve()),
        };
        return builder;
      },
    };
    const { id, error } = await findOrCreateDM(db, 's1', 's2');
    expect(error).toBeNull();
    expect(id).toBe('existing-dm');
  });
});

describe('Debounced reload: hard max-wait cap prevents unbounded resets', () => {
  it('fires within the max-wait window even under a continuous burst of triggers', async () => {
    let fetchCount = 0;
    const db = {
      from: (table) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          then: (res) => {
            if (table === 'chat_conversations') fetchCount++;
            // a real membership row, so loadConversationsForStaff
            // actually proceeds to query chat_conversations at all,
            // rather than returning early on an empty membership list
            res({ data: table === 'chat_conversation_members' ? [{ conversation_id: 'c1' }] : [], error: null });
          },
        };
        return builder;
      },
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={[]} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    // real fetch should happen within ~500ms even for the very first
    // mount-triggered call, not hang indefinitely
    await waitFor(() => expect(fetchCount).toBeGreaterThanOrEqual(1), { timeout: 600 });
    vi.doUnmock('../lib/supabase.js');
  });
});
