import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildPaginatedLetterheadDocument, printHTML, formatDateDMY, isIsoDateString, loadQuotationVersions, summarizeFinalPriceEntries, logAudit, db, entryINR, currencyLabel, entryMatchesTourCurrency, formatDateSlash, PnLExportButton } = Lib;

// entryINR() moved to src/lib/utils.js so QueryDrawerWithQuote's Finance-tab
// summary can share the exact same formula -- see there for the comment.

function IncomingEntryRow({ entry: e, TYPE_COLORS, TYPE_TEXT, TYPE_LABELS, query, pt, setPt, onUpdatePayments, LOGO_B64, COMPANY_INFO, currentUser }) {
  const deleteEntry = () => {
    const updated = { ...pt, entries: pt.entries.filter(x => x.id !== e.id) };
    setPt(updated);
    onUpdatePayments(query.id, updated, `Payment entry deleted: ${e.inCurrency||""} ${e.amount} (receipt ${e.receipt||"n/a"})`);
  };

  // ─── Amend (edit) with version history ───────────────────────────────
  // A receipt is amendable after the fact -- most commonly to fill in or
  // correct amountINR once the real bank credit note/FIRC arrives, but
  // any field can be corrected. Every edit snapshots the entry's PRIOR
  // field values into its own `history` array (oldest first) before
  // applying the new ones, and bumps `version`. This is separate from
  // the query_audit trail: history is the actual prior data (what did
  // this entry used to say), audit trail is the human-readable log (who
  // changed what, when) -- onUpdatePayments already logs that via its
  // own auditAction parameter, same as add/delete.
  const EDIT_FIELDS = ["type","inCurrency","currOther","amount","amountINR","date","mode","modeOther","ref","note"];
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const openEditModal = () => {
    const form = {};
    EDIT_FIELDS.forEach(k => { form[k] = e[k] ?? ""; });
    setEditForm(form);
    setShowEditModal(true);
  };
  const setEF = (k,v) => setEditForm(f => ({ ...f, [k]: v }));

  const FIELD_LABELS = { type:"Type", inCurrency:"Currency", currOther:"Currency (other)", amount:"Amount",
    amountINR:"Amount in INR", date:"Date", mode:"Mode", modeOther:"Mode (other)", ref:"Reference", note:"Note" };

  const saveEdit = () => {
    const changed = EDIT_FIELDS.filter(k => String(e[k] ?? "") !== String(editForm[k] ?? ""));
    if (changed.length === 0) { setShowEditModal(false); return; }
    const oldSnapshot = {};
    EDIT_FIELDS.forEach(k => { oldSnapshot[k] = e[k] ?? ""; });
    oldSnapshot.version = e.version || 1;
    oldSnapshot.editedAt = new Date().toISOString();
    oldSnapshot.editedBy = currentUser?.name || "";

    const updatedEntry = {
      ...e, ...editForm,
      version: (e.version || 1) + 1,
      history: [...(e.history || []), oldSnapshot],
    };
    const updated = { ...pt, entries: pt.entries.map(x => x.id === e.id ? updatedEntry : x) };
    setPt(updated);
    const changeSummary = changed.map(k => `${FIELD_LABELS[k]} ${e[k]||"—"}→${editForm[k]||"—"}`).join(", ");
    onUpdatePayments(query.id, updated, `Payment entry amended (receipt ${e.receipt||"n/a"}, v${e.version||1}→v${updatedEntry.version}): ${changeSummary}`);
    setShowEditModal(false);
  };

  // Default Received From text, pre-filled into the review modal below
  // but freely editable there before printing -- the query's own data is
  // a starting point, not a hard requirement (e.g. an agent's exact
  // legal name for the receipt may differ slightly from what's on file).
  const defaultReceivedFrom = () => {
    // Same field mapping InvoiceGenerator uses for this query shape --
    // query.travelDateFrom does not exist on a real loaded query object,
    // the arrival date is stored under the plain `travelDate` key.
    const fromRaw = query.travelDate;
    const toRaw = query.travelDateTo;
    const dmySlash = (iso) => formatDateDMY(iso).replace(/-/g, "/");
    const dateRange = () => {
      const fromIsDate = isIsoDateString(fromRaw);
      const toIsDate = isIsoDateString(toRaw);
      if (fromIsDate && toIsDate) return `${dmySlash(fromRaw)} - ${dmySlash(toRaw)}`;
      if (fromIsDate) return dmySlash(fromRaw);
      return fromRaw || "TBC";
    };
    // Client / Agency -- the actual paying party, deliberately NOT
    // falling back to groupName: groupName is the tour name, already
    // shown on the line below it, and falling back to it here duplicated
    // the same text on both lines whenever a query had no separate
    // clientName set (the common case).
    const clientAgency = `${query.clientName || "—"}${query.agentCompany ? ` / ${query.agentCompany}` : ""}`;
    const tourLine = `${query.groupName || query.clientName || "—"} | ${dateRange()}`;
    const fileLine = `${query.tourFileId||query.id} | ${query.destination||query.sector||"—"} | ${query.paxDisplay||"—"}`;
    return { clientAgency, tourLine, fileLine };
  };

  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [rcptClientAgency, setRcptClientAgency] = useState("");
  const [rcptTourLine, setRcptTourLine] = useState("");
  const [rcptFileLine, setRcptFileLine] = useState("");
  const [rcptSignature, setRcptSignature] = useState(true);
  const [rcptStamp, setRcptStamp] = useState(false);

  const openReceiptModal = () => {
    const d = defaultReceivedFrom();
    setRcptClientAgency(d.clientAgency);
    setRcptTourLine(d.tourLine);
    setRcptFileLine(d.fileLine);
    setRcptSignature(true);
    setRcptStamp(false);
    setShowReceiptModal(true);
  };

  const printReceipt = async () => {
    const ci = COMPANY_INFO;
    const currencyLabel = e.inCurrency==="Other" ? (e.currOther||"Other") : e.inCurrency;
    const amountFormatted = parseFloat(e.amount).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

    // Every selector below is scoped under .rcpt -- this document's own
    // extraHeadCSS is injected as a plain, unscoped <style> tag alongside
    // buildLetterheadDocument's shared invoiceLetterheadCSS, inside the
    // SAME <head>. A bare `table`/`th`/`td`/`tr` selector here would have
    // applied document-wide, including to the outer .lh-doc wrapper table
    // that buildLetterheadDocument itself assembles the page from --
    // exactly the kind of unscoped rule this codebase's shared CSS
    // (table.content-table, .party-block, etc) always namespaces under
    // its own class for this reason.
    const extraHeadCSS = `
  .rcpt .title{font-family:'Playfair Display',serif;font-size:15pt;font-weight:700;color:#1A3A52;text-align:center;margin:4pt 0 6pt;text-transform:uppercase;letter-spacing:1pt}
  .rcpt .party{background:#f8f9fa;border:1pt solid #e5e7eb;border-radius:4pt;padding:8pt 10pt;margin-bottom:10pt}
  .rcpt .party-lbl{font-size:7pt;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1pt;margin-bottom:3pt}
  .rcpt .party-name{font-size:11pt;font-weight:700;color:#1A3A52;font-family:'Playfair Display',serif}
  .rcpt .party-det{font-size:8.5pt;color:#555;margin-top:2pt;line-height:1.6}
  .rcpt table{width:100%;border-collapse:collapse;margin-bottom:8pt}
  .rcpt th{background:#1A3A52;color:#fff;font-size:8pt;font-weight:700;padding:5pt 7pt;text-align:left}
  .rcpt td{padding:5pt 7pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;vertical-align:top}
  .rcpt tr:nth-child(even) td{background:#f9fafb}
  .rcpt .amount-row td{background:#1A3A52;color:#fff;font-weight:700;border:none;padding:7pt}
  .rcpt .receipt-disclaimer{font-size:7.5pt;color:#888;text-align:center;margin-top:14pt}
  .rcpt .stamp-area{margin-top:18pt;display:flex;justify-content:space-between;align-items:flex-end;font-size:8pt;color:#555}
`;

    // Client Signature and the digital stamp are two independent toggles:
    // a soft copy sent by email needs neither a physical client signature
    // nor a hand-applied company stamp -- the digital stamp image stands
    // in for the latter, and the client-signature line is simply omitted
    // rather than left as a blank line nobody will ever sign.
    const signatureBlock = rcptSignature
      ? `<div><div style="border-top:0.5pt solid #ccc;padding-top:4pt;margin-top:32pt;width:120pt;text-align:center">Client Signature</div></div>`
      : `<div></div>`;
    const stampImgHTML = rcptStamp
      ? `<img src="${STAMP_B64}" style="height:52pt;width:auto;display:block;margin:0 auto 4pt" alt="Digital Stamp"/>` : "";

    const bodyHTML = `
  <div class="rcpt">
    <div class="title">Payment Receipt</div>

    <div class="party">
      <div class="party-lbl">Received From</div>
      <div class="party-name">${rcptClientAgency}</div>
      <div class="party-det">
        ${rcptTourLine}<br/>
        ${rcptFileLine}
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th style="text-align:right">Details</th></tr></thead>
      <tbody>
        <tr><td>Receipt No.</td><td style="text-align:right;font-weight:600;color:#8B1A1A">${e.receipt||"RCP-"+e.id}</td></tr>
        <tr><td>Payment Type</td><td style="text-align:right;font-weight:600">${TYPE_LABELS[e.type]||e.type}</td></tr>
        <tr><td>Date Received</td><td style="text-align:right">${e.date||"—"}</td></tr>
        <tr><td>Mode of Payment</td><td style="text-align:right">${e.mode==="Other"?e.modeOther||"Other":e.mode}</td></tr>
        ${e.ref?`<tr><td>Reference / UTR</td><td style="text-align:right;font-family:monospace">${e.ref}</td></tr>`:""}
        ${e.note?`<tr><td>Notes</td><td style="text-align:right;font-style:italic">${e.note}</td></tr>`:""}
      </tbody>
      <tfoot>
        <tr class="amount-row"><td>Amount Received</td><td style="text-align:right;font-size:12pt">${currencyLabel} ${amountFormatted}</td></tr>
      </tfoot>
    </table>

    <div class="stamp-area">
      ${signatureBlock}
      <div style="text-align:right">
        ${stampImgHTML}
        <div style="border-top:0.5pt solid #ccc;padding-top:4pt;margin-top:${rcptStamp?4:32}pt;width:120pt;text-align:center">For ${ci.name}<br/><span style="font-size:7pt;color:#888">Authorised Signatory</span></div>
      </div>
    </div>

    <div class="receipt-disclaimer">This is a computer-generated receipt. &nbsp;|&nbsp; ${ci.name} &nbsp;|&nbsp; GSTIN: ${ci.gstin}</div>
  </div>
`;

    const html = await buildPaginatedLetterheadDocument({
      title: `Receipt ${e.receipt||""}`,
      extraHeadCSS,
      bodyBlocks: [bodyHTML],
      headerFooterAllPages: true, // engages real DOM-measured pagination so the footer sits at the true bottom of the page, not just appended after the content
    });
    printHTML(html);
    logAudit(db, query.id, currentUser?.name, `Payment receipt printed: ${e.receipt||"n/a"} (${e.inCurrency||"INR"} ${e.amount})`);
    setShowReceiptModal(false);
  };

  const rcptInputStyle = {padding:"8px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,
    fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800};
  const rcptLabelStyle = {fontSize:11,fontWeight:600,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6};

  return (
    <>
    <div style={{background:"#fff",border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,
              background:TYPE_COLORS[e.type]||"#F3F4F6",color:TYPE_TEXT[e.type]||"#374151"}}>
              {TYPE_LABELS[e.type]||e.type}
            </span>
            <span style={{fontSize:13,fontWeight:700,color:"#059669"}}>
              {e.inCurrency==="Other"?e.currOther:e.inCurrency||"INR"} {parseFloat(e.amount||0).toLocaleString("en-IN")}
            </span>
            {e.inCurrency && e.inCurrency!=="INR" && (
              e.amountINR
                ? <span style={{fontSize:10,color:G.gray400,fontWeight:400}}>≈ ₹ {parseFloat(e.amountINR).toLocaleString("en-IN")}</span>
                : <span style={{fontSize:10,color:"#B45309",fontWeight:600,background:"#FEF3C7",padding:"1px 6px",borderRadius:8}}>⚠ INR amount not set</span>
            )}
            {e.receipt && <span style={{fontSize:10,color:G.gray400,fontFamily:"monospace"}}>{e.receipt}</span>}
            {e.version > 1 && (
              <span onClick={()=>setShowHistoryModal(true)}
                style={{fontSize:10,color:"#1A5276",background:"#EBF5FB",padding:"1px 7px",borderRadius:8,cursor:"pointer",fontWeight:600}}
                title="View edit history">v{e.version}</span>
            )}
          </div>
          <div style={{fontSize:11,color:G.gray600}}>
            {formatDateSlash(e.date)} · {e.mode==="Other"?e.modeOther||"Other":e.mode}
            {e.ref && <span style={{fontFamily:"monospace",marginLeft:6,color:G.gray500}}>{e.ref}</span>}
          </div>
          {e.note && <div style={{fontSize:11,color:G.gray400,marginTop:2,fontStyle:"italic"}}>{e.note}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
          <button onClick={openEditModal}
            style={{background:"#F5F3FF",border:"1px solid #DDD6FE",color:"#5B21B6",borderRadius:5,
              padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
            ✏ Amend
          </button>
          <button onClick={openReceiptModal}
            style={{background:"#EBF5FB",border:"1px solid #A9CCE3",color:"#1A5276",borderRadius:5,
              padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
            🖨 Receipt
          </button>
          <button onClick={deleteEntry}
            style={{background:"none",border:"none",cursor:"pointer",color:G.gray400,fontSize:18,padding:"0 4px"}}
            title="Delete entry">✕</button>
        </div>
      </div>
    </div>

    {showEditModal && editForm && (
      <div className="modal-overlay">
        <div className="modal" style={{width:480}}>
          <div className="modal-head">
            <div className="modal-title">Amend Payment Entry</div>
            <div className="modal-sub">{e.receipt||"RCP-"+e.id} · currently v{e.version||1}</div>
          </div>
          <div className="modal-body">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div><div style={rcptLabelStyle}>Type</div>
                <select style={rcptInputStyle} value={editForm.type} onChange={ev=>setEF("type",ev.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><div style={rcptLabelStyle}>Date</div>
                <input style={rcptInputStyle} type="date" value={editForm.date} onChange={ev=>setEF("date",ev.target.value)}/>
              </div>
              <div><div style={rcptLabelStyle}>Currency</div>
                <select style={rcptInputStyle} value={editForm.inCurrency} onChange={ev=>setEF("inCurrency",ev.target.value)}>
                  {["INR","USD","EUR","GBP","AUD","SGD","THB","NTD","Other"].map(c=><option key={c}>{c}</option>)}
                </select>
                {editForm.inCurrency==="Other" && <input style={{...rcptInputStyle,marginTop:4}} value={editForm.currOther} onChange={ev=>setEF("currOther",ev.target.value)} placeholder="Specify currency..."/>}
              </div>
              <div><div style={rcptLabelStyle}>Amount</div>
                <input style={{...rcptInputStyle,textAlign:"right"}} type="number" value={editForm.amount} onChange={ev=>setEF("amount",ev.target.value)}/>
              </div>
              {editForm.inCurrency!=="INR" && (
                <div style={{gridColumn:"1/-1"}}><div style={rcptLabelStyle}>Amount in INR (as actually credited)</div>
                  <input style={{...rcptInputStyle,textAlign:"right"}} type="number" value={editForm.amountINR} onChange={ev=>setEF("amountINR",ev.target.value)} placeholder="From the bank credit advice / FIRC"/>
                  <div style={{fontSize:10.5,color:G.gray400,marginTop:4}}>Used for P&L and balance-due -- the exchange-house rate, not a general market rate.</div>
                </div>
              )}
              <div><div style={rcptLabelStyle}>Mode</div>
                <select style={rcptInputStyle} value={editForm.mode} onChange={ev=>setEF("mode",ev.target.value)}>
                  {["Remittance","SWIFT","NEFT/RTGS","Cheque","Cash","Credit Card","Other"].map(m=><option key={m}>{m}</option>)}
                </select>
                {editForm.mode==="Other" && <input style={{...rcptInputStyle,marginTop:4}} value={editForm.modeOther} onChange={ev=>setEF("modeOther",ev.target.value)} placeholder="Specify mode..."/>}
              </div>
              <div><div style={rcptLabelStyle}>Reference</div>
                <input style={rcptInputStyle} value={editForm.ref} onChange={ev=>setEF("ref",ev.target.value)}/>
              </div>
              <div style={{gridColumn:"1/-1"}}><div style={rcptLabelStyle}>Note</div>
                <input style={rcptInputStyle} value={editForm.note} onChange={ev=>setEF("note",ev.target.value)}/>
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={()=>setShowEditModal(false)}>Cancel</button>
            <div style={{flex:1}}/>
            <button className="btn btn-primary" onClick={saveEdit}>Save Amendment</button>
          </div>
        </div>
      </div>
    )}

    {showHistoryModal && (
      <div className="modal-overlay">
        <div className="modal" style={{width:480}}>
          <div className="modal-head">
            <div className="modal-title">Edit History</div>
            <div className="modal-sub">{e.receipt||"RCP-"+e.id} · v{e.version||1} (current)</div>
          </div>
          <div className="modal-body">
            {[...(e.history||[])].reverse().map((h,i) => (
              <div key={i} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:G.gray600,marginBottom:6}}>
                  v{h.version} — {h.editedBy||"Unknown"}{h.editedAt?` · ${new Date(h.editedAt).toLocaleString("en-IN")}`:""}
                </div>
                <div style={{fontSize:11,color:G.gray600,lineHeight:1.7}}>
                  {EDIT_FIELDS.filter(k=>h[k]).map(k=>(
                    <div key={k}><span style={{color:G.gray400}}>{FIELD_LABELS[k]}:</span> {h[k]}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={()=>setShowHistoryModal(false)}>Close</button>
          </div>
        </div>
      </div>
    )}

    {showReceiptModal && (
      <div className="modal-overlay">
        <div className="modal" style={{width:480}}>
          <div className="modal-head">
            <div className="modal-title">Print Payment Receipt</div>
            <div className="modal-sub">{e.receipt||"RCP-"+e.id}</div>
          </div>
          <div className="modal-body">
            <div style={{marginBottom:12}}>
              <div style={rcptLabelStyle}>Client / Agency</div>
              <input style={rcptInputStyle} value={rcptClientAgency} onChange={ev=>setRcptClientAgency(ev.target.value)}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={rcptLabelStyle}>Tour Name | Dates</div>
              <input style={rcptInputStyle} value={rcptTourLine} onChange={ev=>setRcptTourLine(ev.target.value)}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={rcptLabelStyle}>Tour File No. | Sector | Pax</div>
              <input style={rcptInputStyle} value={rcptFileLine} onChange={ev=>setRcptFileLine(ev.target.value)}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",color:G.gray800,marginBottom:8}}>
              <input type="checkbox" checked={rcptSignature} onChange={ev=>setRcptSignature(ev.target.checked)}/>
              Include client signature line
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,cursor:"pointer",color:G.gray800}}>
              <input type="checkbox" checked={rcptStamp} onChange={ev=>setRcptStamp(ev.target.checked)}/>
              Apply digital stamp
            </label>
            <div style={{fontSize:10.5,color:G.gray400,marginTop:8}}>
              For a soft copy sent digitally: uncheck client signature, apply digital stamp.
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={()=>setShowReceiptModal(false)}>Cancel</button>
            <div style={{flex:1}}/>
            <button className="btn btn-primary" onClick={printReceipt}>🖨 Print</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function EnhancedPaymentTracker({ query, payments, onUpdatePayments, onClose, readOnly, currentUser }) {
  const can = useCan(currentUser);
  const existing = payments[query.id] || { queryId:query.id, tourValue:"", currency:"US $", roeUsed:90, tourValueINR:"", entries:[], outgoing:[] };
  const [pt, setPt] = useState(existing);
  const [tab, setTab]  = useState("incoming");
  const [newIn, setNewIn] = useState({ type:"advance", inCurrency:"INR", amount:"", amountINR:"", date:"", mode:"Remittance", ref:"", note:"", modeOther:"", currOther:"" });
  const [newOut, setNewOut] = useState({ vendor:"", category:"", amount:"", date:"", mode:"NEFT/RTGS", ref:"", note:"", receiptName:"" });
  const setF=(k,v)=>setPt(p=>({...p,[k]:v}));
  const setNI=(k,v)=>setNewIn(p=>({...p,[k]:v}));
  const setNO=(k,v)=>setNewOut(p=>({...p,[k]:v}));

  // Reference only -- deliberately NOT auto-syncing into pt.tourValue.
  // Tour Value here is independently editable (may be a different currency,
  // may include adjustments this tracker doesn't know about), so silently
  // overwriting it risked the exact "which number do I trust" confusion
  // this was meant to fix. Shown so staff can cross-check by eye instead.
  const [finalQuotation, setFinalQuotation] = useState(null);
  useEffect(() => {
    loadQuotationVersions(db, query.id).then(versions => {
      const final = versions.find(v => v.isFinal);
      setFinalQuotation(final || null);
    });
  }, [query.id]);

  const totalIn  = pt.entries.reduce((s,e)=>s+entryINR(e),0);
  const totalOut = (pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const tourValueINR = (parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1);
  const balance = tourValueINR - totalIn;
  const pct = tourValueINR>0 ? Math.round(totalIn/tourValueINR*100) : 0;

  // FC view of the Payment Summary: native amounts only, no conversion.
  // Clients almost always pay in the tour's own quoted currency, so this
  // sums entries that match it directly -- entries paid in a different
  // currency are excluded here (not converted/guessed at) and flagged,
  // since the INR view (entryINR-based, above) is the one complete,
  // always-accurate total regardless of currency mix.
  const [viewCurrency, setViewCurrency] = useState("FC");
  const tourCurrencyLabel = currencyLabel(pt.currency, pt.currOther);
  const matchingEntries = pt.entries.filter(e=>entryMatchesTourCurrency(e, pt.currency, pt.currOther));
  const otherCurrencyEntries = pt.entries.filter(e=>!entryMatchesTourCurrency(e, pt.currency, pt.currOther));
  const receivedFC = matchingEntries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const tourValueFC = parseFloat(pt.tourValue)||0;
  const balanceFC = tourValueFC - receivedFC;

  const addIncoming = () => {
    if(!newIn.amount||!newIn.date) return;
    const receiptNo = `RCP-${new Date().getFullYear()}-${String(pt.entries.length+1).padStart(3,"0")}`;
    // INR entries need no separate conversion -- amountINR just mirrors
    // amount. FC entries use whatever was entered in the "Amount in INR
    // (as credited)" field, which may be blank at first if the bank
    // credit note/FIRC hasn't arrived yet; it's correctable later via
    // Amend, same as every other field on this entry.
    const amountINR = newIn.inCurrency==="INR" ? newIn.amount : (newIn.amountINR||"");
    const updated = {...pt, tourValueINR, entries:[...pt.entries, {...newIn,amountINR,id:Date.now(),receipt:receiptNo,version:1,history:[]}]};
    setPt(updated); onUpdatePayments(query.id, updated, `Payment received: ${newIn.inCurrency} ${newIn.amount} (${TYPE_LABELS[newIn.type]||newIn.type}, receipt ${receiptNo})`);
    setNewIn({type:"advance",inCurrency:"INR",amount:"",amountINR:"",date:"",mode:"Remittance",ref:"",note:"",modeOther:"",currOther:""});
  };

  const addOutgoing = () => {
    if(!newOut.vendor||!newOut.amount) return;
    const updated = {...pt, outgoing:[...(pt.outgoing||[]), {...newOut,id:Date.now()}]};
    setPt(updated); onUpdatePayments(query.id, updated, `Payment made to ${newOut.vendor}: ₹${newOut.amount}`);
    setNewOut({vendor:"",category:"",amount:"",date:"",mode:"NEFT/RTGS",ref:"",note:"",receiptName:""});
  };

  const inp={padding:"7px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const TYPE_LABELS={advance:"Advance",second:"2nd Instalment",third:"3rd Instalment",final:"Final Payment",credit:"Credit Note",refund:"Refund",other:"Other"};
  const TYPE_COLORS={advance:"#DBEAFE",second:"#DCFCE7",third:"#DCFCE7",final:"#ECFDF5",credit:"#FEF3C7",refund:"#FEE2E2"};
  const TYPE_TEXT={advance:"#1E40AF",second:"#166534",third:"#166534",final:"#065F46",credit:"#92400E",refund:"#991B1B"};

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:"min(660px, 100vw)",height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",flexShrink:0}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>PAYMENT TRACKER</div>
          <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · {query.destination||query.sector}</div>
        </div>

        <fieldset disabled={readOnly} style={{flex:1,overflowY:"auto",padding:"16px 20px",border:"none",margin:0,minWidth:0}}>
          {readOnly && (
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#92400E",marginBottom:14}}>
              🔒 This tour file is cancelled — viewing only, nothing here is editable.
            </div>
          )}
          {finalQuotation && finalQuotation.tourValue && (
            <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#1A5276"}}>
              📋 Final quotation (v{finalQuotation.version}) agreed: <strong>{summarizeFinalPriceEntries(finalQuotation.finalPriceEntries, "")}</strong> · {finalQuotation.confirmedPax} pax total · Tour Value <strong>{finalQuotation.tourValue}</strong>. Cross-check against the Tour Value below — not auto-filled, since currency/adjustments here may differ.
            </div>
          )}
          {/* Tour value */}
          <div style={{background:G.gray50,borderRadius:8,border:`1px solid ${G.gray200}`,padding:12,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Tour Value</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["Tour Value (FX)",pt.tourValue,"tourValue","number"],["Currency",pt.currency,"currency","select"],["ROE (₹ per unit)",pt.roeUsed,"roeUsed","number"]].map(([l,v,k,t])=>(
                <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                  {t==="select"?<><select style={inp} value={v} onChange={e=>setF(k,e.target.value)}>{["US $","EUR","GBP","AUD","SGD","NTD","THB","INR","Other"].map(c=><option key={c}>{c}</option>)}</select>{v==="Other"&&<input style={{...inp,marginTop:4}} value={pt.currOther||""} onChange={e=>setF("currOther",e.target.value)} placeholder="Specify currency..."/>}</> 
                  :<input style={{...inp,textAlign:"right"}} type="number" value={v} onChange={e=>setF(k,e.target.value)}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Payment Summary</div>
            <div style={{display:"flex",border:`1px solid ${G.gray200}`,borderRadius:6,overflow:"hidden"}}>
              {["FC","INR"].map(v=>(
                <div key={v} onClick={()=>setViewCurrency(v)} style={{padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer",
                  background:viewCurrency===v?G.navy:G.white,color:viewCurrency===v?G.white:G.gray600}}>
                  {v==="FC"?tourCurrencyLabel:"INR"}
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:6}}>
            {(viewCurrency==="FC"
              ? [["Tour Value",tourCurrencyLabel+" "+tourValueFC.toLocaleString(),G.navy],["Received",tourCurrencyLabel+" "+Math.round(receivedFC).toLocaleString(),"#059669"],["Balance Due",tourCurrencyLabel+" "+Math.round(balanceFC).toLocaleString(),balanceFC>0?G.accent:"#059669"],["Paid Out","₹ "+Math.round(totalOut).toLocaleString(),"#6B21A8"]]
              : [["Tour (INR)","₹ "+Math.round(tourValueINR).toLocaleString(),G.navy],["Received","₹ "+Math.round(totalIn).toLocaleString(),"#059669"],["Balance Due","₹ "+Math.round(balance).toLocaleString(),balance>0?G.accent:"#059669"],["Paid Out","₹ "+Math.round(totalOut).toLocaleString(),"#6B21A8"]]
            ).map(([l,v,c])=>(
              <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {viewCurrency==="FC" && otherCurrencyEntries.length>0 && (
            <div style={{fontSize:10.5,color:"#B45309",background:"#FEF3C7",borderRadius:6,padding:"5px 10px",marginBottom:14}}>
              ⚠ {otherCurrencyEntries.length} {otherCurrencyEntries.length===1?"entry":"entries"} paid in a different currency
              ({[...new Set(otherCurrencyEntries.map(e=>currencyLabel(e.inCurrency,e.currOther)))].join(", ")}) not shown here — switch to INR for the complete total.
            </div>
          )}
          {viewCurrency==="FC" && otherCurrencyEntries.length===0 && <div style={{marginBottom:14}}/>}

          {/* Progress */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:G.gray600,marginBottom:4}}>
              <span>Incoming Progress</span><span>{pct}%</span>
            </div>
            <div style={{height:6,background:G.gray200,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>=100?"#059669":pct>=50?"#F59E0B":G.accent,borderRadius:3}}/>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:2,borderBottom:`1px solid ${G.gray200}`,marginBottom:14}}>
            {[["incoming","💰 Incoming"],["outgoing","📤 Outgoing"],["pl","📊 P&L"]].map(([id,label])=>(
              <div key={id} onClick={()=>setTab(id)} style={{padding:"7px 14px",fontSize:12,fontWeight:500,cursor:"pointer",
                color:tab===id?G.accent:G.gray600,borderBottom:`2px solid ${tab===id?G.accent:"transparent"}`,transition:"all .15s"}}>
                {label}
              </div>
            ))}
          </div>

          {tab==="incoming" && (
            <>
              {pt.entries.map((e,i)=>(
                <IncomingEntryRow key={e.id} entry={e}
                  TYPE_COLORS={TYPE_COLORS} TYPE_TEXT={TYPE_TEXT} TYPE_LABELS={TYPE_LABELS}
                  query={query} pt={pt} setPt={setPt} onUpdatePayments={onUpdatePayments}
                  LOGO_B64={LOGO_B64} COMPANY_INFO={COMPANY_INFO} currentUser={currentUser}/>
              ))}
              {can("payments_incoming") && (
              <div style={{background:"#EAFAF1",border:"1px solid #A9DFBF",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#0E6655",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>+ Record Incoming Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  {[["Type","select"],["Currency","currselect"],["Amount","number"],["Date","date"],["Mode","modeselect"],["Reference","text"],["Note","text"]].map(([l,t],i)=>{
                    const keys=["type","inCurrency","amount","date","mode","ref","note"];
                    const k=keys[i];
                    return (
                      <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                        {t==="select"?<select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{Object.entries(TYPE_LABELS).map(([kk,vv])=><option key={kk} value={kk}>{vv}</option>)}</select>
                        :t==="modeselect"?<>
                          <select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{["Remittance","SWIFT","NEFT/RTGS","Cheque","Cash","Credit Card","Other"].map(m=><option key={m}>{m}</option>)}</select>
                          {newIn[k]==="Other"&&<input style={{...inp,marginTop:4}} value={newIn.modeOther||""} onChange={e=>setNI("modeOther",e.target.value)} placeholder="Specify mode..."/>}
                        </>
                        :t==="currselect"?<>
                          <select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{["INR","USD","EUR","GBP","AUD","SGD","THB","NTD","Other"].map(c=><option key={c}>{c}</option>)}</select>
                          {newIn[k]==="Other"&&<input style={{...inp,marginTop:4}} value={newIn.currOther||""} onChange={e=>setNI("currOther",e.target.value)} placeholder="Specify currency..."/>}
                        </>
                        :<input style={{...inp,textAlign:t==="number"?"right":"left"}} type={t} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}/>}
                      </div>
                    );
                  })}
                </div>
                {newIn.inCurrency!=="INR" && (
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Amount in INR (as credited)</div>
                    <input style={{...inp,textAlign:"right"}} type="number" value={newIn.amountINR} onChange={e=>setNI("amountINR",e.target.value)} placeholder="From the bank credit advice / FIRC, if known yet"/>
                    <div style={{fontSize:9.5,color:G.gray400,marginTop:3}}>Used for P&amp;L and balance-due, not the receipt itself. Leave blank if not yet known -- correctable later via Amend.</div>
                  </div>
                )}
                <button className="btn btn-success" onClick={addIncoming} style={{fontSize:12}}>✓ Record & Generate Receipt</button>
              </div>
              )}
            </>
          )}

          {tab==="outgoing" && (
            <>
              {(pt.outgoing||[]).map((e,i)=>(
                <div key={e.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{e.vendor}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#6B21A8"}}>₹ {parseFloat(e.amount).toLocaleString()}</div>
                    <div style={{fontSize:11,color:G.gray600}}>{formatDateSlash(e.date)} · {e.mode}{e.ref?" · "+e.ref:""}</div>
                    {e.note&&<div style={{fontSize:11,color:G.gray400}}>{e.note}</div>}
                    {e.receiptName&&<div style={{fontSize:10,background:"#EBF5FB",color:"#154360",padding:"2px 8px",borderRadius:10,display:"inline-block",marginTop:3}}>📎 {e.receiptName}</div>}
                  </div>
                  <button onClick={()=>{const u={...pt,outgoing:(pt.outgoing||[]).filter(x=>x.id!==e.id)};setPt(u);onUpdatePayments(query.id,u,`Payment out to ${e.vendor} deleted: ₹${e.amount}`);}}
                    style={{background:"none",border:"none",cursor:"pointer",color:G.gray400,fontSize:18,padding:"0 4px",flexShrink:0}} title="Delete">✕</button>
                </div>
              ))}
              {can("payments_outgoing") && (
              <div style={{background:"#F5EEF8",border:"1px solid #D2B4DE",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6C3483",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>+ Record Outgoing / Vendor Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vendor / Payee</div>
                    <input style={inp} value={newOut.vendor} onChange={e=>setNO("vendor",e.target.value)} placeholder="e.g. Hotel Saura, IRCTC, IndiGo Airlines"/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Category</div>
                    <select style={inp} value={newOut.category||""} onChange={e=>setNO("category",e.target.value)}>
                      <option value="">Not categorised</option>
                      {SERVICE_TYPES.map(s=><option key={s.id} value={s.label}>{s.icon} {s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Bank Name (paying from)</div>
                    <input style={inp} value={newOut.bankName||""} onChange={e=>setNO("bankName",e.target.value)} placeholder="e.g. Punjab National Bank"/>
                  </div>
                  {[["Amount (INR)","number","amount"],["Date","date","date"],["Mode","modeselect","mode"],["Reference / UTR","text","ref"],["Note","text","note"]].map(([l,t,k])=>(
                    <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                      {t==="modeselect"?<select style={inp} value={newOut[k]} onChange={e=>setNO(k,e.target.value)}>{["NEFT/RTGS","IMPS","Cheque","Cash","UPI","Credit Card","Other"].map(m=><option key={m}>{m}</option>)}</select>
                      :<input style={{...inp,textAlign:t==="number"?"right":"left"}} type={t} value={newOut[k]} onChange={e=>setNO(k,e.target.value)}/>}
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Receipt / Doc (name)</div>
                    <input style={inp} value={newOut.receiptName} onChange={e=>setNO("receiptName",e.target.value)} placeholder="e.g. hotel_receipt_jun28.pdf"/>
                    <div style={{fontSize:9,color:G.gray400,marginTop:3}}>Document upload will be available once backend is connected (Phase 4)</div>
                  </div>
                </div>
                <button className="btn btn-primary" style={{background:"#6C3483",fontSize:12}} onClick={addOutgoing}>✓ Record Outgoing Payment</button>
              </div>
              )}
            </>
          )}

          {tab==="pl" && (
            <div>
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{fontSize:11,fontWeight:600,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px"}}>P&L for this Tour File</div>
                  <PnLExportButton query={query} payments={pt}/>
                </div>
                <div style={{fontSize:11,color:G.gray400,marginBottom:14}}>
                  Uses the ROE set in Tour Value above (₹{pt.roeUsed||0} per unit) -- adjust it there to recalculate here too, so this and the summary above never disagree.
                </div>
              </div>
              {/* Revenue */}
              {(()=>{
                const tourValINR = (parseFloat(pt.tourValue)||0) * (parseFloat(pt.roeUsed)||1);
                const totalIncome = pt.entries.reduce((s,e)=>s+entryINR(e),0);
                const totalCost   = (pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
                const grossProfit = tourValINR - totalCost;
                const netProfit   = totalIncome - totalCost;
                const margin      = tourValINR > 0 ? Math.round(grossProfit/tourValINR*100) : 0;
                return (
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                      {[
                        ["Tour Value (INR)","₹ "+Math.round(tourValINR).toLocaleString(),G.navy],
                        ["Total Received","₹ "+Math.round(totalIncome).toLocaleString(),"#059669"],
                        ["Total Paid Out","₹ "+Math.round(totalCost).toLocaleString(),"#6B21A8"],
                        ["Gross Profit","₹ "+Math.round(grossProfit).toLocaleString(),grossProfit>=0?"#059669":G.accent],
                        ["Net (Received − Paid)","₹ "+Math.round(netProfit).toLocaleString(),netProfit>=0?"#059669":G.accent],
                        ["Margin (on Tour Value)",margin+"%",margin>=20?"#059669":margin>=10?"#F59E0B":G.accent],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                          <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                          <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{height:8,background:G.gray100,borderRadius:4,overflow:"hidden",marginBottom:6}}>
                      <div style={{height:"100%",width:Math.min(Math.max(margin,0),100)+"%",background:margin>=20?"#059669":margin>=10?"#F59E0B":G.accent,borderRadius:4}}/>
                    </div>
                    <div style={{fontSize:11,color:G.gray400,textAlign:"right"}}>{margin}% margin on tour value</div>
                    <div style={{marginTop:14,background:G.gray50,borderRadius:8,padding:12}}>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Breakdown</div>
                      {[
                        ["Revenue (tour value)",tourValINR,G.navy],
                        ...pt.entries.map(e=>[`Income: ${e.receipt||""} (${e.type})${e.inCurrency&&e.inCurrency!=="INR"?!e.amountINR?" — INR amount not set, excluded":` (${e.inCurrency} ${e.amount} @ actual credit)`:""}`,entryINR(e),"#059669"]),
                        ...(pt.outgoing||[]).map(e=>[`Cost: ${e.vendor}`,-parseFloat(e.amount)||0,G.accent]),
                      ].map(([l,v,c],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${G.gray100}`}}>
                          <span style={{fontSize:11,color:G.gray600}}>{l}</span>
                          <span style={{fontSize:11,fontWeight:600,color:c}}>₹ {Math.round(v).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </fieldset>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ─── ALL_REPORTS ─────────────────────────────────────────────────────────────
