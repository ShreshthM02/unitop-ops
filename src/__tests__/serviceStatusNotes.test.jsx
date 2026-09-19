import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Direct instruction: every service status should have its own note
// field, and it must always be editable -- even when the service (and
// the whole tour file) is otherwise read-only, since a note is
// information, not an action that could misrepresent status.

const mockDb = {
  from: vi.fn((table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      upsert: vi.fn(async (row) => ({ data: [row], error: null })),
      delete: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { ServicesList } = await import('../components/ServicesList.jsx');

const fakeQuery = { id: 'UTQ-2026-950' };
const sec = (label) => <div>{label}</div>;

describe('ServicesList: every service has an always-editable note field', () => {
  it('renders one note input per default service', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Add a note…').length).toBe(5));
  });

  it('typing a note and persisting saves it via saveQueryServices (upsert), notes included', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    const noteInputs = await waitFor(() => screen.getAllByPlaceholderText('Add a note…'));
    fireEvent.change(noteInputs[0], { target: { value: 'Confirmed verbally, awaiting written voucher' } });
    fireEvent.blur(noteInputs[0]);
    await waitFor(() => {
      const upsertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='query_services')
        .map(r=>r.value.upsert.mock.calls).flat();
      expect(upsertCalls.length).toBeGreaterThan(0);
      const firstServiceCall = upsertCalls.find(c => c[0].notes === 'Confirmed verbally, awaiting written voucher');
      expect(firstServiceCall).toBeTruthy();
    });
  });

  it('stays editable even when the tour file is read-only (cancelled), unlike the status dropdown', async () => {
    render(<ServicesList query={fakeQuery} sec={sec} readOnly={true}/>);
    const noteInputs = await waitFor(() => screen.getAllByPlaceholderText('Add a note…'));
    expect(noteInputs[0].disabled).toBe(false);
    const select = document.querySelector('select');
    expect(select.disabled).toBe(true);
  });
});

describe('ServicesList: the service itself (name and date) is now editable too, not just its status', () => {
  it('the service name is a real input, editable and persisted on blur', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    const nameInput = await waitFor(() => screen.getByDisplayValue('Hotel — Primary Hotel (Night 1–2)'));
    fireEvent.change(nameInput, { target: { value: 'Hotel — Renamed Property' } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      const upsertCalls = mockDb.from.mock.results
        .filter((r,i)=>mockDb.from.mock.calls[i][0]==='query_services')
        .map(r=>r.value.upsert.mock.calls).flat();
      expect(upsertCalls.some(c => c[0].name === 'Hotel — Renamed Property')).toBe(true);
    });
  });

  it('name and date inputs are disabled when the tour file is read-only, same as status', async () => {
    render(<ServicesList query={fakeQuery} sec={sec} readOnly={true}/>);
    const nameInput = await waitFor(() => screen.getByDisplayValue('Hotel — Primary Hotel (Night 1–2)'));
    expect(nameInput.disabled).toBe(true);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs[0].disabled).toBe(true);
  });
});
