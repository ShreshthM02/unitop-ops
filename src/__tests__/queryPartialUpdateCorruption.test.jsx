import { describe, it, expect } from 'vitest';
import { mergeQueryForSave, buildQuerySavePayload } from '../lib/utils.js';

// Real, confirmed bug (reported as "editing a query makes a blank phantom
// query appear"): buildQuerySavePayload() always emits every DB column, by
// design -- any field missing from its input is force-defaulted rather than
// left alone (nights/pax_exact/pax_min/pax_max -> null, cancelled -> false,
// manual_wf -> [], file_type/assigned_to/travel_date_to/series_id/
// reviewer_id/agent_id -> null). Some UI call sites (the Reviewer/Series
// dropdowns, Quotation's confirmed-pax sync) intentionally send a
// single-field partial object -- handing that straight to
// buildQuerySavePayload silently wiped every one of those other columns in
// the database on every such edit. mergeQueryForSave() is the fix: it's
// always applied first, so buildQuerySavePayload only ever sees a complete
// record.
describe('mergeQueryForSave: partial query edits must not corrupt other columns', () => {
  const fullQuery = {
    id: 'UTQ-2026-100',
    groupName: 'Anderson Family',
    nights: 5,
    paxExact: 12,
    paxMin: null, paxMax: null,
    cancelled: true,
    cancellationReason: 'Client postponed',
    manualWF: ['step1', 'step2'],
    fileType: 'GIT',
    assignedTo: 'cfff444a-718e-4c14-83a3-f55f368d64dd',
    travelDate: '2026-11-01',
    travelDateTo: '2026-11-08',
    seriesId: 'a1b2c3d4-0000-0000-0000-000000000000',
    reviewerId: 'b2c3d4e5-0000-0000-0000-000000000000',
  };

  it('a bare partial diff (the OLD broken call) nulls out everything else -- proves the bug existed', () => {
    const brokenPayload = buildQuerySavePayload({ reviewerId: 'new-reviewer-uuid', id: fullQuery.id });
    expect(brokenPayload.nights).toBeNull();
    expect(brokenPayload.cancelled).toBe(false); // silently un-cancels!
    expect(brokenPayload.manual_wf).toEqual([]);
    expect(brokenPayload.file_type).toBeNull();
    expect(brokenPayload.travel_date_to).toBeNull();
    expect(brokenPayload.series_id).toBeNull();
  });

  it('merging onto the existing record first (the fix) preserves every untouched column', () => {
    const merged = mergeQueryForSave(fullQuery, { reviewerId: null }); // e.g. "Unassign reviewer"
    const payload = buildQuerySavePayload(merged);
    expect(payload.nights).toBe(5);
    expect(payload.pax_exact).toBe(12);
    expect(payload.cancelled).toBe(true);
    expect(payload.cancellation_reason).toBe('Client postponed');
    expect(payload.manual_wf).toEqual(['step1', 'step2']);
    expect(payload.file_type).toBe('GIT');
    expect(payload.assigned_to).toBe('cfff444a-718e-4c14-83a3-f55f368d64dd');
    expect(payload.travel_date_from).toBe('2026-11-01');
    expect(payload.travel_date_to).toBe('2026-11-08');
    expect(payload.series_id).toBe('a1b2c3d4-0000-0000-0000-000000000000');
    // and the one field that WAS updated really did change
    expect(payload.reviewer_id).toBeNull();
  });

  it('a single-field paxDisplay sync (QuotationGenerator) preserves the rest', () => {
    const merged = mergeQueryForSave(fullQuery, { paxDisplay: '14 pax' });
    const payload = buildQuerySavePayload(merged);
    expect(payload.pax_display).toBe('14 pax');
    expect(payload.nights).toBe(5);
    expect(payload.cancelled).toBe(true);
    expect(payload.series_id).toBe('a1b2c3d4-0000-0000-0000-000000000000');
  });

  it('falls back to just the updates when no existing record is found (new/unknown id)', () => {
    const merged = mergeQueryForSave(undefined, { id: 'UTQ-NEW', groupName: 'Brand New' });
    expect(merged).toEqual({ id: 'UTQ-NEW', groupName: 'Brand New' });
  });
});
