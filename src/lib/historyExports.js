// Service history, query history and financial / expense ledgers for vendors,
// agents and fleet vehicles, as one "spec" per table that feeds BOTH the Excel
// download (simpleXlsx.js) and the PDF, so the two can never disagree.
//
//   spec: { title, sheetName, info: [lines], columns: [{header,key,width,type}], rows, totals }
import { buildSimpleWorkbook } from "./simpleXlsx.js";

const n = (v) => parseFloat(v) || 0;
const stamp = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function periodText(f) {
  if (!f || f.preset === "all" || !f.preset) return "All time";
  if (f.preset === "custom") {
    const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "…");
    return `${fmt(f.from)} to ${fmt(f.to)}`;
  }
  return { "3m": "Last 3 months", "6m": "Last 6 months", "1y": "Last 12 months" }[f.preset] || "All time";
}
const head = (kind, name, period) => [`${kind}: ${name}`, `Period: ${period}  ·  generated ${stamp()}`];

const PAY_LABEL = { voucher: "Voucher (payable)", cash: "Cash paid", settle: "Settlement" };

// ── Vendors ───────────────────────────────────────────────────────────────
export function vendorServiceSpec(vendor, assignments, period) {
  return {
    title: "Service History", sheetName: "Service History",
    info: head(`Vendor`, vendor.name || "", periodText(period)),
    columns: [
      { header: "Tour File", key: "tourFileId", width: 15 }, { header: "Group", key: "groupName", width: 28 }, { header: "Sector", key: "sector", width: 26 },
      { header: "Travel Date", key: "travelDate", width: 12, type: "date" }, { header: "Role", key: "role", width: 18 }, { header: "Status", key: "status", width: 12 },
      { header: "Exchange Orders", key: "eos", width: 20 }, { header: "Notes", key: "notes", width: 32 },
    ],
    rows: (assignments || []).map((a) => ({ tourFileId: a.tourFileId, groupName: a.groupName, sector: a.sector, travelDate: a.travelDate, role: a.role, status: a.cancelled ? "Cancelled" : "Active", eos: (a.eoNos || []).join(", "), notes: a.notes })),
  };
}
export function vendorLedgerSpec(vendor, entries, period) {
  const rows = (entries || []).map((e) => ({
    date: e.date, tourFileId: e.tourFileId, client: e.clientName, sector: e.sector, type: PAY_LABEL[e.paymentType || "cash"] || e.paymentType || "",
    mode: e.mode, ref: e.ref, status: e.paymentType === "voucher" ? (e.settled ? "Settled" : "Payable") : "Paid", amount: n(e.amount),
  }));
  const committed = (entries || []).filter((e) => ["voucher", "cash"].includes(e.paymentType || "cash")).reduce((s, e) => s + n(e.amount), 0);
  const paid = (entries || []).filter((e) => e.paymentType === "cash" || e.paymentType === "settle").reduce((s, e) => s + n(e.amount), 0);
  const payable = (entries || []).filter((e) => e.paymentType === "voucher" && !e.settled).reduce((s, e) => s + n(e.amount), 0);
  return {
    title: "Financial Ledger", sheetName: "Financial Ledger",
    info: [...head("Vendor", vendor.name || "", periodText(period)), `Total committed ₹${Math.round(committed).toLocaleString("en-IN")}  ·  Total paid ₹${Math.round(paid).toLocaleString("en-IN")}  ·  Outstanding ₹${Math.round(payable).toLocaleString("en-IN")}`],
    columns: [
      { header: "Date", key: "date", width: 12, type: "date" }, { header: "Tour File", key: "tourFileId", width: 15 }, { header: "Client", key: "client", width: 26 }, { header: "Sector", key: "sector", width: 22 },
      { header: "Type", key: "type", width: 18 }, { header: "Mode", key: "mode", width: 12 }, { header: "Reference", key: "ref", width: 18 }, { header: "Status", key: "status", width: 11 }, { header: "Amount (₹)", key: "amount", width: 14, type: "money" },
    ],
    rows, totals: { label: "Total", keys: ["amount"] }, summary: { committed, paid, payable },
  };
}

// ── Agents ────────────────────────────────────────────────────────────────
export function agentHistorySpec(agent, queries, payments, entryINR, period) {
  const rows = (queries || []).map((q) => {
    const pt = payments && payments[q.id];
    const tv = n(pt && pt.tourValue) * (n(pt && pt.roeUsed) || 1);
    const rc = ((pt && pt.entries) || []).reduce((s, e) => s + entryINR(e), 0);
    return { queryId: q.id, tourFileId: q.tourFileId, group: q.groupName || q.clientName, sector: q.destination || q.sector, travelDate: q.travelDate, status: q.cancelled ? "Cancelled" : q.status, tourValue: tv, received: rc, balance: tv - rc };
  });
  return {
    title: "Query History", sheetName: "Query History",
    info: head("Agent", agent.company || agent.name || "", periodText(period)),
    columns: [
      { header: "Query ID", key: "queryId", width: 15 }, { header: "Tour File", key: "tourFileId", width: 15 }, { header: "Group", key: "group", width: 28 }, { header: "Sector", key: "sector", width: 24 },
      { header: "Travel Date", key: "travelDate", width: 12, type: "date" }, { header: "Status", key: "status", width: 13 },
      { header: "Tour Value (₹)", key: "tourValue", width: 15, type: "money" }, { header: "Received (₹)", key: "received", width: 15, type: "money" }, { header: "Balance (₹)", key: "balance", width: 15, type: "money" },
    ],
    rows, totals: { label: "Total", keys: ["tourValue", "received", "balance"] },
  };
}
// One row per tour file (value / received / balance) plus a second table of every receipt.
export function agentLedgerSpecs(agent, ledger, period) {
  const tours = (ledger || []).map((r) => ({ tourFileId: r.tourFileId || r.queryId, group: r.group, sector: r.sector, travelDate: r.travelDate === "—" ? "" : r.travelDate, status: r.cancelled ? "Cancelled" : r.status, tourValue: r.tourVal, received: r.received, balance: r.balance }));
  const receipts = [];
  (ledger || []).forEach((r) => (r.entries || []).forEach((e) => receipts.push({ date: e.date, tourFileId: r.tourFileId || r.queryId, group: r.group, receipt: e.receipt, mode: e.mode, amount: n(e.amount), currency: e.currency || "" })));
  receipts.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const tv = tours.reduce((s, r) => s + n(r.tourValue), 0), rc = tours.reduce((s, r) => s + n(r.received), 0);
  return [
    {
      title: "Financial Ledger", sheetName: "Financial Ledger",
      info: [...head("Agent", agent.company || agent.name || "", periodText(period)), `Total tour value ₹${Math.round(tv).toLocaleString("en-IN")}  ·  Received ₹${Math.round(rc).toLocaleString("en-IN")}  ·  Balance due ₹${Math.round(tv - rc).toLocaleString("en-IN")}`],
      columns: [
        { header: "Tour File", key: "tourFileId", width: 15 }, { header: "Group", key: "group", width: 28 }, { header: "Sector", key: "sector", width: 24 }, { header: "Travel Date", key: "travelDate", width: 12, type: "date" }, { header: "Status", key: "status", width: 13 },
        { header: "Tour Value (₹)", key: "tourValue", width: 15, type: "money" }, { header: "Received (₹)", key: "received", width: 15, type: "money" }, { header: "Balance (₹)", key: "balance", width: 15, type: "money" },
      ],
      rows: tours, totals: { label: "Total", keys: ["tourValue", "received", "balance"] },
    },
    {
      title: "Receipts", sheetName: "Receipts", info: head("Agent", agent.company || agent.name || "", periodText(period)),
      columns: [
        { header: "Date", key: "date", width: 12, type: "date" }, { header: "Tour File", key: "tourFileId", width: 15 }, { header: "Group", key: "group", width: 28 }, { header: "Receipt No.", key: "receipt", width: 16 },
        { header: "Mode", key: "mode", width: 12 }, { header: "Amount", key: "amount", width: 14, type: "money" },
      ],
      rows: receipts, totals: { label: "Total", keys: ["amount"] },
    },
  ];
}

// ── Fleet ─────────────────────────────────────────────────────────────────
export function fleetServiceSpec(vehicle, rows) {
  return {
    title: "Service History", sheetName: "Service History",
    info: [`Vehicle: ${vehicle.name || ""}${vehicle.regNo ? "  ·  " + vehicle.regNo : ""}`, `Generated ${stamp()}`],
    columns: [
      { header: "Tour File No.", key: "tourFileNo", width: 16 }, { header: "Start Date", key: "startDate", width: 12, type: "date" }, { header: "End Date", key: "endDate", width: 12, type: "date" },
      { header: "Sector", key: "sector", width: 28 }, { header: "Notes", key: "notes", width: 40 },
    ],
    rows: (rows || []).map((r) => ({ tourFileNo: r.tourFileNo, startDate: r.startDate, endDate: r.endDate, sector: r.sector, notes: r.notes })),
  };
}
export function fleetExpenseSpec(vehicle, rows, from, to) {
  const range = from || to ? `${from ? new Date(from).toLocaleDateString("en-IN") : "…"} to ${to ? new Date(to).toLocaleDateString("en-IN") : "…"}` : "All time";
  return {
    title: "Expense Ledger", sheetName: "Expense Ledger",
    info: [`Vehicle: ${vehicle.name || ""}${vehicle.regNo ? "  ·  " + vehicle.regNo : ""}`, `Period: ${range}  ·  generated ${stamp()}`],
    columns: [
      { header: "Date", key: "date", width: 12, type: "date" }, { header: "Particulars", key: "particulars", width: 36 }, { header: "Amount (₹)", key: "amount", width: 14, type: "money" }, { header: "Notes", key: "notes", width: 36 },
    ],
    rows: (rows || []).map((r) => ({ date: r.date, particulars: r.particulars, amount: n(r.amount), notes: r.notes })),
    totals: { label: "Total", keys: ["amount"] },
  };
}

// ── Output: PDF (printable HTML) and Excel ──────────────────────────────────
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtCell = (c, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (c.type === "money") return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c.type === "date") { const d = new Date(v); return isNaN(d) ? esc(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  return esc(v);
};
export function specsToBodyBlocks(specs) {
  return (Array.isArray(specs) ? specs : [specs]).map((sp, i) => {
    const right = (c) => c.type === "money" || c.type === "number";
    const body = sp.rows.length
      ? sp.rows.map((r) => `<tr>${sp.columns.map((c) => `<td style="${right(c) ? "text-align:right;white-space:nowrap" : ""}">${fmtCell(c, r[c.key])}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${sp.columns.length}" style="text-align:center;color:#999;padding:12pt">Nothing to show for this selection</td></tr>`;
    const tot = sp.totals && sp.rows.length
      ? `<tr style="font-weight:700;background:#f3f4f6">${sp.columns.map((c, ci) => ci === 0 ? `<td>${esc(sp.totals.label || "Total")}</td>` : sp.totals.keys.includes(c.key) ? `<td style="text-align:right;white-space:nowrap">${fmtCell(c, sp.rows.reduce((s, r) => s + n(r[c.key]), 0))}</td>` : "<td></td>").join("")}</tr>`
      : "";
    return `${i ? '<div style="margin-top:14pt"></div>' : ""}
      <div class="inv-title" style="margin-bottom:4pt">${esc(sp.title)}</div>
      ${(sp.info || []).map((l) => `<div style="font-size:9pt;color:#555;margin-bottom:2pt">${esc(l)}</div>`).join("")}
      <table class="content-table" style="margin-top:6pt"><thead><tr>${sp.columns.map((c) => `<th style="text-align:${right(c) ? "right" : "left"}">${esc(c.header)}</th>`).join("")}</tr></thead><tbody>${body}${tot}</tbody></table>`;
  });
}
export function buildHistoryPdfHTML(buildLetterheadDocument, specs, docTitle) {
  return buildLetterheadDocument({ title: docTitle, bodyBlocks: specsToBodyBlocks(specs), orientation: "landscape", showPageNum: true });
}
export async function buildHistoryWorkbook(specs) {
  const ExcelJS = (await import("exceljs")).default;
  return buildSimpleWorkbook(ExcelJS, specs);
}
export const historyFilename = (kind, name, what) => `${what} - ${String(name || kind).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()}`;
