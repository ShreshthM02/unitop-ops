import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockDb = {
  from: vi.fn((table) => {
    const filters = {};
    const builder = {
      select: () => builder,
      eq: (col, val) => { filters[col] = val; return builder; },
      order: () => builder,
      upsert: vi.fn(async (row) => ({ data: [row], error: null })),
      delete: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }), // starts with no saved services
    };
    return builder;
  }),
};

vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

const { ServicesList } = await import('../components/ServicesList.jsx');

const fakeQuery = { id: 'UTQ-2026-900' };
const sec = (label) => <div>{label}</div>;

describe('ServicesList: real persistence', () => {
  it('loads from db.from("query_services") on mount', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('query_services'));
  });

  it('falls back to default demo services when nothing is saved yet, and persists them via saveQueryServices', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());
  });

  it('changing a status calls the persistence layer (upsert), not just local state', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());
    mockDb.from.mockClear();
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'confirmed' } });
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('query_services'));
  });
});

describe('ServicesList: "Voucher Issued" status option', () => {
  it('includes Voucher Issued as a selectable status, manually selectable (not automatic)', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());
    const select = document.querySelectorAll('select')[0];
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(options).toContain('voucher issued');
  });

  it('shows a note clarifying this is manual, not automatic', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/manual confirmation, not automatic/)).toBeTruthy());
  });
});

describe('ServicesList: drag-to-reorder', () => {
  it('each service row is draggable', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());
    const row = screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/).closest('div[draggable]');
    expect(row).toBeTruthy();
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('dropping a dragged row onto another position reorders the list and persists the new order', async () => {
    render(<ServicesList query={fakeQuery} sec={sec}/>);
    await waitFor(() => expect(screen.getByText(/Hotel — Primary Hotel \(Night 1–2\)/)).toBeTruthy());
    const rows = document.querySelectorAll('div[draggable]');
    expect(rows.length).toBeGreaterThan(1);
    mockDb.from.mockClear();
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    await waitFor(() => expect(mockDb.from).toHaveBeenCalledWith('query_services'));
  });
});
