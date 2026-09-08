import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Real Google Drive document upload, replacing the old "log a paper
// document + optionally paste a Drive link" placeholder that was
// always explicitly labeled as a Phase 5 placeholder awaiting this.
// Never gated by tour file conversion -- works identically before and
// after a query converts. The underlying Drive folder is created
// lazily on first upload, named after the query, and renamed (never
// recreated) the moment conversion happens.

function makeDb({ documents = [] } = {}) {
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
      upload: vi.fn(async () => ({ success: true, document: { id: 'd1', file_name: 'test.pdf', file_size: 1000, uploaded_by_name: 'Priya', created_at: '2026-09-08T10:00:00Z', drive_view_link: 'https://drive.google.com/file/x' } })),
      delete: vi.fn(async () => ({ success: true })),
      renameFolder: vi.fn(async () => ({ success: true })),
    },
  };
}

describe('DocRegistryInline: real file upload', () => {
  it('loads and lists real documents from query_documents', async () => {
    const db = makeDb({ documents: [
      { id: 'd1', query_id: 'q1', file_name: 'Passport Scan.pdf', file_size: 204800, file_type: 'application/pdf', uploaded_by_name: 'Priya', created_at: '2026-09-01T10:00:00Z', drive_view_link: 'https://drive.google.com/file/x' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('Passport Scan.pdf')).toBeTruthy());
    expect(screen.getByText(/200 KB/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('works identically on a query that has not been converted to a tour file yet -- never gated on tourFileId', async () => {
    const db = makeDb({ documents: [] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test Group" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/\+ Upload document/)).toBeTruthy());
    expect(screen.getByText(/\+ Upload document/).closest('button').disabled).toBe(false);
    vi.doUnmock('../lib/supabase.js');
  });

  it('uploading a file calls db.drive.upload with real file details and shows the result immediately', async () => {
    const db = makeDb({ documents: [] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    const { container } = render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Smith Family" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/\+ Upload document/)).toBeTruthy());
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => expect(db.drive.upload).toHaveBeenCalled());
    const call = db.drive.upload.mock.calls[0];
    expect(call[0]).toBe('q1'); // queryId
    expect(call[1]).toContain('Smith Family'); // folder label includes the query's own group name
    expect(call[2]).toBe('test.pdf'); // real file name preserved
    await waitFor(() => expect(screen.getByText('test.pdf')).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('the folder label uses the query id before conversion, and the real tour file id after', async () => {
    const db = makeDb({ documents: [] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    const { container, rerender } = render(<DocRegistryInline queryId="UTQ-5" tourFileId={null} groupName="Smith Family" currentUser={{name:'Priya'}}/>);
    const fileInput = () => container.querySelector('input[type="file"]');
    const file1 = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput(), 'files', { value: [file1], configurable: true });
    fireEvent.change(fileInput());
    await waitFor(() => expect(db.drive.upload).toHaveBeenCalled());
    expect(db.drive.upload.mock.calls[0][1]).toBe('UTQ-5 - Smith Family');

    db.drive.upload.mockClear();
    rerender(<DocRegistryInline queryId="UTQ-5" tourFileId="TUR-2026-050" groupName="Smith Family" currentUser={{name:'Priya'}}/>);
    const file2 = new File(['x'], 'b.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput(), 'files', { value: [file2], configurable: true });
    fireEvent.change(fileInput());
    await waitFor(() => expect(db.drive.upload).toHaveBeenCalled());
    expect(db.drive.upload.mock.calls[0][1]).toBe('TUR-2026-050 - Smith Family');
    vi.doUnmock('../lib/supabase.js');
  });

  it('deleting a document calls db.drive.delete and removes it from the visible list', async () => {
    const db = makeDb({ documents: [
      { id: 'd1', query_id: 'q1', file_name: 'old.pdf', file_size: 1000, uploaded_by_name: 'Priya', created_at: '2026-09-01T10:00:00Z', drive_view_link: 'https://drive.google.com/file/x' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('old.pdf')).toBeTruthy());
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(db.drive.delete).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(screen.queryByText('old.pdf')).toBeFalsy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('the View link opens the real Drive link in a new tab, not a raw file id', async () => {
    const db = makeDb({ documents: [
      { id: 'd1', query_id: 'q1', file_name: 'doc.pdf', file_size: 1000, uploaded_by_name: 'Priya', created_at: '2026-09-01T10:00:00Z', drive_view_link: 'https://drive.google.com/file/d/xyz/view' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test" currentUser={{name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('View')).toBeTruthy());
    const link = screen.getByText('View').closest('a');
    expect(link.href).toBe('https://drive.google.com/file/d/xyz/view');
    expect(link.target).toBe('_blank');
    vi.doUnmock('../lib/supabase.js');
  });

  it('readOnly disables upload and delete but still allows viewing', async () => {
    const db = makeDb({ documents: [
      { id: 'd1', query_id: 'q1', file_name: 'doc.pdf', file_size: 1000, uploaded_by_name: 'Priya', created_at: '2026-09-01T10:00:00Z', drive_view_link: 'https://drive.google.com/file/x' },
    ] });
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    const { container } = render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test" currentUser={{name:'Priya'}} readOnly/>);
    await waitFor(() => expect(screen.getByText('doc.pdf')).toBeTruthy());
    expect(container.querySelector('fieldset').disabled).toBe(true);
    expect(screen.getByText('View')).toBeTruthy(); // viewing still works even when locked
    vi.doUnmock('../lib/supabase.js');
  });

  it('shows a real, visible error if an upload fails, rather than failing silently', async () => {
    const db = makeDb({ documents: [] });
    db.drive.upload = vi.fn(async () => ({ success: false, error: 'Drive upload failed: quota exceeded' }));
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    const { container } = render(<DocRegistryInline queryId="q1" tourFileId={null} groupName="Test" currentUser={{name:'Priya'}}/>);
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByText(/quota exceeded/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Convert to Tour File: Drive folder rename hook', () => {
  it('UnitopApp calls db.drive.renameFolder with the query id and the real new tour file name', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UnitopApp.jsx'), 'utf8');
    expect(src).toMatch(/db\.drive\.renameFolder\(query\.id,/);
    // Fired inside handleConvertToCaseFile, after the real tour number is assigned
    const convertFnStart = src.indexOf('const handleConvertToCaseFile');
    const convertFnBody = src.slice(convertFnStart, convertFnStart + 2000);
    expect(convertFnBody).toContain('db.drive.renameFolder');
  });
});
