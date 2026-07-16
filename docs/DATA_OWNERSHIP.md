# Data Ownership Map

**Purpose:** every important fact about a tour file exists in exactly the places listed here — no more, no less. If you're about to add a feature that reads or writes one of these facts, check here first. If a fact isn't listed here yet, it needs to be added before the feature ships (see "Adding a new fact" at the bottom).

This file is not documentation of "how things currently happen to work." It is a set of decisions. Where two places legitimately hold the same fact, that duplication is deliberate and explained — not accidental drift.

Last verified against live Supabase schema: 2026-07-15.

---

## How to read this

Each fact has:
- **Canonical owner** — the one table/column that is the real answer, when asked "what is this, actually?"
- **Other holders** — every other place that reads or stores a copy, and whether that copy is:
  - **LIVE** — must always match the owner. If it doesn't, that's a bug.
  - **SNAPSHOT** — deliberately independent once created (a draft, a point-in-time record, a different currency/context). Divergence is expected and fine.

---

## Tour Value (three real homes, on purpose)

| Holder | Column(s) | Type | Notes |
|---|---|---|---|
| **`quotations`** (starred version) | `tour_value`, `confirmed_pax`, `final_price_entries` | **Canonical for "what was agreed"** | Composed from rate lines (pax paying × rate + FOC), captured when a version is marked final. This is *the* answer to "what did we agree with the client." |
| `payments` | `tour_value`, `tour_value_inr`, `roe_used` | SNAPSHOT | Independently entered in the Payment Tracker for reconciliation. Deliberately **not** auto-synced from Quotations — currency, ROE, and manual adjustments can legitimately differ. The Payment Tracker shows a reference banner ("Final quotation agreed: ...") so staff can cross-check by eye, but nothing overwrites the other automatically. |
| `agent_ledger.tour_value` | — | **ORPHANED** | Table has zero rows, zero code references. Not a real holder — see "Orphaned tables" below. |

**Rule going forward:** if Tax Invoice (not yet built) needs a tour value, it pre-fills from `quotations.tour_value` as a starting point, then is independently editable (SNAPSHOT), same pattern as Payments. It must never live-sync from Quotations after the fact.

---

## Pax Count (three real homes)

| Holder | Column(s) | Type | Notes |
|---|---|---|---|
| `queries` | `pax_display`, `pax_exact`, `pax_min`, `pax_max` | SNAPSHOT (early estimate) | The query-stage estimate, often "TBC" until close to departure. Free text (`pax_display`) plus optional exact/range numbers. **There is no bare `pax` field — that name has never existed.** If you write `query.pax` or `q.pax`, it will always be `undefined`. Use `query.paxDisplay`. |
| **`quotations`** (starred version) | `confirmed_pax`, plus the paying/FOC breakdown inside `final_price_entries` | **Canonical once it exists** | The real, confirmed number. Once a final quotation exists, this — not `queries.pax_display` — is the answer to "how many people." |
| `cost_sheets.slabs` | — | Not a count at all | Pricing *tiers* (e.g. "15–19 pax"), used only for rate calculation. Never read as "the pax count" anywhere — if you're tempted to, don't; use `quotations.confirmed_pax` instead. |

**Known gap:** nothing currently pulls `quotations.confirmed_pax` back into `queries.pax_display` for display consistency once a quotation is finalized — a query's own "pax" field can still show the old TBC estimate even after a real number exists elsewhere. Not fixed yet; flagging so it doesn't surprise anyone.

---

## Route / Itinerary / Hotels (the least unified area — read this one carefully)

| Holder | Column(s) | Type | Notes |
|---|---|---|---|
| **`tour_execution`** | `days[].route`, `days[].hotelName`, `days[].rooms` | **Canonical operational record** | Populated only via the Tour File drawer's Info tab (Day-wise Itinerary / Hotels). This is what Movement Chart reads, and what the Tour Facilitator/Local Handler/Transporter columns resolve against. |
| `cost_sheets.days` | — | SNAPSHOT, deliberately separate | A **pricing draft** — day-by-day cost breakdown for quoting, not an operational record. Can legitimately show different granularity or wording than `tour_execution.days`. |
| `quotations.itinerary`, `quotations.hotels` | — | SNAPSHOT, deliberately separate | Client-facing copy for the quotation document — often summarized or reworded for presentation. Not synced from `tour_execution`. |

**This is the one area without a real unification plan yet.** Three places can describe "the itinerary" with no enforced relationship between them. It works today because each is used for a different purpose (pricing draft / client document / operational record), but it's the most likely place for a future "which one do I trust" question. If this ever needs tightening, the fix is a one-way pre-fill (tour_execution → quotation draft, editable after) — never a live sync.

---

## Vendor Assignments (Transporter / Facilitator / Local Handler)

| Holder | Column(s) | Type | Notes |
|---|---|---|---|
| **`vendors`** | `id`, `name`, `type`, `languages`, `areas`, contact fields | **Canonical vendor master data** | One real vendor record per person/company, filtered by `type` in the UI (Transport / Tour Facilitator / Local Handler / Hotel / etc). |
| `tour_execution` | `transporters[]`, `facilitators[]`, `local_handlers[]` | Reference only | Each entry is `{vendorId, sector, notes}` — a pointer into `vendors`, not a copy of vendor data. Clean owner/reference relationship, no duplication risk here. |
| `payment_outgoing.vendor` | — | Free text, NOT a reference | Deliberately not tied to `vendors.id` — outgoing payments can go to non-vendor-master payees (airlines, railways, one-off charges), so a strict FK isn't right here. VendorMaster's "Related Payments" section matches this against vendor name as best-effort, not a guaranteed link — labeled as such in the UI. |

**VendorMaster's "Service History" tab** now reads real assignment history from `tour_execution`, matched strictly by `vendor.id` — this is the correct, reliable signal for "which tours has this vendor actually worked on." It used to be built entirely from `payment_outgoing` name-matching (and that matching was additionally broken by a missing prop — see bugs log), so assigning a facilitator in the Tour File drawer's Info tab never showed up there at all. Fixed 2026-07-16.

---

## Audit Trail

| Holder | Notes |
|---|---|
| **`query_audit`** | Single canonical log for every meaningful action on a tour file. Every persistence function (`saveQueryToDB`, `updateTourExecution`, `updatePayments`, Cost Sheet/Quotation save+final, Services, Document Registry, receipts) logs here via the shared `logAudit` helper. No other table holds a parallel history — if something isn't showing up in Audit, it's a missing `logAudit` call, not a second audit system to check. |

---

## Orphaned tables — dropped 2026-07-17

These existed in Supabase with zero rows and zero code references, confirmed across three separate audits (2026-07-15, 2026-07-16, 2026-07-17) before removal:

- `agent_ledger` (a VIEW)
- `agent_lumpsum_payments`
- `lumpsum_allocations`
- `payments_incoming` *(the near-identical-name hazard vs the real, active `payment_incoming` — the main motivation for dropping rather than just documenting)*
- `facilitators` *(standalone table — superseded by `vendors` filtered by `type = 'Tour Facilitator'`)*

All five are gone. `agent_lumpsum_payments` had a foreign-key dependency from `lumpsum_allocations`, dropped in the correct order rather than via `CASCADE`, to avoid silently removing anything unexpected.

---

## Bugs found and fixed during this audit (2026-07-15)

1. **`vendors.languages` / `vendors.areas` never existed as columns**, despite `VendorMaster.jsx` having fully working UI for them and `saveVendorToDB` always sending them. Every vendor save has been failing outright since the feature was built — confirmed via a live insert test, which errored with `column "languages" of relation "vendors" does not exist`. The `vendors` table had **zero rows, ever**. Fixed by adding the missing columns; verified end-to-end as the anon role.
2. **`queries.source_other`, `queries.travel_date_to`, `queries.internal_correspondent`** — all three are typed into working UI fields but were never included in `buildQuerySavePayload`, so silently never persisted. Same bug class as the earlier `assigned_to` gap. Fixed.
3. **`VendorMaster`'s "Service History" tab had nothing to do with tour assignments.** It was built entirely from `payment_outgoing` entries matched by fuzzy name substring against the vendor's name — meaning assigning a Tour Facilitator/Local Handler/Transporter in the Tour File drawer's Info tab never appeared there, ever. Compounding this: `payments` was declared as a prop in `VendorMaster`'s signature but never actually passed in the render call, so this tab (and "Financial Ledger") had been showing empty results regardless of any real payment data. Fixed by (a) passing the missing prop, and (b) adding a real, `vendor.id`-matched assignment history as the primary content of the tab, with the payment-based data kept as a separate, clearly-labeled secondary section.
4. **`q.pax` / `query.pax` — a field that has never existed — was referenced across 10 different files**: Dashboard, Kanban, All Queries, Tour Files, Payment Tracker, Exchange Order Generator, Proforma Invoice, Tax Invoice, Tour Briefing Sheet, and the Active Pipeline report. Only `paxDisplay` has ever actually held a value. This meant pax count silently showed blank/dash across nearly the entire app, everywhere except the few places that happened to use the correct field name (Movement Chart, built correctly last round). Fixed everywhere it was found; each document generator's own local `pax` form field is now correctly seeded from `paxDisplay` at open time, then remains independently editable within that document (SNAPSHOT, same pattern as everything else).
5. **Confirmed correct, not a bug:** individual per-staff permission overrides (set in User Management) looked suspicious at first — the general `staff` list load deliberately excludes the `permissions` column (bundled in with genuinely sensitive fields like `password_hash` during earlier security hardening). But permission *enforcement* never reads from that list — `currentUser` comes from the `staff_login` RPC, which correctly returns the real `permissions` value from the row directly. Verified by reading the actual RPC function body in Postgres, not just the client code. The UI's own "changes take effect on next login" notice is accurate, not a symptom of a deeper bug.
6. **RLS policies checked for consistency across all 19 tables** — every one has an appropriate anon-access policy; `staff` is correctly read-only-safe-columns for anon, by design. No silent access-denial gaps found.
7. **`document_registry.tour_file_id`** — a real column, available at the call site (`DocRegistryInline` already receives `tourFileId` as a prop), but never threaded through to `saveDocRegistry`. Found by the new schema-completeness test (see below) on its first run. Fixed.

---

## Tour Identity/Display (name, dates, pax shown in Dashboard/Search — eliminated, not documented as a duplicate)

There used to be a second, frozen copy of core tour facts (`name`, `dates`, `pax`, `status`) in a separate `tours` state array, captured once at "Convert to Tour File" time and never updated again. `Dashboard`'s "Tour Calendar" widget and the "Tours On Ground" stat read from it directly; `SmartSearch` searched it as a second, duplicate result type that did nothing when clicked; `GanttView` received it as a prop but never actually used it (dead prop).

**This was not a LIVE/SNAPSHOT split worth keeping — it was pure duplication with no purpose**, so it was removed entirely rather than documented as an intentional pattern. `Dashboard` and `SmartSearch` now derive tour name/dates/pax/status fresh from `queries` on every render, the same way `GanttView` already correctly did. Found 2026-07-17 after a direct user report that Info tab edits weren't reflecting on Dashboard/Tour Calendar. Fixed by deleting the `tours` state, not by adding a sync step — one less place for a fact to drift out of date.

---

## Standing safeguard: schema-completeness tests

`src/__tests__/schemaCompleteness.test.jsx` mechanically checks every save function against the live column list for its table — not from memory, but a snapshot captured directly from Supabase. Each test calls the real save function and asserts every real column actually appears as a key in what gets sent to the database. This is the direct fix for the bug class this whole document exists to prevent: a column existing on the live table with a working UI field feeding it, silently dropped because the save function never included that key.

**This is not optional maintenance — it already found a real bug (`document_registry.tour_file_id`) on its first run**, before it could sit undetected the way `vendors.languages`/`assigned_to` did.

**When a migration changes a table's columns, `EXPECTED_COLUMNS` in this test file must be updated in the same change** — same discipline as this document itself. A column intentionally left unused (like `version_name`) gets added to the relevant exclusion list with a one-line reason, not silently ignored.

---

## Adding a new fact — the checklist

Before a new feature persists something new, or reads something that already exists elsewhere:

1. **Who's the canonical owner?** One table/column, not "wherever's convenient."
2. **Does anything else legitimately need a copy?** If yes — LIVE (must always match; needs a real sync mechanism) or SNAPSHOT (independent after creation; needs a reference/cross-check, not a sync)?
3. **Update this file.** A fact that lives in two places without an entry here is exactly how the `assigned_to` and `vendors.languages` bugs happened.
4. **If it's a new column on an existing table:** confirm the migration actually landed on the live schema — don't assume from the code. `information_schema.columns` is the source of truth, not memory of what should have been added.
