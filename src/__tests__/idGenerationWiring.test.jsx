import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { nextInvoiceNo, formatDocPattern, nextDocNumber } from '../lib/utils.js';

// This round originally wired Query ID and Tour File ID generation to
// real settings by reusing nextInvoiceNo(prefix, existing) -- both were
// previously fully hardcoded. A LATER round found that approach itself
// was incomplete: nextInvoiceNo only ever respected the configured
// PREFIX, silently ignoring the rest of the configured pattern
// ({group}/{sector}/{date}/{id}/{tourfile}) entirely -- the Settings
// page's rich pattern editor only ever fed its own preview, never real
// generation. Query ID, Tour File ID, Tax/Pro-forma Invoice, and
// Exchange Order numbering all now go through nextDocNumber() instead,
// which actually applies the full configured pattern and uses a real
// persistent serial counter (not derived from parsing existing id
// strings, which can't survive an arbitrary user-configured pattern).
// nextInvoiceNo() itself is kept, tested below, and still used as
// formatDocPattern's fallback shape has NOTHING to do with it -- these
// are just its own original, still-valid, still-passing tests.

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

  it('generic enough to work correctly with any prefix, e.g. a "TUR" tour-file-style prefix (this exact function is no longer what generates real Tour File ids -- that\'s nextDocNumber now -- but it\'s still a real, tested, reusable building block)', () => {
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

describe('InvoiceGenerator (Tax Invoice flavor): a custom prefix AND pattern are now genuinely respected, not just the prefix half of the old hardcoded shape', () => {
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
    render(<InvoiceGenerator query={fakeQuery} payments={{}} agents={[]} taxinvoiceTemplate={{}} docSettings={{ taxinvoice: { prefix: 'GST', pattern: '{prefix}-{year}-{seq}', serial: 1 } }} initialFlavor="tax" onClose={()=>{}} currentUser={{id:'x'}}/>);
    await waitFor(() => {
      const input = screen.getByDisplayValue(new RegExp(`^GST-${new Date().getFullYear()}-`));
      expect(input).toBeTruthy();
    });
  });
});

describe('formatDocPattern: real pattern-based document number formatting', () => {
  const year = new Date().getFullYear();

  it('substitutes every placeholder correctly', () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const result = formatDocPattern('{prefix}-{seq}-{group}-{sector}-{date}-{year}', {
      prefix: 'QT', seq: 7, group: 'Smith Family', sector: 'Golden Triangle',
    });
    expect(result).toBe(`QT-007-Smith_Family-Golden_Triangle-${dd}-${mm}-${year}-${year}`);
  });

  it('{id} is a smart placeholder: resolves to the query id before conversion...', () => {
    const result = formatDocPattern('{prefix}-{seq}-{id}', { prefix: 'CS', seq: 1, id: 'UTQ-2026-050' });
    expect(result).toBe('CS-001-UTQ-2026-050');
  });

  it('...and automatically switches to the tour file id once one exists, with no pattern change needed', () => {
    const result = formatDocPattern('{prefix}-{seq}-{id}', { prefix: 'CS', seq: 1, id: 'UTQ-2026-050', tourfile: 'TUR-2026-012' });
    expect(result).toBe('CS-001-TUR-2026-012');
  });

  it('{tourfile} stays available on its own for blank-until-converted behavior specifically', () => {
    const result = formatDocPattern('{prefix}-{seq}-{tourfile}', { prefix: 'TB', seq: 1, id: 'UTQ-2026-050' });
    expect(result).toBe('TB-001-'); // blank, not the query id -- {tourfile} never falls back
  });

  it('group/sector are sanitized for safe use in a filename -- spaces become underscores, unsafe characters stripped', () => {
    const result = formatDocPattern('{group}', { group: "O'Brien & Sons / Travel!" });
    expect(result).toBe('OBrien__Sons__Travel');
  });

  it('sequence is always 3-digit zero-padded', () => {
    expect(formatDocPattern('{seq}', { seq: 7 })).toBe('007');
    expect(formatDocPattern('{seq}', { seq: 42 })).toBe('042');
    expect(formatDocPattern('{seq}', { seq: 1234 })).toBe('1234');
  });

  it('falls back to a sensible default shape when no pattern is configured at all', () => {
    expect(formatDocPattern(null, { prefix: 'X', seq: 1 })).toBe('X-001');
    expect(formatDocPattern(undefined, { prefix: 'X', seq: 1 })).toBe('X-001');
  });
});

describe('nextDocNumber: real persistent-serial generation, replacing string-parsed sequences', () => {
  it('reads the current serial, formats it into the configured pattern, and returns settings with that type\u2019s serial bumped -- nothing else', () => {
    const docSettings = { quotation: { prefix: 'QT', pattern: '{prefix}-{seq}-{group}', serial: 5 }, agents: { serial: 99 } };
    const { number, updatedSettings } = nextDocNumber(docSettings, 'quotation', { group: 'Test Group' });
    expect(number).toBe('QT-005-Test_Group');
    expect(updatedSettings.quotation.serial).toBe(6);
    expect(updatedSettings.quotation.prefix).toBe('QT'); // untouched, just serial bumped
    expect(updatedSettings.agents.serial).toBe(99); // a DIFFERENT doc type's settings are untouched
  });

  it('defaults to serial 1 when a document type has never been configured with one', () => {
    const { number, updatedSettings } = nextDocNumber({}, 'brand_new_type', { });
    expect(number).toBe('-001'); // no prefix configured either
    expect(updatedSettings.brand_new_type.serial).toBe(2);
  });

  it('never mutates the docSettings object passed in -- returns a new one, matching how every other setting in this app is updated', () => {
    const original = { quotation: { prefix: 'QT', serial: 1 } };
    const { updatedSettings } = nextDocNumber(original, 'quotation', {});
    expect(original.quotation.serial).toBe(1); // untouched
    expect(updatedSettings).not.toBe(original);
  });
});

describe('Exchange Order numbering: two real, separate bugs fixed together', () => {
  const fakeVendors = [{ id: 'VND-001', name: 'Nanking Restaurant', type: 'Restaurant', active: true }];
  const fakeQuery = { id: 'UTQ-2026-900', groupName: 'EO Numbering Test', tourFileId: 'TUR-900', destination: 'Kerala' };

  function makeDb() {
    return {
      from: (table) => {
        const builder = {
          select: () => builder, eq: () => builder, order: () => builder,
          insert: async (r) => ({ data: [{ ...r, id: 'new-id' }], error: null }),
          update: async () => ({ data: [], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        return builder;
      },
    };
  }

  it('a custom configured pattern is genuinely used, not the hardcoded {prefix}-{year}-{seq} default -- and docSettings is real, not the static DEFAULT_DOC_SETTINGS constant', async () => {
    const db = makeDb();
    vi.doMock('../lib/supabase.js', () => ({ db, realtimeClient: null }));
    vi.resetModules();
    const { default: ExchangeOrderGenerator } = await import('../components/ExchangeOrderGenerator.jsx');
    const onSaveDocSettings = vi.fn();
    const docSettings = { exchange: { prefix: 'VOUCHER', pattern: '{prefix}-{seq}-{group}', serial: 9 } };
    render(<ExchangeOrderGenerator query={fakeQuery} template={{}} vendors={fakeVendors} docSettings={docSettings} onSaveDocSettings={onSaveDocSettings} onClose={()=>{}} currentUser={{id:'x',name:'Test'}}/>);
    fireEvent.change(await screen.findByDisplayValue('Select vendor...'), { target: { value: 'VND-001' } });
    fireEvent.click(screen.getByText('✓ Save Exchange Order'));
    await waitFor(() => expect(screen.getByText(/VOUCHER-009-EO_Numbering_Test saved/)).toBeTruthy());
    // The bump was actually persisted, not just used locally
    expect(onSaveDocSettings).toHaveBeenCalledWith(expect.objectContaining({ exchange: expect.objectContaining({ serial: 10 }) }));
    vi.doUnmock('../lib/supabase.js');
  });
});
