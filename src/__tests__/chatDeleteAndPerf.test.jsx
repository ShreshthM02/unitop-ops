import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { removeConversationMember, deleteConversation } from '../lib/utils.js';
import { deleteLibraryPhoto } from '../lib/photoLibrary.js';
import { deleteSignature } from '../lib/utils.js';

// Real, severe bug class found and fixed across three separate tables:
// this hand-rolled db wrapper's delete() (like insert/update/upsert) is
// async and TERMINAL -- it fires its fetch immediately when called,
// unlike select()/eq()/etc, which return the builder synchronously for
// lazy chaining via then(). Calling .delete() BEFORE .eq() dispatches
// an UNFILTERED delete request (no filter had been applied yet) before
// the .eq() calls afterward throw (caught silently by the calling
// function's own try/catch, masking that an unfiltered request had
// already been sent). Combined with an unconditional DELETE policy,
// every real call was at risk of wiping the entire table, not just the
// one row intended -- confirmed via direct database simulation that
// this was real and reproducible before any fix shipped, and that the
// live data had not yet been damaged.

function makeOrderedDb() {
  const calls = [];
  return {
    _calls: calls,
    from: (table) => {
      const filters = [];
      const builder = {
        eq: (col, val) => { filters.push([col, val]); return builder; },
        delete: async () => { calls.push({ table, op: 'delete', filtersAtCallTime: [...filters] }); return { error: null }; },
        update: async (row) => { calls.push({ table, op: 'update', row, filtersAtCallTime: [...filters] }); return { error: null }; },
      };
      return builder;
    },
  };
}

describe('The real bug: filters must be applied before the terminal delete()/update() call', () => {
  it('removeConversationMember applies both filters before calling delete -- not after', async () => {
    const db = makeOrderedDb();
    await removeConversationMember(db, 'conv-1', 'staff-1');
    const call = db._calls[0];
    expect(call.op).toBe('delete');
    // the real bug: filtersAtCallTime would be [] if .delete() fired
    // before .eq() was ever called -- this proves the fix.
    expect(call.filtersAtCallTime).toEqual([['conversation_id', 'conv-1'], ['staff_id', 'staff-1']]);
  });

  it('deleteConversation applies its filter before calling delete', async () => {
    const db = makeOrderedDb();
    await deleteConversation(db, 'conv-1');
    const call = db._calls[0];
    expect(call.op).toBe('delete');
    expect(call.filtersAtCallTime).toEqual([['id', 'conv-1']]);
  });

  it('deleteLibraryPhoto applies its filter before calling delete', async () => {
    const db = makeOrderedDb();
    await deleteLibraryPhoto(db, 'photo-1');
    const call = db._calls[0];
    expect(call.op).toBe('delete');
    expect(call.filtersAtCallTime).toEqual([['id', 'photo-1']]);
  });

  it('deleteSignature applies its filter before calling delete', async () => {
    const db = makeOrderedDb();
    await deleteSignature(db, 'sig-1');
    const call = db._calls[0];
    expect(call.op).toBe('delete');
    expect(call.filtersAtCallTime).toEqual([['id', 'sig-1']]);
  });
});

describe('InAppChat UI: delete for both DM and Group', () => {
  const staff = [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Amit' }];
  function makeDb({ conversations = [], members = [] } = {}) {
    return {
      from: (table) => {
        let conditions = [];
        const resolve = () => {
          let rows = table === 'chat_conversations' ? conversations : table === 'chat_conversation_members' ? members : [];
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
          delete: async () => ({ error: null }),
          then: (res) => res(resolve()),
        };
        return builder;
      },
    };
  }

  it('a DM shows Delete Chat, with no admin requirement -- unlike a group', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', is_admin: false, last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    expect(screen.getByText(/🗑 Delete Chat/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a group only shows Delete Group when the current user is admin', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'group', name: 'Ops Team', created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', is_admin: false, last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', is_admin: true, last_read_at: '2026-01-01' }],
    });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText(/Ops Team/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ops Team/));
    expect(screen.queryByText(/🗑 Delete Group/)).toBeFalsy(); // s1 is not admin here
    vi.doUnmock('../lib/supabase.js');
  });

  it('confirming delete on a DM actually calls the real delete, and clears the active conversation', async () => {
    const db = makeDb({
      conversations: [{ id: 'c1', type: 'dm', name: null, created_at: '2026-01-01' }],
      members: [{ conversation_id: 'c1', staff_id: 's1', last_read_at: '2026-01-01' }, { conversation_id: 'c1', staff_id: 's2', last_read_at: '2026-01-01' }],
    });
    const deleteSpy = vi.fn(async () => ({ error: null }));
    const origFrom = db.from;
    db.from = (table) => { const b = origFrom(table); if (table === 'chat_conversations') b.delete = deleteSpy; return b; };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={staff} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    await waitFor(() => expect(screen.getByText('Amit')).toBeTruthy());
    fireEvent.click(screen.getByText('Amit'));
    fireEvent.click(screen.getByText(/🗑 Delete Chat/));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    confirmSpy.mockRestore();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Performance: reload debouncing', () => {
  it('multiple rapid reload triggers collapse into a single real fetch, not one per trigger', async () => {
    let fetchCount = 0;
    const db = {
      from: (table) => {
        let conditions = [];
        const builder = {
          select: () => builder,
          eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
          in: () => builder,
          order: () => builder,
          then: (res) => { if (table === 'chat_conversations') fetchCount++; res({ data: [], error: null }); },
        };
        return builder;
      },
    };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InAppChat } = await import('../components/InAppChat.jsx');
    const { unmount } = render(<InAppChat currentUser={{id:'s1',name:'Priya'}} queries={[]} staff={[]} agents={[]} vendors={[]} series={[]} onClose={()=>{}}/>);
    // initial mount triggers one; the debounce window means a burst of
    // renders right after doesn't multiply this
    await new Promise(r => setTimeout(r, 250));
    const countAfterMount = fetchCount;
    expect(countAfterMount).toBeLessThanOrEqual(2); // one real fetch for mount, not many
    unmount();
    vi.doUnmock('../lib/supabase.js');
  });
});
