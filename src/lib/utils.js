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
