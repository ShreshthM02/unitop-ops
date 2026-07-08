import { describe, it, expect } from 'vitest';
import { buildPricingTimeline, loadPricingTimeline } from '../lib/utils.js';

const staff = [
  { id: 'staff-1', name: 'Priya' },
  { id: 'staff-2', name: 'Ravi' },
];

describe('buildPricingTimeline', () => {
  it('merges Cost Sheet and Quotation versions into one chronologically sorted list', () => {
    const costSheets = [
      { version: 1, isFinal: false, note: 'Initial estimate', createdAt: '2026-08-01T10:00:00Z', createdBy: 'staff-1' },
      { version: 2, isFinal: false, note: 'Client requested discount', createdAt: '2026-08-02T09:00:00Z', createdBy: 'staff-1' },
    ];
    const quotations = [
      { version: 1, isFinal: false, note: 'First quote to client', createdAt: '2026-08-01T14:00:00Z', createdBy: 'staff-2', costSheetId: 'cs-1' },
      { version: 2, isFinal: true, note: 'Client accepted', createdAt: '2026-08-02T11:30:00Z', createdBy: 'staff-2', costSheetId: 'cs-2' },
    ];
    const timeline = buildPricingTimeline(costSheets, quotations, staff);
    expect(timeline.length).toBe(4);
    // Chronological order regardless of source document
    expect(timeline.map(e => `${e.type}v${e.version}`)).toEqual([
      'costsheetv1', 'quotationv1', 'costsheetv2', 'quotationv2',
    ]);
  });

  it('resolves createdBy uuid to the real staff name', () => {
    const timeline = buildPricingTimeline(
      [{ version: 1, createdAt: '2026-08-01T10:00:00Z', createdBy: 'staff-1' }], [], staff
    );
    expect(timeline[0].by).toBe('Priya');
  });

  it('falls back to "Unknown" for an unresolvable staff id, without crashing', () => {
    const timeline = buildPricingTimeline(
      [{ version: 1, createdAt: '2026-08-01T10:00:00Z', createdBy: 'nonexistent-id' }], [], staff
    );
    expect(timeline[0].by).toBe('Unknown');
  });

  it('carries the isFinal flag and note through correctly for both document types', () => {
    const timeline = buildPricingTimeline(
      [{ version: 1, isFinal: true, note: 'Approved', createdAt: '2026-08-01T10:00:00Z', createdBy: 'staff-1' }],
      [{ version: 1, isFinal: false, note: 'Draft', createdAt: '2026-08-01T11:00:00Z', createdBy: 'staff-2' }],
      staff
    );
    expect(timeline[0].isFinal).toBe(true);
    expect(timeline[0].note).toBe('Approved');
    expect(timeline[1].isFinal).toBe(false);
  });

  it('carries the cost_sheet_id link on quotation entries, for showing which cost sheet a quotation came from', () => {
    const timeline = buildPricingTimeline([], [
      { version: 1, createdAt: '2026-08-01T10:00:00Z', createdBy: 'staff-1', costSheetId: 'cs-uuid-1' },
    ], staff);
    expect(timeline[0].costSheetId).toBe('cs-uuid-1');
  });

  it('handles empty input on both sides without throwing', () => {
    expect(buildPricingTimeline([], [], staff)).toEqual([]);
    expect(buildPricingTimeline(null, null, staff)).toEqual([]);
  });

  it('treats a missing createdAt as earliest (does not crash the sort)', () => {
    const timeline = buildPricingTimeline(
      [{ version: 1, createdAt: null, createdBy: 'staff-1' }],
      [{ version: 1, createdAt: '2026-08-01T10:00:00Z', createdBy: 'staff-2' }],
      staff
    );
    expect(timeline.length).toBe(2);
    expect(timeline[0].type).toBe('costsheet'); // the null-date one sorts first
  });
});

describe('loadPricingTimeline', () => {
  it('loads both histories in parallel and merges them', async () => {
    const db = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: table === 'cost_sheets'
                ? [{ version: 1, created_at: '2026-08-01T10:00:00Z', created_by: 'staff-1', days:[], transports:[], slabs:[], monuments:[], local_handlers:[], extras:[] }]
                : [{ version: 1, created_at: '2026-08-01T14:00:00Z', created_by: 'staff-2', itinerary:[], hotels:[], slabs:[], monuments:[], includes:[], excludes:[] }],
            }),
          }),
        }),
      }),
    };
    const timeline = await loadPricingTimeline(db, 'UTQ-1', staff);
    expect(timeline.length).toBe(2);
    expect(timeline[0].type).toBe('costsheet');
    expect(timeline[1].type).toBe('quotation');
    expect(timeline[0].by).toBe('Priya');
  });
});
