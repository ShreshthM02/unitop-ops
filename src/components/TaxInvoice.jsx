import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_TAXINVOICE_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, buildLetterheadDocument, buildPaginatedLetterheadDocument, useLetterheadToggles, LetterheadToggleBar, DocTabBar, DocPreviewFrame, printHTML, loadTaxInvoiceVersions, saveTaxInvoiceVersion, markTaxInvoiceVersionFinal, loadExistingInvoiceNumbers, logAudit, db } = Lib;

export default function TaxInvoice({ query, payments, template, docSettings, onClose, currentUser, readOnly }) {
  const tmpl = { ...DEFAULT_TAXINVOICE_TEMPLATE, ...(template||{}) };
  const pt = payments[query.id];
  const today = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
  const tourValueINR = pt ? (parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1) : 0;
  const gstBase = Math.round(tourValueINR / 1.05);
  const prefix = docSettings?.taxInvoice?.prefix || 'TAX';

  const [inv, setInv] = useState({
    invoiceNo: '', // resolved once existing invoice numbers load (see useEffect below) -- was a random 3-digit suffix before, with zero uniqueness guarantee at all
    date: today,
    placeOfSupply: tmpl.placeOfSupply,
    items:[{ desc:`Tour Package — ${query.destination||""} (${query.nights||"??"} Days)`, hsn:"998552", qty:query.paxDisplay||1, rate:Math.round(gstBase), amount:Math.round(gstBase) }],
    igst: true,
    gstRate: 5,
    notes:"",
  });
  const [activeTab, setActiveTab] = useState("content");
  const toggles = useLetterheadToggles();
  const { showStamp, showPageNum, headerFooterAllPages, printOnLetterhead } = toggles;
  const setF=(k,v)=>setInv(p=>({...p,[k]:v}));
  const updateItem=(i,f,v)=>setInv(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,[f]:v}:x)}));

  const subtotal = inv.items.reduce((s,it)=>s+(parseFloat(it.amount)||0),0);
  const gstCalc  = Math.round(subtotal * inv.gstRate / 100);
  const grandTotal = subtotal + gstCalc;

  const inp={padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  // Real version history, same pattern as the rest of the Document Chain
  // plan (Phase 0, the final document in it -- see docs/DATA_OWNERSHIP.md).
  // Invoice number computed from every tax invoice number ever saved
  // globally, same safety reasoning as Proforma Invoice.
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState([]);
  const [finalVersion, setFinalVersion] = useState(null);
  const [viewingVersion, setViewingVersion] = useState(null);

  const loadVersionIntoDraft = (v) => {
    setInv(p => ({ ...p, ...(v.content||{}), invoiceNo: v.invoiceNo || p.invoiceNo }));
    setViewingVersion(v.version);
  };

  useEffect(() => {
    Promise.all([
      loadTaxInvoiceVersions(db, query.id),
      loadExistingInvoiceNumbers(db, "tax_invoices"),
    ]).then(([loaded, existingNumbers]) => {
      if (loaded.length > 0) {
        setVersions(loaded);
        setVersion(Math.max(...loaded.map(v => v.version)) + 1);
        const finalV = loaded.find(v => v.isFinal);
        if (finalV) setFinalVersion(finalV.version);
        loadVersionIntoDraft(loaded[loaded.length - 1]);
      } else {
        setF("invoiceNo", nextInvoiceNo(prefix, existingNumbers));
      }
    });
  }, [query.id]);

  const saveVersion = () => {
    if (!inv.invoiceNo) {
      alert("Still preparing a safe invoice number, please wait a moment and try again.");
      return;
    }
    const { invoiceNo, ...content } = inv;
    const snap = { version, invoiceNo, content };
    setVersions(p => [...p, { ...snap, date: new Date().toLocaleString("en-IN") }]);
    saveTaxInvoiceVersion(db, query.id, snap, currentUser?.id);
    logAudit(db, query.id, currentUser?.name, `Tax Invoice v${version} saved (${invoiceNo})`);
    setViewingVersion(version);
    setVersion(v => v+1);
  };

  const buildPrintHTML = () => {
    const itemRows=inv.items.map(it=>`<tr><td>${it.desc}</td><td style="text-align:center">${it.hsn}</td><td style="text-align:center">${it.qty}</td><td class="amount">₹ ${parseFloat(it.rate).toLocaleString()}</td><td class="amount">₹ ${parseFloat(it.amount).toLocaleString()}</td></tr>`).join("");
    const gstRow = inv.igst
      ? `<tr><td colspan="4" style="text-align:right">IGST @ ${inv.gstRate}%</td><td class="amount">₹ ${gstCalc.toLocaleString()}</td></tr>`
      : `<tr><td colspan="4" style="text-align:right">CGST @ ${inv.gstRate/2}%</td><td class="amount">₹ ${Math.round(gstCalc/2).toLocaleString()}</td></tr>
         <tr><td colspan="4" style="text-align:right">SGST @ ${inv.gstRate/2}%</td><td class="amount">₹ ${Math.round(gstCalc/2).toLocaleString()}</td></tr>`;
    const stampHTML = showStamp ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Stamp"/>` : '';

    const metaBlock = `
        <div style="display:flex;justify-content:space-between;margin-bottom:10pt">
          <div>
            <div style="font-size:10.5pt;font-weight:bold">TAX INVOICE</div>
            <div style="font-size:10pt"><b>Invoice No:</b> <span style="color:#8B1A1A;font-weight:700">${inv.invoiceNo}</span></div>
          </div>
          <div style="text-align:right;font-size:10pt">
            <div><b>Date:</b> ${inv.date}</div>
            <div><b>Place of Supply:</b> ${inv.placeOfSupply}</div>
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
            <div class="party-label">Bill To (Recipient)</div>
            <div class="party-name">${query.agentName||query.clientName}</div>
            ${query.agentCompany?`<div class="party-detail">${query.agentCompany}</div>`:''}
            <div class="party-detail">${query.agentCountry||''}</div>
            <div class="party-detail" style="color:#888;margin-top:4pt">GSTIN: N/A (Foreign Agent)</div>
          </div>
          <div class="party-block">
            <div class="party-label">Tour Details</div>
            <div class="party-name">${query.destination||''}</div>
            <div class="party-detail">Travel: ${query.dateDisplay||query.travelDate||''}</div>
            <div class="party-detail">Pax: ${query.paxDisplay||query.pax||''}</div>
            <div class="party-detail">Ref: ${query.id}</div>
          </div>
        </div>`;

    const itemsBlock = `
        <table class="content-table">
          <thead><tr><th style="width:40%">Description of Service</th><th style="text-align:center">HSN/SAC</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr></thead>
          <tbody>${itemRows}
          <tr><td colspan="4" style="text-align:right;color:#555">Taxable Value</td><td class="amount">₹ ${subtotal.toLocaleString()}</td></tr>
          ${gstRow}
          <tr style="background:#1A3A52"><td colspan="4" style="text-align:right;color:#fff;font-weight:700;font-size:10.5pt;padding:8pt">GRAND TOTAL</td><td style="text-align:right;color:#fff;font-weight:700;font-size:10.5pt;padding:8pt">₹ ${grandTotal.toLocaleString()}</td></tr>
          </tbody>
        </table>
        <div style="font-size:10pt;font-style:italic;font-weight:600;margin-bottom:12pt">
          IN WORDS: ${numToWords(grandTotal).toUpperCase()}
        </div>
        ${inv.notes?`<div class="notes-box">${inv.notes}</div>`:''}`;

    const closingBlock = `
        <div style="font-size:8.5pt;color:#999;text-align:center;margin-bottom:14pt">${tmpl.footerNote}<br/>${COMPANY_INFO.name} | ${COMPANY_INFO.gstin}</div>
        <div style="display:flex;justify-content:space-between;margin-top:14pt;">
          <div style="text-align:center;font-size:9pt;color:#555">
            <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
            Prepared by
          </div>
          <div style="text-align:center;font-size:9pt;color:#555">
            ${stampHTML}
            ${showStamp ? '' : '<div style="height:44pt;"></div>'}
            <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
            Authorised Signatory
          </div>
        </div>`;

    return buildPaginatedLetterheadDocument({
      title: `Tax Invoice ${inv.invoiceNo}`,
      bodyBlocks: [metaBlock, partiesBlock, itemsBlock, closingBlock],
      headerFooterAllPages, printOnLetterhead, showPageNum,
    });
  };

  const handlePrint = async () => printHTML(await buildPrintHTML());

  const [previewHTML, setPreviewHTML] = useState("");
  useEffect(() => {
    if (activeTab !== "preview") return;
    let cancelled = false;
    buildPrintHTML().then(html => { if (!cancelled) setPreviewHTML(html); });
    return () => { cancelled = true; };
  }, [activeTab, inv, showStamp, headerFooterAllPages, printOnLetterhead, showPageNum]);

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:660,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>GST TAX INVOICE · {versions.length>0?`v${version-1} saved`:"unsaved"}</div>
            <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · GSTIN: {COMPANY_INFO.gstin}</div>
          </div>
          {versions.length > 0 && (
            <div style={{display:"flex",gap:4}}>
              {versions.map(v=>(
                <div key={v.version} style={{display:"flex",borderRadius:10,overflow:"hidden",border:viewingVersion===v.version?"1px solid #fff":"1px solid transparent"}}>
                  <div onClick={()=>loadVersionIntoDraft(v)} title={`View v${v.version}`}
                    style={{padding:"3px 8px",background:G.navyMid,color:"#fff",fontSize:10,cursor:"pointer",fontWeight:viewingVersion===v.version?700:400}}>
                    v{v.version}
                  </div>
                  <div onClick={()=>{if(readOnly)return;setFinalVersion(v.version);markTaxInvoiceVersionFinal(db,query.id,v.version);logAudit(db,query.id,currentUser?.name,`Tax Invoice v${v.version} marked final`);}} title="Mark as final"
                    style={{padding:"3px 6px",background:finalVersion===v.version?"#059669":G.navyMid,color:"#fff",fontSize:10,cursor:readOnly?"default":"pointer",borderLeft:"1px solid rgba(255,255,255,0.2)"}}>
                    {finalVersion===v.version?"★":"☆"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!readOnly && <button onClick={saveVersion} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none",fontSize:11}}>💾 Save v{version}</button>}
          <button onClick={handlePrint} className="btn btn-success" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <DocTabBar activeTab={activeTab} setActiveTab={setActiveTab} G={G}/>
        <LetterheadToggleBar toggles={toggles} G={G}/>
        {activeTab === "content" ? (
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
            <div style={{background:"#EBF5FB",border:"1px solid #BEE3F8",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#1A5276",marginBottom:14}}>
              GSTIN: <strong>{COMPANY_INFO.gstin}</strong> · PAN: <strong>{COMPANY_INFO.pan}</strong> · State: {COMPANY_INFO.state}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[["Invoice No",inv.invoiceNo,"invoiceNo"],["Date",inv.date,"date"],["Place of Supply",inv.placeOfSupply,"placeOfSupply"]].map(([l,v,k])=>(
                <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                <input style={inp} value={v} onChange={e=>setF(k,e.target.value)}/></div>
              ))}
            </div>

            {/* GST type toggle */}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"10px 12px",background:G.gray50,borderRadius:8,border:`1px solid ${G.gray200}`}}>
              <span style={{fontSize:12,fontWeight:600,color:G.gray600}}>GST Type:</span>
              {[["IGST (Interstate / Foreign)",true],["CGST + SGST (Local)",false]].map(([label,val])=>(
                <label key={label} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:G.gray800}}>
                  <input type="radio" checked={inv.igst===val} onChange={()=>setF("igst",val)} style={{accentColor:G.accent}}/>
                  {label}
                </label>
              ))}
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:G.gray600}}>GST Rate:</span>
                <select style={{...inp,width:80}} value={inv.gstRate} onChange={e=>setF("gstRate",Number(e.target.value))}>
                  {[5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            </div>

            {/* Line items */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Line Items</div>
              {inv.items.map((it,i)=>(
                <div key={i} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12,marginBottom:8}}>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Description</div>
                    <input style={inp} value={it.desc} onChange={e=>updateItem(i,"desc",e.target.value)}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                    {[["HSN/SAC",it.hsn,"hsn"],["Qty",it.qty,"qty"],["Rate (₹)",it.rate,"rate"],["Amount (₹)",it.amount,"amount"]].map(([l,v,k])=>(
                      <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                      <input style={{...inp,textAlign:["Rate (₹)","Amount (₹)"].includes(l)?"right":"center"}} type={k==="hsn"?"text":"number"} value={v} onChange={e=>updateItem(i,k,e.target.value)}/></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Tax summary */}
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Tax Summary</div>
              {[["Taxable Value","₹ "+subtotal.toLocaleString()],
                ...(inv.igst?[[`IGST @ ${inv.gstRate}%`,"₹ "+gstCalc.toLocaleString()]]:[[`CGST @ ${inv.gstRate/2}%`,"₹ "+Math.round(gstCalc/2).toLocaleString()],[`SGST @ ${inv.gstRate/2}%`,"₹ "+Math.round(gstCalc/2).toLocaleString()]]),
                ["Grand Total","₹ "+grandTotal.toLocaleString()]
              ].map(([l,v],i,arr)=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<arr.length-1?`1px solid ${G.gray200}`:"none"}}>
                  <span style={{fontSize:i===arr.length-1?13:12,fontWeight:i===arr.length-1?700:400,color:i===arr.length-1?G.navy:G.gray800}}>{l}</span>
                  <span style={{fontSize:i===arr.length-1?14:12,fontWeight:700,color:i===arr.length-1?G.navy:G.gray800}}>{v}</span>
                </div>
              ))}
              <div style={{marginTop:10,padding:"8px 10px",background:"#EBF5FB",borderRadius:6,fontSize:11,color:"#1A5276"}}>
                Amount in words: <strong>{numToWords(grandTotal)}</strong>
              </div>
            </div>

            <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div>
              <textarea style={{...inp,minHeight:52,resize:"vertical"}} value={inv.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Any additional notes..."/>
            </div>
          </div>
        ) : (
          <div style={{flex:1,overflow:"hidden",background:G.gray100}}>
            <DocPreviewFrame html={previewHTML}/>
          </div>
        )}
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          <button onClick={handlePrint} className="btn btn-success">🖨 Print / PDF</button>
          {!readOnly && <button onClick={saveVersion} className="btn btn-primary">💾 Save v{version}</button>}
        </div>
      </div>
    </div>
  );
}
