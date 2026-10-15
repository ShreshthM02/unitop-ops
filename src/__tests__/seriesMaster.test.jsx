import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../lib/supabase.js', () => ({
  db: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ series_id: 'S1', source_query_id: 'QRY-9', source_label: 'UT-3400', promoted_by: 'Priya', promoted_at: '2026-10-01T00:00:00Z', cost_sheet: {}, quotation: {}, itinerary: null }], error: null }) }) }) },
  realtimeClient: null,
}));

describe('SeriesMasterPanel', () => {
  it('shows the master source and lets another file copy it', async () => {
    const { default: SeriesMasterPanel } = await import('../components/SeriesMasterPanel.jsx');
    const onApply = vi.fn().mockResolvedValue();
    render(<SeriesMasterPanel query={{ id: 'QRY-1', seriesId: 'S1' }} seriesName="Kailash 2026" onPromote={vi.fn()} onApply={onApply}/>);
    await waitFor(() => expect(screen.getByText('UT-3400')).toBeTruthy());
    expect(screen.getByText(/Cost Sheet, Quotation/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Copy master into this file/));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
  });
  it('the source file itself cannot copy onto itself', async () => {
    const { default: SeriesMasterPanel } = await import('../components/SeriesMasterPanel.jsx');
    render(<SeriesMasterPanel query={{ id: 'QRY-9', seriesId: 'S1' }} onPromote={vi.fn()} onApply={vi.fn()}/>);
    await waitFor(() => expect(screen.getByText('UT-3400')).toBeTruthy());
    expect(screen.queryByText(/Copy master into this file/)).toBeNull();
  });
});
