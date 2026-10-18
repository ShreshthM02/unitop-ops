import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { useUnsavedGuard } from '../lib/useUnsavedGuard.jsx';

function Doc({ onClose, onSave, readOnly }) {
  const [text, setText] = useState('start');
  useEffect(() => { const t = setTimeout(() => setText(x => (x === 'start' ? 'loaded by itself' : x)), 60); return () => clearTimeout(t); }, []);
  const guard = useUnsavedGuard({ snapshot: { text }, onClose, onSave: async () => { await onSave(text); return true; }, enabled: !readOnly });
  return <div>
    <input aria-label="field" value={text} onChange={e => setText(e.target.value)} />
    <button onClick={guard.requestClose}>close</button>
    {guard.dialog}
  </div>;
}

describe('useUnsavedGuard', () => {
  it('closes straight away when nothing was changed', () => {
    const onClose = vi.fn(); render(<Doc onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalled(); expect(screen.queryByTestId('unsaved-dialog')).toBeNull();
  });
  it('asks when the person edited, and "Exit without saving" leaves', async () => {
    const onClose = vi.fn(); render(<Doc onClose={onClose} onSave={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'x' });
    fireEvent.change(screen.getByLabelText('field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('close'));
    expect(await screen.findByTestId('unsaved-dialog')).toBeTruthy(); expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Exit without saving'));
    expect(onClose).toHaveBeenCalled();
  });
  it('"Save as new version & exit" saves first, then leaves', async () => {
    const onClose = vi.fn(), onSave = vi.fn(async () => {}); render(<Doc onClose={onClose} onSave={onSave} />);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'x' });
    fireEvent.change(screen.getByLabelText('field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('close'));
    fireEvent.click(await screen.findByText(/Save as new version/));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith('edited');
  });
  it('"Keep editing" stays', async () => {
    const onClose = vi.fn(); render(<Doc onClose={onClose} onSave={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'x' });
    fireEvent.change(screen.getByLabelText('field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('close'));
    fireEvent.click(await screen.findByText('Keep editing'));
    expect(onClose).not.toHaveBeenCalled(); expect(screen.queryByTestId('unsaved-dialog')).toBeNull();
  });
  it('a change that arrives by itself (data loading, no typing) is not an unsaved edit', async () => {
    const onClose = vi.fn(); render(<Doc onClose={onClose} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('field').value).toBe('loaded by itself'));
    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalled();
  });
  it('does nothing in read-only mode', () => {
    const onClose = vi.fn(); render(<Doc onClose={onClose} onSave={vi.fn()} readOnly />);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'x' });
    fireEvent.change(screen.getByLabelText('field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('close'));
    expect(onClose).toHaveBeenCalled();
  });
});
