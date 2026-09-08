import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocRegistryInline } from '../components/DocumentRegistry.jsx';

// Note: this file previously tested the OLD "log a document with
// category/received-from/status metadata, optionally paste a Drive
// link" placeholder UI. That entire workflow (including the "Other"
// free-text fields for Category/Received From) no longer exists --
// replaced by real Google Drive file upload, which has no equivalent
// concept of "category" or "received from" to select. Coverage for
// the real, current behavior (upload, delete, view, read-only,
// folder naming, error handling) lives in driveDocuments.test.jsx.
// Only the one test still genuinely applicable (real persistence, not
// localStorage) is kept here, adapted for the new component.

vi.mock('../lib/supabase.js', () => ({
  db: {
    from: (table) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (resolve) => resolve({ data: [], error: null }), // starts empty
      };
      return builder;
    },
    drive: { upload: vi.fn(), delete: vi.fn() },
  },
  realtimeClient: null,
}));

describe('DocRegistryInline uses real Supabase/Drive persistence, not localStorage', () => {
  it('does not touch localStorage at all', async () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const getSpy = vi.spyOn(Storage.prototype, 'getItem');
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/No documents uploaded yet/)).toBeTruthy());
    expect(setSpy).not.toHaveBeenCalledWith(expect.stringContaining('unitop_docs'), expect.anything());
    expect(getSpy).not.toHaveBeenCalledWith(expect.stringContaining('unitop_docs'));
    setSpy.mockRestore();
    getSpy.mockRestore();
  });
});
