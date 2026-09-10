// New Phase: Maintenance -- backup export and a real, data-level health
// check the app can run on itself, so Shreshth isn't relying on Claude
// to manually re-run these checks every time. Deliberately scoped to
// what a RUNNING APP can genuinely inspect about itself: real data in
// its own tables. Things like "check RLS policies" or "check for
// orphaned Supabase objects nothing in code references" stay a
// developer-side check (they need source-code and schema-catalog
// access this app's own restricted authenticated role never has) --
// not glossed over, just genuinely a different kind of check.

// ─── EXPORT EVERYTHING ───────────────────────────────────────────────────────

// Tables considered real business records worth backing up in a form a
// person can actually open and read. Deliberately excludes: gazetteer
// (1M+ rows of place-name reference data, not business data),
// photo_library/custom_places (supporting reference data, not records
// of what the business did), signatures (binary image data, meaningless
// as a spreadsheet row), and chat_conversation_members/chat_messages
// (personal conversations, not business records this export is for).
const EXPORT_TABLES = [
  { table: "queries", sheet: "Queries" },
  { table: "cost_sheets", sheet: "Cost Sheets" },
  { table: "quotations", sheet: "Quotations" },
  { table: "tour_execution", sheet: "Tour Info" },
  { table: "payment_incoming", sheet: "Payments Received" },
  { table: "payment_outgoing", sheet: "Payments Paid" },
  { table: "invoices", sheet: "Invoices" },
  { table: "exchange_orders", sheet: "Exchange Orders" },
  { table: "itineraries", sheet: "Itineraries" },
  { table: "meal_plans", sheet: "Meal Plans" },
  { table: "tour_briefings", sheet: "Tour Briefings" },
  { table: "editor_documents", sheet: "Editor Documents" },
  { table: "document_registry", sheet: "Document Registry" },
  { table: "agents", sheet: "Agents & Clients" },
  { table: "vendors", sheet: "Vendors" },
  { table: "series", sheet: "Series" },
  { table: "query_audit", sheet: "Audit Trail" },
  { table: "query_remarks", sheet: "Discussion" },
];
// staff exported separately, with credentials (password_hash,
// session_token) deliberately stripped -- a backup export is not a
// place those should ever end up, even for an admin-only feature.
const STAFF_SAFE_COLUMNS = ["id", "name", "username", "role", "active", "last_login", "deleted_at"];

function flattenValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function rowsToSheetData(rows) {
  if (!rows || !rows.length) return { headers: [], data: [] };
  // Union of every key across every row, not just the first row's keys
  // -- different rows of the same table can genuinely have different
  // shapes over time as columns get added.
  const headerSet = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => headerSet.add(k)));
  const headers = [...headerSet];
  const data = rows.map(r => headers.map(h => flattenValue(r[h])));
  return { headers, data };
}

// Exports every real business table into one .xlsx workbook, one sheet
// per table, and records when this export happened (who, and how many
// rows of what) so "when was this last backed up" is a real, visible
// answer rather than something only discoverable by asking someone.
export async function exportAllData(db, currentUser) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const summary = [];

  // Real, server-authoritative time -- not the browser's own clock,
  // which a real bug traced back to: a backup genuinely taken 2 days
  // earlier showed as "yesterday" because the displayed timestamp
  // trusted whatever clock the device happened to have. Falls back to
  // the local clock only if the server call itself somehow fails, so a
  // transient network issue never blocks the export outright.
  const serverNow = await db.auth.getServerTime();
  const now = serverNow ? new Date(serverNow) : new Date();

  // Added first (not reordered afterward -- ExcelJS orders sheets by
  // when addWorksheet() was called, not when their cells get written),
  // so opening the file always lands on a real cover explaining what
  // it is, filled in once the export summary below is known.
  const cover = wb.addWorksheet("Backup Info");

  for (const { table, sheet } of EXPORT_TABLES) {
    let rows = [];
    try {
      // No .order() here deliberately -- not every table is guaranteed
      // to have a created_at column, and row order doesn't matter for
      // a backup export; correctness (never erroring out a whole
      // table over an assumed column) matters more.
      const { data } = await db.from(table).select("*");
      rows = data || [];
    } catch (e) {
      console.warn(`Export: could not read ${table}:`, e);
    }
    const { headers, data } = rowsToSheetData(rows);
    const ws = wb.addWorksheet(sheet.slice(0, 31)); // Excel's own 31-char sheet-name limit
    if (headers.length) {
      ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(12, h.length + 2)) }));
      ws.getRow(1).font = { bold: true };
      data.forEach(rowArr => ws.addRow(rowArr));
    } else {
      ws.getCell("A1").value = "No rows in this table yet.";
    }
    summary.push({ sheet, rows: rows.length });
  }

  // Staff, with credentials stripped
  try {
    const { data: staffRows } = await db.from("staff").select("*").order("name", { ascending: true });
    const safeRows = (staffRows || []).map(r => {
      const safe = {};
      STAFF_SAFE_COLUMNS.forEach(c => { safe[c] = r[c]; });
      return safe;
    });
    const { headers, data } = rowsToSheetData(safeRows);
    const ws = wb.addWorksheet("Staff");
    if (headers.length) {
      ws.columns = headers.map(h => ({ header: h, key: h, width: Math.min(30, Math.max(12, h.length + 2)) }));
      ws.getRow(1).font = { bold: true };
      data.forEach(rowArr => ws.addRow(rowArr));
    }
    summary.push({ sheet: "Staff", rows: safeRows.length });
  } catch (e) {
    console.warn("Export: could not read staff:", e);
  }

  // A real cover sheet, first in the workbook, so opening the file
  // tells you immediately what it is and when it was made -- not just
  // a pile of unlabeled tabs.
  cover.getCell("A1").value = "Unitop Ops -- Full Data Export";
  cover.getCell("A1").font = { bold: true, size: 16 };
  cover.getCell("A3").value = "Exported by:";
  cover.getCell("B3").value = currentUser?.name || "Unknown";
  cover.getCell("A4").value = "Exported at:";
  cover.getCell("B4").value = now.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" });
  cover.getCell("A6").value = "Contents:";
  cover.getCell("A6").font = { bold: true };
  summary.forEach((s, i) => {
    cover.getCell(`A${7 + i}`).value = s.sheet;
    cover.getCell(`B${7 + i}`).value = `${s.rows} row${s.rows === 1 ? "" : "s"}`;
  });
  cover.getColumn("A").width = 22;
  cover.getColumn("B").width = 30;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const filename = `Unitop-Ops-Backup-${now.toISOString().slice(0, 10)}.xlsx`;
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);

  // Record when this happened, so "when was this last backed up" is a
  // real, visible answer -- not something only discoverable by asking
  // whoever last ran it.
  await saveBackupInfo(db, { by: currentUser?.name || "Unknown", at: now.toISOString(), summary });
  return { success: true, summary, filename };
}

export async function saveBackupInfo(db, info) {
  try {
    await db.from("app_settings").upsert({ key: "last_backup", value: info });
  } catch (e) {
    console.warn("Save backup info failed:", e);
  }
}

export async function getLastBackupInfo(db) {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", "last_backup");
    return (data && data[0] && data[0].value) || null;
  } catch (e) {
    console.warn("Load backup info failed:", e);
    return null;
  }
}

// Same pattern as backup tracking above -- "when was this last run, and
// by whom" is exactly as useful a signal for the health check as it is
// for backups, so it gets the identical treatment rather than a new
// one-off mechanism.
export async function saveHealthCheckInfo(db, info) {
  try {
    await db.from("app_settings").upsert({ key: "last_health_check", value: info });
  } catch (e) {
    console.warn("Save health check info failed:", e);
  }
}

export async function getLastHealthCheckInfo(db) {
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", "last_health_check");
    return (data && data[0] && data[0].value) || null;
  } catch (e) {
    console.warn("Load health check info failed:", e);
    return null;
  }
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
// Deliberately scoped to what's genuinely checkable from a running
// app's own database connection: real data problems, not source-code
// or schema-catalog issues (those need a developer with direct
// Supabase/GitHub access, not something this app can inspect about
// itself). Each check returns {id, label, status: 'ok'|'warning'|
// 'error', detail}, so the panel can show a clear pass/fail per item
// rather than one opaque yes/no for the whole app.

async function safeSelect(db, table, cols = "*") {
  try {
    const { data, error } = await db.from(table).select(cols);
    if (error) return { data: null, error };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

function orphanCheck(id, label, childRows, childIdField, queryIds) {
  if (childRows === null) return { id, label, status: "error", detail: "Could not read this table -- check your connection and try again." };
  const orphans = childRows.filter(r => r[childIdField] && !queryIds.has(r[childIdField]));
  if (orphans.length === 0) return { id, label, status: "ok", detail: `All ${childRows.length} record${childRows.length === 1 ? "" : "s"} correctly linked to a real query.` };
  return { id, label, status: "warning", detail: `${orphans.length} record${orphans.length === 1 ? "" : "s"} reference a query that no longer exists.` };
}

export async function runHealthCheck(db) {
  const results = [];
  const startedAt = Date.now();

  // Same real bug/fix as the backup export: a client device's own
  // clock isn't reliable enough for "when did this actually run" --
  // uses the database's own server time instead, falling back to the
  // local clock only if that call itself fails.
  const serverNow = await db.auth.getServerTime();
  const nowIso = serverNow ? new Date(serverNow).toISOString() : new Date().toISOString();

  // 1. Basic connectivity -- if this fails, nothing else below is
  // meaningful, so it's checked and reported first.
  const { data: pingRows, error: pingError } = await safeSelect(db, "app_settings", "key");
  if (pingError || pingRows === null) {
    results.push({ id: "connectivity", label: "Database connection", status: "error", detail: "Could not reach the database at all. Check your internet connection, or this may be a genuine outage -- try again in a few minutes." });
    return { results, ranAt: nowIso, durationMs: Date.now() - startedAt };
  }
  results.push({ id: "connectivity", label: "Database connection", status: "ok", detail: "Connected and responding normally." });

  // Load queries once, reused by every orphan check below.
  const { data: queries } = await safeSelect(db, "queries", "id");
  const queryIds = new Set((queries || []).map(q => q.id));

  // 2. Orphaned records -- a row that points at a query which no
  // longer exists. Foreign keys should prevent this at the database
  // level for most of these tables, so finding any here is a genuine
  // red flag worth a human's attention, not routine noise.
  const orphanTargets = [
    ["cost_sheets", "query_id", "orphan_cost_sheets", "Cost Sheets"],
    ["quotations", "query_id", "orphan_quotations", "Quotations"],
    ["tour_execution", "query_id", "orphan_tour_execution", "Tour Info records"],
    ["payment_incoming", "query_id", "orphan_pay_in", "Incoming payment records"],
    ["payment_outgoing", "query_id", "orphan_pay_out", "Outgoing payment records"],
    ["invoices", "query_id", "orphan_invoices", "Invoices"],
    ["exchange_orders", "query_id", "orphan_eo", "Exchange Orders"],
  ];
  for (const [table, field, id, label] of orphanTargets) {
    // Only ever selects the link column itself (see orphanCheck below --
    // it never reads anything but that field). A real bug found via a
    // live health check run: this used to also request "id", which
    // doesn't exist on tour_execution at all (its own query_id IS its
    // primary key, since there's exactly one row per query) -- that
    // caused a hard SQL error there specifically, surfaced honestly as
    // "could not read this table" rather than silently passing.
    const { data } = await safeSelect(db, table, field);
    results.push(orphanCheck(id, `${label}: linked to a real query`, data, field, queryIds));
  }

  // 3. Foreign-currency payments missing their real INR amount -- a
  // genuine, actionable data-quality gap, not just a technical check:
  // these payments are silently excluded from every P&L total until
  // fixed (by design, so nothing gets counted on a guess), but that
  // means they're easy to forget about entirely.
  const { data: incomingPayments } = await safeSelect(db, "payment_incoming", "id,query_id,in_currency,amount_inr");
  if (incomingPayments === null) {
    results.push({ id: "fc_incomplete", label: "Foreign-currency payments: INR amount entered", status: "error", detail: "Could not check this." });
  } else {
    const incomplete = incomingPayments.filter(p => p.in_currency && p.in_currency !== "INR" && (p.amount_inr === null || p.amount_inr === undefined));
    results.push(incomplete.length === 0
      ? { id: "fc_incomplete", label: "Foreign-currency payments: INR amount entered", status: "ok", detail: "Every foreign-currency payment has its real INR amount recorded." }
      : { id: "fc_incomplete", label: "Foreign-currency payments: INR amount entered", status: "warning", detail: `${incomplete.length} foreign-currency payment${incomplete.length === 1 ? "" : "s"} still missing a real INR amount -- these are currently excluded from every P&L total until fixed.` });
  }

  // 4. Queries stuck in Operations long after their tour should have
  // finished -- likely just forgotten to move forward, not a data bug,
  // but a genuinely useful nudge.
  //
  // Real bug found (by Claude Code's own verification, not caught by
  // this file's own tests since their mock db accepted any column
  // name unconditionally): this originally read a travel_date column
  // that doesn't exist on queries -- the real columns are
  // travel_date_from/travel_date_to. Fixed to use travel_date_to
  // directly as the real end date, which is actually simpler than the
  // original travel_date+nights math it replaces (that shape doesn't
  // exist on this table at all).
  const { data: opsQueries } = await safeSelect(db, "queries", "id,status,travel_date_to,cancelled");
  if (opsQueries === null) {
    results.push({ id: "stale_ops", label: "Tours stuck in Operations past their end date", status: "error", detail: "Could not check this." });
  } else {
    const today = new Date();
    const stale = (opsQueries || []).filter(q => {
      if (q.status !== "operations" || q.cancelled || !q.travel_date_to) return false;
      const end = new Date(q.travel_date_to);
      const daysSinceEnd = (today - end) / 86400000;
      return daysSinceEnd > 14; // a genuine grace period, not flagging a tour that ended yesterday
    });
    results.push(stale.length === 0
      ? { id: "stale_ops", label: "Tours stuck in Operations past their end date", status: "ok", detail: "Nothing sitting in Operations well past its travel dates." }
      : { id: "stale_ops", label: "Tours stuck in Operations past their end date", status: "warning", detail: `${stale.length} tour${stale.length === 1 ? "" : "s"} ended more than two weeks ago but ${stale.length === 1 ? "is" : "are"} still marked Operations -- worth moving to Finance/Completed if they're actually done.` });
  }

  // 5. Staff/access sanity -- at least one active admin must exist, or
  // the whole team could genuinely get locked out of admin-only
  // features with no way back in.
  const { data: staffRows } = await safeSelect(db, "staff", "id,role,active,deleted_at");
  if (staffRows === null) {
    results.push({ id: "admin_exists", label: "At least one active admin account", status: "error", detail: "Could not check this." });
  } else {
    const activeAdmins = staffRows.filter(s => s.role === "admin" && s.active && !s.deleted_at);
    results.push(activeAdmins.length > 0
      ? { id: "admin_exists", label: "At least one active admin account", status: "ok", detail: `${activeAdmins.length} active admin account${activeAdmins.length === 1 ? "" : "s"}.` }
      : { id: "admin_exists", label: "At least one active admin account", status: "error", detail: "No active admin account exists -- this is a genuine lockout risk. Reactivate or promote someone to admin as soon as possible." });
  }

  // 6. Orphaned chat conversations -- a conversation with no members
  // left in it at all (everyone left, or a bug), invisible to anyone
  // but genuinely just dead data worth knowing about.
  const { data: convRows } = await safeSelect(db, "chat_conversations", "id,type");
  const { data: memberRows } = await safeSelect(db, "chat_conversation_members", "conversation_id");
  if (convRows === null || memberRows === null) {
    results.push({ id: "orphan_chats", label: "Chat conversations with real members", status: "error", detail: "Could not check this." });
  } else {
    const memberConvIds = new Set(memberRows.map(m => m.conversation_id));
    const empty = convRows.filter(c => !memberConvIds.has(c.id));
    results.push(empty.length === 0
      ? { id: "orphan_chats", label: "Chat conversations with real members", status: "ok", detail: "No empty/orphaned conversations found." }
      : { id: "orphan_chats", label: "Chat conversations with real members", status: "warning", detail: `${empty.length} conversation${empty.length === 1 ? "" : "s"} with no members left in them at all.` });
  }

  // 7. When was this last actually backed up -- surfaced here too,
  // not just on the Backup tab, since "have I backed up recently" is
  // itself a real health signal worth a glance during a routine check.
  const lastBackup = await getLastBackupInfo(db);
  if (!lastBackup) {
    results.push({ id: "backup_recency", label: "Recent backup exists", status: "warning", detail: "No backup has ever been exported from this app. Consider running one from the Backup tab." });
  } else {
    const daysSince = (Date.now() - new Date(lastBackup.at).getTime()) / 86400000;
    results.push(daysSince <= 7
      ? { id: "backup_recency", label: "Recent backup exists", status: "ok", detail: `Last backed up ${daysSince < 1 ? "today" : `${Math.floor(daysSince)} day${Math.floor(daysSince) === 1 ? "" : "s"} ago`}, by ${lastBackup.by}.` }
      : { id: "backup_recency", label: "Recent backup exists", status: "warning", detail: `Last backup was ${Math.floor(daysSince)} days ago (by ${lastBackup.by}) -- worth running a fresh one from the Backup tab.` });
  }

  return { results, ranAt: nowIso, durationMs: Date.now() - startedAt };
}
