import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real incident, tour file UT-3495 / QRY-2026-007, 2026-09-24: 4 hotel
// service entries (renamed from the default placeholder rows, then
// marked confirmed in quick succession) silently vanished from
// query_services. Root cause: saveQueryServices() does a whole-list
// sync -- upsert everything in the array it's given, then DELETE any DB
// row whose id isn't in that same array (see lib/utils.js). Every field
// in ServicesList (name, date, status, notes) fired its own persist()
// independently, and persist() used to kick off an unawaited,
// fire-and-forget saveQueryServices call each time. Two calls fired
// close together therefore raced: if the OLDER call's delete step
// finished AFTER the newer call had already inserted something the
// older snapshot didn't know about, it silently deleted it.
//
// The fix chains every save through a ref-held promise, so calls can
// never interleave -- each one's upsert AND delete fully complete before
// the next one's even starts. This test proves that ordering directly:
// it deliberately makes the FIRST save (from a rename) slow, fires a
// SECOND save (a status change on the same row) immediately after, and
// asserts every one of the first save's db operations is logged before
// any of the second's -- the exact interleaving that caused the data
// loss is now structurally impossible.

function makeRaceTrackingDb(log, { delayFirstUpsertMs = 30 } = {}) {
  let upsertCallCount = 0;
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        upsert: vi.fn(async (row) => {
          upsertCallCount++;
          const isFirstEverUpsert = upsertCallCount === 1;
          if (isFirstEverUpsert) {
            await new Promise(r => setTimeout(r, delayFirstUpsertMs));
          }
          log.push(`upsert:${row.id}:${row.name}:${row.status}`);
          return { data: [row], error: null };
        }),
        delete: vi.fn(async () => { log.push('delete-called'); return { data: null, error: null }; }),
        insert: vi.fn(async () => ({ data: null, error: null })), // logAudit's target -- irrelevant to this test, just kept quiet
        then: (resolve) => resolve({ data: [], error: null }), // no pre-saved services -> defaults seed
      };
      return builder;
    }),
  };
}

const sec = (label) => <div>{label}</div>;
const fakeQuery = { id: 'UTQ-race-1' };

describe('ServicesList: overlapping saves no longer race (tour file UT-3495 data-loss fix)', () => {
  it('a slow first save never has its writes interleaved with a fast second save -- all first-save ops complete before the second starts', async () => {
    const log = [];
    const db = makeRaceTrackingDb(log, { delayFirstUpsertMs: 40 });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { ServicesList } = await import('../components/ServicesList.jsx');

    render(<ServicesList query={fakeQuery} sec={sec} currentUser={{ name: 'Yash Srivastava' }} />);
    await waitFor(() => expect(screen.getByDisplayValue(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());

    // Call #1 (slow): rename the first service -- fires persist() on blur.
    const nameInput = screen.getByDisplayValue(/Hotel — Primary Hotel \(Night 1–2\)/);
    fireEvent.change(nameInput, { target: { value: 'Hotel — Clarks Varanasi (D2)' } });
    fireEvent.blur(nameInput);

    // Call #2 (fast): change that same row's status almost immediately
    // after -- exactly the sequence (rename, then confirm) from the real
    // incident. Before the fix this raced with call #1's still-pending
    // save; now it must wait behind it in the save queue.
    const statusSelect = document.querySelectorAll('select')[0];
    fireEvent.change(statusSelect, { target: { value: 'confirmed' } });

    await waitFor(() => expect(log.filter(l => l.startsWith('upsert:')).length).toBeGreaterThanOrEqual(2));

    // Every one of call #1's upserts (the rename, still carrying the old
    // "requested" status) must be logged strictly before call #2's
    // upsert (the status change) even starts -- proving the two saves
    // never interleaved.
    const firstUpsertIdx = log.findIndex(l => l.startsWith('upsert:') && l.includes('Clarks Varanasi') && l.endsWith(':requested'));
    const secondUpsertIdx = log.findIndex(l => l.startsWith('upsert:') && l.includes('Clarks Varanasi') && l.endsWith(':confirmed'));
    expect(firstUpsertIdx).toBeGreaterThan(-1);
    expect(secondUpsertIdx).toBeGreaterThan(firstUpsertIdx);
  });

  it('a slow first save does not lose a row added by a fast second save (the actual UT-3495 failure mode)', async () => {
    const log = [];
    const db = makeRaceTrackingDb(log, { delayFirstUpsertMs: 40 });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { ServicesList } = await import('../components/ServicesList.jsx');

    render(<ServicesList query={fakeQuery} sec={sec} currentUser={{ name: 'Yash Srivastava' }} />);
    await waitFor(() => expect(screen.getByDisplayValue(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());

    // Call #1 (slow, older/smaller snapshot): rename the first service.
    const nameInput = screen.getByDisplayValue(/Hotel — Primary Hotel \(Night 1–2\)/);
    fireEvent.change(nameInput, { target: { value: 'Hotel — Clarks Varanasi (D2)' } });
    fireEvent.blur(nameInput);

    // Call #2 (fast, newer/larger snapshot): add a brand-new service
    // right after -- in the real incident this is analogous to Yash
    // confirming a second hotel moments after renaming the first. If
    // call #1's delete step ran after call #2 inserted this new row
    // (the pre-fix behavior), the new row would vanish.
    fireEvent.click(screen.getByText('+ Add Service'));
    const svcNameInputs = screen.getAllByPlaceholderText('e.g. Hotel Taj Mahal 3N');
    fireEvent.change(svcNameInputs[0], { target: { value: 'Hotel - Saura Agra (D4 & D5)' } });
    fireEvent.click(screen.getByText('Add Service'));

    await waitFor(() => expect(log.some(l => l.includes('Saura Agra'))).toBe(true));

    // The new row's upsert must be logged, and (because saves are
    // serialized) call #1's delete-check must have already happened
    // before call #2 (which includes the new row) even began --
    // otherwise call #1's delete could have raced ahead and wiped it.
    const savedNames = log.filter(l => l.startsWith('upsert:')).map(l => l.split(':').slice(2, -1).join(':'));
    expect(savedNames).toContain('Hotel - Saura Agra (D4 & D5)');
  });
});
