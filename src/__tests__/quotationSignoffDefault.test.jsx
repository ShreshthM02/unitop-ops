import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockDb = {
  from: vi.fn((t) => {
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


describe('#2 of the general backlog: Quotation signoff defaults to the actual internalCorrespondent, not a generic department signature', () => {
  const mockDb = {
    from: vi.fn(() => ({
      select: () => mockDb.from(),
      eq: () => mockDb.from(),
      order: () => mockDb.from(),
      insert: async (r) => ({ data: [{ ...r, id: 'x' }], error: null }),
      update: async () => ({ data: [], error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    })),
  };
  vi.mock('../lib/supabase.js', () => ({ db: mockDb, realtimeClient: null }));

  it('uses the query\'s internalCorrespondent name in the signoff when set', async () => {
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: '', monumentNote: '' };
    const query = { id: 'UTQ-2026-1900', groupName: 'Signoff Test', internalCorrespondent: 'Priya Sharma' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue(/Priya Sharma/)).toBeTruthy();
  });

  it('falls back to the template default when internalCorrespondent is not set', async () => {
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greeting: '', openingLine: '', closingLine: '', signoff: 'Custom Template Default', monumentNote: '' };
    const query = { id: 'UTQ-2026-1901', groupName: 'No Correspondent Test' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByDisplayValue('Custom Template Default')).toBeTruthy();
  });
});
