import { describe, it, expect } from 'vitest';
import { queueSequential } from '../lib/utils.js';

// The real fix behind two separate data-loss incidents:
//   - tour file UT-3495's Service Status list (ServicesList.jsx,
//     2026-09-24): overlapping saveQueryServices calls raced, and a
//     stale, older save's delete step could run AFTER a newer save's
//     insert, silently deleting rows the newer save had just added.
//   - a further, still-reported "editing a query makes it look
//     blank/reverted" report (UnitopApp.jsx's saveQueryToDB): the same
//     shape of race, for the queries table itself, via a second,
//     previously-overlooked bypass (SeriesManagement's Unassign writing
//     straight to the DB) plus the underlying saveQueryToDB call itself
//     never having been serialized in the first place.
// queueSequential is the shared, directly-testable fix: it guarantees
// tasks sharing a key run strictly one at a time, in call order, so the
// most recently fired task is always what's left standing -- regardless
// of which one's network round-trip happens to resolve first.

describe('queueSequential', () => {
  it('runs a single task and resolves with its result', async () => {
    const chains = {};
    const result = await queueSequential(chains, 'k1', async () => 'done');
    expect(result).toBe('done');
  });

  it('never lets two tasks for the SAME key run concurrently, even when the first is slow', async () => {
    const chains = {};
    const log = [];
    const taskA = async () => {
      log.push('A:start');
      await new Promise(r => setTimeout(r, 30));
      log.push('A:end');
    };
    const taskB = async () => {
      log.push('B:start');
      await new Promise(r => setTimeout(r, 5));
      log.push('B:end');
    };
    const pA = queueSequential(chains, 'query-1', taskA);
    const pB = queueSequential(chains, 'query-1', taskB); // fired immediately after, same key
    await Promise.all([pA, pB]);
    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('the LAST task fired for a key is always what finishes last -- so its result is what "wins", not whichever resolves fastest', async () => {
    const chains = {};
    const finalState = { value: null };
    const write = (v, delayMs) => async () => {
      await new Promise(r => setTimeout(r, delayMs));
      finalState.value = v; // simulates "the DB now holds this snapshot"
    };
    // Task A (older user action) is artificially slow; task B (a newer
    // user action, fired right after A) is fast. Without serialization,
    // B could finish first and then get overwritten by A's stale write
    // landing later -- exactly the data-loss bug. With serialization, A
    // must fully finish before B even starts, so B always wins.
    queueSequential(chains, 'query-1', write('A-stale-snapshot', 40));
    const pB = queueSequential(chains, 'query-1', write('B-latest-snapshot', 5));
    await pB;
    expect(finalState.value).toBe('B-latest-snapshot');
  });

  it('tasks for DIFFERENT keys run fully in parallel, unaffected by each other', async () => {
    const chains = {};
    const log = [];
    const task = (label, delayMs) => async () => {
      log.push(`${label}:start`);
      await new Promise(r => setTimeout(r, delayMs));
      log.push(`${label}:end`);
    };
    const p1 = queueSequential(chains, 'query-1', task('Q1', 30));
    const p2 = queueSequential(chains, 'query-2', task('Q2', 5));
    await Promise.all([p1, p2]);
    // Q2 (different key, shorter delay) finishes before Q1 -- proving the
    // two keys were never forced to serialize against each other.
    expect(log.indexOf('Q2:end')).toBeLessThan(log.indexOf('Q1:end'));
  });

  it('a task that throws does not jam the queue for that key -- the next task still runs', async () => {
    const chains = {};
    const log = [];
    await expect(queueSequential(chains, 'k', async () => { log.push('first'); throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(queueSequential(chains, 'k', async () => { log.push('second'); return 'ok'; })).resolves.toBe('ok');
    expect(log).toEqual(['first', 'second']);
  });
});
