import { describe, it, expect } from 'vitest';
import { isUuid, buildQuerySavePayload, mapDbQueryRow } from '../lib/utils.js';

describe('isUuid', () => {
  it('accepts a real uuid', () => {
    expect(isUuid('cfff444a-718e-4c14-83a3-f55f368d64dd')).toBe(true);
  });
  it('rejects the demo/fallback agent id format ("AGT-001") -- the exact value that broke query saving', () => {
    expect(isUuid('AGT-001')).toBe(false);
  });
  it('rejects null/undefined/empty string without throwing', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('buildQuerySavePayload (the exact regression this round)', () => {
  const baseQuery = { id: 'UTQ-2026-300', groupName: 'Test', clientName: 'Test', status: 'new_query' };

  it('sends agent_id as null when given a demo/fallback (non-uuid) agent id, instead of failing the whole payload', () => {
    const payload = buildQuerySavePayload({ ...baseQuery, agentId: 'AGT-001' });
    expect(payload.agent_id).toBeNull();
    // Critically: the REST of the payload must still be present and correct --
    // this is what actually broke (the whole row failed, not just this field).
    expect(payload.id).toBe('UTQ-2026-300');
    expect(payload.group_name).toBe('Test');
  });

  it('sends the real agent_id through untouched when it is a genuine uuid', () => {
    const payload = buildQuerySavePayload({ ...baseQuery, agentId: 'cfff444a-718e-4c14-83a3-f55f368d64dd' });
    expect(payload.agent_id).toBe('cfff444a-718e-4c14-83a3-f55f368d64dd');
  });

  it('sends null when no agent is selected at all', () => {
    const payload = buildQuerySavePayload({ ...baseQuery, agentId: '' });
    expect(payload.agent_id).toBeNull();
  });

  it('maps every other field correctly regardless of agent_id validity', () => {
    const payload = buildQuerySavePayload({
      ...baseQuery, agentId: 'AGT-002', agentCompany: 'Demo Co', nights: '5', pax: 10,
      paxExact: '10', paxKnown: true, status: 'operations', tourFileId: 'TF-1',
    });
    expect(payload.agent_company).toBe('Demo Co');
    expect(payload.nights).toBe(5);
    expect(payload.pax_exact).toBe(10);
    expect(payload.status).toBe('operations');
    expect(payload.tour_file_id).toBe('TF-1');
  });
});

describe('buildQuerySavePayload: assigned_to and file_type (real gaps found and fixed)', () => {
  it('includes assigned_to -- this was silently missing entirely, meaning "Assigned To" edits never actually persisted despite the UI and callback both working correctly', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', assignedTo: 'cfff444a-718e-4c14-83a3-f55f368d64dd' });
    expect(payload.assigned_to).toBe('cfff444a-718e-4c14-83a3-f55f368d64dd');
  });

  it('sends null for assigned_to when unassigned, not undefined (undefined would be dropped from the JSON body silently)', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1' });
    expect(payload.assigned_to).toBeNull();
  });

  it('sends assigned_to as null when given a non-uuid value, instead of failing the whole query save -- the actual bug: a brand-new query silently never persisted (gone on refresh) whenever the staff list hadn\'t loaded yet, since the form fell back to USERS\' plain integer ids (1, 2, 3, 4), and that integer went straight into a uuid column with no validation at all, unlike agent_id which already had this exact protection', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-2026-999', groupName: 'New Query Not Persisting Regression', assignedTo: 1 });
    expect(payload.assigned_to).toBeNull();
    // Critically: the REST of the payload must still be present and correct --
    // this is what actually broke (the whole row failed to upsert, not just this field).
    expect(payload.id).toBe('UTQ-2026-999');
    expect(payload.group_name).toBe('New Query Not Persisting Regression');
  });

  it('includes file_type (FIT/GIT) when set', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', fileType: 'GIT' });
    expect(payload.file_type).toBe('GIT');
  });

  it('sends null for file_type when not set', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1' });
    expect(payload.file_type).toBeNull();
  });
});

describe('buildQuerySavePayload / mapDbQueryRow: 3 more silently-lost fields found via live schema audit', () => {
  it('includes source_other -- previously lost when Source = "Others"', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', sourceOther: 'Referred by past client' });
    expect(payload.source_other).toBe('Referred by past client');
  });

  it('includes travel_date_to -- previously lost even though the column has always existed', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', travelDateTo: '2026-08-20' });
    expect(payload.travel_date_to).toBe('2026-08-20');
  });

  it('includes internal_correspondent -- previously lost', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', internalCorrespondent: 'Priya' });
    expect(payload.internal_correspondent).toBe('Priya');
  });

  it('mapDbQueryRow reads all three back correctly on the load side', () => {
    const mapped = mapDbQueryRow({ id: 'UTQ-1', source_other: 'Referral', travel_date_to: '2026-08-20T00:00:00', internal_correspondent: 'Priya' });
    expect(mapped.sourceOther).toBe('Referral');
    expect(mapped.travelDateTo).toBe('2026-08-20');
    expect(mapped.internalCorrespondent).toBe('Priya');
  });
});

describe('buildQuerySavePayload: travel_date_from/to must never receive a non-date text label (the ACTUAL confirmed root cause of "new query not persisting", found 2026-07-27 via the real Postgres error the error-toast fix finally surfaced: \'invalid input syntax for type date: "TBC"\')', () => {
  it('sends null for travel_date_from when the travel date is unconfirmed ("TBC" text label), instead of the literal string that broke every such query\'s save entirely', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-2026-043', travelDate: 'TBC' });
    expect(payload.travel_date_from).toBeNull();
  });

  it('sends null for a month-name or season-name label too, not just literal "TBC"', () => {
    expect(buildQuerySavePayload({ id: 'UTQ-1', travelDate: 'December' }).travel_date_from).toBeNull();
    expect(buildQuerySavePayload({ id: 'UTQ-1', travelDate: 'Monsoon' }).travel_date_from).toBeNull();
  });

  it('sends the real date through untouched when travelDate genuinely is a confirmed ISO date', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', travelDate: '2026-08-15' });
    expect(payload.travel_date_from).toBe('2026-08-15');
  });

  it('falls back to travelDateFrom if travelDate itself is not a real date but travelDateFrom is', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', travelDate: 'TBC', travelDateFrom: '2026-09-01' });
    expect(payload.travel_date_from).toBe('2026-09-01');
  });

  it('sends null for travel_date_to when it is not a valid date string either', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1', travelDateTo: 'TBC' });
    expect(payload.travel_date_to).toBeNull();
  });

  it('the rest of the payload still saves correctly even when the date is unconfirmed -- this is the actual regression: previously the WHOLE upsert failed, not just this one field', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-2026-043', groupName: 'Real Test Group', travelDate: 'TBC' });
    expect(payload.travel_date_from).toBeNull();
    expect(payload.id).toBe('UTQ-2026-043');
    expect(payload.group_name).toBe('Real Test Group');
  });
});
