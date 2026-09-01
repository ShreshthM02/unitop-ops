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

describe('DocRegistryInline: tour_file_id now actually passed through (found by schema-completeness test)', () => {
  it('saveDocs passes tourFileId through to saveDocRegistry', async () => {
    const upsertSpy = vi.fn(async ()=>({data:[],error:null}));
    const mockDb = { from: () => ({ select:()=>({eq:()=>({order:async()=>({data:[]})})}), upsert: upsertSpy }) };
    vi.doMock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
    vi.resetModules();
    const { DocRegistryInline } = await import('../components/DocumentRegistry.jsx');
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:'x',name:'Priya'}}/>);
    await waitFor(() => expect(screen.getByText('+ Log Document')).toBeTruthy());
    fireEvent.click(screen.getByText('+ Log Document'));
    fireEvent.change(screen.getByPlaceholderText('Document name...'), { target: { value: 'New Doc' } });
    fireEvent.click(screen.getByText('Log'));
    await waitFor(() => expect(upsertSpy).toHaveBeenCalled());
    expect(upsertSpy.mock.calls[0][0].tour_file_id).toBe('TF-1');
  });
});

describe('Document type and source have an "Other" option that reveals a free-text field', () => {
  it('DocRegistryInline: selecting "Other" for Category reveals a text field; the typed text is what displays afterward', async () => {
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:1,name:'Priya'}} readOnly={false}/>);
    fireEvent.click(screen.getByText('+ Log Document'));
    fireEvent.change(screen.getByPlaceholderText('Document name...'), { target: { value: 'A weird one-off document' } });
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'Other' } }); // Category select
    expect(screen.getByPlaceholderText('Specify category...')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Specify category...'), { target: { value: 'Customs Declaration' } });
    fireEvent.click(screen.getByText('Log'));
    await waitFor(() => expect(screen.getByText(/Customs Declaration/)).toBeTruthy());
  });

  it('DocRegistryInline: selecting "Other" for Received From reveals its own text field, independent of Category', async () => {
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:1,name:'Priya'}} readOnly={false}/>);
    fireEvent.click(screen.getByText('+ Log Document'));
    fireEvent.change(screen.getByPlaceholderText('Document name...'), { target: { value: 'Doc B' } });
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'Other' } }); // Received From select
    expect(screen.getByPlaceholderText('Specify source...')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Specify category...')).toBeFalsy(); // Category wasn't touched, stays hidden
    fireEvent.change(screen.getByPlaceholderText('Specify source...'), { target: { value: 'Local Tour Guide' } });
    fireEvent.click(screen.getByText('Log'));
    await waitFor(() => expect(screen.getByText(/Local Tour Guide/)).toBeTruthy());
  });

  it('does not show either free-text field for a normal (non-Other) selection', async () => {
    render(<DocRegistryInline queryId="UTQ-1" tourFileId="TF-1" currentUser={{id:1,name:'Priya'}} readOnly={false}/>);
    fireEvent.click(screen.getByText('+ Log Document'));
    expect(screen.queryByPlaceholderText('Specify category...')).toBeFalsy();
    expect(screen.queryByPlaceholderText('Specify source...')).toBeFalsy();
  });
});
