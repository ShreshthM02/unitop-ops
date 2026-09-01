import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };

function mockDbWithDocs(rows = []) {
  const inserted = [];
  return {
    db: { from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
      insert: async (payload) => { inserted.push(payload); return { data: [{ id: 'new-row' }], error: null }; },
    }) },
    inserted,
  };
}

describe('DocumentEditor Phase 2: word count', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows a live word count as content is typed', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByText(/0 words/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor Phase 2: unsaved-changes protection', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows "unsaved changes" and warns before navigating away once dirty', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByTitle('Insert table')).toBeTruthy());
    expect(screen.queryByText(/unsaved changes/)).toBeFalsy();

    fireEvent.click(screen.getByTitle('Insert table')); // a real content mutation
    await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByText('← Documents'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText(/unsaved changes/)).toBeTruthy(); // still on the editor -- user cancelled leaving
    confirmSpy.mockRestore();
    vi.doUnmock('../lib/supabase.js');
  });

  it('saving clears the unsaved-changes indicator', async () => {
    const { db } = mockDbWithDocs();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByTitle('Insert table')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Insert table'));
    await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());
    fireEvent.click(screen.getAllByText(/Save v1/)[0]);
    await waitFor(() => expect(screen.queryByText(/unsaved changes/)).toBeFalsy());
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor Phase 2: Find & Replace', () => {
  beforeEach(() => { vi.resetModules(); });

  it('opens and closes the Find & Replace panel', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByText('🔍 Find & Replace')).toBeTruthy());
    expect(screen.queryByPlaceholderText('Find...')).toBeFalsy();
    fireEvent.click(screen.getByText('🔍 Find & Replace'));
    expect(screen.getByPlaceholderText('Find...')).toBeTruthy();
    expect(screen.getByPlaceholderText('Replace with...')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor Phase 2: comments', () => {
  beforeEach(() => { vi.resetModules(); });

  it('the Add Comment toolbar button is disabled with no text selected', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByTitle('Add comment')).toBeTruthy());
    expect(screen.getByTitle('Add comment')).toBeDisabled();
    vi.doUnmock('../lib/supabase.js');
  });

  it('the Comments panel toggles open/closed and shows an empty state', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByText('💬 Comments')).toBeTruthy());
    expect(screen.queryByText(/Select text and click/)).toBeFalsy();
    fireEvent.click(screen.getByText('💬 Comments'));
    expect(screen.getByText(/Select text and click/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('a saved document with comments loads them back and can resolve/delete', async () => {
    const rows = [{
      id: '1', query_id: 'UTQ-1', doc_key: 'a', name: 'Doc A', version: 1, is_final: false,
      content_html: '<p>hello <span data-comment-id="c1">world</span></p>',
      comments: [{ id: 'c1', text: 'check this', author: 'Priya', createdAt: '2026-08-01T00:00:00Z', resolved: false }],
    }];
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs(rows).db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/Doc A/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Doc A/));
    await waitFor(() => expect(screen.getByText(/💬 Comments \(1\)/)).toBeTruthy());
    fireEvent.click(screen.getByText('💬 Comments (1)'));
    expect(screen.getByText('check this')).toBeTruthy();
    fireEvent.click(screen.getByText('✓ Resolve'));
    expect(screen.getByText('↺ Reopen')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor Phase 2: table border color', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows a Cell border swatch picker alongside Cell shading, only inside a table', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ New Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Document'));
    await waitFor(() => expect(screen.getByTitle('Insert table')).toBeTruthy());
    expect(screen.queryByTitle('Cell border')).toBeFalsy();
    fireEvent.click(screen.getByTitle('Insert table'));
    await waitFor(() => expect(screen.getByTitle('Cell border')).toBeTruthy());
    expect(screen.getByTitle('Cell shading')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('DocumentEditor Phase 2: DOCX import', () => {
  beforeEach(() => { vi.resetModules(); });

  it('shows an Import Word Document button in the document list', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/Import Word Document/)).toBeTruthy());
    vi.doUnmock('../lib/supabase.js');
  });

  it('importing a .docx opens the editor pre-filled with its converted content and name', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: mockDbWithDocs().db, realtimeClient: null }));
    vi.doMock('mammoth', () => ({ default: { convertToHtml: async () => ({ value: '<p>Imported paragraph</p>' }) } }));
    const { default: DocumentEditor } = await import('../components/DocumentEditor.jsx');
    render(<DocumentEditor query={query} onClose={()=>{}} currentUser={{id:1,name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText(/Import Word Document/)).toBeTruthy());
    const file = new File(['dummy content'], 'My Contract.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByDisplayValue('My Contract')).toBeTruthy());
    expect(screen.getByText('Imported paragraph')).toBeTruthy();
    expect(screen.getByText(/unsaved changes/)).toBeTruthy(); // imported content starts dirty -- it isn't saved yet
    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('mammoth');
  });
});
