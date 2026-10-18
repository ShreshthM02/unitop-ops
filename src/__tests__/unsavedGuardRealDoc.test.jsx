import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn(() => {
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null })),
      update: vi.fn(async () => ({ data: [], error: null })),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};
vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));
const { default: TourBriefingSheet } = await import('../components/TourBriefingSheet.jsx');

describe('a real document: Tour Briefing Sheet', () => {
  const setup = () => { const onClose = vi.fn(); render(<TourBriefingSheet query={{ id: 'UTQ-1', groupName: 'G' }} template={{}} facilitators={[]} onClose={onClose} currentUser={{ id: 'x' }} />); return onClose; };
  const edit = async () => {
    const box = (await screen.findAllByPlaceholderText(/Optional/))[0];
    fireEvent.keyDown(box, { key: 'a' }); fireEvent.change(box, { target: { value: 'changed text' } });
  };
  it('asks after an edit, but not once it has been saved', async () => {
    const onClose = setup(); await edit();
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect(await screen.findByTestId('unsaved-dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep editing'));
    fireEvent.click(screen.getAllByText(/💾 Save v/)[0]);
    await new Promise(r => setTimeout(r, 100));
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect(onClose).toHaveBeenCalledTimes(1); expect(screen.queryByTestId('unsaved-dialog')).toBeNull();
  });
  it('does not ask when nothing was edited', async () => {
    const onClose = setup(); await screen.findAllByPlaceholderText(/Optional/);
    fireEvent.click(screen.getAllByText('Close')[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
