// Alerts shared by the top-bar bell, the sidebar and the browser tab title.
// Everything here is computed from the signed-in person's OWN read state, so
// counts are never shared between users.

// Discussion messages older than this never count as unread (stops every old
// thread lighting up the day the feature ships).
export const DISCUSSION_UNREAD_SINCE = "2026-10-18T00:00:00Z";

export async function loadDiscussionReads(db, staffId) {
  try {
    const { data } = await db.from("discussion_reads").select("*").eq("staff_id", staffId);
    const m = {};
    (data || []).forEach(r => { m[r.query_id] = r.last_read_at; });
    return m;
  } catch (e) { return {}; }
}
export async function markDiscussionRead(db, staffId, queryId) {
  try { await db.from("discussion_reads").upsert({ staff_id: staffId, query_id: queryId, last_read_at: new Date().toISOString() }); }
  catch (e) { /* best effort */ }
}

// Threads with messages from others that this person has not seen. A thread
// counts only if the person is involved: assigned/reviewer, has posted, was
// @mentioned, or has opened it before.
export function discussionUnread(queries, reads, me) {
  if (!me) return [];
  const out = [];
  for (const q of queries || []) {
    if (q.cancelled) continue;
    const remarks = q.remarks || [];
    if (!remarks.length) continue;
    const seen = reads && reads[q.id];
    const since = seen ? new Date(seen).getTime() : new Date(DISCUSSION_UNREAD_SINCE).getTime();
    const fresh = remarks.filter(r => r.byStaffId !== me && r.createdAt && new Date(r.createdAt).getTime() > since);
    if (!fresh.length) continue;
    const mentioned = fresh.some(r => (r.mentions || []).some(m => m.type === "staff" && m.id === me));
    const involved = !!seen || q.assignedTo === me || q.reviewerId === me || mentioned || remarks.some(r => r.byStaffId === me);
    if (!involved) continue;
    out.push({ query: q, count: fresh.length, mentioned, latestAt: fresh[fresh.length - 1].createdAt, preview: fresh[fresh.length - 1] });
  }
  return out.sort((a, b) => (b.mentioned - a.mentioned) || (new Date(b.latestAt) - new Date(a.latestAt)));
}

// Fleet documents whose reminder date has arrived and whose alert is still on.
export function fleetDue(docs, todayISO) {
  return (docs || []).filter(d => d.reminder_date && !d.reminder_off && String(d.reminder_date).slice(0, 10) <= todayISO)
    .sort((a, b) => String(a.reminder_date).localeCompare(String(b.reminder_date)));
}
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function tabTitle(base, n) { return n > 0 ? `(${n > 99 ? "99+" : n}) ${base}` : base; }
