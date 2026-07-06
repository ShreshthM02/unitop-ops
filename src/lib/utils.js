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
export function getMovementChartRows(queries, users, year, month) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  return queries
    .filter(q => ["operations", "completed"].includes(q.status) && !q.cancelled && q.travelDate)
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
    flights: [],
    arrFlightDetails: "",
    depFlightDetails: "",
    transporterVendorId: "",
    transporterNotes: "",
  };
}

export function mapDbTourExecutionRow(row) {
  return {
    queryId: row.query_id,
    days: row.days || [],
    facilitators: row.facilitators || [],
    localHandlers: row.local_handlers || [],
    flights: row.flights || [],
    arrFlightDetails: row.arr_flight_details || "",
    depFlightDetails: row.dep_flight_details || "",
    transporterVendorId: row.transporter_vendor_id || "",
    transporterNotes: row.transporter_notes || "",
  };
}

// Merges the loaded tour_execution rows into a map keyed by query_id, the
// same pattern as mergePaymentsRows -- pure function, testable without a DB.
export function mergeTourExecutionRows(rows) {
  const map = {};
  (rows || []).forEach(row => { map[row.query_id] = mapDbTourExecutionRow(row); });
  return map;
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
      flights: data.flights || [],
      arr_flight_details: data.arrFlightDetails || null,
      dep_flight_details: data.depFlightDetails || null,
      transporter_vendor_id: data.transporterVendorId || null,
      transporter_notes: data.transporterNotes || null,
    });
  } catch (e) { console.warn("Save tour execution to DB failed:", e); }
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
