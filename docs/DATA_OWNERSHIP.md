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
| `queries` | `pax_display`, `pax_exact`, `pax_min`, `pax_max` | SNAPSHOT (early estimate) | The query-stage estimate, often "TBC" until close to departure. Free text (`pax_display`) plus optional exact/range numbers. |
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

---

## Audit Trail

| Holder | Notes |
|---|---|
| **`query_audit`** | Single canonical log for every meaningful action on a tour file. Every persistence function (`saveQueryToDB`, `updateTourExecution`, `updatePayments`, Cost Sheet/Quotation save+final, Services, Document Registry, receipts) logs here via the shared `logAudit` helper. No other table holds a parallel history — if something isn't showing up in Audit, it's a missing `logAudit` call, not a second audit system to check. |

---

## Orphaned tables (found via live-schema audit, 2026-07-15)

These exist in Supabase but have **zero rows and zero code references**. They are not part of the current data model — do not read from or write to them without first understanding why they're empty and unused:

- `agent_ledger`
- `agent_lumpsum_payments`
- `lumpsum_allocations`
- `payments_incoming` *(note the "s" — this is different from the real, active `payment_incoming` table. The near-identical name is a genuine hazard; recommend dropping this one specifically to remove the risk of ever using it by mistake.)*
- `facilitators` *(standalone table — superseded by `vendors` filtered by `type = 'Tour Facilitator'`)*

**Recommendation:** drop all five. Confirmed zero data loss risk. Pending explicit confirmation before executing, since dropping DB objects deserves a heads-up even when safe.

---

## Bugs found and fixed during this audit (2026-07-15)

1. **`vendors.languages` / `vendors.areas` never existed as columns**, despite `VendorMaster.jsx` having fully working UI for them and `saveVendorToDB` always sending them. Every vendor save has been failing outright since the feature was built — confirmed via a live insert test, which errored with `column "languages" of relation "vendors" does not exist`. The `vendors` table had **zero rows, ever**. Fixed by adding the missing columns; verified end-to-end as the anon role.
2. **`queries.source_other`, `queries.travel_date_to`, `queries.internal_correspondent`** — all three are typed into working UI fields but were never included in `buildQuerySavePayload`, so silently never persisted. Same bug class as the earlier `assigned_to` gap. Fixed.

---

## Adding a new fact — the checklist

Before a new feature persists something new, or reads something that already exists elsewhere:

1. **Who's the canonical owner?** One table/column, not "wherever's convenient."
2. **Does anything else legitimately need a copy?** If yes — LIVE (must always match; needs a real sync mechanism) or SNAPSHOT (independent after creation; needs a reference/cross-check, not a sync)?
3. **Update this file.** A fact that lives in two places without an entry here is exactly how the `assigned_to` and `vendors.languages` bugs happened.
4. **If it's a new column on an existing table:** confirm the migration actually landed on the live schema — don't assume from the code. `information_schema.columns` is the source of truth, not memory of what should have been added.
