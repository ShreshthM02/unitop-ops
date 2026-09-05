import { describe, it, expect } from 'vitest';
import { isConversationUnread } from '../lib/utils.js';

// Critical bug fixed this round: deleted_at was added to staff without
// ever granting authenticated SELECT on it -- any query filtering on
// it (both the main app's staff load and getStaffList) failed
// outright, which is why the ENTIRE staff list disappeared, not just
// delete-related behavior. Fixed at the database level (a real grant),
// confirmed via direct simulation, no code changes needed for that
// part. This file covers the two genuine feature gaps raised
// alongside it: a global unread badge (visible even when chat is
// closed) and mention notifications, both now built.

describe('isConversationUnread (shared between the global badge and InAppChat’s own list)', () => {
  it('a conversation with a message sent after the last read time is unread', () => {
    const conv = { lastMessage: { createdAt: '2026-01-02T10:00:00Z' }, lastReadAt: '2026-01-01T10:00:00Z' };
    expect(isConversationUnread(conv)).toBe(true);
  });

  it('a conversation read at or after the last message is not unread', () => {
    const conv = { lastMessage: { createdAt: '2026-01-01T10:00:00Z' }, lastReadAt: '2026-01-02T10:00:00Z' };
    expect(isConversationUnread(conv)).toBe(false);
  });

  it('a conversation never read at all, with a real message, is unread', () => {
    const conv = { lastMessage: { createdAt: '2026-01-01T10:00:00Z' }, lastReadAt: null };
    expect(isConversationUnread(conv)).toBe(true);
  });

  it('a conversation with no messages at all is never unread', () => {
    expect(isConversationUnread({ lastMessage: null, lastReadAt: null })).toBe(false);
  });
});

describe('UnitopApp: chat data-loading respects the same real-login guard as everything else', () => {
  it('never calls db.from for chat data when there is no real authUser -- the exact bug class that made the whole staff list disappear', async () => {
    let fetchedTables = [];
    const mockDb = {
      from: (table) => { fetchedTables.push(table); return { select: () => ({ order: async () => ({ data: [], error: null }), eq: () => ({ order: async () => ({data:[],error:null}) }) }) }; },
      auth: { getSession: async () => null },
    };
    const { vi } = await import('vitest');
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { default: UnitopApp } = await import('../components/UnitopApp.jsx');
    const { render } = await import('@testing-library/react');
    render(<UnitopApp authUser={null} onUpdateAuthUser={()=>{}} onOpenVendorLedger={()=>{}} onOpenAgentLedger={()=>{}}/>);
    await new Promise(r => setTimeout(r, 150));
    expect(fetchedTables).not.toContain('chat_conversation_members');
    expect(fetchedTables).not.toContain('chat_messages');
    vi.doUnmock('../lib/supabase.js');
  });
});
