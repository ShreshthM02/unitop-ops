import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RichTextEditor } from '../lib/helpers.jsx';

// Item 11: a shared signature library replacing the old rigid,
// single-template correspondent auto-fill. Named rich-text blocks,
// picked from a toolbar button inside the closing/sign-off field
// itself (not a separate control), inserted as real editable text at
// the cursor -- never a locked block.

describe('utils.js: signature CRUD', () => {
  it('loadSignatures maps db rows to the {id, name, content} shape the UI expects', async () => {
    const { loadSignatures } = await import('../lib/utils.js');
    const db = { from: () => ({ select: () => ({ order: async () => ({ data: [
      { id: 'sig-1', name: 'Formal', content_html: '<p>Regards,</p>' },
    ], error: null }) }) }) };
    const result = await loadSignatures(db);
    expect(result).toEqual([{ id: 'sig-1', name: 'Formal', content: '<p>Regards,</p>' }]);
  });

  it('loadSignatures fails gracefully to an empty array, never throws', async () => {
    const { loadSignatures } = await import('../lib/utils.js');
    const db = { from: () => { throw new Error('network fail'); } };
    await expect(loadSignatures(db)).resolves.toEqual([]);
  });

  it('saveSignature inserts a new signature (no id) with the right payload shape', async () => {
    const { saveSignature } = await import('../lib/utils.js');
    const insert = vi.fn(async (payload) => ({ data: [{ ...payload, id: 'new-id' }], error: null }));
    const db = { from: () => ({ insert }) };
    const { id, error } = await saveSignature(db, { name: 'Casual', content: '<p>Cheers,</p>' });
    expect(error).toBeNull();
    expect(id).toBe('new-id');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Casual', content_html: '<p>Cheers,</p>' }));
  });

  it('saveSignature upserts an existing signature (has id)', async () => {
    const { saveSignature } = await import('../lib/utils.js');
    const upsert = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    const { id, error } = await saveSignature(db, { id: 'sig-1', name: 'Updated', content: '<p>New content</p>' });
    expect(error).toBeNull();
    expect(id).toBe('sig-1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'sig-1', name: 'Updated' }));
  });

  it('deleteSignature calls delete().eq() with the right id', async () => {
    const { deleteSignature } = await import('../lib/utils.js');
    const eq = vi.fn(async () => ({ error: null }));
    const db = { from: () => ({ delete: () => ({ eq }) }) };
    const { error } = await deleteSignature(db, 'sig-1');
    expect(error).toBeNull();
    expect(eq).toHaveBeenCalledWith('id', 'sig-1');
  });
});

describe('RichTextEditor: signature picker', () => {
  const sigs = [
    { id: 's1', name: 'Formal Sign-off', content: '<p>Thanks & Regards,<br/>Tour Deptt.</p>' },
    { id: 's2', name: "Priya's Signature", content: '<p>Warm regards,<br/>Priya</p>' },
  ];

  it('the Signature button is hidden when no signatures are passed at all', () => {
    render(<RichTextEditor value="" onChange={()=>{}}/>);
    expect(screen.queryByText(/Signature/)).toBeFalsy();
  });

  it('the Signature button is hidden when an empty array is passed', () => {
    render(<RichTextEditor value="" onChange={()=>{}} signatures={[]}/>);
    expect(screen.queryByText(/Signature/)).toBeFalsy();
  });

  it('shows the button and a dropdown with name + text preview when signatures exist', () => {
    render(<RichTextEditor value="" onChange={()=>{}} signatures={sigs}/>);
    expect(screen.getByText('✒ Signature ▾')).toBeTruthy();
    fireEvent.click(screen.getByText('✒ Signature ▾'));
    expect(screen.getByText('Formal Sign-off')).toBeTruthy();
    expect(screen.getByText("Priya's Signature")).toBeTruthy();
    expect(screen.getByText('Thanks & Regards, Tour Deptt.')).toBeTruthy(); // stripped-HTML preview, real spacing at line breaks
  });

  it('picking a signature inserts it and calls onChange with the updated content', async () => {
    const onChange = vi.fn();
    // jsdom doesn't implement execCommand -- stub it to simulate a real
    // insertHTML at the (empty, in this test) cursor position.
    document.execCommand = vi.fn((cmd, _, val) => {
      if (cmd === 'insertHTML') {
        const editor = document.querySelector('[contenteditable="true"]');
        editor.innerHTML += val;
      }
      return true;
    });
    render(<RichTextEditor value="" onChange={onChange} signatures={sigs}/>);
    fireEvent.click(screen.getByText('✒ Signature ▾'));
    fireEvent.click(screen.getByText('Formal Sign-off'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Thanks &amp; Regards')));
    // dropdown closes after picking
    expect(screen.queryByText("Priya's Signature")).toBeFalsy();
  });

  it('readOnly mode never shows the signature button, matching the other toolbar buttons', () => {
    render(<RichTextEditor value="<p>content</p>" onChange={()=>{}} signatures={sigs} readOnly/>);
    expect(screen.queryByText(/Signature/)).toBeFalsy();
  });
});

describe('TemplatesHub: Signatures section', () => {
  it('the sidebar shows a Signatures entry, and clicking it shows the create form', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) }, realtimeClient: null }));
    vi.resetModules();
    const { default: TemplatesHub } = await import('../components/TemplatesHub.jsx');
    render(<TemplatesHub docTemplates={{}} onSaveDocTemplates={()=>{}} docSettings={{}} setDocSettings={()=>{}}/>);
    fireEvent.click(screen.getByText(/Signatures/));
    await waitFor(() => expect(screen.getByText('No signatures saved yet.')).toBeTruthy());
    fireEvent.click(screen.getByText('+ New Signature'));
    expect(screen.getByText('New Signature')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Formal Sign-off/)).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });

  it('an existing signature shows its name and a rendered preview of its content', async () => {
    const db = { from: () => ({ select: () => ({ order: async () => ({ data: [
      { id: 'sig-1', name: 'Formal', content_html: '<p>Thanks & Regards</p>' },
    ], error: null }) }) }) };
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: TemplatesHub } = await import('../components/TemplatesHub.jsx');
    render(<TemplatesHub docTemplates={{}} onSaveDocTemplates={()=>{}} docSettings={{}} setDocSettings={()=>{}}/>);
    fireEvent.click(screen.getByText(/Signatures/));
    await waitFor(() => expect(screen.getByText('Formal')).toBeTruthy());
    expect(screen.getByText('Thanks & Regards')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});

describe('Signature picker wired onto the three real target fields', () => {
  it('Quotation\u2019s closing+sign-off field receives the signatures prop', async () => {
    vi.doMock('../lib/supabase.js', () => ({ db: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }, realtimeClient: null }));
    vi.resetModules();
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '', closingSignoff: '', monumentNote: '' };
    const query = { id: 'UTQ-1', groupName: 'Test Group', tourFileId: 'TF-1' };
    const sigs = [{ id: 's1', name: 'Test Sig', content: '<p>Regards</p>' }];
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:1,name:'Priya'}} signatures={sigs}/>);
    await waitFor(() => expect(screen.getByText('✍ Closing')).toBeTruthy());
    expect(screen.getByText('✒ Signature ▾')).toBeTruthy();
    vi.doUnmock('../lib/supabase.js');
  });
});
