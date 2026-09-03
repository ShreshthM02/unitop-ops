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
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '', closingSignoff: '', monumentNote: '' };
    const query = { id: 'UTQ-2026-1900', groupName: 'Signoff Test', internalCorrespondent: 'Priya Sharma' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByText(/Priya Sharma/)).toBeTruthy();
  });

  it('falls back to the template default when internalCorrespondent is not set', async () => {
    const { default: QuotationGenerator } = await import('../components/QuotationGenerator.jsx');
    // 2.3: closingLine+signoff merged into one field, closingSignoff --
    // a real caller always supplies an already-migrated template (via
    // mergeDocTemplates, which runs once at app load), so this fixture
    // uses the new field name directly, matching that real shape.
    const fakeTemplate = { includes: [], excludes: [], monuments: [], showMonuments: true, greetingOpening: '', closingSignoff: 'Custom Template Default', monumentNote: '' };
    const query = { id: 'UTQ-2026-1901', groupName: 'No Correspondent Test' };
    render(<QuotationGenerator query={query} template={fakeTemplate} onClose={()=>{}} onSaved={()=>{}} currentUser={{id:'x'}}/>);
    expect(await screen.findByText('Custom Template Default')).toBeTruthy();
  });
});
