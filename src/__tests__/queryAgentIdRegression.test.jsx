import { describe, it, expect } from 'vitest';
import { isUuid, buildQuerySavePayload } from '../lib/utils.js';

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
