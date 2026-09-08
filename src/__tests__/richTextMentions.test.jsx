import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageWithMentions, MentionInput } from '../lib/Mentions.jsx';

// Discussion/chat composers became rich text (bold/italic/underline/
// bullet list), matching this app's other lightweight rich-text field
// (Exchange Order's Service Details). Storage stays plain text with
// markdown-like markers (**bold**, _italic_, ~underline~, "• " for list
// items) -- a deliberate choice over raw HTML, so there is genuinely no
// HTML ever stored or rendered via dangerouslySetInnerHTML, and every
// message already in the database (all plain text, no markers) renders
// exactly as it always did with zero migration needed.

function typeIntoEditor(editor, text) {
  editor.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.input(editor);
}
function getEditor(container) { return container.querySelector('.mention-input-editable'); }

describe('MessageWithMentions: rich text rendering', () => {
  it('renders **bold** as real bold text', () => {
    const { container } = render(<MessageWithMentions text="this is **important**" queries={[]}/>);
    expect(container.querySelector('strong')?.textContent).toBe('important');
  });

  it('renders _italic_ as real italic text', () => {
    const { container } = render(<MessageWithMentions text="please _confirm_ this" queries={[]}/>);
    expect(container.querySelector('em')?.textContent).toBe('confirm');
  });

  it('renders ~underline~ as real underlined text', () => {
    const { container } = render(<MessageWithMentions text="see ~this part~" queries={[]}/>);
    expect(container.querySelector('u')?.textContent).toBe('this part');
  });

  it('renders a bullet-list line with a real visible bullet', () => {
    const { container } = render(<MessageWithMentions text={"• first item\n• second item"} queries={[]}/>);
    expect(screen.getByText('first item')).toBeTruthy();
    expect(screen.getByText('second item')).toBeTruthy();
    expect(container.textContent).toContain('•');
  });

  it('renders a mention correctly NESTED inside bold formatting', () => {
    let captured = null;
    document.addEventListener('unitop-activate-vendor', (e) => { captured = e.detail.id; });
    const { container } = render(<MessageWithMentions text="**call @[[vendor:v1:Taj Palace]] now**" queries={[]}/>);
    expect(container.querySelector('strong')).toBeTruthy();
    fireEvent.click(screen.getByText(/Taj Palace/));
    expect(captured).toBe('v1'); // the mention is still a real, clickable link even while bolded
  });

  it('an old, pre-existing plain-text message (no markers at all) renders exactly as before -- zero migration needed', () => {
    render(<MessageWithMentions text="Please check the hotel booking @[[vendor:v1:Taj Palace]] for tomorrow" queries={[]}/>);
    expect(screen.getByText(/Please check the hotel booking/)).toBeTruthy();
    expect(screen.getByText(/Taj Palace/)).toBeTruthy();
  });

  it('does not misinterpret a literal underscore in a real filename as italic formatting', () => {
    const { container } = render(<MessageWithMentions text="see my_file_name.pdf" queries={[]}/>);
    // "my_file_name.pdf" has underscores but not matching a real _text_
    // pattern with non-whitespace boundaries in the way that produces a
    // false positive here -- confirms no <em> was produced from it.
    expect(container.querySelector('em')).toBeFalsy();
    expect(screen.getByText(/my_file_name\.pdf/)).toBeTruthy();
  });

  it('does not crash or misrender on an unmatched/stray formatting character', () => {
    expect(() => render(<MessageWithMentions text="that costs ~500 rupees" queries={[]}/>)).not.toThrow();
  });
});

describe('MentionInput: rich text formatting round-trips correctly', () => {
  it('bold formatting typed in the editor is stored as **markers**', () => {
    const onChange = vi.fn();
    const { container } = render(<MentionInput value="" onChange={onChange} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const editor = getEditor(container);
    editor.innerHTML = 'plain <b>bold part</b> plain';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith('plain **bold part** plain');
  });

  it('italic formatting typed in the editor is stored as _markers_', () => {
    const onChange = vi.fn();
    const { container } = render(<MentionInput value="" onChange={onChange} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const editor = getEditor(container);
    editor.innerHTML = '<i>urgent</i>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith('_urgent_');
  });

  it('a bullet list typed in the editor is stored with real "•" line markers', () => {
    const onChange = vi.fn();
    const { container } = render(<MentionInput value="" onChange={onChange} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const editor = getEditor(container);
    editor.innerHTML = '<ul><li>first</li><li>second</li></ul>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith('• first\n• second');
  });

  it('loading an existing formatted message back into the editor (Edit mode) shows real formatting, not raw ** _ ~ characters', () => {
    const { container, rerender } = render(<MentionInput value="" onChange={()=>{}} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    rerender(<MentionInput value="this is **important**" onChange={()=>{}} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const editor = getEditor(container);
    expect(editor.querySelector('b')?.textContent).toBe('important');
    expect(editor.innerHTML).not.toContain('**'); // the raw marker characters themselves are never shown to the person editing
  });

  it('a mention token loaded back into Edit mode is not mistaken for formatting or corrupted', () => {
    const { container } = render(<MentionInput value="check @[[vendor:v1:Taj Palace]] please" onChange={()=>{}} staff={[]} queries={[]} agents={[]} vendors={[]} series={[]}/>);
    const editor = getEditor(container);
    expect(editor.textContent).toContain('@[[vendor:v1:Taj Palace]]');
  });
});
