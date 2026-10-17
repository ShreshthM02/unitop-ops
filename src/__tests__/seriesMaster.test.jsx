import { describe, it, expect, vi } from 'vitest';
import { promoteSeriesMaster, applySeriesMaster, describeCopied } from '../lib/utils.js';

describe('series master helpers', () => {
  it('promote returns the RPC result on success', async () => {
    const db = { authRpc: vi.fn().mockResolvedValue({ data: { success: true, source: 'UT-3500', cost_sheet: true }, error: null }) };
    const r = await promoteSeriesMaster(db, 'S1', 'QRY-1', 'Priya');
    expect(db.authRpc).toHaveBeenCalledWith('promote_series_master', { p_series: 'S1', p_query: 'QRY-1', p_by: 'Priya' });
    expect(r.success).toBe(true);
  });
  it('explains that the migration is missing when the function does not exist', async () => {
    const db = { authRpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Could not find the function public.apply_series_master (PGRST202)' } }) };
    const r = await applySeriesMaster(db, 'S1', 'QRY-2');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/migration/);
  });
  it('passes through a business error from the function', async () => {
    const db = { authRpc: vi.fn().mockResolvedValue({ data: { success: false, error: 'This series has no master yet' }, error: null }) };
    expect((await applySeriesMaster(db, 'S1', 'QRY-2')).error).toBe('This series has no master yet');
  });
  it('describeCopied names the documents', () => {
    expect(describeCopied(['cost_sheet', 'itinerary'])).toBe('Cost Sheet, Itinerary');
  });
});
