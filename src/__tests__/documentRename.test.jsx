import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Direct request: "give a provision to change file name post upload
// from the app itself." Renames the real file in Google Drive (via
// the edge function's new rename-file action) and this app's own
// query_documents record together, so the two never drift apart.

function makeDb({ documents = [], renameResult } = {}) {
  return {
    from: (table) => {
      let conditions = [];
      const builder = {
        select: () => builder,
        eq: (col, val) => { conditions = [...conditions, [col, val]]; return builder; },
        order: () => builder,
        then: (res) => {
          let rows = table === 'query_documents' ? documents : [];
          conditions.forEach(([col, val]) => { rows = rows.filter(r => r[col] === val); });
          res({ data: rows, error: null });
        },
      };
      return builder;
    },
    drive: {
      upload: vi.fn(),
      delete: vi.fn(async () => ({ success: true })),
      renameFolder: vi.fn(async () => ({ success: true })),
      renameFile: renameResult || vi.fn(async (documentId, newName) => ({ success: true, document: { id: documentId, file_name: newName } })),
    },
  };
}

const baseDoc = { id: 'd1', query_id: 'q1', file_name: 'Passport Scan.pdf', file_size: 204800, file_type: 'application/pdf', uploaded_by_name: 'Priya', created_at: '2026-09-01T10:00:00Z', drive_view_link: 'https://drive.google.com/file/x' };

describe('DocRegistryInline: renaming an uploaded document', () => {
  it('shows a rename (pencil) affordance next to each document name', async () => {
    const db = makeDb({ documents: [baseDoc] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    expect(screen.getByTitle('Rename')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('clicking rename shows an editable field pre-filled with the current name', async () => {
    const db = makeDb({ documents: [baseDoc] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Rename'));
    expect(screen.getByDisplayValue('Passport Scan.pdf')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('saving a new name calls db.drive.renameFile and updates the displayed name', async () => {
    const renameFile = vi.fn(async () => ({ success: true, document: { id: 'd1', file_name: 'Passport Scan (Renewed).pdf' } }));
    const db = makeDb({ documents: [baseDoc], renameResult: renameFile });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Passport Scan.pdf');
    fireEvent.change(input, { target: { value: 'Passport Scan (Renewed).pdf' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(renameFile).toHaveBeenCalledWith('d1', 'Passport Scan (Renewed).pdf'));
    await waitFor(() => expect(screen.getByText('Passport Scan (Renewed).pdf')).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('pressing Escape cancels without saving', async () => {
    const renameFile = vi.fn();
    const db = makeDb({ documents: [baseDoc], renameResult: renameFile });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Passport Scan.pdf');
    fireEvent.change(input, { target: { value: 'Something Else.pdf' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByText('Passport Scan.pdf')).toBeTruthy();
    expect(renameFile).not.toHaveBeenCalled();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a failed rename shows the real error and leaves the original name in place', async () => {
    const renameFile = vi.fn(async () => ({ success: false, error: 'Could not rename file in Drive: insufficient permissions' }));
    const db = makeDb({ documents: [baseDoc], renameResult: renameFile });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Rename'));
    fireEvent.change(screen.getByDisplayValue('Passport Scan.pdf'), { target: { value: 'New Name.pdf' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText(/insufficient permissions/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('the rename affordance is hidden when read-only (cancelled tour file)', async () => {
    const db = makeDb({ documents: [baseDoc] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}} readOnly={true}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    expect(screen.queryByTitle('Rename')).toBeNull();
    vi.doUnmock('../lib/supabase.js');
  });
});
