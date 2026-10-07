import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileRemark } from '../lib/FileRemark.jsx';
import { G } from '../lib/constants.js';

const doc = (over = {}) => ({ id: 'd1', file_name: 'Passport.pdf', remarks: null, ...over });
const type = (html) => {
  const ed = document.querySelector('[contenteditable="true"]');
  ed.innerHTML = html; fireEvent.input(ed);
};

describe('FileRemark', () => {
  it('shows "+ Add remark" when empty and nothing else', () => {
    render(<FileRemark doc={doc()} G={G} onSave={vi.fn()} />);
    expect(screen.getByText('+ Add remark')).toBeTruthy();
    expect(screen.queryByTestId('file-remark')).toBeNull();
  });
  it('shows the saved remark sanitised, with an Edit link', () => {
    render(<FileRemark doc={doc({ remarks: '<b>Original</b><script>window.__x=1</script>' })} G={G} onSave={vi.fn()} />);
    const box = screen.getByTestId('file-remark');
    expect(box.querySelector('b').textContent).toBe('Original');
    expect(box.innerHTML).not.toContain('script');
    expect(screen.getByText('✎ Edit remark')).toBeTruthy();
  });
  it('saves what was typed', async () => {
    const onSave = vi.fn(async () => ({ success: true }));
    render(<FileRemark doc={doc()} G={G} onSave={onSave} />);
    fireEvent.click(screen.getByText('+ Add remark'));
    type('<i>Expires soon</i>');
    fireEvent.click(screen.getByText('Save remark'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('<i>Expires soon</i>'));
    await waitFor(() => expect(screen.queryByTestId('file-remark-editor')).toBeNull());
  });
  it('an emptied editor saves "" (clears the remark)', async () => {
    const onSave = vi.fn(async () => ({ success: true }));
    render(<FileRemark doc={doc({ remarks: 'old' })} G={G} onSave={onSave} />);
    fireEvent.click(screen.getByText('✎ Edit remark'));
    type('<p><br></p>');
    fireEvent.click(screen.getByText('Save remark'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
  });
  it('keeps the editor open and shows the error when saving fails', async () => {
    render(<FileRemark doc={doc()} G={G} onSave={async () => ({ success: false, error: 'Boom' })} />);
    fireEvent.click(screen.getByText('+ Add remark'));
    type('x');
    fireEvent.click(screen.getByText('Save remark'));
    expect(await screen.findByText('Boom')).toBeTruthy();
    expect(screen.getByTestId('file-remark-editor')).toBeTruthy();
  });
  it('Cancel discards the draft', () => {
    render(<FileRemark doc={doc()} G={G} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('+ Add remark'));
    type('draft');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('+ Add remark')).toBeTruthy();
  });
  it('read-only viewers see the remark but no add/edit control', () => {
    render(<FileRemark doc={doc({ remarks: 'note' })} G={G} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByTestId('file-remark')).toBeTruthy();
    expect(screen.queryByText('✎ Edit remark')).toBeNull();
  });
});
