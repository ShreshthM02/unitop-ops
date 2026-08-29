import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mapDbEditorDocumentRow, loadEditorDocuments, saveEditorDocumentVersion } from '../lib/utils.js';

describe('mapDbEditorDocumentRow / loadEditorDocuments', () => {
  it('maps every real editor_documents column to its app-object field', () => {
    const row = {
      id: 'row-1', query_id: 'UTQ-1', doc_key: 'key-1', name: 'Client Brief', version: 2,
      is_final: true, content_html: '<p>hello</p>', created_by: 'staff-1',
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    };
    const mapped = mapDbEditorDocumentRow(row);
    expect(mapped).toEqual({
      id: 'row-1', queryId: 'UTQ-1', docKey: 'key-1', name: 'Client Brief', version: 2,
      isFinal: true, contentHtml: '<p>hello</p>', createdBy: 'staff-1',
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
    });
  });

  it('loads and maps all version rows for a query, ordered by version ascending', async () => {
    const rows = [
      { id: '1', query_id: 'UTQ-1', doc_key: 'a', name: 'Doc A', version: 1, is_final: false, content_html: '' },
      { id: '2', query_id: 'UTQ-1', doc_key: 'a', name: 'Doc A', version: 2, is_final: false, content_html: '' },
    ];
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) }) };
    const result = await loadEditorDocuments(db, 'UTQ-1');
    expect(result.length).toBe(2);
    expect(result[1].version).toBe(2);
  });

  it('does not throw and returns an empty array when the db call fails', async () => {
    const db = { from: () => { throw new Error('network fail'); } };
    await expect(loadEditorDocuments(db, 'UTQ-1')).resolves.toEqual([]);
  });
});

describe('saveEditorDocumentVersion', () => {
  it('inserts a new version row with the correct field mapping', async () => {
    const calls = [];
    const db = { from: (table) => ({ insert: async (payload) => { calls.push({ table, payload }); return { data: [{ id: 'new-id' }], error: null }; } }) };
    const result = await saveEditorDocumentVersion(db, 'UTQ-1', 'doc-key-1', { name: 'My Doc', contentHtml: '<p>x</p>', version: 1 }, 'staff-uuid-not-real');
    const call = calls.find(c => c.table === 'editor_documents');
    expect(call.payload.query_id).toBe('UTQ-1');
    expect(call.payload.doc_key).toBe('doc-key-1');
    expect(call.payload.name).toBe('My Doc');
    expect(call.payload.version).toBe(1);
    expect(call.payload.is_final).toBe(false);
    expect(call.payload.content_html).toBe('<p>x</p>');
    expect(result.id).toBe('new-id');
  });

  it('defaults an empty name to "Untitled Document"', async () => {
    const calls = [];
    const db = { from: (table) => ({ insert: async (payload) => { calls.push({ table, payload }); return { data: [{ id: '1' }], error: null }; } }) };
    await saveEditorDocumentVersion(db, 'UTQ-1', 'doc-key-1', { contentHtml: '', version: 1 }, null);
    expect(calls[0].payload.name).toBe('Untitled Document');
  });
});

describe('DocumentEditor component', () => {
  const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };

  beforeEach(() => { vi.resetModules(); });

  function mockDbWithDocs(rows = []) {
    const inserted = [];
    return {
      db: {
        from: () => ({
          select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
          insert: async (payload) => { inserted.push(payload); return { data: [{ id: 'new-row' }], error: null }; },
        }),
      },
      inserted,
    };
  }

  it('shows the empty state and a "+ New Document" button when the query has no Editor documents yet', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/No documents yet/)).toBeTruthy());
    expect(screen.getByText('+ New Document')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('lists existing documents grouped to their latest version', async () => {
    const rows = [
      { id: '1', query_id: 'UTQ-1', doc_key: 'a', name: 'Client Brief', version: 1, is_final: false, content_html: '<p>v1</p>' },
      { id: '2', query_id: 'UTQ-1', doc_key: 'a', name: 'Client Brief', version: 2, is_final: false, content_html: '<p>v2</p>' },
    ];
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs(rows).db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/Client Brief/)).toBeTruthy());
    expect(screen.getAllByText(/v2/).length).toBeGreaterThan(0); // shows the latest version, not both rows separately
    vi.doUnmock('../lib/supabase.js');
  });

  it('opens a blank editor when "+ New Document" is clicked, with the toolbar and export options present', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    expect(screen.getByDisplayValue('Untitled Document')).toBeTruthy(); // name field, pre-filled
    expect(screen.getByTitle('Bold')).toBeTruthy();
    expect(screen.getByTitle('Insert table')).toBeTruthy();
    expect(screen.getByText(/Export/)).toBeTruthy(); // ExportMenu (PDF/Word/Print)
    vi.doUnmock('../lib/supabase.js');
  });

  it('saving a new document calls the insert with the given name and increments the displayed version', async () => {
    const { db, inserted } = mockDbWithDocs();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    fireEvent.change(screen.getByDisplayValue('Untitled Document'), { target: { value: 'My Notes' } });
    fireEvent.click(screen.getAllByText(/Save v1/)[0]);
    await waitFor(() => expect(inserted.length).toBeGreaterThan(0));
    expect(inserted[0].name).toBe('My Notes');
    expect(inserted[0].version).toBe(1);
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor toolbar reactivity and new controls', () => {
  const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };

  beforeEach(() => { vi.resetModules(); });

  function mockDbWithDocs(rows = []) {
    return { db: { from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
      insert: async () => ({ data: [{ id: 'new-row' }], error: null }),
    }) } };
  }

  async function openBlankEditor() {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByTitle('Undo')).toBeTruthy());
  }

  it('undo becomes enabled after an edit, and disabled again after undoing it -- the toolbar reactively tracks editor state (shouldRerenderOnTransaction)', async () => {
    await openBlankEditor();
    expect(screen.getByTitle('Undo')).toBeDisabled();
    fireEvent.click(screen.getByTitle('Insert table')); // a real content mutation, guaranteed to push a history step
    await waitFor(() => expect(screen.getByTitle('Undo')).not.toBeDisabled());
    fireEvent.click(screen.getByTitle('Undo'));
    await waitFor(() => expect(screen.getByTitle('Undo')).toBeDisabled());
    vi.doUnmock('../lib/supabase.js');
  });

  it('has five independent letterhead toggles: Header, Footer, Page number, Digital stamp, Print on Letterhead', async () => {
    await openBlankEditor();
    expect(screen.getByText('Header')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
    expect(screen.getByText('Page number')).toBeTruthy();
    expect(screen.getByText('Digital stamp')).toBeTruthy();
    expect(screen.getByText(/Print on Letterhead/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('has font family and font size selectors, defaulting to no override (Playfair/Inter apply via page CSS, not forced per-selection)', async () => {
    await openBlankEditor();
    expect(screen.getByTitle('Font')).toBeTruthy();
    expect(screen.getByTitle('Font size')).toBeTruthy();
    expect(screen.getByTitle('Font').value).toBe('');
    vi.doUnmock('../lib/supabase.js');
  });

  it('highlight color swatch picker offers multiple colors, not just an on/off toggle', async () => {
    await openBlankEditor();
    fireEvent.click(screen.getByTitle('Highlight color'));
    expect(screen.getByTitle('#FEF08A')).toBeTruthy();
    expect(screen.getByTitle('#BFDBFE')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('text color swatch picker is present, separate from highlight', async () => {
    await openBlankEditor();
    expect(screen.getByTitle('Text color')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('table toolbar (merge/split/header row/column/shading) only appears once the cursor is inside a table', async () => {
    await openBlankEditor();
    expect(screen.queryByTitle('Merge cells')).toBeFalsy();
    fireEvent.click(screen.getByTitle('Insert table'));
    await waitFor(() => expect(screen.getByTitle('Merge cells')).toBeTruthy());
    expect(screen.getByTitle('Split cell')).toBeTruthy();
    expect(screen.getByTitle('Toggle header row')).toBeTruthy();
    expect(screen.getByTitle('Toggle header column')).toBeTruthy();
    expect(screen.getByTitle('Cell shading')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});
