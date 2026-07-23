import { describe, it, expect, vi } from 'vitest';
import {
  buildQuerySavePayload,
  saveCostSheetVersion, saveQuotationVersion, saveTourExecutionToDB,
  savePaymentsToDB, saveVendorToDB, saveAgentToDB, saveQueryServices, saveDocRegistry,
  saveMealPlanVersion, saveItineraryVersion, saveExchangeOrderVersion, saveTourBriefingVersion,
  saveProformaInvoiceVersion, saveTaxInvoiceVersion,
} from '../lib/utils.js';

// ─── THE ACTUAL BUG CLASS THIS FILE EXISTS TO PREVENT ────────────────────
// Every real bug found in the 2026-07-15/16 data-ownership audits had the
// same shape: a column exists on the live table, a working UI field feeds
// it, but the save function never includes that key in its payload -- so
// the write is silently accepted (or, worse, silently rejected) and the
// value is gone. Unit tests with mocked databases never catch this, because
// a mock doesn't know what columns are real -- it happily accepts whatever
// shape the code sends it, in perfect agreement with the code's own
// (possibly wrong) assumptions.
//
// This file is the mechanical fix: for each table, the exact live column
// list (captured directly from Supabase, not remembered/assumed) is
// hard-coded as EXPECTED_COLUMNS below. Each test then calls the real save
// function and asserts every relevant column actually appears as a key in
// what gets sent to the database. A field silently missing from a payload
// now fails a test, not a customer's data six months later.
//
// EXPECTED_COLUMNS snapshot captured live: 2026-07-16. If a migration adds
// or removes a column, this file must be updated as part of that change --
// same discipline as docs/DATA_OWNERSHIP.md itself.

// Columns intentionally excluded from coverage checks per table, with why:
// - id: usually DB-generated (serial/uuid) or passed through untouched
// - created_at / updated_at: DB-managed timestamps, never app-written
// - version_name (cost_sheets, quotations): schema capacity for a planned
//   "named versions" feature that was never built -- no UI writes it, so
//   there's nothing to lose. Documented in DATA_OWNERSHIP.md.
// - vendors.code, agents.code, agents.gstin: same pattern -- unused schema
//   capacity, no UI field feeds them on either table.

function capturingDb() {
  const calls = []; // { table, method, payload }
  const db = {
    from: (table) => {
      const filters = {};
      const builder = {
        select: () => builder,
        eq: (col, val) => { filters[col] = val; return builder; },
        order: () => builder,
        insert: vi.fn(async (payload) => { calls.push({ table, method: 'insert', payload }); return { data: [{ ...payload, id: payload.id ?? 'generated-id' }], error: null }; }),
        upsert: vi.fn(async (payload) => { calls.push({ table, method: 'upsert', payload }); return { data: [payload], error: null }; }),
        update: vi.fn(async (payload) => { calls.push({ table, method: 'update', payload }); return { data: [payload], error: null }; }),
        delete: vi.fn(async () => ({ data: [], error: null })),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
  };
  return { db, calls };
}

function assertCoversSchema(payload, expectedColumns, excluded, label) {
  const sentKeys = new Set(Object.keys(payload));
  const missing = expectedColumns.filter(col => !excluded.includes(col) && !sentKeys.has(col));
  expect(missing, `${label}: missing column(s) in save payload: ${missing.join(', ')}`).toEqual([]);
}

describe('Schema completeness: queries (buildQuerySavePayload)', () => {
  const EXPECTED_COLUMNS = [
    'id','agent_id','agent_company','agent_country','correspondent','nationality','source','source_other',
    'group_name','client_name','sector','nights','hotel_cat','pax_known','pax_exact','pax_min','pax_max',
    'pax_display','date_known','travel_date_from','travel_date_to','travel_month','travel_season','date_display',
    'status','cancelled','cancellation_reason','assigned_to','internal_correspondent','notes','manual_wf',
    'tour_file_id','date','file_type',
  ];
  it('every real column has a corresponding key in the save payload', () => {
    const payload = buildQuerySavePayload({ id: 'UTQ-1' });
    assertCoversSchema(payload, EXPECTED_COLUMNS, ['id'], 'queries');
  });
});

describe('Schema completeness: cost_sheets (saveCostSheetVersion)', () => {
  const EXPECTED_COLUMNS = [
    'query_id','version','is_final','gst_pct','markup_pct','roe','currency','tl_mode','tl_cost','misc_mode',
    'misc_cost','mon_mode','days','transports','slabs','monuments','created_by','local_handlers','extras',
    'mon_extra','note','tl_slabs','client_agent_name','assigned_staff_name',
  ];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveCostSheetVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'cost_sheets');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'cost_sheets');
  });
});

// meal_plans is a NEW table, Phase 0 of the Document Chain plan (see
// docs/DATA_OWNERSHIP.md) -- this test defines the columns the migration
// must create, rather than checking against an already-live schema the
// way the other tests here do. Once the migration runs, this becomes a
// normal completeness check like the rest of this file.
describe('Schema completeness: meal_plans (saveMealPlanVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'heading', 'rows', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveMealPlanVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'meal_plans');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'meal_plans');
  });
});

// itineraries is a NEW table, Phase 0 of the Document Chain plan -- one
// table covers both Brief and Detailed Itinerary, since ItineraryBuilder
// is a single component with an outlined/detailed style toggle over the
// same underlying day data.
describe('Schema completeness: itineraries (saveItineraryVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'tour_title', 'tagline', 'route', 'duration', 'active_tab', 'days', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveItineraryVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'itineraries');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'itineraries');
  });
});

describe('Schema completeness: exchange_orders (saveExchangeOrderVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'content', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveExchangeOrderVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'exchange_orders');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'exchange_orders');
  });
});

describe('Schema completeness: tour_briefings (saveTourBriefingVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'content', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveTourBriefingVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'tour_briefings');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'tour_briefings');
  });
});

// The final two tables in Phase 0 of the Document Chain plan. Both carry
// a real invoice_no column (used for global uniqueness checking via
// loadExistingInvoiceNumbers), not bundled into content like the other
// scalar fields, since it's specifically the thing that needs to be
// queried across every saved invoice, not just this one document.
describe('Schema completeness: proforma_invoices (saveProformaInvoiceVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'invoice_no', 'content', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveProformaInvoiceVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'proforma_invoices');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'proforma_invoices');
  });
});

describe('Schema completeness: tax_invoices (saveTaxInvoiceVersion) -- NEW table, requires migration', () => {
  const EXPECTED_COLUMNS = ['query_id', 'version', 'is_final', 'note', 'invoice_no', 'content', 'created_by'];
  it('every intended column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveTaxInvoiceVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'tax_invoices');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'tax_invoices');
  });
});

describe('Schema completeness: quotations (saveQuotationVersion)', () => {
  const EXPECTED_COLUMNS = [
    'query_id','cost_sheet_id','version','is_final','attn_name','attn_company','attn_city','date','currency',
    'roe','ref_line','period','pax_line','itinerary','hotels','slabs','monuments','show_monuments','includes',
    'excludes','closing_line','signoff','created_by','greeting','opening_line','monument_note','note',
    'confirmed_pax','tour_value','final_price_entries',
  ];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveQuotationVersion(db, 'UTQ-1', { version: 1 }, null);
    const call = calls.find(c => c.table === 'quotations');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'quotations');
  });
});

describe('Schema completeness: tour_execution (saveTourExecutionToDB) -- synced_from_cost_sheet_version is a NEW column, requires migration', () => {
  const EXPECTED_COLUMNS = [
    'query_id','days','facilitators','local_handlers','transporters','flights','arr_flight_details','dep_flight_details','synced_from_cost_sheet_version',
  ];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveTourExecutionToDB(db, { queryId: 'UTQ-1' });
    const call = calls.find(c => c.table === 'tour_execution');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'tour_execution');
  });
});

describe('Schema completeness: payments + payment_incoming + payment_outgoing (savePaymentsToDB, one function covering 3 tables)', () => {
  it('payments: every real column has a corresponding key', async () => {
    const { db, calls } = capturingDb();
    await savePaymentsToDB(db, 'UTQ-1', {});
    const call = calls.find(c => c.table === 'payments');
    assertCoversSchema(call.payload, ['query_id','tour_value','currency','roe_used','tour_value_inr'], [], 'payments');
  });

  it('payment_incoming: every real column has a corresponding key (when at least one entry exists)', async () => {
    const { db, calls } = capturingDb();
    await savePaymentsToDB(db, 'UTQ-1', { entries: [{ id: 1 }] });
    const call = calls.find(c => c.table === 'payment_incoming');
    assertCoversSchema(call.payload, ['id','query_id','type','in_currency','curr_other','amount','date','mode','mode_other','ref','note','receipt'], [], 'payment_incoming');
  });

  it('payment_outgoing: every real column has a corresponding key (when at least one entry exists)', async () => {
    const { db, calls } = capturingDb();
    await savePaymentsToDB(db, 'UTQ-1', { outgoing: [{ id: 1 }] });
    const call = calls.find(c => c.table === 'payment_outgoing');
    assertCoversSchema(call.payload, ['id','query_id','vendor','amount','date','mode','ref','note','receipt_name'], [], 'payment_outgoing');
  });
});

describe('Schema completeness: vendors (saveVendorToDB) -- the exact table that had the real bug', () => {
  const EXPECTED_COLUMNS = ['name','type','city','contact_name','contact_phone','contact_email','gstin','notes','active','languages','areas'];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveVendorToDB(db, { id: 'VND-1' });
    const call = calls.find(c => c.table === 'vendors');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'vendors');
  });
});

describe('Schema completeness: agents (saveAgentToDB)', () => {
  const EXPECTED_COLUMNS = ['company','country','city','market','contact_name','contact_phone','contact_email','notes','active'];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveAgentToDB(db, {});
    const call = calls.find(c => c.table === 'agents');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'agents');
  });
});

describe('Schema completeness: query_services (saveQueryServices)', () => {
  const EXPECTED_COLUMNS = ['id','query_id','name','status','date','sort_order'];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveQueryServices(db, 'UTQ-1', [{ id: 1, name: 'Test', status: 'requested' }]);
    const call = calls.find(c => c.table === 'query_services');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'query_services');
  });
});

describe('Schema completeness: document_registry (saveDocRegistry)', () => {
  const EXPECTED_COLUMNS = ['id','query_id','tour_file_id','name','category','from','date','status','drive_link','notes'];
  it('every real column has a corresponding key in the save payload', async () => {
    const { db, calls } = capturingDb();
    await saveDocRegistry(db, 'UTQ-1', [{ id: 1, name: 'Test Doc' }], 'TF-1');
    const call = calls.find(c => c.table === 'document_registry');
    assertCoversSchema(call.payload, EXPECTED_COLUMNS, [], 'document_registry');
  });
});
