import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocRegistryInline } from '../components/DocumentRegistry.jsx';

vi.mock('../lib/supabase.js', () => ({
  db: {
    from: (table) => {
      const filters = {};
      const builder = {
        select: () => builder,
        eq: (col, val) => { filters[col] = val; return builder; },
        order: () => builder,
        upsert: vi.fn(async (row) => ({ data: [row], error: null })),
        delete: async () => ({ data: null, error: null }),
        then: (resolve) => resolve({ data: [], error: null }), // starts empty
      };
      return builder;
    },
  },
  realtimeClient: null,
}));

describe('DocRegistryInline uses real Supabase persistence, not localStorage', () => {
  it('does not touch localStorage at all', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1"/>);
    expect(setSpy).not.toHaveBeenCalledWith(expect.stringContaining('unitop_docs'), expect.anything());
    expect(getSpy).not.toHaveBeenCalledWith(expect.stringContaining('unitop_docs'));
    setSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('loads (empty) state without crashing, then allows logging a new document', async () => {
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1"/>);
    await waitFor(() => expect(screen.getByText('No documents logged yet')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Log Document'));
    fireEvent.change(screen.getByPlaceholderText('Document name...'), { target: { value: 'Test Voucher' } });
    fireEvent.click(screen.getByText('Log'));
    expect(screen.getByText('Test Voucher')).toBeTruthy();
  });
});
