import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { discussionUnread, fleetDue, tabTitle } from '../lib/alerts.js';
import { isConversationUnread } from '../lib/utils.js';
import NotificationBell from '../components/NotificationBell.jsx';

const T1 = '2026-10-18T10:00:00Z', T2 = '2026-10-18T12:00:00Z';
const q = (extra = {}) => ({ id: 'Q1', assignedTo: 'me', remarks: [{ id: 1, byStaffId: 'other', createdAt: T1, text: 'hi', mentions: [] }], ...extra });

describe('discussion unread (per person)', () => {
  it('counts messages from others after your last read, never your own', () => {
    expect(discussionUnread([q()], {}, 'me')).toHaveLength(1);
    expect(discussionUnread([q()], { Q1: T2 }, 'me')).toHaveLength(0);
    expect(discussionUnread([q({ remarks: [{ id: 1, byStaffId: 'me', createdAt: T1, mentions: [] }] })], {}, 'me')).toHaveLength(0);
  });
  it('ignores threads you are not involved in, unless mentioned', () => {
    expect(discussionUnread([q({ assignedTo: 'x' })], {}, 'me')).toHaveLength(0);
    const m = q({ assignedTo: 'x', remarks: [{ id: 1, byStaffId: 'other', createdAt: T1, mentions: [{ type: 'staff', id: 'me' }] }] });
    const r = discussionUnread([m], {}, 'me'); expect(r).toHaveLength(1); expect(r[0].mentioned).toBe(true);
  });
  it('old history never counts', () => {
    expect(discussionUnread([q({ remarks: [{ id: 1, byStaffId: 'other', createdAt: '2026-09-01T00:00:00Z', mentions: [] }] })], {}, 'me')).toHaveLength(0);
  });
  it('two people have independent counts', () => {
    const qs = [q()];
    expect(discussionUnread(qs, { Q1: T2 }, 'me')).toHaveLength(0);
    expect(discussionUnread(qs, {}, 'me')).toHaveLength(1);
  });
});

describe('chat unread and fleet due', () => {
  it('own last message is not unread to you', () => {
    const c = { lastMessage: { senderId: 'me', createdAt: T2 }, lastReadAt: T1 };
    expect(isConversationUnread(c, 'me')).toBe(false);
    expect(isConversationUnread(c, 'other')).toBe(true);
  });
  it('fleet alert is due from the reminder date until turned off', () => {
    const docs = [{ id: 1, reminder_date: '2026-10-18' }, { id: 2, reminder_date: '2026-10-25' }, { id: 3, reminder_date: '2026-10-01', reminder_off: true }, { id: 4 }];
    expect(fleetDue(docs, '2026-10-18').map(d => d.id)).toEqual([1]);
    expect(fleetDue(docs, '2026-10-30').map(d => d.id)).toEqual([1, 2]);
  });
  it('tab title carries the count', () => {
    expect(tabTitle('App', 0)).toBe('App'); expect(tabTitle('App', 3)).toBe('(3) App'); expect(tabTitle('App', 150)).toBe('(99+) App');
  });
});

describe('NotificationBell', () => {
  it('shows a total, lists each kind and opens the item', () => {
    let opened = null;
    render(<NotificationBell chats={[{ id: 'c1', label: 'Priya', lastMessage: { text: 'ping' } }]} discussions={[{ query: { id: 'Q1', tourFileId: 'TF-1' }, count: 2, mentioned: true }]}
      fleet={[{ id: 'd1', vehicle_id: 'v1', file_name: 'Insurance.pdf', reminder_date: '2026-10-18' }]} vehicleNames={{ v1: 'Bus 1' }} onOpenQuery={q => { opened = q; }} />);
    expect(screen.getByTestId('bell-count').textContent).toBe('3');
    fireEvent.click(screen.getByLabelText(/Notifications/));
    expect(screen.getByText(/Bus 1 — Insurance.pdf/)).toBeTruthy();
    fireEvent.click(screen.getByText(/TF-1/));
    expect(opened.id).toBe('Q1');
  });
});
