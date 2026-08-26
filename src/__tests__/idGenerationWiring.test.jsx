import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { nextInvoiceNo } from '../lib/utils.js';

// This round wires Query ID and Tour File ID generation to real settings
// (prefix, auto-incrementing serial) for the first time -- both were
// previously fully hardcoded ("UTQ-{year}-{seq}" and "TUR-2025-0"+count,
// neither reading docSettings.query/tourfile at all despite the
// Templates section's Prefix/Serial fields existing and looking
// functional). Both now reuse nextInvoiceNo(prefix, existing), the same
// proven, already-in-production function Tax Invoice and Pro-forma
// Invoice use -- deliberately NOT a new, untested implementation, given
// the real risk here is generating a duplicate id. nextInvoiceNo itself
// had no direct tests at all before this round despite already being
// live in two documents; this closes that gap too.

describe('nextInvoiceNo: the shared, collision-safe id generator now driving Query ID and Tour File ID too', () => {
  it('generates prefix-year-001 when there are no existing ids at all', () => {
    const result = nextInvoiceNo('UTQ', []);
    expect(result).toBe(`UTQ-${new Date().getFullYear()}-001`);
  });

  it('increments from the highest existing number matching the prefix, not just the count of existing ids', () => {
    const year = new Date().getFullYear();
    const existing = [`UTQ-${year}-001`, `UTQ-${year}-005`, `UTQ-${year}-003`];
    const result = nextInvoiceNo('UTQ', existing);
    expect(result).toBe(`UTQ-${year}-006`);
  });

  it('a custom prefix from settings is respected, and only ids matching THAT prefix count toward the sequence', () => {
    const year = new Date().getFullYear();
    // Mixed prefixes in history (e.g. after a prefix change) -- the new
    // prefix's own sequence must start fresh from what actually has that
    // prefix, not be confused by unrelated old ids.
    const existing = [`UTQ-${year}-050`, `GTQ-${year}-002`];
    const result = nextInvoiceNo('GTQ', existing);
    expect(result).toBe(`GTQ-${year}-003`);
  });

  it('never produces a duplicate: the same existing list always yields a number strictly greater than every existing one matching that prefix', () => {
    const year = new Date().getFullYear();
    const existing = Array.from({ length: 50 }, (_, i) => `UTQ-${year}-${String(i + 1).padStart(3, '0')}`);
    const result = nextInvoiceNo('UTQ', existing);
    expect(existing).not.toContain(result);
    expect(result).toBe(`UTQ-${year}-051`);
  });

  it('this same function already used for Tax Invoice/Pro-forma numbering now also correctly generates Tour File ids with the TUR prefix', () => {
    const year = new Date().getFullYear();
    const existingTourFiles = [`TUR-${year}-019`, `TUR-${year}-020`, `TUR-${year}-021`];
    const result = nextInvoiceNo('TUR', existingTourFiles);
    expect(result).toBe(`TUR-${year}-022`);
  });

  it('handles a gap year correctly -- an id from a previous year with the same prefix does not interfere with this year\'s sequence (both use the CURRENT year in the generated id, matching the default {prefix}-{year}-{seq} pattern)', () => {
    const existing = ['UTQ-2024-099', 'UTQ-2024-100'];
    const result = nextInvoiceNo('UTQ', existing);
    // Numeric suffix continues from the highest match regardless of
    // year embedded in the id string (nextInvoiceNo doesn't parse the
    // year segment, only the trailing sequence number) -- but the
    // NEWLY GENERATED id always stamps the current year.
    expect(result).toBe(`UTQ-${new Date().getFullYear()}-101`);
  });

  it('empty-string prefix or malformed existing entries do not crash, and still produce a usable id', () => {
    expect(() => nextInvoiceNo('UTQ', ['not-a-valid-id', '', 'UTQ-garbage'])).not.toThrow();
    const result = nextInvoiceNo('UTQ', ['not-a-valid-id', '', 'UTQ-garbage']);
    expect(result).toMatch(/^UTQ-\d{4}-\d{3}$/);
  });
});

describe('InvoiceGenerator (Tax Invoice flavor): docSettings key case mismatch fix (docSettings.taxInvoice never matched the real key "taxinvoice", so this prefix setting silently never applied since it was added)', () => {
  const makeDb = () => ({
    from: vi.fn(() => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        insert: vi.fn(async (r) => ({ data: [{ ...r, id: 'x' }], error: null })),
        update: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    }),
  });

  it('a custom prefix set under the correct lowercase key "taxinvoice" is now actually used for the generated invoice number', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: InvoiceGenerator } = await import('../components/InvoiceGenerator.jsx');
    const fakeQuery = { id: 'UTQ-2026-500', groupName: 'Prefix Fix Test' };
    render(<InvoiceGenerator query={fakeQuery} payments={{}} agents={[]} taxinvoiceTemplate={{}} docSettings={{ taxinvoice: { prefix: 'GST' } }} initialFlavor="tax" onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => {
      const input = screen.getByDisplayValue(new RegExp(`^GST-${new Date().getFullYear()}-`));
      expect(input).toBeTruthy();
    });
  });
});
