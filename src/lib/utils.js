export const nextInvoiceNo = (prefix, existing) => {
  const nums = existing.filter(n=>n.startsWith(prefix)).map(n=>parseInt(n.split("-").pop())||0);
  return `${prefix}-${new Date().getFullYear()}-${String(Math.max(0,...nums)+1).padStart(3,"0")}`;
};



export function numToWords(n) {
  if (!n || isNaN(n)) return '';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function below1000(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num] + ' ';
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' ' + ones[num%10] : '') + ' ';
    return ones[Math.floor(num/100)] + ' Hundred ' + below1000(num%100);
  }
  const int = Math.floor(Math.abs(n));
  const dec = Math.round((Math.abs(n) - int) * 100);
  if (int === 0) return 'Zero';
  let result = '';
  if (int >= 1000000) { result += below1000(Math.floor(int/1000000)) + 'Million '; }
  if (int >= 1000)    { result += below1000(Math.floor((int%1000000)/1000)) + 'Thousand '; }
  result += below1000(int % 1000);
  result = result.trim();
  if (dec > 0) result += ' and ' + below1000(dec).trim() + ' Cents';
  return result + ' Only';
}

// ─── SHARED INVOICE LETTERHEAD ────────────────────────────────────────────────


// ─── DB ROW <-> APP OBJECT MAPPING ─────────────────────────────────────────────
// Converts a raw `queries` table row (snake_case, as returned by Supabase)
// into the camelCase shape the rest of the app expects. Used by both the
// initial page-load fetch and by Realtime postgres_changes payloads, so the
// two paths can never drift out of sync with each other.
// Deliberately does NOT set `audit`/`remarks` — those come from separate
// tables (query_audit/query_remarks) and callers are responsible for either
// attaching freshly-loaded values (initial load) or preserving whatever the
// existing local state already has (Realtime updates, which don't include
// audit/remarks changes).
export function mapDbQueryRow(q) {
  return {
    ...q,
    id: q.id,
    agentId: q.agent_id,
    agentCompany: q.agent_company,
    agentCountry: q.agent_country,
    correspondent: q.correspondent,
    groupName: q.group_name,
    clientName: q.client_name || q.group_name,
    sector: q.sector,
    destination: q.sector,
    nights: q.nights,
    hotelCat: q.hotel_cat,
    paxKnown: q.pax_known,
    paxExact: q.pax_exact,
    paxMin: q.pax_min,
    paxMax: q.pax_max,
    paxDisplay: q.pax_display,
    dateKnown: q.date_known,
    travelDate: q.travel_date_from ? q.travel_date_from.split("T")[0] : (q.travel_month || ""),
    travelMonth: q.travel_month,
    travelSeason: q.travel_season,
    dateDisplay: q.date_display,
    status: q.status,
    cancelled: q.cancelled,
    cancellationReason: q.cancellation_reason,
    tourFileId: q.tour_file_id,
    notes: q.notes,
    manualWF: q.manual_wf || [],
    date: q.date || q.created_at?.split("T")[0],
    assignedTo: q.assigned_to,
    fileType: q.file_type || "",
    sourceOther: q.source_other,
    travelDateTo: q.travel_date_to ? q.travel_date_to.split("T")[0] : "",
    internalCorrespondent: q.internal_correspondent,
  };
}

// Pure reducer: given the current queries array and an incoming Realtime
// postgres_changes event, returns the new queries array. Kept separate from
// the actual subscription wiring so it's trivially unit-testable without a
// live WebSocket connection.
//   eventType: 'INSERT' | 'UPDATE' | 'DELETE'
//   newRow / oldRow: raw DB rows as delivered by Supabase Realtime
export function applyQueryRealtimeEvent(queries, eventType, newRow, oldRow) {
  if (eventType === "DELETE") {
    const deadId = oldRow?.id;
    return queries.filter(q => q.id !== deadId);
  }
  const mapped = mapDbQueryRow(newRow);
  const idx = queries.findIndex(q => q.id === mapped.id);
  if (idx === -1) {
    // New query from another user -- no local audit/remarks history yet.
    return [{ ...mapped, audit: [], remarks: [] }, ...queries];
  }
  // Existing query updated -- keep local audit/remarks (a plain `queries`
  // UPDATE never touches those separate tables), replace everything else.
  const existing = queries[idx];
  const updated = { ...existing, ...mapped, audit: existing.audit, remarks: existing.remarks };
  const next = [...queries];
  next[idx] = updated;
  return next;
}

// ─── PAYMENTS DB <-> APP OBJECT MAPPING ────────────────────────────────────────
// Merges the three payments tables (payments, payment_incoming,
// payment_outgoing) into the { queryId, tourValue, currency, roeUsed,
// tourValueINR, entries:[], outgoing:[] } shape EnhancedPaymentTracker
// expects, keyed by query id. Pure function so it's testable without a live
// DB connection; used by UnitopApp's initial load.
export function blankPaymentRecord(queryId) {
  return { queryId, tourValue: "", currency: "US $", roeUsed: 90, tourValueINR: "", entries: [], outgoing: [] };
}

export function mergePaymentsRows(payRows, incomingRows, outgoingRows) {
  const map = {};
  (payRows || []).forEach(p => {
    map[p.query_id] = {
      queryId: p.query_id, tourValue: p.tour_value, currency: p.currency,
      roeUsed: p.roe_used, tourValueINR: p.tour_value_inr, entries: [], outgoing: [],
    };
  });
  (incomingRows || []).forEach(e => {
    if (!map[e.query_id]) map[e.query_id] = blankPaymentRecord(e.query_id);
    map[e.query_id].entries.push({
      id: e.id, type: e.type, inCurrency: e.in_currency, currOther: e.curr_other,
      amount: e.amount, date: e.date, mode: e.mode, modeOther: e.mode_other,
      ref: e.ref, note: e.note, receipt: e.receipt,
    });
  });
  (outgoingRows || []).forEach(o => {
    if (!map[o.query_id]) map[o.query_id] = blankPaymentRecord(o.query_id);
    map[o.query_id].outgoing.push({
      id: o.id, vendor: o.vendor, amount: o.amount, date: o.date, mode: o.mode,
      ref: o.ref, note: o.note, receiptName: o.receipt_name,
    });
  });
  return map;
}

// Persists a payments record (header + incoming + outgoing entries) to
// Supabase, syncing entries by upserting everything currently present and
// deleting any DB rows no longer present locally (handles deleted entries).
// Takes `db` as a parameter (rather than importing it directly) so it's
// testable against a mock without a live Supabase connection.
export async function savePaymentsToDB(db, queryId, data) {
  try {
    await db.from("payments").upsert({
      query_id: queryId,
      tour_value: parseFloat(data.tourValue) || null,
      currency: data.currency,
      roe_used: parseFloat(data.roeUsed) || null,
      tour_value_inr: parseFloat(data.tourValueINR) || null,
    });

    for (const e of (data.entries || [])) {
      await db.from("payment_incoming").upsert({
        id: e.id, query_id: queryId, type: e.type, in_currency: e.inCurrency,
        curr_other: e.currOther, amount: parseFloat(e.amount) || null, date: e.date || null,
        mode: e.mode, mode_other: e.modeOther, ref: e.ref, note: e.note, receipt: e.receipt,
      });
    }
    const { data: dbIncoming } = await db.from("payment_incoming").select("id").eq("query_id", queryId);
    const keepIncomingIds = new Set((data.entries || []).map(e => String(e.id)));
    for (const row of (dbIncoming || [])) {
      if (!keepIncomingIds.has(String(row.id))) await db.from("payment_incoming").eq("id", row.id).delete();
    }

    for (const o of (data.outgoing || [])) {
      await db.from("payment_outgoing").upsert({
        id: o.id, query_id: queryId, vendor: o.vendor, amount: parseFloat(o.amount) || null,
        date: o.date || null, mode: o.mode, ref: o.ref, note: o.note, receipt_name: o.receiptName,
      });
    }
    const { data: dbOutgoing } = await db.from("payment_outgoing").select("id").eq("query_id", queryId);
    const keepOutgoingIds = new Set((data.outgoing || []).map(o => String(o.id)));
    for (const row of (dbOutgoing || [])) {
      if (!keepOutgoingIds.has(String(row.id))) await db.from("payment_outgoing").eq("id", row.id).delete();
    }
  } catch (e) { console.warn("Save payments to DB failed:", e); }
}

// Persists a single vendor record (create or update) to Supabase -- covers
// every vendor type, including "Tour Facilitator" (individuals selected by
// id in Tour Briefing Sheet rather than free-typed). Takes `db` as a
// parameter for testability, same pattern as savePaymentsToDB.
export async function saveVendorToDB(db, vendor) {
  try {
    await db.from("vendors").upsert({
      id: vendor.id,
      name: vendor.name,
      type: vendor.type,
      city: vendor.city,
      contact_name: vendor.contactName,
      contact_phone: vendor.contactPhone,
      contact_email: vendor.contactEmail,
      gstin: vendor.gstin,
      notes: vendor.notes,
      languages: vendor.languages,
      areas: vendor.areas,
      active: vendor.active !== false,
    });
  } catch (e) { console.warn("Save vendor to DB failed:", e); }
}

// ─── MOVEMENT CHART ─────────────────────────────────────────────────────────
// Parse a YYYY-MM-DD string as local midnight (avoids UTC-shift off-by-one).
// Duplicated from GanttView's own copy deliberately -- same reasoning as
// mapDbQueryRow: keeping this as a small, pure, exported function makes it
// directly testable without needing to render the whole calendar component.
export function parseLocalDateStr(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

// Builds Movement Chart rows for a given month: tours whose date range
// overlaps that month at all (not just ones starting in it), so a tour
// spanning a month boundary shows up in both months' charts. Only pulls
// fields that are reliably available on the query record itself --
// Tour Escort/Transport/Hotels live in Tour Briefing Sheet/Cost Sheet,
// which aren't persisted centrally yet, so they're deliberately left out
// rather than shown as permanently-blank columns.
// Builds the Route column as a list of per-stop lines (not a single joined
// string): each day's route ("Khajuraho - Orchha - Jhansi - Agra") is split
// into individual stops, and the last stop of the day -- where the group
// actually overnights -- gets the confirmed hotel name attached, since a
// bare list of place names doesn't answer "where are they staying." A stop
// that exactly repeats the previous day's last stop is not repeated.
export function buildRouteLines(days) {
  const lines = [];
  let lastStop = null;
  (days || []).forEach(d => {
    if (!d.route) return;
    const stops = d.route.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
    stops.forEach((stop, idx) => {
      const upperStop = stop.toUpperCase();
      if (upperStop === lastStop) return;
      const isLast = idx === stops.length - 1;
      lines.push(isLast && d.hotelName ? `${upperStop} - ${d.hotelName}` : upperStop);
      lastStop = upperStop;
    });
  });
  return lines;
}

export function getMovementChartRows(queries, users, year, month, tourExecutions, vendors) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  return queries
    .filter(q => ["operations", "finance", "completed"].includes(q.status) && !q.cancelled && q.travelDate)
    .map(q => {
      const start = parseLocalDateStr(q.travelDate);
      if (!start) return null;
      const nights = parseInt(q.nights) || 0;
      const end = new Date(start);
      end.setDate(start.getDate() + nights);
      return { query: q, start, end };
    })
    .filter(r => r && r.start <= monthEnd && r.end >= monthStart)
    .sort((a, b) => a.start - b.start)
    .map((r, i) => {
      const handler = (users || []).find(u => u.id === r.query.assignedTo);
      // Single source of truth: tour_execution, populated only via the Tour
      // File drawer's Info tab (Day-wise Itinerary / Hotels / Others).
      // Never read route/hotel/facilitator/handler data from anywhere else
      // (e.g. Cost Sheet's own day fields are a separate pricing draft).
      const te = (tourExecutions || {})[r.query.id];
      const days = te?.days || [];
      const routeLines = buildRouteLines(days);
      const rooming = [...new Set(days.filter(d => d.hotelName).map(d => `${d.hotelName}${d.rooms ? " (" + d.rooms + ")" : ""}`))].join("; ");
      const resolveVendorNames = (list) => [...new Set((list || []).map(x => (vendors || []).find(v => v.id === x.vendorId)?.name).filter(Boolean))].join(", ");
      const transporter = resolveVendorNames(te?.transporters);
      const facilitator = resolveVendorNames(te?.facilitators);
      const localHandler = resolveVendorNames(te?.localHandlers);
      return {
        sNo: i + 1,
        query: r.query,
        fileHandler: handler ? handler.name : "",
        tourFileId: r.query.tourFileId || r.query.id,
        arrDate: r.start,
        depDate: r.end,
        fto: r.query.agentCompany || r.query.agentName || "",
        sector: r.query.destination || r.query.sector || "",
        pax: r.query.paxDisplay || r.query.pax || "",
        remarks: r.query.notes || "",
        arrFlight: te?.arrFlightDetails || "",
        depFlight: te?.depFlightDetails || "",
        routeLines,
        rooming,
        transporter,
        facilitator,
        localHandler,
      };
    });
}

// ─── TOUR EXECUTION DETAILS ─────────────────────────────────────────────────
// The single operational source of truth for a Tour File's day-wise
// itinerary/hotels, transporter, facilitator assignments, local handlers,
// and flight/train legs -- edited from the Tour File drawer's Info
// sub-tabs. Deliberately separate from Cost Sheet / Quotation / Itinerary
// Builder's own day fields, which remain independent drafting tools for
// now (see the code comment on saveTourExecutionToDB for why they aren't
// unified yet).
export function blankTourExecution(queryId) {
  return {
    queryId,
    days: [],
    facilitators: [],
    localHandlers: [],
    transporters: [],
    flights: [],
    arrFlightDetails: "",
    depFlightDetails: "",
  };
}

export function mapDbTourExecutionRow(row) {
  return {
    queryId: row.query_id,
    days: row.days || [],
    facilitators: row.facilitators || [],
    localHandlers: row.local_handlers || [],
    transporters: row.transporters || [],
    flights: row.flights || [],
    arrFlightDetails: row.arr_flight_details || "",
    depFlightDetails: row.dep_flight_details || "",
    // Tracks which Cost Sheet version's day-wise data tour_execution was
    // last populated/synced from -- the anchor for the mutual staleness
    // check between Tour Info and the star-marked Cost Sheet (Document
    // Chain plan, docs/DATA_OWNERSHIP.md). Never used to auto-overwrite
    // anything; only to decide whether to show a "sync available" banner.
    syncedFromCostSheetVersion: row.synced_from_cost_sheet_version ?? null,
  };
}

// Merges the loaded tour_execution rows into a map keyed by query_id, the
// same pattern as mergePaymentsRows -- pure function, testable without a DB.
export function mergeTourExecutionRows(rows) {
  const map = {};
  (rows || []).forEach(row => { map[row.query_id] = mapDbTourExecutionRow(row); });
  return map;
}

// Targeted single-query loader, separate from the bulk load path above
// (used by UnitopApp's main data load + mergeTourExecutionRows). Needed
// by Cost Sheet's Phase 1 pre-fill (see docs/DATA_OWNERSHIP.md,
// "Document Chain Architecture") -- fetching all tour_execution rows
// just to find one would be wasteful and would require passing the
// whole app's data down into Cost Sheet, which doesn't otherwise need it.
export async function loadTourExecutionForQuery(db, queryId) {
  try {
    const { data } = await db.from("tour_execution").select("*").eq("query_id", queryId);
    return data && data[0] ? mapDbTourExecutionRow(data[0]) : null;
  } catch (e) {
    console.warn("Load tour execution for query failed:", e);
    return null;
  }
}

// NOTE ON NOT UNIFYING WITH COST SHEET / QUOTATION / ITINERARY BUILDER YET:
// Those three documents each have their own independent day-wise hotel/route
// fields, entered separately, with no connection to this table or to each
// other. That's a real inconsistency risk (the same tour's hotel could be
// typed differently in two places) -- deliberately not solved in this pass.
// Migrating those documents to read from/write to this same table is a
// separate, later piece of work once this foundation is proven out; doing
// it in the same pass risked destabilizing three already-working documents.
export async function saveTourExecutionToDB(db, data) {
  try {
    await db.from("tour_execution").upsert({
      query_id: data.queryId,
      days: data.days || [],
      facilitators: data.facilitators || [],
      local_handlers: data.localHandlers || [],
      transporters: data.transporters || [],
      flights: data.flights || [],
      arr_flight_details: data.arrFlightDetails || null,
      dep_flight_details: data.depFlightDetails || null,
      synced_from_cost_sheet_version: data.syncedFromCostSheetVersion ?? null,
    });
  } catch (e) { console.warn("Save tour execution to DB failed:", e); }
}

// Reverse of Phase 1's Cost Sheet pre-fill (movement/hotel FROM
// tour_execution) -- this direction maps Cost Sheet's day-wise data INTO
// tour_execution's shape, used at tour-file conversion (Document Chain
// plan, docs/DATA_OWNERSHIP.md) and by the manual Tour Info sync button.
// Pure function, no DB access, easy to test in isolation.
export function mapCostSheetDaysToTourExecutionDays(csDays) {
  return (csDays || []).map(d => ({
    id: d.id || Date.now() + Math.random(),
    dayLabel: d.day || "",
    date: d.date || "",
    route: d.movement || "",
    hotelName: d.hotel || "",
    rooms: "",
    notes: d.notes || "",
  }));
}

// Finds the star-marked (is_final) Cost Sheet version for a query, or
// null if none has been marked final yet. The anchor for the mutual
// staleness check -- Tour Info is only flagged as "out of sync" relative
// to a deliberately finalized Cost Sheet, never against an in-progress
// draft version.
export async function loadFinalCostSheetVersion(db, queryId) {
  const versions = await loadCostSheetVersions(db, queryId);
  return versions.find(v => v.isFinal) || null;
}


// Persists an agent record to Supabase. Unlike Vendors (text ids, chosen
// client-side), agents.id is a real database-generated uuid
// (default uuid_generate_v4()) -- so a NEW agent must be INSERTed without
// an id and the real generated one read back from the response, rather
// than upserted with a client-invented id. Returns the saved agent object
// (with its real id attached, if newly created) so the caller can update
// its local state correctly.
export async function saveAgentToDB(db, agent) {
  const payload = {
    company: agent.company, country: agent.country, city: agent.city,
    market: agent.market, contact_name: agent.contactName, contact_phone: agent.contactPhone,
    contact_email: agent.contactEmail, notes: agent.notes, active: agent.active !== false,
  };
  try {
    if (agent.id) {
      await db.from("agents").upsert({ id: agent.id, ...payload });
      return agent;
    }
    const { data } = await db.from("agents").insert(payload);
    const created = data && data[0];
    return created ? { ...agent, id: created.id } : agent;
  } catch (e) {
    console.warn("Save agent to DB failed:", e);
    return agent;
  }
}

// Validates a real Postgres uuid format (the standard 8-4-4-4-12 hex shape).
export function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Builds the exact payload for saving a query to Supabase. Pure and
// exported specifically so this exact class of bug -- one bad field
// silently failing the ENTIRE upsert -- is directly testable, rather than
// only discoverable by a real user hitting it in production. This is
// exactly what happened with agent_id: the demo/fallback agent list (shown
// until a real agent exists) uses ids like "AGT-001", not real uuids, and
// Postgres rejected the whole row because of it.
export function buildQuerySavePayload(q) {
  return {
    id:                  q.id,
    agent_id:            isUuid(q.agentId) ? q.agentId : null,
    agent_company:       q.agentCompany,
    agent_country:       q.agentCountry,
    correspondent:       q.correspondent,
    group_name:          q.groupName,
    client_name:         q.clientName,
    sector:              q.sector || q.destination,
    nights:              parseInt(q.nights) || null,
    hotel_cat:           q.hotelCat,
    pax_known:           q.paxKnown,
    pax_exact:           parseInt(q.paxExact) || null,
    pax_min:             parseInt(q.paxMin) || null,
    pax_max:             parseInt(q.paxMax) || null,
    pax_display:         q.paxDisplay,
    date_known:          q.dateKnown,
    travel_date_from:    q.travelDate || q.travelDateFrom || null,
    travel_month:        q.travelMonth,
    travel_season:       q.travelSeason,
    date_display:        q.dateDisplay,
    status:              q.status,
    cancelled:           q.cancelled || false,
    cancellation_reason: q.cancellationReason,
    tour_file_id:        q.tourFileId,
    notes:               q.notes,
    manual_wf:           q.manualWF || [],
    source:              q.source,
    source_other:        q.sourceOther,
    nationality:         q.nationality,
    date:                q.date,
    assigned_to:         q.assignedTo || null,
    file_type:           q.fileType || null,
    travel_date_to:      q.travelDateTo || null,
    internal_correspondent: q.internalCorrespondent,
  };
}

// ─── SHARED APP SETTINGS (generic key-value pattern) ───────────────────────
// A single reusable pattern for any app-wide setting that should be shared
// across every staff member's device rather than sitting in localStorage on
// just one browser. Load once at startup, save whenever it changes -- any
// future global setting should use this same pair of functions rather than
// reaching for localStorage and creating the same "looks configured but
// isn't shared" gap that doc numbering/typography/templates had.
export async function loadAppSetting(db, key, fallback) {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", key);
    if (data && data[0] && data[0].value && Object.keys(data[0].value).length > 0) {
      return { ...fallback, ...data[0].value };
    }
    return fallback;
  } catch (e) {
    console.warn(`Load app setting "${key}" failed:`, e);
    return fallback;
  }
}

export async function saveAppSetting(db, key, value) {
  try {
    await db.from("app_settings").upsert({ key, value });
  } catch (e) {
    console.warn(`Save app setting "${key}" failed:`, e);
  }
}

// ─── DOCUMENT REGISTRY ──────────────────────────────────────────────────────
// Per-tour-file document tracking (booking confirmations, vouchers, visa
// copies, etc.) -- was localStorage-only, meaning different staff on
// different computers saw a different log for the same tour file.

export function mapDbDocRegistryRow(row) {
  return {
    id: row.id, name: row.name, category: row.category, from: row.from,
    date: row.date, status: row.status, driveLink: row.drive_link,
    notes: row.notes, addedAt: row.added_at,
  };
}

export async function loadDocRegistry(db, queryId) {
  try {
    const { data } = await db.from("document_registry").select("*").eq("query_id", queryId).order("added_at", { ascending: false });
    return (data || []).map(mapDbDocRegistryRow);
  } catch (e) {
    console.warn("Load document registry failed:", e);
    return [];
  }
}

// Saves the whole current list for a query: upserts everything present,
// deletes anything that existed in the DB but is no longer in the local
// array (handles removing a logged document) -- same sync pattern as
// savePaymentsToDB's entries.
export async function saveDocRegistry(db, queryId, docs, tourFileId) {
  try {
    for (const d of docs) {
      await db.from("document_registry").upsert({
        id: d.id, query_id: queryId, tour_file_id: tourFileId || null, name: d.name, category: d.category,
        from: d.from, date: d.date || null, status: d.status,
        drive_link: d.driveLink, notes: d.notes,
      });
    }
    const { data: existing } = await db.from("document_registry").select("id").eq("query_id", queryId);
    const keepIds = new Set(docs.map(d => String(d.id)));
    for (const row of (existing || [])) {
      if (!keepIds.has(String(row.id))) await db.from("document_registry").eq("id", row.id).delete();
    }
  } catch (e) {
    console.warn("Save document registry failed:", e);
  }
}

// ─── COST SHEET (real versioned persistence) ───────────────────────────────
// Maps a cost_sheets DB row to the shape CostSheet.jsx's local state uses.

// Computes a group slab's final price from a saved Cost Sheet snapshot
// (the shape mapDbCostSheetRow returns). This is a deliberate, standalone
// copy of CostSheet.jsx's own internal calcSlab -- not an import from it --
// so that QuotationGenerator's "Pull from Cost Sheet" feature can compute
// the same final price without adding a dependency on CostSheet.jsx's
// internals, which stays self-contained and untouched by this. If the
// pricing formula changes, both copies need updating together.
export function calcCostSheetSlabFinalPrice(snap, slab) {
  const n = v => parseFloat(v)||0;
  const days = snap.days || [], transports = snap.transports || [], monuments = snap.monuments || [];
  const localHandlers = snap.localHandlers || [], extras = snap.extras || [];
  const totMeal = days.reduce((s,d)=>s+n(d.mealCost),0);
  const totHotel = days.reduce((s,d)=>s+n(d.hotelNetPP),0);
  const monTotal = monuments.filter(m=>m.include).reduce((s,m)=>s+n(m.fee),0) + n(snap.monExtra);

  const tptTotal = transports.filter(t=>t.slabs.includes(slab.id)).reduce((s,t)=>s+n(t.cost),0);
  const tptPP = slab.foc > 0 ? tptTotal / slab.foc : 0;
  const tlPP = snap.tlMode==="pp" ? n(snap.tlCost) : (slab.foc>0 ? n(snap.tlCost)/slab.foc : 0);
  const miscPP = snap.miscMode==="pp" ? n(snap.miscCost) : (slab.foc>0 ? n(snap.miscCost)/slab.foc : 0);
  const monPP = snap.monMode==="pp" ? monTotal : (slab.foc>0 ? monTotal/slab.foc : 0);
  const localPP = localHandlers.reduce((s,h) => s + (h.mode==="pp" ? n(h.cost) : (slab.foc>0 ? n(h.cost)/slab.foc : 0)), 0);
  const extrasPP = extras.reduce((s,e) => s + (e.mode==="PP" ? n(e.cost) : (slab.foc>0 ? n(e.cost)/slab.foc : 0)), 0);

  const sub = totHotel + totMeal + tptPP + tlPP + miscPP + monPP + localPP + extrasPP;
  const tax = Math.round(sub * (snap.gst||0)/100);
  const afterTax = sub + tax;
  const markupAmt = Math.round(afterTax * (snap.markup||0)/100);
  const sellingINR = afterTax + markupAmt;
  const finalFX = Math.ceil(sellingINR / (snap.roe||1));
  return { finalFX, sub: Math.round(sub), tax, afterTax: Math.round(afterTax), markupAmt };
}

// Standalone copy of Cost Sheet's own calcTlSlab -- T/L slabs have a
// genuinely different formula from group slabs (a surcharge on top,
// divided by the slab's own paying-pax count rather than foc), not just
// a different label. Reuses calcCostSheetSlabFinalPrice as its base
// (tl.pax standing in for foc), then layers the surcharge exactly the
// way Cost Sheet itself does, so Quotation's pull can't silently compute
// a different number for T/L slabs than the Cost Sheet the client
// actually saw.
export function calcCostSheetTlSlabFinalPrice(snap, tlSlab) {
  const n = v => parseFloat(v)||0;
  const base = calcCostSheetSlabFinalPrice(snap, { id: tlSlab.id, foc: n(tlSlab.pax) });
  const surchargeTotal = Object.entries(tlSlab.costs||{}).reduce((s,[k,v])=>s+(tlSlab.includes && tlSlab.includes[k] ? n(v) : 0),0);
  const surchargePP = n(tlSlab.pax)>0 ? surchargeTotal/n(tlSlab.pax) : 0;
  const sub = base.sub + surchargePP;
  const tax = Math.round(sub * (snap.gst||0)/100);
  const afterTax = sub + tax;
  const markupAmt = Math.round(afterTax * (snap.markup||0)/100);
  const sellingINR = afterTax + markupAmt;
  const finalFX = Math.ceil(sellingINR / (snap.roe||1));
  return { finalFX, sub: Math.round(sub), tax, afterTax: Math.round(afterTax), markupAmt, surchargePP: Math.round(surchargePP) };
}


export function mapDbCostSheetRow(row) {
  return {
    id: row.id,
    version: row.version,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by,
    isFinal: row.is_final || false,
    note: row.note || "",
    gst: row.gst_pct ?? 5, markup: row.markup_pct ?? 20, roe: row.roe ?? 90, currency: row.currency || "US $",
    tlMode: row.tl_mode || "lumpsum", tlCost: row.tl_cost ?? "",
    miscMode: row.misc_mode || "pp", miscCost: row.misc_cost ?? "",
    monMode: row.mon_mode || "pp", monExtra: row.mon_extra ?? 0,
    days: row.days || [], transports: row.transports || [], slabs: row.slabs || [],
    monuments: row.monuments || [], localHandlers: row.local_handlers || [], extras: row.extras || [],
    tlSlabs: row.tl_slabs || [], clientAgentName: row.client_agent_name || "", assignedStaffName: row.assigned_staff_name || "",
  };
}

// Loads every saved version for a tour file, oldest first (matches the
// order CostSheet.jsx's own versions[] array is built in).
export async function loadCostSheetVersions(db, queryId) {
  try {
    const { data } = await db.from("cost_sheets").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbCostSheetRow);
  } catch (e) {
    console.warn("Load cost sheet versions failed:", e);
    return [];
  }
}

// Inserts a NEW row -- Save Version means permanent history, never an
// overwrite of a previous version, matching what the version/is_final
// columns are clearly designed for.
// createdBy is guarded with isUuid() the same way agent_id was: a demo-mode
// user's id may not be a real staff uuid, and one bad field here would
// otherwise silently fail the entire insert, the exact bug agent_id caused.
export async function saveCostSheetVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("cost_sheets").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      gst_pct: snap.gst, markup_pct: snap.markup, roe: snap.roe, currency: snap.currency,
      tl_mode: snap.tlMode, tl_cost: parseFloat(snap.tlCost) || 0,
      misc_mode: snap.miscMode, misc_cost: parseFloat(snap.miscCost) || 0,
      mon_mode: snap.monMode, mon_extra: parseFloat(snap.monExtra) || 0,
      days: snap.days || [], transports: snap.transports || [], slabs: snap.slabs || [],
      monuments: snap.monuments || [], local_handlers: snap.localHandlers || [], extras: snap.extras || [],
      tl_slabs: snap.tlSlabs || [], client_agent_name: snap.clientAgentName || null, assigned_staff_name: snap.assignedStaffName || null,
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save cost sheet version failed:", e);
    return null;
  }
}

// Marks exactly one version as final, clearing the flag on every other
// version for the same tour file first.
export async function markCostSheetVersionFinal(db, queryId, version) {
  try {
    await db.from("cost_sheets").eq("query_id", queryId).update({ is_final: false });
    await db.from("cost_sheets").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark cost sheet version final failed:", e);
  }
}

// ─── MEAL PLAN (real versioned history, mirrors Cost Sheet -- Phase 0 of
// the Document Chain plan, see docs/DATA_OWNERSHIP.md) ─────────────────────
export function mapDbMealPlanRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    heading: row.heading || "", rows: row.rows || [],
  };
}

export async function loadMealPlanVersions(db, queryId) {
  try {
    const { data } = await db.from("meal_plans").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbMealPlanRow);
  } catch (e) {
    console.warn("Load meal plan versions failed:", e);
    return [];
  }
}

export async function saveMealPlanVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("meal_plans").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      heading: snap.heading || null, rows: snap.rows || [],
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save meal plan version failed:", e);
    return null;
  }
}

export async function markMealPlanVersionFinal(db, queryId, version) {
  try {
    await db.from("meal_plans").eq("query_id", queryId).update({ is_final: false });
    await db.from("meal_plans").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark meal plan version final failed:", e);
  }
}

// ─── ITINERARY (real versioned history, mirrors Meal Plan/Cost Sheet --
// Phase 0 of the Document Chain plan, see docs/DATA_OWNERSHIP.md). One
// table covers both Brief and Detailed Itinerary, since ItineraryBuilder
// is a single component with a "brief"/"detailed" style toggle over
// the same underlying day data, not two separate documents. ────────────
export function mapDbItineraryRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    tourTitle: row.tour_title || "", tagline: row.tagline || "", route: row.route || "",
    duration: row.duration || "", activeTab: row.active_tab || "brief", days: row.days || [],
  };
}

export async function loadItineraryVersions(db, queryId) {
  try {
    const { data } = await db.from("itineraries").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbItineraryRow);
  } catch (e) {
    console.warn("Load itinerary versions failed:", e);
    return [];
  }
}

export async function saveItineraryVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("itineraries").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      tour_title: snap.tourTitle || null, tagline: snap.tagline || null, route: snap.route || null,
      duration: snap.duration || null, active_tab: snap.activeTab || "brief", days: snap.days || [],
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save itinerary version failed:", e);
    return null;
  }
}

export async function markItineraryVersionFinal(db, queryId, version, style) {
  try {
    await db.from("itineraries").eq("query_id", queryId).eq("active_tab", style).update({ is_final: false });
    await db.from("itineraries").eq("query_id", queryId).eq("version", version).eq("active_tab", style).update({ is_final: true });
  } catch (e) {
    console.warn("Mark itinerary version final failed:", e);
  }
}

// ─── EXCHANGE ORDERS (real versioned history -- Phase 0 of the Document
// Chain plan). orders[] is a list of independent vendor instructions
// (each already has its own confirmed flag), not sections of one draft --
// but versioned the same way as every other document here for a
// consistent, holistic history system rather than a bespoke model just
// for this one. Bundled into a single jsonb `content` column rather than
// enumerating every field as its own column, given the scale of fields
// involved (each order alone has 25+ fields). ─────────────────────────────
export function mapDbExchangeOrderRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    orders: (row.content && row.content.orders) || [],
  };
}

export async function loadExchangeOrderVersions(db, queryId) {
  try {
    const { data } = await db.from("exchange_orders").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbExchangeOrderRow);
  } catch (e) {
    console.warn("Load exchange order versions failed:", e);
    return [];
  }
}

export async function saveExchangeOrderVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("exchange_orders").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      content: { orders: snap.orders || [] },
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save exchange order version failed:", e);
    return null;
  }
}

export async function markExchangeOrderVersionFinal(db, queryId, version) {
  try {
    await db.from("exchange_orders").eq("query_id", queryId).update({ is_final: false });
    await db.from("exchange_orders").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark exchange order version final failed:", e);
  }
}

// ─── TOUR BRIEFING SHEET (real versioned history -- Phase 0 of the
// Document Chain plan). Same single-jsonb-column approach as Exchange
// Orders: this document has 12+ scalar fields plus 8 separate array
// sections (hotels, flights, trains, guides, other services, programme,
// contacts) plus per-section notes and print ordering/visibility --
// enumerating each as its own column would be a lot of schema for
// limited benefit, given nothing here needs to be queried individually
// outside this one document. ────────────────────────────────────────────
export function mapDbTourBriefingRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    content: row.content || {},
  };
}

export async function loadTourBriefingVersions(db, queryId) {
  try {
    const { data } = await db.from("tour_briefings").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbTourBriefingRow);
  } catch (e) {
    console.warn("Load tour briefing versions failed:", e);
    return [];
  }
}

export async function saveTourBriefingVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("tour_briefings").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      content: snap.content || {},
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save tour briefing version failed:", e);
    return null;
  }
}

export async function markTourBriefingVersionFinal(db, queryId, version) {
  try {
    await db.from("tour_briefings").eq("query_id", queryId).update({ is_final: false });
    await db.from("tour_briefings").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark tour briefing version final failed:", e);
  }
}

// ─── PRO-FORMA + TAX INVOICE (real versioned history -- Phase 0 of the
// Document Chain plan, and the FINAL two documents in it, deliberately
// last given their compliance weight). Found and fixed along the way:
// ProformaInvoice's invoice number defaulted from a localStorage counter
// that never synced across staff/devices (the exact "duplicate invoice
// numbers across staff" risk the settings migration existed to prevent,
// which never got wired into this specific file), and TaxInvoice's
// defaulted to a random 3-digit suffix with zero uniqueness guarantee at
// all -- a real risk for a document with GST/legal numbering
// requirements. loadExistingInvoiceNumbers scans ALL saved invoices of a
// type globally (not scoped to one query_id, since invoice numbers must
// be unique across the whole business, not just one tour), feeding
// nextInvoiceNo (already existed in utils.js, but was never actually
// used by either component) to compute a genuinely safe next number. ──

export async function loadExistingInvoiceNumbers(db, table) {
  try {
    const { data } = await db.from(table).select("invoice_no");
    return (data || []).map(r => r.invoice_no).filter(Boolean);
  } catch (e) {
    console.warn(`Load existing invoice numbers from ${table} failed:`, e);
    return [];
  }
}

export function mapDbProformaInvoiceRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    invoiceNo: row.invoice_no || "", content: row.content || {},
  };
}

export async function loadProformaInvoiceVersions(db, queryId) {
  try {
    const { data } = await db.from("proforma_invoices").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbProformaInvoiceRow);
  } catch (e) {
    console.warn("Load proforma invoice versions failed:", e);
    return [];
  }
}

export async function saveProformaInvoiceVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("proforma_invoices").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      invoice_no: snap.invoiceNo || null, content: snap.content || {},
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save proforma invoice version failed:", e);
    return null;
  }
}

export async function markProformaInvoiceVersionFinal(db, queryId, version) {
  try {
    await db.from("proforma_invoices").eq("query_id", queryId).update({ is_final: false });
    await db.from("proforma_invoices").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark proforma invoice version final failed:", e);
  }
}

export function mapDbTaxInvoiceRow(row) {
  return {
    id: row.id, version: row.version, isFinal: row.is_final || false,
    date: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by, note: row.note || "",
    invoiceNo: row.invoice_no || "", content: row.content || {},
  };
}

export async function loadTaxInvoiceVersions(db, queryId) {
  try {
    const { data } = await db.from("tax_invoices").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbTaxInvoiceRow);
  } catch (e) {
    console.warn("Load tax invoice versions failed:", e);
    return [];
  }
}

export async function saveTaxInvoiceVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("tax_invoices").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      invoice_no: snap.invoiceNo || null, content: snap.content || {},
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save tax invoice version failed:", e);
    return null;
  }
}

export async function markTaxInvoiceVersionFinal(db, queryId, version) {
  try {
    await db.from("tax_invoices").eq("query_id", queryId).update({ is_final: false });
    await db.from("tax_invoices").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark tax invoice version final failed:", e);
  }
}

// ─── QUOTATION (real versioned history, mirrors Cost Sheet exactly) ────────
export function mapDbQuotationRow(row) {
  return {
    version: row.version, isFinal: row.is_final || false, note: row.note || "",
    savedAt: row.updated_at ? new Date(row.updated_at).toLocaleString("en-IN") : "",
    createdAt: row.created_at, createdBy: row.created_by,
    finalPriceEntries: row.final_price_entries || [], confirmedPax: row.confirmed_pax ?? "", tourValue: row.tour_value ?? "",
    attnName: row.attn_name || "", attnCompany: row.attn_company || "", attnCity: row.attn_city || "",
    date: row.date || "", currency: row.currency || "US $", roe: row.roe ?? "", refLine: row.ref_line || "",
    period: row.period || "", paxLine: row.pax_line || "",
    itinerary: row.itinerary || [], hotels: row.hotels || [], slabs: row.slabs || [],
    monuments: row.monuments || [], showMonuments: row.show_monuments ?? true,
    includes: row.includes || [], excludes: row.excludes || [],
    greeting: row.greeting || "", openingLine: row.opening_line || "", closingLine: row.closing_line || "",
    signoff: row.signoff || "", monumentNote: row.monument_note || "", costSheetId: row.cost_sheet_id || null,
    // Tracks which Cost Sheet version this Quotation was last pulled
    // from -- the anchor for the mutual staleness check against a newer
    // star-marked Cost Sheet (Document Chain plan, docs/DATA_OWNERSHIP.md
    // Phase 3), same pattern as tour_execution's
    // synced_from_cost_sheet_version.
    pulledFromCostSheetVersion: row.pulled_from_cost_sheet_version ?? null,
  };
}

// Loads every saved version for a tour file, oldest first -- same shape as
// loadCostSheetVersions, so the two histories can be merged for the
// Pricing Timeline.
export async function loadQuotationVersions(db, queryId) {
  try {
    const { data } = await db.from("quotations").select("*").eq("query_id", queryId).order("version", { ascending: true });
    return (data || []).map(mapDbQuotationRow);
  } catch (e) {
    console.warn("Load quotation versions failed:", e);
    return [];
  }
}

// Inserts a NEW row -- Save Version means permanent history, matching
// Cost Sheet exactly, since real negotiations produce real quotation
// versions (client pushback, revised pricing, etc.) that deserve the same
// permanent record as Cost Sheet versions do.
export async function saveQuotationVersion(db, queryId, snap, createdBy) {
  try {
    const { data } = await db.from("quotations").insert({
      query_id: queryId, version: snap.version, is_final: false, note: snap.note || null,
      cost_sheet_id: snap.costSheetId || null,
      final_price_entries: snap.finalPriceEntries || [],
      confirmed_pax: snap.confirmedPax ? parseInt(snap.confirmedPax) : null,
      tour_value: snap.tourValue ? parseFloat(snap.tourValue) : null,
      attn_name: snap.attnName, attn_company: snap.attnCompany, attn_city: snap.attnCity,
      date: snap.date || null, currency: snap.currency, roe: snap.roe || null, ref_line: snap.refLine,
      period: snap.period, pax_line: snap.paxLine,
      itinerary: snap.itinerary || [], hotels: snap.hotels || [], slabs: snap.slabs || [],
      monuments: snap.monuments || [], show_monuments: snap.showMonuments,
      includes: snap.includes || [], excludes: snap.excludes || [],
      greeting: snap.greeting, opening_line: snap.openingLine, closing_line: snap.closingLine,
      signoff: snap.signoff, monument_note: snap.monumentNote,
      pulled_from_cost_sheet_version: snap.pulledFromCostSheetVersion ?? null,
      created_by: isUuid(createdBy) ? createdBy : null,
    });
    return data && data[0] ? data[0].id : null;
  } catch (e) {
    console.warn("Save quotation version failed:", e);
    return null;
  }
}

export async function markQuotationVersionFinal(db, queryId, version) {
  try {
    await db.from("quotations").eq("query_id", queryId).update({ is_final: false });
    await db.from("quotations").eq("query_id", queryId).eq("version", version).update({ is_final: true });
  } catch (e) {
    console.warn("Mark quotation version final failed:", e);
  }
}

// ─── PRICING TIMELINE ───────────────────────────────────────────────────────
// Merges Cost Sheet and Quotation version history into one dated,
// chronological narrative -- the "office executive glancing at a paper
// file" experience: what was done, by whom, why, and what's final, without
// having to open two separate documents and cross-reference dates by hand.
// Pure function, testable without a live DB -- takes the already-loaded
// version arrays and a staff list (both already loaded elsewhere in the
// app) rather than fetching anything itself.
export function buildPricingTimeline(costSheetVersions, quotationVersions, staff) {
  const staffName = (id) => {
    const s = (staff || []).find(s => s.id === id);
    return s ? s.name : "Unknown";
  };
  const csEntries = (costSheetVersions || []).map(v => ({
    type: "costsheet", version: v.version, isFinal: v.isFinal, note: v.note,
    createdAt: v.createdAt, by: staffName(v.createdBy),
  }));
  const qEntries = (quotationVersions || []).map(v => ({
    type: "quotation", version: v.version, isFinal: v.isFinal, note: v.note,
    createdAt: v.createdAt, by: staffName(v.createdBy), costSheetId: v.costSheetId,
    finalPriceEntries: v.finalPriceEntries, confirmedPax: v.confirmedPax, tourValue: v.tourValue,
  }));
  return [...csEntries, ...qEntries].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

// Loads both histories for a tour file and merges them. Takes `staff` as a
// parameter (already loaded app-wide) rather than querying it again here.
export async function loadPricingTimeline(db, queryId, staff) {
  const [costSheetVersions, quotationVersions] = await Promise.all([
    loadCostSheetVersions(db, queryId),
    loadQuotationVersions(db, queryId),
  ]);
  return buildPricingTimeline(costSheetVersions, quotationVersions, staff);
}

// Formats a yyyy-mm-dd date string (the native <input type="date"> value
// shape) as dd-mm-yyyy for display. Returns the input unchanged if it
// isn't in the expected shape, rather than showing something broken.
export function formatDateDMY(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return isoDate || "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ─── WORKFLOW PROGRESS (real auto-detection, not pipeline-stage guessing) ──
// The old system marked steps done purely because the query reached a given
// pipeline stage (e.g. "Operations" instantly checked off Vouchers Issued
// and Meal Plan Generated, whether or not that work actually happened) --
// and worse, those auto-marked steps couldn't even be unmarked. That's
// exactly the "misleading, misrepresenting, manipulative" tracker problem.
//
// New rule: a step is only ever auto-marked done when there's real,
// verifiable data behind it. Everything else defaults to pending and
// requires a human to confirm it -- under-claiming is fine, over-claiming
// is not. Every step, auto or not, can always be toggled by a human, and
// every toggle is meant to be logged to the audit trail by the caller.

// Which steps have a real, checkable signal, and what that signal is.
// Steps not listed here are never auto-detected -- always default pending.
export function getAutoDetectedSteps(signals) {
  const s = signals || {};
  return {
    1: true,                 // Query acknowledged -- the query existing IS the acknowledgment
    2: true,                 // Query number assigned -- the query's own id is the number
    4: !!s.hasCostSheet,      // Cost sheet prepared -- a real cost_sheets row exists
    5: !!s.hasQuotation,      // Quotation sent to client -- a real quotations row exists
    12: !!s.hasFacilitators,  // Tour facilitator assigned -- tour_execution.facilitators is non-empty
    14: !!s.hasPayments,      // Payment status tracked -- at least one payment entry exists
  };
}

// manualWF used to be a flat array of step ids meaning "done" (no way to
// override an auto-true back to pending). Normalizes both the old shape
// and the new {step, done} override shape so existing saved data doesn't
// break.
export function normalizeManualWF(manualWF) {
  return (manualWF || []).map(m => (typeof m === "number" ? { step: m, done: true } : m));
}

// The actual done/pending state for one step, and whether that came from
// real auto-detection, a human's explicit override, or neither (pending).
export function getWFStepStatus(stepId, autoDetected, manualWF) {
  const override = normalizeManualWF(manualWF).find(m => m.step === stepId);
  if (override) return { done: override.done, source: "manual" };
  if (autoDetected[stepId]) return { done: true, source: "auto" };
  return { done: false, source: "pending" };
}

// Computes the new manualWF array and a ready-to-log audit message for
// toggling one step. Always produces an explicit override (even to
// re-affirm what auto-detection already said), so a human's decision is
// always the visible, persisted source of truth for that step going
// forward.
export function toggleWFStep(manualWF, stepId, autoDetected, stepLabel) {
  const normalized = normalizeManualWF(manualWF);
  const existing = normalized.find(m => m.step === stepId);
  const currentlyDone = existing ? existing.done : !!autoDetected[stepId];
  const newDone = !currentlyDone;
  const newManualWF = [...normalized.filter(m => m.step !== stepId), { step: stepId, done: newDone }];
  const auditAction = `${newDone ? "Marked" : "Unmarked"} step "${stepLabel}" as ${newDone ? "done" : "pending"}`;
  return { manualWF: newManualWF, auditAction };
}

// ─── QUERY SERVICES (Service Status list, now with real persistence + order) ──
export function mapDbServiceRow(row) {
  return { id: row.id, name: row.name, status: row.status, date: row.date, sortOrder: row.sort_order || 0 };
}

export async function loadQueryServices(db, queryId) {
  try {
    const { data } = await db.from("query_services").select("*").eq("query_id", queryId).order("sort_order", { ascending: true });
    return (data || []).map(mapDbServiceRow);
  } catch (e) {
    console.warn("Load query services failed:", e);
    return [];
  }
}

// Saves the whole current list: upserts everything present (including each
// item's current sort_order, so drag-reorder persists), deletes anything
// removed locally. Same sync pattern as saveDocRegistry/savePaymentsToDB.
export async function saveQueryServices(db, queryId, services) {
  try {
    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      await db.from("query_services").upsert({
        id: s.id, query_id: queryId, name: s.name, status: s.status, date: s.date || null, sort_order: i,
      });
    }
    const { data: existing } = await db.from("query_services").select("id").eq("query_id", queryId);
    const keepIds = new Set(services.map(s => String(s.id)));
    for (const row of (existing || [])) {
      if (!keepIds.has(String(row.id))) await db.from("query_services").eq("id", row.id).delete();
    }
  } catch (e) {
    console.warn("Save query services failed:", e);
  }
}

// ─── FINAL PRICE AGREEMENT (multi-entry composition) ───────────────────────
// A confirmed group's price is often split across multiple rate lines --
// e.g. 18 pax on one slab + 2 pax on single supplement -- rather than one
// flat rate. Each entry is { id, paxPaying, foc, source: "slab"|"custom",
// slabLabel, rate }. FOC (free-of-cost, e.g. a Tour Leader travelling free)
// counts toward the group's total headcount but contributes nothing to
// tour value -- only paying pax get multiplied by rate. Totals are always
// derived from the entries, never entered separately, so the numbers
// can't drift apart from what's actually listed.
// entryPaxPaying reads paxPaying with a fallback to the old single "pax"
// field, for entries saved before FOC was split out as its own field.
function entryPaxPaying(e) { return e.paxPaying ?? e.pax ?? ""; }

export function computeFinalPriceTotals(entries) {
  const list = entries || [];
  const paxPaying = list.reduce((s, e) => s + (parseInt(entryPaxPaying(e)) || 0), 0);
  const foc = list.reduce((s, e) => s + (parseInt(e.foc) || 0), 0);
  const tourValue = list.reduce((s, e) => s + (parseInt(entryPaxPaying(e)) || 0) * (parseFloat(e.rate) || 0), 0);
  return { confirmedPax: paxPaying + foc, paxPaying, foc, tourValue };
}

// True only once every entry has both a paying-pax count and a resolved
// rate -- this is the actual gate for allowing a version to be marked
// final. FOC is optional (many lines have none) and defaults to 0.
export function isFinalPriceComplete(entries) {
  const list = entries || [];
  if (list.length === 0) return false;
  return list.every(e => (parseInt(entryPaxPaying(e)) || 0) > 0 && (parseFloat(e.rate) || 0) > 0);
}

// Builds a short, human-readable summary of a final price entries list,
// used both for the audit log message and for display.
export function summarizeFinalPriceEntries(entries, currency) {
  const list = entries || [];
  if (list.length === 0) return "no entries";
  return list.map(e => {
    const foc = parseInt(e.foc) || 0;
    return `${entryPaxPaying(e)} pax paying${foc ? ` + ${foc} FOC` : ""} @ ${currency || ""}${e.rate} (${e.source === "custom" ? "Custom" : e.slabLabel || "Slab"})`;
  }).join(" + ");
}

// "Last change" audits specific to the final price agreement section --
// separate from the broader Pricing Timeline, filtered by a fixed prefix
// so they're identifiable among a query's general audit trail.
export const FINAL_PRICE_AUDIT_PREFIX = "Final price agreement:";

// Updates the price entries on an ALREADY-final version in place, rather
// than requiring a new version number. Real group sizes often stay fluid
// until close to departure -- refining the same agreed deal isn't a new
// negotiation, and shouldn't clutter version history the way a genuinely
// new price would. Every update is still logged to the audit trail.
export async function updateFinalPriceAgreement(db, queryId, version, entries, currency, byName) {
  const { confirmedPax, tourValue } = computeFinalPriceTotals(entries);
  try {
    await db.from("quotations").eq("query_id", queryId).eq("version", version).update({
      final_price_entries: entries, confirmed_pax: confirmedPax, tour_value: tourValue,
    });
    await logAudit(db, queryId, byName, `${FINAL_PRICE_AUDIT_PREFIX} [Updated in place, v${version}, no renegotiation] ${summarizeFinalPriceEntries(entries, currency)} — Total Pax ${confirmedPax}, Tour Value ${currency || ""}${tourValue}`);
  } catch (e) {
    console.warn("Update final price agreement failed:", e);
  }
}

// ─── GENERIC AUDIT LOGGING ──────────────────────────────────────────────────
// The audit trail is meant to be the hub of every important activity on a
// tour file -- not just query field edits. Any component that persists a
// meaningful change should call this directly, the same way
// logFinalPriceAgreementChange already did. Centralizing it here so every
// caller behaves identically (same table, same shape, same silent-fail
// safety) rather than each component rolling its own insert.
export async function logAudit(db, queryId, byName, action) {
  try {
    await db.from("query_audit").insert({ query_id: queryId, by_name: byName || "Unknown", action });
  } catch (e) {
    console.warn("Log audit failed:", e);
  }
}

export async function logFinalPriceAgreementChange(db, queryId, byName, entries, currency) {
  const summary = summarizeFinalPriceEntries(entries, currency);
  await logAudit(db, queryId, byName, `${FINAL_PRICE_AUDIT_PREFIX} ${summary}`);
}

export async function loadFinalPriceAgreementAudits(db, queryId) {
  try {
    const { data } = await db.from("query_audit").select("*").eq("query_id", queryId).order("created_at", { ascending: false });
    return (data || [])
      .filter(a => (a.action || "").startsWith(FINAL_PRICE_AUDIT_PREFIX))
      .map(a => ({ by: a.by_name, at: a.created_at, action: a.action.replace(FINAL_PRICE_AUDIT_PREFIX, "").trim() }));
  } catch (e) {
    console.warn("Load final price agreement audits failed:", e);
    return [];
  }
}

// ─── VENDOR ASSIGNMENT HISTORY (the real "Service History") ────────────────
// The old "Service History" tab in VendorMaster was actually payment
// history matched by fuzzy name substring against payment_outgoing.vendor
// (a free-text field, since outgoing payments can go to non-vendor payees
// like airlines) -- it had nothing to do with tour assignments at all, so
// assigning a facilitator/handler/transporter in the Tour File drawer's
// Info tab never showed up here. This is the real thing: every tour this
// vendor has actually been assigned to, matched reliably by vendor id
// (not name), read from tour_execution -- the single canonical source for
// assignments, per DATA_OWNERSHIP.md.
export function getVendorAssignmentHistory(vendorId, tourExecutions, queries) {
  const rows = [];
  Object.entries(tourExecutions || {}).forEach(([queryId, te]) => {
    const q = (queries || []).find(qq => qq.id === queryId);
    if (!q) return;
    const roleLists = [
      { role: "Tour Facilitator", list: te?.facilitators },
      { role: "Local Handler", list: te?.localHandlers },
      { role: "Transporter", list: te?.transporters },
    ];
    roleLists.forEach(({ role, list }) => {
      (list || []).forEach(entry => {
        if (entry.vendorId !== vendorId) return;
        rows.push({
          tourFileId: q.tourFileId || q.id,
          queryId: q.id,
          groupName: q.groupName || q.clientName || "",
          sector: entry.sector || q.destination || q.sector || "",
          travelDate: q.travelDate || "",
          status: q.status,
          cancelled: !!q.cancelled,
          role,
          notes: entry.notes || "",
        });
      });
    });
  });
  return rows.sort((a, b) => new Date(b.travelDate || 0) - new Date(a.travelDate || 0));
}
