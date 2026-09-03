import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const {
  COMPANY_INFO, G, STAMP_B64, ExportMenu, VersionDropdown, DocTabBar, DocPreviewFrame,
  LetterheadToggleBar, useLetterheadToggles, buildAddresseeBlock, RichTextEditor,
  buildPaginatedLetterheadDocument, buildDocxBlobFromBodyBlocks, downloadDocx,
  DEFAULT_PROFORMA_TEMPLATE, DEFAULT_TAXINVOICE_TEMPLATE, nextInvoiceNo, nextDocNumber, numToWords, formatDateDMY, formatDateSlash, isIsoDateString,
  loadInvoiceVersions, saveInvoiceVersion, markInvoiceVersionFinal, loadExistingInvoiceNumbers,
  logAudit, db,
} = Lib;

const CUSTOM_PARTY = "__custom__";
const inp = { padding: "6px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
const label = (t) => <div style={{ fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{t}</div>;
const secHead = (t) => <div style={{ background: G.navy, color: "#fff", padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", margin: "14px 0 8px" }}>{t}</div>;

export default function InvoiceGenerator({ query, payments, proformaTemplate, taxinvoiceTemplate, docSettings, onSaveDocSettings, agents, onClose, currentUser, readOnly, initialFlavor, signatures }) {
  const pTmpl = { ...DEFAULT_PROFORMA_TEMPLATE, ...(proformaTemplate || {}) };
  const tTmpl = { ...DEFAULT_TAXINVOICE_TEMPLATE, ...(taxinvoiceTemplate || {}) };
  const pt = payments ? payments[query.id] : null;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const agentList = agents || [];

  const [docFlavor, setDocFlavor] = useState(initialFlavor || "proforma"); // 'proforma' | 'tax'

  // ─── Shared Bill To / Tour Details (2026-08-22) -- edited once, embedded
  // into whichever flavor's version gets saved, same self-contained-
  // snapshot convention every other document here follows. Switching
  // flavors (or picking an older version) reloads these from that
  // version's own saved content, matching Itinerary's Brief/Detailed. ────
  const travelDateRange = () => {
    // query.travelDateFrom does not exist on a real loaded query object --
    // the arrival date is stored under the plain `travelDate` key (see
    // utils.js's row mapping), with travelDateFrom only ever existing on
    // the transient query-creation form. Checking the wrong key meant
    // `from` was always empty, so this never actually produced a range.
    const fromRaw = query.travelDate;
    const toRaw = query.travelDateTo;
    const fromIsDate = isIsoDateString(fromRaw);
    const toIsDate = isIsoDateString(toRaw);
    if (fromIsDate && toIsDate) return `${formatDateSlash(fromRaw)} to ${formatDateSlash(toRaw)}`;
    if (fromIsDate) return formatDateSlash(fromRaw);
    return fromRaw || "TBC";
  };

  // ─── Addressee vs Billed To (2026-08-22) -- kept as two separate blocks
  // per direct instruction: Addressee is the "Attn:" salutation at the
  // top of the letter (a person, at a company); Billed To is the actual
  // paying entity and doesn't need a contact name at all. Picking an
  // agent for Addressee cascades into Billed To once, at selection time
  // -- both stay independently editable afterward, which is the whole
  // point of keeping them separate rather than one shared block. ────────
  const emptyShared = () => ({
    addresseePartyId: "",
    addresseeName: "",
    addresseeCompany: query.agentCompany || "",
    addresseeCityCountry: query.agentCountry || "",
    billToCompany: query.agentCompany || "",
    billToAddress: "",
    billToCityCountry: query.agentCountry || "",
    billToGSTIN: "",
    tourName: query.groupName || query.clientName || "",
    tourRef: query.tourFileId || query.id,
    travelDate: travelDateRange(),
    sector: query.destination || "",
    pax: query.paxDisplay || "",
  });

  const emptyProforma = () => ({
    invoiceNo: "",
    date: today,
    validUntil: "",
    subject: `GROUP FROM ${query.travelDate || ""} x ${query.paxDisplay || "??"}`,
    openingLine: pTmpl.asDesiredLine,
    currency: "USD",
    items: [{ desc: "Tour Package", qty: 1, unit: "Package", rate: 0, amount: 0 }],
    roeNote: "",
    advanceEnabled: false,
    advanceAmount: 0,
    advanceIsManual: false,
    advanceFetchedAt: null,
    advanceOtherCurrencyCount: 0,
    notes: pTmpl.notes,
    signOff: pTmpl.signOff,
  });

  const emptyTax = () => {
    const tourValueINR = pt ? (parseFloat(pt.tourValue) || 0) * (parseFloat(pt.roeUsed) || 1) : 0;
    const gstBase = Math.round(tourValueINR / 1.05);
    return {
      invoiceNo: "",
      date: today,
      placeOfSupply: tTmpl.placeOfSupply,
      items: [{ desc: `Tour Package — ${query.destination || ""} (${query.nights || "??"} Days)`, hsn: "998552", qty: query.paxDisplay || 1, rate: Math.round(gstBase), amount: Math.round(gstBase) }],
      igst: true,
      gstRate: 5,
      notes: "",
    };
  };

  const [shared, setShared] = useState(emptyShared());
  const setS = (k, v) => setShared(p => ({ ...p, [k]: v }));
  const [pInv, setPInv] = useState(emptyProforma());
  const setP = (k, v) => setPInv(p => ({ ...p, [k]: v }));
  const [tInv, setTInv] = useState(emptyTax());
  const setT = (k, v) => setTInv(p => ({ ...p, [k]: v }));

  const setAddresseeParty = (partyId) => {
    if (partyId === CUSTOM_PARTY) { setS("addresseePartyId", CUSTOM_PARTY); return; }
    const a = agentList.find(x => x.id === partyId);
    if (!a) { setS("addresseePartyId", partyId); return; }
    const cityCountry = [a.city, a.country].filter(Boolean).join(", ");
    setShared(p => ({
      ...p, addresseePartyId: partyId,
      addresseeName: a.contactName || "",
      addresseeCompany: a.company,
      addresseeCityCountry: cityCountry,
      // One-time cascade into Billed To at the moment of selection --
      // both stay independently editable afterward, that's the point of
      // keeping them as two separate blocks rather than one shared one.
      billToCompany: a.company,
      billToAddress: a.address || "",
      billToCityCountry: cityCountry,
      billToGSTIN: a.gstin || "",
    }));
  };

  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerFooterAllPages, printOnLetterhead } = toggles;
  const [activeTab, setActiveTab] = useState("content");

  // ─── Version history, per flavor ────────────────────────────────────
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadVersionIntoDraft = (v) => {
    const c = v.content || {};
    setShared(p => ({ ...emptyShared(), ...(c.shared || {}) }));
    if (docFlavor === "proforma") setPInv(p => ({ ...emptyProforma(), ...c, invoiceNo: v.invoiceNo || c.invoiceNo }));
    else setTInv(p => ({ ...emptyTax(), ...c, invoiceNo: v.invoiceNo || c.invoiceNo }));
    setViewingVersion(v.version);
  };

  const refreshVersions = (flavor) => {
    Promise.all([
      loadInvoiceVersions(db, query.id, flavor),
      loadExistingInvoiceNumbers(db, "invoices"),
    ]).then(([loaded, existingNumbers]) => {
      setVersions(loaded);
      if (loaded.length > 0) {
        setVersion(Math.max(...loaded.map(v => v.version)) + 1);
        const finalV = loaded.find(v => v.isFinal);
        setFinalVersion(finalV ? finalV.version : null);
        loadVersionIntoDraft(finalV || loaded[loaded.length - 1]);
      } else {
        setVersion(1);
        setFinalVersion(null);
        setViewingVersion(null);
        const setF = flavor === "proforma" ? setP : setT;
        const { number, updatedSettings } = nextDocNumber(docSettings, flavor === "proforma" ? "proforma" : "taxinvoice", {
          group: query.groupName || query.clientName, sector: query.destination || query.sector,
          id: query.id, tourfile: query.tourFileId,
        });
        setF("invoiceNo", number);
        onSaveDocSettings && onSaveDocSettings(updatedSettings);
      }
    });
  };

  useEffect(() => { refreshVersions(docFlavor); }, [query.id, docFlavor]);

  const saveVersion = () => {
    const inv = docFlavor === "proforma" ? pInv : tInv;
    if (!inv.invoiceNo) {
      alert("Still preparing a safe invoice number, please wait a moment and try again.");
      return;
    }
    setSaving(true);
    const { invoiceNo, ...rest } = inv;
    const content = { ...rest, shared };
    const snap = { version, invoiceNo, content };
    saveInvoiceVersion(db, query.id, docFlavor, snap, currentUser?.id).then(({ error }) => {
      setSaving(false);
      if (error) { alert(`Failed to save: ${error}`); return; }
      logAudit(db, query.id, currentUser?.name, `${docFlavor === "proforma" ? "Proforma Invoice" : "Tax Invoice"} v${version} saved (${invoiceNo})`);
      refreshVersions(docFlavor);
    });
  };

  const onMarkFinal = (v) => {
    if (readOnly) return;
    markInvoiceVersionFinal(db, query.id, docFlavor, v.version);
    logAudit(db, query.id, currentUser?.name, `${docFlavor === "proforma" ? "Proforma Invoice" : "Tax Invoice"} v${v.version} marked final`);
    setFinalVersion(v.version);
  };

  // ─── Advance / Adjusted Payment (Proforma only), Phase B ──────────────
  // Automatic by direct instruction: "only incoming payments which have a
  // receipt get fetched" -- every incoming entry in the Payments feature
  // gets a real receipt number stamped on it the moment it's logged
  // (EnhancedPaymentTracker.jsx), so `!!e.receipt` is the literal, correct
  // encoding of that rule -- it happens to be true for every entry today
  // (receipt issuance isn't currently conditional), but this is still the
  // right filter to write: it's checking the actual field that means
  // "has a receipt," not just assuming the current always-true behavior.
  // Manual editing stays available underneath for the lump-sum-advance-on-
  // series-bookings case, per direct instruction -- fetching sets a
  // value, it doesn't lock the field.
  const fetchAdvanceFromPayments = () => {
    const entries = (pt && pt.entries) || [];
    const receipted = entries.filter(e => !!e.receipt);
    const sameCurrency = receipted.filter(e => (e.inCurrency || "INR") === pInv.currency);
    const otherCurrency = receipted.filter(e => (e.inCurrency || "INR") !== pInv.currency);
    const total = sameCurrency.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    setPInv(p => ({
      ...p, advanceAmount: total, advanceIsManual: false,
      advanceFetchedAt: new Date().toLocaleString("en-IN"),
      advanceOtherCurrencyCount: otherCurrency.length,
    }));
  };

  const toggleAdvance = (checked) => {
    setP("advanceEnabled", checked);
    // Only auto-fetch on turning the section on, and only if the amount
    // hasn't already been hand-typed -- reopening a saved version with a
    // genuine manual figure should show that figure, not silently
    // overwrite it with a live re-fetch.
    if (checked && !pInv.advanceIsManual) fetchAdvanceFromPayments();
  };

  const subTotal = pInv.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const advance = pInv.advanceEnabled ? (parseFloat(pInv.advanceAmount) || 0) : 0;
  const grandTotal = subTotal;
  const totalDue = subTotal - advance;

  const tSubtotal = tInv.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const tGstCalc = Math.round(tSubtotal * tInv.gstRate / 100);
  const tGrandTotal = tSubtotal + tGstCalc;

  // Amount is always qty x rate -- computed, never typed directly, so it
  // can't drift from the two numbers it's supposed to represent.
  const updateItem = (setInvFn, i, f, v) => setInvFn(p => ({
    ...p, items: p.items.map((x, idx) => {
      if (idx !== i) return x;
      const next = { ...x, [f]: v };
      if (f === "qty" || f === "rate") next.amount = (parseFloat(next.qty) || 0) * (parseFloat(next.rate) || 0);
      return next;
    }),
  }));
  const addItem = (setInvFn, blank) => setInvFn(p => ({ ...p, items: [...p.items, blank] }));
  const removeItem = (setInvFn, i) => setInvFn(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  // ─── Print: Proforma ──────────────────────────────────────────────────
  const buildProformaHTML = (asBlocks) => {
    const words = numToWords(grandTotal);
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Digital Stamp"/>` : '';
    const rows = pInv.items.map(it => `
      <tr><td>${it.desc}</td><td style="text-align:center">${it.qty}</td>
      <td style="text-align:center">${it.unit}</td>
      <td class="amount">${pInv.currency} ${parseFloat(it.rate || 0).toLocaleString()}</td>
      <td class="amount">${pInv.currency} ${parseFloat(it.amount || 0).toLocaleString()}</td></tr>`);

    const addresseeBlock = `
        <div style="display:table;width:100%;margin-bottom:10pt">
          <div style="display:table-cell;vertical-align:top">
            ${buildAddresseeBlock({ name: shared.addresseeName, company: shared.addresseeCompany, city: shared.addresseeCityCountry, fontSizePt: 10.5 })}
          </div>
          <div style="display:table-cell;vertical-align:top;text-align:right;white-space:nowrap">
            <div style="font-size:10.5pt">DATE: <strong>${pInv.date}</strong></div>
          </div>
        </div>
        ${pInv.subject ? `<div style="font-size:10.5pt;font-weight:bold;text-decoration:underline;margin-bottom:6pt">RE: ${pInv.subject}</div>` : ''}
        <div style="font-size:10.5pt;font-weight:bold;margin-bottom:12pt">${pInv.openingLine}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:7pt;font-size:9pt">
          <div>
            <div><strong>Invoice No:</strong> <span style="color:#8B1A1A;font-weight:700">${pInv.invoiceNo}</span></div>
            <div><strong>Tour Name:</strong> ${shared.tourName}</div>
            <div><strong>Tour Ref:</strong> ${shared.tourRef}</div>
            ${pInv.validUntil ? `<div><strong>Valid Until:</strong> ${pInv.validUntil}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div><strong>Travel Date:</strong> ${shared.travelDate}</div>
            <div><strong>Sector:</strong> ${shared.sector}</div>
            <div><strong>No. of Pax:</strong> ${shared.pax || 'TBC'}</div>
          </div>
        </div>`;

    const partiesBlock = `
        <div class="parties">
          <div class="party-block">
            <div class="party-label">Billed To</div>
            <div class="party-name">${shared.billToCompany}</div>
            ${shared.billToAddress ? `<div class="party-detail">${shared.billToAddress}</div>` : ''}
            ${shared.billToCityCountry ? `<div class="party-detail">${shared.billToCityCountry}</div>` : ''}
            ${shared.billToGSTIN ? `<div class="party-detail">GSTIN: ${shared.billToGSTIN}</div>` : ''}
          </div>
          <div class="party-block">
            <div class="party-label">Billed By</div>
            <div class="party-name">Unitop Tours &amp; Travel Pvt. Ltd.</div>
            <div class="party-detail">506, DDA-2F, District Centre, Janakpuri<br/>New Delhi – 110058, India</div>
            <div class="party-detail">GSTIN: 07AAACU4406H1ZK &nbsp;|&nbsp; PAN: AAACU4406H</div>
          </div>
        </div>`;

    const itemsBlock = {
      type: "table",
      headerHTML: `<tr>
        <th style="width:45%">Description</th><th style="width:8%;text-align:center">Qty</th>
        <th style="width:12%;text-align:center">Unit</th><th style="width:15%;text-align:right">Rate</th>
        <th style="width:20%;text-align:right">Amount</th>
      </tr>`,
      rowsHTML: rows,
    };

    const totalsBlock = `
        <div class="totals-block">
          <div class="total-row"><span class="lbl">Sub Total</span><span>${pInv.currency} ${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          ${pInv.roeNote ? `<div class="total-row" style="font-size:8.5pt;color:#888"><span>ROE Note</span><span>${pInv.roeNote}</span></div>` : ''}
          <div class="total-row grand"><span class="lbl">Total</span><span>${pInv.currency} ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          ${pInv.advanceEnabled ? `
          <div class="total-row"><span class="lbl">Advance / Adjusted Payment</span><span>- ${pInv.currency} ${advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          <div class="total-row grand"><span class="lbl">Total Due</span><span>${pInv.currency} ${totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
          ` : ''}
        </div>
        <div style="font-size:10pt;font-style:italic;font-weight:600;margin-bottom:12pt">
          IN WORDS: ${pInv.currency} ${numToWords(pInv.advanceEnabled ? totalDue : grandTotal).toUpperCase()}
        </div>`;

    const bankBlock = `
        <div class="bank-box">
          <div class="bank-title">Bank Details as Under:</div>
          <div class="bank-row"><span class="bank-key">Account Name</span><span class="bank-val">${pTmpl.bankAccountName}</span></div>
          <div class="bank-row"><span class="bank-key">Bank Name</span><span class="bank-val">${pTmpl.bankName}</span></div>
          <div class="bank-row"><span class="bank-key">Current A/C No.</span><span class="bank-val">${pTmpl.bankAccountNo}</span></div>
          <div class="bank-row"><span class="bank-key">Swift Code</span><span class="bank-val">${pTmpl.bankSwift}</span></div>
          <div class="bank-row"><span class="bank-key">Address</span><span class="bank-val">${pTmpl.bankAddress}</span></div>
        </div>
        ${pInv.notes ? `<div class="notes-box">${pInv.notes.replace(/\n/g, '<br/>')}</div>` : ''}`;

    const closingBlock = `
        <div style="margin-top:14pt;">
          ${stampHTML}
          ${showStamp ? '' : '<div style="height:44pt;"></div>'}
          <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
          <div style="font-size:10pt;font-weight:700;color:#1A3A52;">${pInv.signOff.replace(/\n/g, '<br/>')}</div>
          <div style="font-size:9pt;color:#888;">(Authorised Signatory)</div>
        </div>`;

    const docArgs = {
      title: `Proforma Invoice ${pInv.invoiceNo}`,
      bodyBlocks: [addresseeBlock, partiesBlock, itemsBlock, totalsBlock, bankBlock, closingBlock],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    };
    if (asBlocks) return docArgs;
    return buildPaginatedLetterheadDocument(docArgs);
  };

  // ─── Print: Tax Invoice ───────────────────────────────────────────────
  const buildTaxHTML = (asBlocks) => {
    const itemRows = tInv.items.map(it => `<tr><td>${it.desc}</td><td style="text-align:center">${it.hsn}</td><td style="text-align:center">${it.qty}</td><td class="amount">₹ ${parseFloat(it.rate).toLocaleString()}</td><td class="amount">₹ ${parseFloat(it.amount).toLocaleString()}</td></tr>`);
    const gstRow = tInv.igst
      ? `<tr><td colspan="4" style="text-align:right">IGST @ ${tInv.gstRate}%</td><td class="amount">₹ ${tGstCalc.toLocaleString()}</td></tr>`
      : `<tr><td colspan="4" style="text-align:right">CGST @ ${tInv.gstRate / 2}%</td><td class="amount">₹ ${Math.round(tGstCalc / 2).toLocaleString()}</td></tr>
         <tr><td colspan="4" style="text-align:right">SGST @ ${tInv.gstRate / 2}%</td><td class="amount">₹ ${Math.round(tGstCalc / 2).toLocaleString()}</td></tr>`;
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Stamp"/>` : '';

    const metaBlock = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10pt">
          <div>
            <div style="font-size:10.5pt;font-weight:bold">TAX INVOICE</div>
            <div style="font-size:10pt"><b>Invoice No:</b> <span style="color:#8B1A1A;font-weight:700">${tInv.invoiceNo}</span></div>
          </div>
          <div style="text-align:right;font-size:10pt">
            <div><b>Date:</b> ${tInv.date}</div>
            <div><b>Place of Supply:</b> ${tInv.placeOfSupply}</div>
          </div>
        </div>
        <div class="bank-box" style="background:#EBF5FB;border-color:#BEE3F8;">
          <strong>Supplier GSTIN:</strong> ${COMPANY_INFO.gstin} &nbsp;|&nbsp;
          <strong>PAN:</strong> ${COMPANY_INFO.pan} &nbsp;|&nbsp;
          <strong>State:</strong> ${COMPANY_INFO.state}
        </div>`;

    const partiesBlock = `
        <div class="parties">
          <div class="party-block">
            <div class="party-label">Billed To</div>
            <div class="party-name">${shared.billToCompany}</div>
            ${shared.billToAddress ? `<div class="party-detail">${shared.billToAddress}</div>` : ''}
            ${shared.billToCityCountry ? `<div class="party-detail">${shared.billToCityCountry}</div>` : ''}
            <div class="party-detail">GSTIN: ${shared.billToGSTIN || 'N/A (Foreign Agent)'}</div>
          </div>
          <div class="party-block">
            <div class="party-label">Tour Details</div>
            <div class="party-name">${shared.tourName}</div>
            <div class="party-detail">Travel: ${shared.travelDate}</div>
            <div class="party-detail">Sector: ${shared.sector}</div>
            <div class="party-detail">Pax: ${shared.pax}</div>
            <div class="party-detail">Ref: ${shared.tourRef}</div>
          </div>
        </div>`;

    const itemsBlock = {
      type: "table",
      headerHTML: `<tr><th style="width:40%">Description of Service</th><th style="text-align:center">HSN/SAC</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr>`,
      rowsHTML: itemRows,
    };
    const totalsBlock = `
        <table class="content-table" style="margin-top:-1pt">
          <colgroup><col style="width:40%"/><col/><col/><col/><col/></colgroup>
          <tbody>
          <tr><td colspan="4" style="text-align:right;color:#555">Taxable Value</td><td class="amount">₹ ${tSubtotal.toLocaleString()}</td></tr>
          ${gstRow}
          <tr style="background:#1A3A52"><td colspan="4" style="text-align:right;color:#fff;font-weight:700;font-size:10.5pt;padding:8pt">GRAND TOTAL</td><td style="text-align:right;color:#fff;font-weight:700;font-size:10.5pt;padding:8pt">₹ ${tGrandTotal.toLocaleString()}</td></tr>
          </tbody>
        </table>
        <div style="font-size:10pt;font-style:italic;font-weight:600;margin-bottom:12pt">
          IN WORDS: ${numToWords(tGrandTotal).toUpperCase()}
        </div>
        ${tInv.notes ? `<div class="notes-box">${tInv.notes}</div>` : ''}`;

    // "Prepared by" removed and the "computer generated" note moved to
    // come after Authorised Signatory (spec 2.3/2.4), directly above the
    // page footer rather than above the signatory block.
    const closingBlock = `
        <div style="display:flex;justify-content:flex-end;margin-top:14pt;">
          <div style="text-align:center;font-size:9pt;color:#555">
            ${stampHTML}
            ${showStamp ? '' : '<div style="height:44pt;"></div>'}
            <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
            Authorised Signatory
          </div>
        </div>
        <div style="font-size:8.5pt;color:#999;text-align:center;margin-top:14pt">${tTmpl.footerNote}<br/>${COMPANY_INFO.name} | ${COMPANY_INFO.gstin}</div>`;

    const docArgs = {
      title: `Tax Invoice ${tInv.invoiceNo}`,
      bodyBlocks: [metaBlock, partiesBlock, itemsBlock, totalsBlock, closingBlock],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    };
    if (asBlocks) return docArgs;
    return buildPaginatedLetterheadDocument(docArgs);
  };

  const buildPrintHTML = (asBlocks) => docFlavor === "proforma" ? buildProformaHTML(asBlocks) : buildTaxHTML(asBlocks);

  const exportDocx = async () => {
    const args = await buildPrintHTML(true);
    const blob = await buildDocxBlobFromBodyBlocks({
      bodyBlocks: args.bodyBlocks,
      toggles: { headerFooterAllPages: args.headerFooterAllPages, printOnLetterhead: args.printOnLetterhead, showPageNum: args.showPageNum },
      orientation: args.orientation,
    });
    const inv = docFlavor === "proforma" ? pInv : tInv;
    await downloadDocx(blob, `${docFlavor === "proforma" ? "Proforma Invoice" : "Tax Invoice"} - ${inv.invoiceNo}`);
  };

  const handlePrint = async () => {
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups for this site to print/export PDF.'); return; }
    win.document.write(await buildPrintHTML());
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const [previewHTML, setPreviewHTML] = useState("");
  useEffect(() => {
    if (activeTab !== "preview") return;
    let cancelled = false;
    Promise.resolve(buildPrintHTML()).then(html => { if (!cancelled) setPreviewHTML(html); });
    return () => { cancelled = true; };
  }, [activeTab, docFlavor, shared, pInv, tInv, showStamp, headerFooterAllPages, printOnLetterhead, showPageNum]);

  const inv = docFlavor === "proforma" ? pInv : tInv;

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: G.white, width: "min(700px, 100vw)", height: "100vh", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: G.navy, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>INVOICES · {versions.length > 0 ? `v${version - 1} saved` : "unsaved"}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: G.white, fontFamily: "'Playfair Display',serif" }}>{query.groupName || query.clientName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{query.id}</div>
          </div>
          <VersionDropdown versions={versions} viewingVersion={viewingVersion} displayVersion={version} finalVersion={finalVersion}
            onSelectVersion={loadVersionIntoDraft} onMarkFinal={onMarkFinal} readOnly={readOnly} G={G} />
          {!readOnly && <button onClick={saveVersion} disabled={saving} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", fontSize: 11 }}>{saving ? "Saving…" : `💾 Save v${version}`}</button>}
          <button onClick={onClose} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>✕</button>
        </div>

        {/* Pro-Forma / Tax Invoice flavor toggle -- same pattern as Itinerary's Brief/Detailed */}
        <div style={{ display: "flex", gap: 4, padding: "8px 18px 0", background: G.white }}>
          {[["proforma", "Pro-Forma"], ["tax", "Tax Invoice"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setDocFlavor(id)}
              style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${docFlavor === id ? G.navy : G.gray200}`,
                background: docFlavor === id ? G.navy : G.white, color: docFlavor === id ? "#fff" : G.gray600,
                cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif", marginRight: 6 }}>
              {lbl}
            </button>
          ))}
        </div>

        <DocTabBar activeTab={activeTab} setActiveTab={setActiveTab} G={G} />

        {activeTab === "content" ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {secHead("👤 Addressee")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <div style={{ gridColumn: "1/-1" }}>
                {label("Choose from Agent Master (fills Addressee and Billed To below — both stay editable after)")}
                <select style={inp} value={shared.addresseePartyId} onChange={e => setAddresseeParty(e.target.value)} disabled={readOnly}>
                  <option value="">Select from Agent Master...</option>
                  <option value={CUSTOM_PARTY}>✎ Custom (type details manually)</option>
                  {agentList.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.company}</option>)}
                </select>
              </div>
              <div>{label("Name")}<input style={inp} value={shared.addresseeName} onChange={e => setS("addresseeName", e.target.value)} /></div>
              <div>{label("Company")}<input style={inp} value={shared.addresseeCompany} onChange={e => setS("addresseeCompany", e.target.value)} /></div>
              <div>{label("City / Country")}<input style={inp} value={shared.addresseeCityCountry} onChange={e => setS("addresseeCityCountry", e.target.value)} /></div>
            </div>

            {secHead("📬 Billed To")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <div style={{ gridColumn: "1/-1" }}>{label("Company / Agency / Client")}<input style={inp} value={shared.billToCompany} onChange={e => setS("billToCompany", e.target.value)} /></div>
              <div>{label("Address")}<input style={inp} value={shared.billToAddress} onChange={e => setS("billToAddress", e.target.value)} /></div>
              <div>{label("City / Country")}<input style={inp} value={shared.billToCityCountry} onChange={e => setS("billToCityCountry", e.target.value)} /></div>
              <div>{label("GSTIN (if applicable for Indian customers)")}<input style={inp} value={shared.billToGSTIN} onChange={e => setS("billToGSTIN", e.target.value)} /></div>
            </div>

            {secHead("✈ Tour Details")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <div>{label("Tour Name")}<input style={inp} value={shared.tourName} onChange={e => setS("tourName", e.target.value)} /></div>
              <div>{label("Tour Ref")}<input style={inp} value={shared.tourRef} onChange={e => setS("tourRef", e.target.value)} /></div>
              <div>{label("Travel Date")}<input style={inp} value={shared.travelDate} onChange={e => setS("travelDate", e.target.value)} /></div>
              <div>{label("Sector")}<input style={inp} value={shared.sector} onChange={e => setS("sector", e.target.value)} /></div>
              <div>{label("No. of Pax")}<input style={inp} value={shared.pax} onChange={e => setS("pax", e.target.value)} /></div>
            </div>

            {docFlavor === "proforma" ? (
              <>
                {secHead("📋 Invoice Details")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  <div>{label("Invoice Number")}<input style={inp} value={pInv.invoiceNo} onChange={e => setP("invoiceNo", e.target.value)} /></div>
                  <div>{label("Date")}<input style={inp} value={pInv.date} onChange={e => setP("date", e.target.value)} /></div>
                  <div>{label("Valid Until")}<input style={inp} value={pInv.validUntil} onChange={e => setP("validUntil", e.target.value)} placeholder="e.g. 15 August 2026" /></div>
                  <div>{label("Currency")}
                    <select style={inp} value={pInv.currency} onChange={e => setP("currency", e.target.value)}>
                      {["USD", "INR", "EUR", "GBP", "AUD", "CAD", "SGD", "AED", "THB"].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>{label("RE / Subject Line")}<RichTextEditor value={pInv.subject} onChange={v => setP("subject", v)} minHeight={36}/></div>
                  <div style={{ gridColumn: "1/-1" }}>{label("Opening Line")}<RichTextEditor value={pInv.openingLine} onChange={v => setP("openingLine", v)} minHeight={36}/></div>
                </div>

                {secHead("🧾 Line Items")}
                {pInv.items.map((it, i) => (
                  <div key={i} style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ marginBottom: 8 }}>{label("Description")}<input style={inp} value={it.desc} onChange={e => updateItem(setPInv, i, "desc", e.target.value)} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8 }}>
                      {[["Qty", it.qty, "qty"], ["Unit", it.unit, "unit"], ["Rate", it.rate, "rate"], ["Amount", it.amount, "amount"]].map(([l, v, k]) => (
                        <div key={k}>{label(l)}<input style={{ ...inp, textAlign: ["Rate", "Amount"].includes(l) ? "right" : "left", background: k === "amount" ? G.gray100 : G.white }} readOnly={k === "amount"} value={v} onChange={e => updateItem(setPInv, i, k, e.target.value)} /></div>
                      ))}
                      {pInv.items.length > 1 && <button className="btn btn-ghost" style={{ alignSelf: "end", fontSize: 10 }} onClick={() => removeItem(setPInv, i)}>✕</button>}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 14 }} onClick={() => addItem(setPInv, { desc: "", qty: 1, unit: "", rate: 0, amount: 0 })}>+ Add Item</button>

                <div style={{ marginBottom: 8 }}>{label("ROE Note (optional)")}<input style={inp} value={pInv.roeNote} onChange={e => setP("roeNote", e.target.value)} /></div>

                {secHead("💵 Advance / Adjusted Payment (optional)")}
                <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", marginBottom: pInv.advanceEnabled ? 10 : 0 }}>
                    <input type="checkbox" checked={pInv.advanceEnabled} onChange={e => toggleAdvance(e.target.checked)} />
                    Show advance / adjusted payment and Total Due
                  </label>
                  {pInv.advanceEnabled && <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <input style={{ ...inp, flex: 1 }} type="number" value={pInv.advanceAmount} onChange={e => { setP("advanceAmount", e.target.value); setP("advanceIsManual", true); }} placeholder="0" />
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 10, whiteSpace: "nowrap" }} onClick={fetchAdvanceFromPayments}>↻ Fetch from Payments</button>
                    </div>
                    <div style={{ fontSize: 10, color: pInv.advanceIsManual ? G.accent : G.gray600 }}>
                      {pInv.advanceIsManual
                        ? "Entered manually — won't be overwritten by re-fetching unless you click \"Fetch from Payments\" again."
                        : pInv.advanceFetchedAt
                          ? `Fetched from receipted incoming payments in ${pInv.currency} as of ${pInv.advanceFetchedAt}.`
                          : `Fetches receipted incoming payments in ${pInv.currency} automatically. Only entries with a receipt number count.`}
                    </div>
                    {pInv.advanceOtherCurrencyCount > 0 && (
                      <div style={{ fontSize: 10, color: "#B7791F", marginTop: 4 }}>
                        ⚠ {pInv.advanceOtherCurrencyCount} receipted payment{pInv.advanceOtherCurrencyCount === 1 ? "" : "s"} in a different currency than this invoice ({pInv.currency}) were not included — check manually if any should count.
                      </div>
                    )}
                  </>}
                </div>

                {secHead("📝 Notes")}
                <div style={{ marginBottom: 14 }}><RichTextEditor value={pInv.notes} onChange={v => setP("notes", v)} minHeight={72}/></div>

                {secHead("✍ Sign-off")}
                <div style={{ marginBottom: 14 }}><RichTextEditor value={pInv.signOff} onChange={v => setP("signOff", v)} minHeight={110} signatures={signatures}/></div>
              </>
            ) : (
              <>
                {secHead("📋 Invoice Details")}
                <div style={{ background: "#EBF5FB", border: "1px solid #BEE3F8", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#1A5276", marginBottom: 10 }}>
                  GSTIN: <strong>{COMPANY_INFO.gstin}</strong> · PAN: <strong>{COMPANY_INFO.pan}</strong> · State: {COMPANY_INFO.state}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[["Invoice No", tInv.invoiceNo, "invoiceNo"], ["Date", tInv.date, "date"], ["Place of Supply", tInv.placeOfSupply, "placeOfSupply"]].map(([l, v, k]) => (
                    <div key={k}>{label(l)}<input style={inp} value={v} onChange={e => setT(k, e.target.value)} /></div>
                  ))}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "10px 12px", background: G.gray50, borderRadius: 8, border: `1px solid ${G.gray200}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: G.gray600 }}>GST Type:</span>
                  {[["IGST (Interstate / Foreign)", true], ["CGST + SGST (Local)", false]].map(([l, val]) => (
                    <label key={l} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: G.gray800 }}>
                      <input type="radio" checked={tInv.igst === val} onChange={() => setT("igst", val)} style={{ accentColor: G.accent }} />{l}
                    </label>
                  ))}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: G.gray600 }}>GST Rate:</span>
                    <select style={{ ...inp, width: 80 }} value={tInv.gstRate} onChange={e => setT("gstRate", Number(e.target.value))}>
                      {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>

                {secHead("🧾 Line Items")}
                {tInv.items.map((it, i) => (
                  <div key={i} style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ marginBottom: 8 }}>{label("Description")}<input style={inp} value={it.desc} onChange={e => updateItem(setTInv, i, "desc", e.target.value)} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8 }}>
                      {[["HSN/SAC", it.hsn, "hsn"], ["Qty", it.qty, "qty"], ["Rate (₹)", it.rate, "rate"], ["Amount (₹)", it.amount, "amount"]].map(([l, v, k]) => (
                        <div key={k}>{label(l)}<input style={{ ...inp, textAlign: ["Rate (₹)", "Amount (₹)"].includes(l) ? "right" : "left", background: k === "amount" ? G.gray100 : G.white }} readOnly={k === "amount"} type={k === "hsn" ? "text" : "number"} value={v} onChange={e => updateItem(setTInv, i, k, e.target.value)} /></div>
                      ))}
                      {tInv.items.length > 1 && <button className="btn btn-ghost" style={{ alignSelf: "end", fontSize: 10 }} onClick={() => removeItem(setTInv, i)}>✕</button>}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ fontSize: 11, marginBottom: 14 }} onClick={() => addItem(setTInv, { desc: "", hsn: "", qty: 1, rate: 0, amount: 0 })}>+ Add Item</button>

                <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  {[["Taxable Value", "₹ " + tSubtotal.toLocaleString()],
                    ...(tInv.igst ? [[`IGST @ ${tInv.gstRate}%`, "₹ " + tGstCalc.toLocaleString()]] : [[`CGST @ ${tInv.gstRate / 2}%`, "₹ " + Math.round(tGstCalc / 2).toLocaleString()], [`SGST @ ${tInv.gstRate / 2}%`, "₹ " + Math.round(tGstCalc / 2).toLocaleString()]]),
                    ["Grand Total", "₹ " + tGrandTotal.toLocaleString()]].map(([l, v], i, arr) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${G.gray200}` : "none" }}>
                      <span style={{ fontSize: i === arr.length - 1 ? 13 : 12, fontWeight: i === arr.length - 1 ? 700 : 400 }}>{l}</span>
                      <span style={{ fontSize: i === arr.length - 1 ? 14 : 12, fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>

                {secHead("📝 Notes")}
                <RichTextEditor value={tInv.notes} onChange={v => setT("notes", v)} minHeight={52}/>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <LetterheadToggleBar toggles={toggles} G={G} />
            <div style={{ flex: 1, overflow: "hidden", background: G.gray100 }}>
              <DocPreviewFrame html={previewHTML} />
            </div>
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{ flex: 1 }} />
          <ExportMenu G={G} actions={[
            { id: "pdf", label: "PDF", icon: "📕", onSelect: handlePrint, hint: "Opens your browser's print dialog" },
            { id: "word", label: "Word", icon: "📄", onSelect: exportDocx, hint: "Downloads a .docx file" },
            { id: "print", label: "Print", icon: "🖨", onSelect: handlePrint, separatorBefore: true },
          ]} />
          {!readOnly && <button onClick={saveVersion} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : `💾 Save v${version}`}</button>}
        </div>
      </div>
    </div>
  );
}
