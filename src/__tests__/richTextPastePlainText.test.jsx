import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextEditor } from '../lib/helpers.jsx';

// Real, direct request: pasting text from another source (e.g. Word, a
// webpage) into any rich text editor in the app was carrying the
// source's own formatting (font, size, color) straight in, with no way
// to change any of that here -- these editors have no font/size
// control at all. Paste should insert plain text only, picking up the
// editor's own default styling like anything typed directly.

function firePaste(el, text, html) {
  const dataTransfer = {
    getData: (type) => (type === 'text/plain' ? text : (html || '')),
  };
  const event = new Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = dataTransfer;
  el.dispatchEvent(event);
}

describe('RichTextEditor (shared): paste strips source formatting, keeps only plain text', () => {
  it('a paste event is intercepted and calls execCommand("insertText", ...) rather than letting the browser insert the original HTML', () => {
    let onChangeCalled = false;
    render(<RichTextEditor value="" onChange={() => { onChangeCalled = true; }} />);
    const editable = document.querySelector('[contenteditable="true"]');
    expect(editable).toBeTruthy();

    const originalExecCommand = document.execCommand;
    let capturedCmd = null, capturedValue = null;
    document.execCommand = (cmd, ui, value) => { capturedCmd = cmd; capturedValue = value; return true; };

    firePaste(editable, 'Plain pasted text', '<b style="font-size:40px;color:red">Plain pasted text</b>');

    expect(capturedCmd).toBe('insertText');
    expect(capturedValue).toBe('Plain pasted text');
    document.execCommand = originalExecCommand;
  });

  it('the pasted plain text is the exact clipboard plain-text value, not derived from the rich HTML', () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const editable = document.querySelector('[contenteditable="true"]');
    const originalExecCommand = document.execCommand;
    let capturedValue = null;
    document.execCommand = (cmd, ui, value) => { if (cmd === 'insertText') capturedValue = value; return true; };
    firePaste(editable, 'Just the plain version', '<div style="font-family:Comic Sans MS;font-size:72px"><span>Just</span> the plain version</div>');
    expect(capturedValue).toBe('Just the plain version');
    document.execCommand = originalExecCommand;
  });
});
